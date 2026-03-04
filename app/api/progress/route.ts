import { ProgressType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/authz";
import { weekStart } from "@/lib/date";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  personalGoalId: z.string(),
  weekStartDate: z.string().optional(),
  valueBoolean: z.boolean().optional(),
  valuePercent: z.number().optional(),
  valueNumeric: z.number().optional(),
  note: z.string().optional()
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const payload = schema.parse(await req.json());
    const goal = await prisma.personalGoal.findFirst({ where: { id: payload.personalGoalId, ownerUserId: user.id } });

    if (!goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    if (goal.progressType === ProgressType.BOOLEAN && typeof payload.valueBoolean !== "boolean") {
      return NextResponse.json({ error: "Boolean progress required" }, { status: 400 });
    }

    if (goal.progressType === ProgressType.PERCENT && typeof payload.valuePercent !== "number") {
      return NextResponse.json({ error: "Percent progress required" }, { status: 400 });
    }

    if (goal.progressType === ProgressType.NUMERIC && typeof payload.valueNumeric !== "number") {
      return NextResponse.json({ error: "Numeric progress required" }, { status: 400 });
    }

    const normalizedWeek = weekStart(payload.weekStartDate ? new Date(`${payload.weekStartDate}T00:00:00.000Z`) : new Date());

    const entry = await prisma.goalProgressEntry.upsert({
      where: {
        personalGoalId_weekStartDate: {
          personalGoalId: goal.id,
          weekStartDate: normalizedWeek
        }
      },
      update: {
        valueBoolean: payload.valueBoolean,
        valuePercent: payload.valuePercent,
        valueNumeric: payload.valueNumeric,
        note: payload.note
      },
      create: {
        personalGoalId: goal.id,
        weekStartDate: normalizedWeek,
        valueBoolean: payload.valueBoolean,
        valuePercent: payload.valuePercent,
        valueNumeric: payload.valueNumeric,
        note: payload.note
      }
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
