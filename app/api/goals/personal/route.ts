import { ProgressType, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/authz";
import { progressToPercent } from "@/lib/progress";
import { prisma } from "@/lib/prisma";
import { createMockPersonalGoal, isMockMode, listMockPersonalGoals } from "@/lib/mock-store";

const schema = z.object({
  quarterlyGoalId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  progressType: z.nativeEnum(ProgressType),
  targetValue: z.number().positive().optional(),
  unit: z.string().optional(),
  dueDate: z.string().optional()
});

export async function GET() {
  try {
    const user = await requireUser();

    if (isMockMode) {
      return NextResponse.json(listMockPersonalGoals(user.id));
    }

    const goals = await prisma.personalGoal.findMany({
      where: { ownerUserId: user.id, status: "ACTIVE" },
      include: {
        progressEntries: {
          orderBy: { weekStartDate: "desc" },
          take: 1
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const mapped = goals.map((goal) => {
      const latest = goal.progressEntries[0];
      return {
        id: goal.id,
        title: goal.title,
        description: goal.description,
        unit: goal.unit,
        targetValue: goal.targetValue,
        dueDate: goal.dueDate,
        progressPercent: progressToPercent({
          progressType: goal.progressType,
          valueBoolean: latest?.valueBoolean,
          valuePercent: latest?.valuePercent,
          valueNumeric: latest?.valueNumeric,
          targetValue: goal.targetValue
        })
      };
    });

    return NextResponse.json(mapped);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const payload = schema.parse(await req.json());

    if (isMockMode) {
      const goal = createMockPersonalGoal({
        ownerUserId: user.id,
        ...payload
      });
      return NextResponse.json(goal, { status: 201 });
    }

    const quarter = await prisma.quarterlyGoal.findFirst({
      where: {
        id: payload.quarterlyGoalId,
        annualGoal: { teamId: user.teamId ?? "" }
      }
    });

    if (!quarter) {
      return NextResponse.json({ error: "Quarterly goal not found" }, { status: 404 });
    }

    const goal = await prisma.personalGoal.create({
      data: {
        ownerUserId: user.id,
        quarterlyGoalId: payload.quarterlyGoalId,
        title: payload.title,
        description: payload.description,
        progressType: payload.progressType,
        targetValue: payload.targetValue,
        unit: payload.unit,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined
      }
    });

    if (user.role === Role.MEMBER || user.role === Role.MANAGER) {
      return NextResponse.json(goal, { status: 201 });
    }

    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
