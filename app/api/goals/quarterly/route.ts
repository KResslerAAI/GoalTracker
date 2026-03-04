import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireManager } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { createMockQuarterlyGoal, isMockMode, listMockQuarterlyGoals } from "@/lib/mock-store";

const schema = z.object({
  annualGoalId: z.string(),
  quarter: z.number().int().min(1).max(4),
  title: z.string(),
  description: z.string().optional(),
  weight: z.number().positive().default(1)
});

export async function GET() {
  try {
    const manager = await requireManager();
    if (!manager.teamId) {
      return NextResponse.json({ error: "No team assigned" }, { status: 400 });
    }

    if (isMockMode) {
      return NextResponse.json(listMockQuarterlyGoals(manager.teamId));
    }

    const goals = await prisma.quarterlyGoal.findMany({
      where: { annualGoal: { teamId: manager.teamId } },
      orderBy: [{ quarter: "asc" }, { createdAt: "asc" }]
    });
    return NextResponse.json(goals);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const manager = await requireManager();
    const payload = schema.parse(await req.json());

    if (isMockMode) {
      const goal = createMockQuarterlyGoal(payload);
      return NextResponse.json(goal, { status: 201 });
    }

    const annual = await prisma.annualGoal.findFirst({ where: { id: payload.annualGoalId, teamId: manager.teamId ?? "" } });
    if (!annual) {
      return NextResponse.json({ error: "Annual goal not found" }, { status: 404 });
    }

    const goal = await prisma.quarterlyGoal.create({ data: payload });
    return NextResponse.json(goal, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
