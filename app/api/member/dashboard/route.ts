import { GoalStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/authz";
import { progressToPercent } from "@/lib/progress";
import { prisma } from "@/lib/prisma";
import { getMockMemberDashboard, isMockMode } from "@/lib/mock-store";

function parseTracking(description?: string | null) {
  if (!description) return null;
  const match = description.match(
    /^Tracking: unit (.*), start (.*), target (.*), startDate (\d{4}-\d{2}-\d{2}), endDate (\d{4}-\d{2}-\d{2})\.$/
  );
  if (!match) return null;

  const unit = match[1];
  const targetRaw = match[3];
  const numericRaw = targetRaw.endsWith(unit) ? targetRaw.slice(0, Math.max(targetRaw.length - unit.length, 0)).trim() : targetRaw;
  const targetValue = Number(numericRaw);
  if (!Number.isFinite(targetValue) || targetValue <= 0) return null;

  return { unit, targetValue };
}

function resolveTrackingForGoal(input: {
  annualDescription?: string | null;
  quarterlyDescriptions?: Array<string | null | undefined>;
  progressPercent: number;
}) {
  const fromAnnual = parseTracking(input.annualDescription);
  const fromQuarterly = (input.quarterlyDescriptions ?? [])
    .map((desc) => parseTracking(desc))
    .find((tracking) => Boolean(tracking));
  const parsed = fromAnnual ?? fromQuarterly ?? null;
  if (!parsed) return null;
  return {
    unit: parsed.unit,
    targetValue: parsed.targetValue,
    progressValue: (input.progressPercent / 100) * parsed.targetValue
  };
}

function resolveAnnualDateRange(annual: { year: number | null | undefined; description?: string | null }) {
  if (typeof annual.year === "number" && Number.isFinite(annual.year)) {
    return {
      startDate: `${annual.year}-01-01`,
      endDate: `${annual.year}-12-31`
    };
  }

  const match = annual.description?.match(/startDate (\d{4}-\d{2}-\d{2}), endDate (\d{4}-\d{2}-\d{2})\.$/);
  if (match) {
    return { startDate: match[1], endDate: match[2] };
  }

  return { startDate: "-", endDate: "-" };
}

export async function GET(_: NextRequest) {
  try {
    const user = await requireUser();
    if (!user.teamId) {
      return NextResponse.json({ error: "No team assigned" }, { status: 400 });
    }

    if (isMockMode) {
      return NextResponse.json(getMockMemberDashboard(user.id));
    }

    const team = await prisma.team.findUnique({
      where: { id: user.teamId },
      select: { name: true }
    });

    const annualGoals = await prisma.annualGoal.findMany({
      where: { teamId: user.teamId, status: GoalStatus.ACTIVE },
      include: {
        quarterlyGoals: {
          include: {
            personalGoals: {
              where: { ownerUserId: user.id, status: GoalStatus.ACTIVE },
              include: {
                progressEntries: {
                  orderBy: { weekStartDate: "desc" },
                  take: 1
                }
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const teamGoals = annualGoals.map((annual) => ({
      id: annual.id,
      title: annual.title ?? "Untitled Team Goal",
      ...resolveAnnualDateRange(annual),
      progressPercent: annual.progressPercent,
      tracking: resolveTrackingForGoal({
        annualDescription: annual.description,
        quarterlyDescriptions: annual.quarterlyGoals.map((q) => q.description),
        progressPercent: annual.progressPercent
      }),
      personalGoals: annual.quarterlyGoals.flatMap((quarterly) =>
        quarterly.personalGoals.map((goal) => {
          const latest = goal.progressEntries[0];
          return {
            id: goal.id,
            title: goal.title,
            dueDate: goal.dueDate,
            unit: goal.unit,
            targetValue: goal.targetValue,
            progressPercent: progressToPercent({
              progressType: goal.progressType,
              valueBoolean: latest?.valueBoolean,
              valuePercent: latest?.valuePercent,
              valueNumeric: latest?.valueNumeric,
              targetValue: goal.targetValue
            })
          };
        })
      )
    }));

    return NextResponse.json({
      name: user.name ?? user.email,
      teamName: team?.name ?? "Team",
      teamGoals
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

