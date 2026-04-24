import { NotificationKind } from "@prisma/client";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function sendCheckinEmail(input: {
  to: string;
  kind: NotificationKind;
  weekStartDate: Date;
  appUrl: string;
}) {
  const isFriday = input.kind === NotificationKind.FRIDAY_PROMPT;
  const subject = isFriday
    ? "Your check-in is due — Pathfinder Goal Tracker"
    : "Reminder: check-in still pending — Pathfinder Goal Tracker";

  const url = `${input.appUrl}/checkins/${input.weekStartDate.toISOString().slice(0, 10)}`;
  const weekLabel = input.weekStartDate.toDateString();

  const heading = isFriday ? "Time to submit your check-in" : "Just a reminder — check-in still pending";
  const body = isFriday
    ? `Your check-in for the week of <strong>${weekLabel}</strong> is now due. It only takes a few minutes — log in and let your manager know how things are going.`
    : `You haven't submitted your check-in for the week of <strong>${weekLabel}</strong> yet. Your manager is waiting on your update — it only takes a couple of minutes.`;

  const html = `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #000;">
      <p style="font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.13em; color: #ff5a10; margin: 0 0 8px;">Pathfinder</p>
      <h1 style="font-size: 1.4rem; margin: 0 0 16px;">${heading}</h1>
      <p style="color: #333; line-height: 1.6;">${body}</p>
      <a href="${url}"
         style="display: inline-block; margin-top: 20px; background: #ff5a10; color: #fff; text-decoration: none;
                padding: 12px 24px; border-radius: 10px; font-weight: 700; font-size: 0.9rem;">
        Submit my check-in →
      </a>
      <p style="margin-top: 32px; font-size: 0.78rem; color: #999;">
        You're receiving this because you're enrolled in Pathfinder Goal Tracker.
        <a href="${input.appUrl}/settings" style="color: #999;">Manage your preferences</a>.
      </p>
    </div>
  `;

  if (!resend || !process.env.EMAIL_FROM) {
    return { skipped: true };
  }

  await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: input.to,
    subject,
    html
  });

  return { skipped: false };
}

export async function sendWelcomeEmail(input: {
  to: string;
  name?: string | null;
  appUrl: string;
}) {
  if (!resend || !process.env.EMAIL_FROM) {
    return { skipped: true };
  }

  const greeting = input.name ? `Hi ${input.name},` : "Hi there,";
  const loginUrl = `${input.appUrl}/login`;

  const html = `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #000;">
      <p style="font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.13em; color: #ff5a10; margin: 0 0 8px;">Pathfinder</p>
      <h1 style="font-size: 1.4rem; margin: 0 0 16px;">You've been added to Goal Tracker</h1>
      <p style="color: #333; line-height: 1.6;">${greeting}</p>
      <p style="color: #333; line-height: 1.6;">
        Your manager has added you to <strong>Pathfinder Goal Tracker</strong> — a tool for setting goals,
        tracking progress, and staying aligned with your team through weekly check-ins.
      </p>
      <p style="color: #333; line-height: 1.6;">
        Log in now to set up your goals and get started.
      </p>
      <a href="${loginUrl}"
         style="display: inline-block; margin-top: 20px; background: #ff5a10; color: #fff; text-decoration: none;
                padding: 12px 24px; border-radius: 10px; font-weight: 700; font-size: 0.9rem;">
        Log in and set your goals →
      </a>
      <p style="margin-top: 32px; font-size: 0.78rem; color: #999;">
        You're receiving this because you were added to Pathfinder Goal Tracker by your manager.
        <a href="${input.appUrl}/settings" style="color: #999;">Manage your preferences</a>.
      </p>
    </div>
  `;

  await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: input.to,
    subject: "You've been added to Pathfinder Goal Tracker",
    html
  });

  return { skipped: false };
}
