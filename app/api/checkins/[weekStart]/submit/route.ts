import { CheckinStatus, ProgressType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/authz";
import { ensurePendingCheckin, isUserDueForWeek } from "@/lib/checkins";
import { weekStart } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { isMockMode, submitMockCheckinWithProgress } from "@/lib/mock-store";

const answerSchema = z.object({
  questionId: z.string(),
  textAnswer: z.string().optional(),
  numberAnswer: z.number().optional(),
  booleanAnswer: z.boolean().optional()
});

const progressSchema = z.object({
  personalGoalId: z.string(),
  valueBoolean: z.boolean().optional(),
  valuePercent: z.number().optional(),
  valueNumeric: z.number().optional(),
  note: z.string().optional()
});

const payloadSchema = z.object({
  answers: z.array(answerSchema),
  progress: z.array(progressSchema)
});

export async function POST(req: NextRequest, context: { params: { weekStart: string } }) {
  try {
    const user = await requireUser();
    if (!user.teamId) {
      return NextResponse.json({ error: "No team assigned" }, { status: 400 });
    }

    const weekStartDate = weekStart(new Date(`${context.params.weekStart}T00:00:00.000Z`));
    const body = payloadSchema.parse(await req.json());

    if (isMockMode) {
      return NextResponse.json(submitMockCheckinWithProgress(user.id, weekStartDate, body.answers, body.progress));
    }

    const due = await isUserDueForWeek(user.id, weekStartDate);
    if (!due) {
      return NextResponse.json({ error: "Not due this week" }, { status: 400 });
    }

    const checkin = await ensurePendingCheckin(user.id, user.teamId, weekStartDate);

    await prisma.$transaction(async (tx) => {
      await tx.weeklyCheckinAnswer.deleteMany({ where: { checkinId: checkin.id } });
      await tx.weeklyCheckinAnswer.createMany({
        data: body.answers.map((answer) => ({
          checkinId: checkin.id,
          questionId: answer.questionId,
          textAnswer: answer.textAnswer,
          numberAnswer: answer.numberAnswer,
          booleanAnswer: answer.booleanAnswer
        }))
      });

      for (const update of body.progress) {
        const goal = await tx.personalGoal.findFirst({
          where: { id: update.personalGoalId, ownerUserId: user.id }
        });

        if (!goal) {
          throw new Error(`Unknown goal ${update.personalGoalId}`);
        }

        if (goal.progressType === ProgressType.BOOLEAN && typeof update.valueBoolean !== "boolean") {
          throw new Error(`Goal ${goal.id} expects boolean progress`);
        }

        if (goal.progressType === ProgressType.PERCENT && typeof update.valuePercent !== "number") {
          throw new Error(`Goal ${goal.id} expects percent progress`);
        }

        if (goal.progressType === ProgressType.NUMERIC && typeof update.valueNumeric !== "number") {
          throw new Error(`Goal ${goal.id} expects numeric progress`);
        }

        await tx.goalProgressEntry.upsert({
          where: {
            personalGoalId_weekStartDate: {
              personalGoalId: goal.id,
              weekStartDate
            }
          },
          update: {
            valueBoolean: update.valueBoolean,
            valuePercent: update.valuePercent,
            valueNumeric: update.valueNumeric,
            note: update.note
          },
          create: {
            personalGoalId: goal.id,
            weekStartDate,
            valueBoolean: update.valueBoolean,
            valuePercent: update.valuePercent,
            valueNumeric: update.valueNumeric,
            note: update.note
          }
        });
      }

      await tx.weeklyCheckin.update({
        where: { id: checkin.id },
        data: {
          status: CheckinStatus.SUBMITTED,
          submittedAt: new Date()
        }
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
