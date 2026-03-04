import { CheckinStatus, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/authz";
import { weekStart } from "@/lib/date";
import { getMockManagerCheckinDetail, isMockMode } from "@/lib/mock-store";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const manager = await requireManager();
    if (!manager.teamId) {
      return NextResponse.json({ error: "No team assigned" }, { status: 400 });
    }

    const userId = req.nextUrl.searchParams.get("userId");
    const weekStartParam = req.nextUrl.searchParams.get("weekStart");
    if (!userId || !weekStartParam) {
      return NextResponse.json({ error: "userId and weekStart are required" }, { status: 400 });
    }

    const weekStartDate = weekStart(new Date(`${weekStartParam}T00:00:00.000Z`));

    if (isMockMode) {
      return NextResponse.json(getMockManagerCheckinDetail(manager.teamId, userId, weekStartDate));
    }

    const member = await prisma.user.findFirst({
      where: { id: userId, teamId: manager.teamId, role: Role.MEMBER, active: true }
    });
    if (!member) {
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    }

    const checkin = await prisma.weeklyCheckin.findFirst({
      where: {
        userId,
        teamId: manager.teamId,
        weekStartDate,
        status: CheckinStatus.SUBMITTED
      },
      include: {
        answers: {
          include: {
            question: true
          }
        }
      }
    });

    if (!checkin) {
      return NextResponse.json({ error: "No submitted check-in for this member and week" }, { status: 404 });
    }

    const goals = await prisma.personalGoal.findMany({
      where: { ownerUserId: userId },
      include: {
        progressEntries: {
          where: { weekStartDate },
          take: 1
        }
      }
    });

    return NextResponse.json({
      userId: member.id,
      name: member.name,
      email: member.email,
      weekStartDate: weekStartDate.toISOString().slice(0, 10),
      submittedAt: checkin.submittedAt?.toISOString() ?? checkin.createdAt.toISOString(),
      progress: goals.map((goal) => {
        const entry = goal.progressEntries[0];
        return {
          personalGoalId: goal.id,
          title: goal.title,
          progressType: goal.progressType,
          unit: goal.unit,
          targetValue: goal.targetValue,
          valueBoolean: entry?.valueBoolean ?? null,
          valuePercent: entry?.valuePercent ?? null,
          valueNumeric: entry?.valueNumeric ?? null
        };
      }),
      answers: checkin.answers.map((answer) => ({
        questionId: answer.questionId,
        prompt: answer.question.prompt,
        key: answer.question.key,
        type: answer.question.type,
        textAnswer: answer.textAnswer,
        numberAnswer: answer.numberAnswer,
        booleanAnswer: answer.booleanAnswer
      }))
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }
}
