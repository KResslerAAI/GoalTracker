import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireManager } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { isMockMode, updateMockQuarterlyGoal } from "@/lib/mock-store";

const schema = z.object({
  quarter: z.number().int().min(1).max(4).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["ACTIVE", "COMPLETE", "ARCHIVED"]).optional(),
  weight: z.number().positive().optional()
});

export async function PATCH(req: NextRequest, context: { params: { id: string } }) {
  try {
    const manager = await requireManager();
    if (!manager.teamId) {
      return NextResponse.json({ error: "No team assigned" }, { status: 400 });
    }

    const payload = schema.parse(await req.json());
    const data: {
      quarter?: number;
      title?: string;
      description?: string;
      status?: "ACTIVE" | "COMPLETE" | "ARCHIVED";
      weight?: number;
    } = {};
    if (payload.quarter !== undefined) data.quarter = payload.quarter;
    if (payload.title !== undefined) data.title = payload.title;
    if (payload.description !== undefined) data.description = payload.description;
    if (payload.status !== undefined) data.status = payload.status;
    if (payload.weight !== undefined) data.weight = payload.weight;

    if (isMockMode) {
      const goal = updateMockQuarterlyGoal(context.params.id, manager.teamId, data);
      if (!goal) {
        return NextResponse.json({ error: "Quarterly goal not found" }, { status: 404 });
      }
      return NextResponse.json(goal);
    }

    const existing = await prisma.quarterlyGoal.findFirst({
      where: { id: context.params.id, annualGoal: { teamId: manager.teamId } }
    });
    if (!existing) {
      return NextResponse.json({ error: "Quarterly goal not found" }, { status: 404 });
    }

    const goal = await prisma.quarterlyGoal.update({
      where: { id: context.params.id },
      data
    });

    return NextResponse.json(goal);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
