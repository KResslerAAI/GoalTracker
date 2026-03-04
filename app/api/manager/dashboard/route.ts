import { CheckinCadence, CheckinStatus, GoalStatus, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/authz";
import { isDueForWeek } from "@/lib/cadence";
import { weekStart } from "@/lib/date";
import { progressToPercent, healthBand } from "@/lib/progress";
import { prisma } from "@/lib/prisma";
import { getMockDashboard, isMockMode } from "@/lib/mock-store";

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
  const progressValue = (input.progressPercent / 100) * parsed.targetValue;
  return {
    unit: parsed.unit,
    targetValue: parsed.targetValue,
    progressValue
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

export async function GET(req: NextRequest) {
  try {
    const manager = await requireManager();
    if (!manager.teamId) {
      return NextResponse.json({ error: "No team assigned" }, { status: 400 });
    }

    const weekStartParam = req.nextUrl.searchParams.get("weekStart");
    const weekStartDate = weekStart(weekStartParam ? new Date(`${weekStartParam}T00:00:00.000Z`) : new Date());

    if (isMockMode) {
      return NextResponse.json(getMockDashboard(manager.teamId, weekStartDate));
    }

    const members = await prisma.user.findMany({
      where: { teamId: manager.teamId, role: Role.MEMBER, active: true },
      include: {
        checkinPreference: true,
        checkins: {
          where: { weekStartDate }
        },
        personalGoals: {
          where: { status: GoalStatus.ACTIVE },
          include: {
            progressEntries: {
              where: { weekStartDate },
              take: 1
            },
            quarterlyGoal: {
              include: {
                annualGoal: true
              }
            }
          }
        }
      }
    });

    const memberRows = members.map((member) => {
      const pref = member.checkinPreference ?? { cadence: CheckinCadence.WEEKLY, anchorWeekStartDate: weekStartDate };
      const dueThisWeek = isDueForWeek(pref, weekStartDate);
      const submitted = member.checkins.some((c) => c.status === CheckinStatus.SUBMITTED);

      const goalPercents = member.personalGoals.map((goal) => {
        const entry = goal.progressEntries[0];
        return progressToPercent({
          progressType: goal.progressType,
          valueBoolean: entry?.valueBoolean,
          valuePercent: entry?.valuePercent,
          valueNumeric: entry?.valueNumeric,
          targetValue: goal.targetValue
        });
      });

      const avg = goalPercents.length
        ? goalPercents.reduce((acc, p) => acc + p, 0) / goalPercents.length
        : 0;

      return {
        userId: member.id,
        name: member.name,
        email: member.email,
        cadence: pref.cadence,
        dueThisWeek,
        submitted,
        progressPercent: avg,
        health: healthBand(avg)
      };
    });

    const dueUsers = memberRows.filter((m) => m.dueThisWeek);
    const submitted = dueUsers.filter((m) => m.submitted).length;

    const annualGoals = await prisma.annualGoal.findMany({
      where: { teamId: manager.teamId, status: GoalStatus.ACTIVE },
      include: {
        quarterlyGoals: {
          include: {
            personalGoals: {
              include: {
                ownerUser: true,
                progressEntries: {
                  where: { weekStartDate },
                  take: 1
                }
              }
            }
          }
        }
      }
    });

    const teamGoals = annualGoals.map((annual) => {
      const personalGoals = annual.quarterlyGoals.flatMap((q) =>
        q.personalGoals.map((p) => {
          const entry = p.progressEntries[0];
          const progressPercent = progressToPercent({
            progressType: p.progressType,
            valueBoolean: entry?.valueBoolean,
            valuePercent: entry?.valuePercent,
            valueNumeric: entry?.valueNumeric,
            targetValue: p.targetValue
          });
          return {
            id: p.id,
            title: p.title,
            ownerName: p.ownerUser.name,
            ownerEmail: p.ownerUser.email,
            progressPercent
          };
        })
      );
      return {
        id: annual.id,
        title: annual.title ?? "Untitled Team Goal",
        description: annual.description,
        ...resolveAnnualDateRange(annual),
        progressPercent: annual.progressPercent,
        tracking: resolveTrackingForGoal({
          annualDescription: annual.description,
          quarterlyDescriptions: annual.quarterlyGoals.map((q) => q.description),
          progressPercent: annual.progressPercent
        }),
        health: healthBand(annual.progressPercent),
        personalGoals
      };
    });

    return NextResponse.json({
      compliance: {
        dueUsers: dueUsers.length,
        submitted,
        completionPercent: dueUsers.length ? (submitted / dueUsers.length) * 100 : 0
      },
      members: memberRows,
      teamGoals
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }
}
