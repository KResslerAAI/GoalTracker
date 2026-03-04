import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/authz";
import { progressToPercent } from "@/lib/progress";
import { prisma } from "@/lib/prisma";
import { getMockRangeReport, isMockMode } from "@/lib/mock-store";

function currentFiscalRange() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const startYear = m >= 1 ? y : y - 1; // Feb is month 1
  const start = new Date(Date.UTC(startYear, 1, 1, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(startYear + 1, 1, 1, 0, 0, 0));
  return { start, endExclusive };
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const startParam = req.nextUrl.searchParams.get("startDate");
    const endParam = req.nextUrl.searchParams.get("endDate");

    const defaults = currentFiscalRange();
    const start = startParam ? new Date(`${startParam}T00:00:00.000Z`) : defaults.start;
    const endInclusive = endParam ? new Date(`${endParam}T00:00:00.000Z`) : new Date(defaults.endExclusive.getTime() - 1);
    const endExclusive = new Date(endInclusive);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

    if (Number.isNaN(start.getTime()) || Number.isNaN(endInclusive.getTime()) || start >= endExclusive) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    if (isMockMode) {
      return NextResponse.json(getMockRangeReport(user.id, start, endExclusive));
    }

    const startYear = start.getUTCFullYear();
    const endYear = new Date(endExclusive.getTime() - 1).getUTCFullYear();
    const overlappingYears = Array.from(new Set([startYear, endYear]));

    const teamGoalsRaw = user.role === Role.MANAGER && user.teamId
      ? await prisma.annualGoal.findMany({
          where: { teamId: user.teamId, year: { in: overlappingYears } },
          include: {
            quarterlyGoals: {
              include: {
                personalGoals: {
                  include: {
                    ownerUser: true,
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
        })
      : [];

    return NextResponse.json({
      startDate: start.toISOString().slice(0, 10),
      endDate: endInclusive.toISOString().slice(0, 10),
      teamGoals: teamGoalsRaw.map((goal) => ({
        id: goal.id,
        title: goal.title,
        status: goal.status,
        progressPercent: goal.progressPercent,
        year: goal.year,
        contributors: goal.quarterlyGoals.flatMap((q) =>
          q.personalGoals.map((personal) => {
            const latest = personal.progressEntries[0];
            return {
              id: personal.id,
              title: personal.title,
              ownerName: personal.ownerUser.name,
              ownerEmail: personal.ownerUser.email,
              status: personal.status,
              dueDate: personal.dueDate,
              progressPercent: progressToPercent({
                progressType: personal.progressType,
                valueBoolean: latest?.valueBoolean,
                valuePercent: latest?.valuePercent,
                valueNumeric: latest?.valueNumeric,
                targetValue: personal.targetValue
              })
            };
          })
        )
      }))
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
