import { NotificationKind } from "@prisma/client";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function sendCheckinEmail(input: {
  to: string;
  kind: NotificationKind;
  weekStartDate: Date;
  appUrl: string;
}) {
  const subject =
    input.kind === NotificationKind.FRIDAY_PROMPT
      ? "Weekly goal check-in is due"
      : "Reminder: your check-in is still due";

  const url = `${input.appUrl}/checkins/${input.weekStartDate.toISOString().slice(0, 10)}`;

  if (!resend || !process.env.EMAIL_FROM) {
    return { skipped: true };
  }

  await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: input.to,
    subject,
    html: `<p>${subject}</p><p><a href="${url}">Open check-in</a></p>`
  });

  return { skipped: false };
}
