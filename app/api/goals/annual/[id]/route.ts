import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireManager } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { isMockMode, listMockAnnualGoals, updateMockAnnualGoal } from "@/lib/mock-store";

const schema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  progressValue: z.number().min(0).optional(),
  status: z.enum(["ACTIVE", "COMPLETE", "ARCHIVED"]).optional(),
  year: z.number().int().optional()
});

function parseTargetFromDescription(description?: string | null) {
  if (!description) return null;
  const match = description.match(
    /^Tracking: unit (.*), start (.*), target (.*), startDate (\d{4}-\d{2}-\d{2}), endDate (\d{4}-\d{2}-\d{2})\.$/
  );
  if (!match) return null;
  const unit = match[1];
  const raw = match[3];
  const numericRaw = raw.endsWith(unit) ? raw.slice(0, Math.max(raw.length - unit.length, 0)).trim() : raw;
  const targetValue = Number(numericRaw);
  return Number.isFinite(targetValue) && targetValue > 0 ? targetValue : null;
}

export async function PATCH(req: NextRequest, context: { params: { id: string } }) {
  try {
    const manager = await requireManager();
    if (!manager.teamId) {
      return NextResponse.json({ error: "No team assigned" }, { status: 400 });
    }

    const payload = schema.parse(await req.json());
    const data: { title?: string; description?: string; year?: number; progressPercent?: number; status?: "ACTIVE" | "COMPLETE" | "ARCHIVED" } = {};
    if (payload.title !== undefined) data.title = payload.title;
    if (payload.description !== undefined) data.description = payload.description;
    if (payload.year !== undefined) data.year = payload.year;
    if (payload.progressPercent !== undefined) data.progressPercent = payload.progressPercent;
    if (payload.status !== undefined) data.status = payload.status;

    if (isMockMode) {
      const existingMock = listMockAnnualGoals(manager.teamId).find((g) => g.id === context.params.id);
      if (payload.progressValue != null) {
        const target = parseTargetFromDescription(payload.description ?? existingMock?.description);
        if (!target) {
          return NextResponse.json({ error: "Team goal target is not configured for value-based updates" }, { status: 400 });
        }
        const computedPercent = Math.max(0, Math.min(100, (payload.progressValue / target) * 100));
        data.progressPercent = computedPercent;
      }

      const goal = updateMockAnnualGoal(context.params.id, manager.teamId, data);
      if (!goal) {
        return NextResponse.json({ error: "Annual goal not found" }, { status: 404 });
      }
      return NextResponse.json(goal);
    }

    const existing = await prisma.annualGoal.findFirst({
      where: { id: context.params.id, teamId: manager.teamId }
    });
    if (!existing) {
      return NextResponse.json({ error: "Annual goal not found" }, { status: 404 });
    }

    if (payload.progressValue != null) {
      const target = parseTargetFromDescription(payload.description ?? existing.description);
      if (!target) {
        return NextResponse.json({ error: "Team goal target is not configured for value-based updates" }, { status: 400 });
      }
      data.progressPercent = Math.max(0, Math.min(100, (payload.progressValue / target) * 100));
    }

    const goal = await prisma.annualGoal.update({
      where: { id: context.params.id },
      data
    });

    return NextResponse.json(goal);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
