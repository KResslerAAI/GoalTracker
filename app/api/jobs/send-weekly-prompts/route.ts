import { NotificationKind } from "@prisma/client";
import { NextResponse } from "next/server";
import { alreadySent, ensurePendingCheckin, getDueUsers, logSent } from "@/lib/checkins";
import { weekStart } from "@/lib/date";
import { sendCheckinEmail } from "@/lib/notifications";

export async function POST() {
  const teamId = process.env.DEFAULT_TEAM_ID;
  if (!teamId) {
    return NextResponse.json({ error: "Missing DEFAULT_TEAM_ID" }, { status: 400 });
  }

  const currentWeek = weekStart(new Date());
  const dueUsers = await getDueUsers(teamId, currentWeek);
  let sent = 0;

  for (const user of dueUsers) {
    if (!user.teamId) {
      continue;
    }

    await ensurePendingCheckin(user.id, user.teamId, currentWeek);

    const existing = await alreadySent(user.id, currentWeek, NotificationKind.FRIDAY_PROMPT);
    if (existing) {
      continue;
    }

    if (!user.email) {
      continue;
    }

    await sendCheckinEmail({
      to: user.email,
      kind: NotificationKind.FRIDAY_PROMPT,
      weekStartDate: currentWeek,
      appUrl: process.env.APP_URL ?? "http://localhost:3000"
    });

    await logSent({
      userId: user.id,
      weekStartDate: currentWeek,
      kind: NotificationKind.FRIDAY_PROMPT,
      deliveryStatus: "SENT"
    });

    sent += 1;
  }

  return NextResponse.json({ sent, dueUsers: dueUsers.length });
}
