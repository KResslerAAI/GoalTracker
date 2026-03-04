import { CheckinStatus, GoalStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/authz";
import { isUserDueForWeek } from "@/lib/checkins";
import { weekStart } from "@/lib/date";
import { progressToPercent } from "@/lib/progress";
import { prisma } from "@/lib/prisma";
import { getMockCheckinData, isMockMode } from "@/lib/mock-store";
import { decodePrioritiesAnswer } from "@/lib/priorities";

export async function GET(_: NextRequest, context: { params: { weekStart: string } }) {
  try {
    const user = await requireUser();
    const weekStartDate = weekStart(new Date(`${context.params.weekStart}T00:00:00.000Z`));
    if (!user.teamId) {
      return NextResponse.json({ error: "No team assigned" }, { status: 400 });
    }

    if (isMockMode) {
      return NextResponse.json(getMockCheckinData(user.id, weekStartDate, user.teamId));
    }

    const due = await isUserDueForWeek(user.id, weekStartDate);
    if (!due) {
      return NextResponse.json({ due: false, checkin: null });
    }

    const checkin = await prisma.weeklyCheckin.findUnique({
      where: {
        userId_weekStartDate: {
          userId: user.id,
          weekStartDate
        }
      },
      include: {
        answers: true
      }
    });

    let questions = await prisma.checkinTemplateQuestion.findMany({
      where: { teamId: user.teamId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
    });

    const hasWeeklyPriorities = questions.some((q) => q.key === "weekly_next_steps");
    if (!hasWeeklyPriorities) {
      await prisma.checkinTemplateQuestion.create({
        data: {
          teamId: user.teamId,
          key: "weekly_next_steps",
          prompt: "Weekly priorities",
          type: "short_answer",
          required: true,
          isDefault: true
        }
      });
      questions = await prisma.checkinTemplateQuestion.findMany({
        where: { teamId: user.teamId },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
      });
    }

    let previousPriorities: string[] = [];
    let lastCheckinDate: string | null = null;
    const nextActionsQuestion = questions.find((q) => q.key === "weekly_next_steps");
    if (nextActionsQuestion) {
      const previousSubmitted = await prisma.weeklyCheckin.findFirst({
        where: {
          userId: user.id,
          weekStartDate: { lt: weekStartDate },
          status: CheckinStatus.SUBMITTED
        },
        orderBy: { weekStartDate: "desc" },
        include: {
          answers: {
            where: { questionId: nextActionsQuestion.id }
          }
        }
      });
      lastCheckinDate = previousSubmitted?.weekStartDate.toISOString().slice(0, 10) ?? null;
      previousPriorities = decodePrioritiesAnswer(previousSubmitted?.answers[0]?.textAnswer);
    }

    const goalsRaw = await prisma.personalGoal.findMany({
      where: { ownerUserId: user.id, status: GoalStatus.ACTIVE },
      include: {
        progressEntries: {
          where: { weekStartDate: { lt: weekStartDate } },
          orderBy: { weekStartDate: "desc" },
          take: 1
        }
      }
    });
    const goals = goalsRaw.map((goal) => {
      const previous = goal.progressEntries[0];
      const previousProgressPercent = progressToPercent({
        progressType: goal.progressType,
        valueBoolean: previous?.valueBoolean,
        valuePercent: previous?.valuePercent,
        valueNumeric: previous?.valueNumeric,
        targetValue: goal.targetValue
      });
      return {
        id: goal.id,
        title: goal.title,
        description: goal.description,
        dueDate: goal.dueDate,
        progressType: goal.progressType,
        unit: goal.unit,
        targetValue: goal.targetValue,
        previousValueBoolean: previous?.valueBoolean ?? null,
        previousValuePercent: previous?.valuePercent ?? null,
        previousValueNumeric: previous?.valueNumeric ?? null,
        previousProgressPercent,
        previousWeekStartDate: previous?.weekStartDate.toISOString().slice(0, 10) ?? null
      };
    });

    return NextResponse.json({ due: true, checkin, questions, goals, previousPriorities, lastCheckinDate });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}
