import { CheckinStatus, NotificationKind } from "@prisma/client";
import { NextResponse } from "next/server";
import { alreadySent, getDueUsers, logSent } from "@/lib/checkins";
import { weekStart } from "@/lib/date";
import { sendCheckinEmail } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export async function GET() {
  return POST();
}

export async function POST() {
  const teamId = process.env.DEFAULT_TEAM_ID || "cmmji5ik40000aglyke9ltpd5";


  const currentWeek = weekStart(new Date());
  const dueUsers = await getDueUsers(teamId, currentWeek);
  let sent = 0;

  for (const user of dueUsers) {
    const submission = await prisma.weeklyCheckin.findUnique({
      where: {
        userId_weekStartDate: {
          userId: user.id,
          weekStartDate: currentWeek
        }
      }
    });

    if (submission?.status === CheckinStatus.SUBMITTED) {
      continue;
    }

    const existing = await alreadySent(user.id, currentWeek, NotificationKind.MONDAY_REMINDER);
    if (existing || !user.email) {
      continue;
    }

    await sendCheckinEmail({
      to: user.email,
      kind: NotificationKind.MONDAY_REMINDER,
      weekStartDate: currentWeek,
      appUrl: process.env.APP_URL ?? "http://localhost:3000"
    });

    await logSent({
      userId: user.id,
      weekStartDate: currentWeek,
      kind: NotificationKind.MONDAY_REMINDER,
      deliveryStatus: "SENT"
    });

    sent += 1;
  }

  return NextResponse.json({ sent, dueUsers: dueUsers.length });
}
