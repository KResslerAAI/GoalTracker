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
    let currentPriorities: string[] = [];
    let lastCheckinDate: string | null = null;
    const currentAnswers = (checkin?.answers ?? []).map((answer) => ({
      questionId: answer.questionId,
      textAnswer: answer.textAnswer ?? null,
      numberAnswer: answer.numberAnswer ?? null,
      booleanAnswer: answer.booleanAnswer ?? null
    }));
    const nextActionsQuestion = questions.find((q) => q.key === "weekly_next_steps");
    if (nextActionsQuestion && checkin) {
      const currentAnswer = checkin.answers.find((answer) => answer.questionId === nextActionsQuestion.id);
      currentPriorities = decodePrioritiesAnswer(currentAnswer?.textAnswer);
    }
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
      lastCheckinDate = checkin?.status === CheckinStatus.SUBMITTED
        ? weekStartDate.toISOString().slice(0, 10)
        : previousSubmitted?.weekStartDate.toISOString().slice(0, 10) ?? null;
      previousPriorities = decodePrioritiesAnswer(previousSubmitted?.answers[0]?.textAnswer);
    }

    const goalsRaw = await prisma.personalGoal.findMany({
      where: { ownerUserId: user.id, status: GoalStatus.ACTIVE },
      include: {
        progressEntries: {
          where: { weekStartDate: { lte: weekStartDate } },
          orderBy: { weekStartDate: "desc" }
        }
      }
    });
    const goals = goalsRaw.map((goal) => {
      const current = goal.progressEntries.find((entry) => entry.weekStartDate.getTime() === weekStartDate.getTime());
      const previous = goal.progressEntries.find((entry) => entry.weekStartDate.getTime() < weekStartDate.getTime());
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
        currentValueBoolean: current?.valueBoolean ?? null,
        currentValuePercent: current?.valuePercent ?? null,
        currentValueNumeric: current?.valueNumeric ?? null,
        currentProgressPercent: progressToPercent({
          progressType: goal.progressType,
          valueBoolean: current?.valueBoolean,
          valuePercent: current?.valuePercent,
          valueNumeric: current?.valueNumeric,
          targetValue: goal.targetValue
        }),
        previousValueBoolean: previous?.valueBoolean ?? null,
        previousValuePercent: previous?.valuePercent ?? null,
        previousValueNumeric: previous?.valueNumeric ?? null,
        previousProgressPercent,
        previousWeekStartDate: previous?.weekStartDate.toISOString().slice(0, 10) ?? null
      };
    });

    const historyGoalEntries = await prisma.personalGoal.findMany({
      where: { ownerUserId: user.id },
      include: {
        progressEntries: {
          orderBy: { weekStartDate: "desc" }
        }
      }
    });

    const submittedHistory = await prisma.weeklyCheckin.findMany({
      where: {
        userId: user.id,
        status: CheckinStatus.SUBMITTED
      },
      orderBy: { weekStartDate: "desc" },
      include: { answers: true }
    });

    const submittedWeekSet = new Set(submittedHistory.map((entry) => entry.weekStartDate.getTime()));
    const historyGoals = historyGoalEntries.map((goal) => ({
      id: goal.id,
      title: goal.title,
      progressType: goal.progressType,
      unit: goal.unit,
      targetValue: goal.targetValue,
      entries: goal.progressEntries.filter((entry) => submittedWeekSet.has(entry.weekStartDate.getTime()))
    }));

    const history = submittedHistory.map((entry) => {
      const priorities = nextActionsQuestion
        ? decodePrioritiesAnswer(entry.answers.find((answer) => answer.questionId === nextActionsQuestion.id)?.textAnswer)
        : [];
      return {
        id: entry.id,
        weekStartDate: entry.weekStartDate.toISOString().slice(0, 10),
        submittedAt: entry.submittedAt?.toISOString() ?? entry.weekStartDate.toISOString(),
        priorities,
        answers: entry.answers
          .filter((answer) => answer.questionId !== nextActionsQuestion?.id)
          .map((answer) => {
            const question = questions.find((item) => item.id === answer.questionId);
            return {
              questionId: answer.questionId,
              prompt: question?.prompt ?? "Question",
              textAnswer: answer.textAnswer ?? null,
              numberAnswer: answer.numberAnswer ?? null,
              booleanAnswer: answer.booleanAnswer ?? null
            };
          }),
        goals: historyGoals.map((goal) => {
          const goalEntry = goal.entries.find((goalProgressEntry) => goalProgressEntry.weekStartDate.getTime() === entry.weekStartDate.getTime());
          return {
            id: goal.id,
            title: goal.title,
            progressType: goal.progressType,
            unit: goal.unit ?? null,
            valueBoolean: goalEntry?.valueBoolean ?? null,
            valuePercent: goalEntry?.valuePercent ?? null,
            valueNumeric: goalEntry?.valueNumeric ?? null
          };
        })
      };
    });

    return NextResponse.json({
      due: true,
      checkin: checkin
        ? {
            id: checkin.id,
            status: checkin.status,
            submittedAt: checkin.submittedAt?.toISOString() ?? null
          }
        : null,
      questions,
      goals,
      previousPriorities,
      currentPriorities,
      currentAnswers,
      lastCheckinDate,
      history
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}
