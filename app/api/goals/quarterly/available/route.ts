import { NextResponse } from "next/server";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { isMockMode, listMockQuarterlyGoals } from "@/lib/mock-store";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user.teamId) {
      return NextResponse.json({ error: "No team assigned" }, { status: 400 });
    }

    if (isMockMode) {
      return NextResponse.json(listMockQuarterlyGoals(user.teamId));
    }

    const goals = await prisma.quarterlyGoal.findMany({
      where: { annualGoal: { teamId: user.teamId } },
      orderBy: [{ quarter: "asc" }, { createdAt: "asc" }]
    });
    return NextResponse.json(goals);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
