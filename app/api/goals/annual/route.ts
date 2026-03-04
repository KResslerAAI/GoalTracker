import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireManager } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { createMockAnnualGoal, isMockMode, listMockAnnualGoals } from "@/lib/mock-store";

const schema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  year: z.number().int()
});

export async function GET() {
  try {
    const manager = await requireManager();
    if (!manager.teamId) {
      return NextResponse.json({ error: "No team assigned" }, { status: 400 });
    }

    if (isMockMode) {
      return NextResponse.json(listMockAnnualGoals(manager.teamId));
    }

    const goals = await prisma.annualGoal.findMany({
      where: { teamId: manager.teamId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" }
    });
    return NextResponse.json(goals);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const manager = await requireManager();
    if (!manager.teamId) {
      return NextResponse.json({ error: "No team assigned" }, { status: 400 });
    }

    const payload = schema.parse(await req.json());
    const { progressPercent, ...rest } = payload;

    if (isMockMode) {
      const goal = createMockAnnualGoal({
        teamId: manager.teamId,
        createdById: manager.id,
        ...rest
      });
      goal.progressPercent = progressPercent ?? 0;
      return NextResponse.json(goal, { status: 201 });
    }

    const goal = await prisma.annualGoal.create({
      data: {
        teamId: manager.teamId,
        createdById: manager.id,
        ...rest,
        progressPercent: progressPercent ?? 0
      }
    });

    return NextResponse.json(goal, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
