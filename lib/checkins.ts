import { CheckinCadence, CheckinStatus, NotificationKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isDueForWeek } from "@/lib/cadence";
import { weekStart } from "@/lib/date";

export async function getOrCreatePreference(userId: string) {
  const nowWeek = weekStart(new Date());

  const existing = await prisma.userCheckinPreference.findUnique({ where: { userId } });
  if (existing) {
    return existing;
  }

  return prisma.userCheckinPreference.create({
    data: {
      userId,
      cadence: CheckinCadence.WEEKLY,
      anchorWeekStartDate: nowWeek
    }
  });
}

export async function isUserDueForWeek(userId: string, candidateWeek: Date): Promise<boolean> {
  const pref = await getOrCreatePreference(userId);
  return isDueForWeek(
    {
      cadence: pref.cadence,
      anchorWeekStartDate: pref.anchorWeekStartDate
    },
    candidateWeek
  );
}

export async function getDueUsers(teamId: string, candidateWeek: Date) {
  const users = await prisma.user.findMany({
    where: { teamId, active: true },
    include: { checkinPreference: true }
  });

  const candidate = weekStart(candidateWeek);
  return users.filter((user) => {
    const pref = user.checkinPreference ?? {
      cadence: CheckinCadence.WEEKLY,
      anchorWeekStartDate: candidate
    };

    return isDueForWeek(pref, candidate);
  });
}

export async function ensurePendingCheckin(userId: string, teamId: string, candidateWeek: Date) {
  const dueWeek = weekStart(candidateWeek);

  return prisma.weeklyCheckin.upsert({
    where: {
      userId_weekStartDate: {
        userId,
        weekStartDate: dueWeek
      }
    },
    update: {},
    create: {
      userId,
      teamId,
      weekStartDate: dueWeek,
      status: CheckinStatus.PENDING
    }
  });
}

export async function alreadySent(userId: string, weekStartDate: Date, kind: NotificationKind) {
  return prisma.emailNotificationLog.findUnique({
    where: {
      userId_weekStartDate_kind: {
        userId,
        weekStartDate,
        kind
      }
    }
  });
}

export async function logSent(input: Prisma.EmailNotificationLogUncheckedCreateInput) {
  return prisma.emailNotificationLog.create({ data: input });
}
