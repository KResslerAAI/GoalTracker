# GoalPulse MVP

Goal tracking web app for teams with annual/quarterly/personal goals and weekly or biweekly check-ins.

## Features

- Single-team workspace with manager/member roles
- Annual and quarterly team goals
- Personal goals mapped to quarterly goals
- Goal progress types: boolean, percent, numeric + unit
- Weekly check-in survey with blockers/next steps/support prompts
- Per-user check-in cadence: weekly or biweekly
- Friday check-in prompt emails and Monday reminders (due users only)
- Manager dashboard with compliance + health rollups
- Magic-link authentication with Auth.js

## Stack

- Next.js 14 (App Router) + TypeScript
- Postgres + Prisma
- Auth.js email provider
- Resend for notification sending
- Vercel cron jobs

## Setup

1. Install dependencies:

```bash
npm install
```

2. Set environment variables:

```bash
cp .env.example .env.local
```

3. Generate Prisma client and run migrations:

```bash
npx prisma generate
npx prisma migrate dev --name init
```

4. Run app:

```bash
npm run dev
```

## Go Live (GitHub + Neon + Vercel)

1. Create a Neon Postgres database, then copy:
- pooled connection string -> `DATABASE_URL`
- direct connection string -> `DIRECT_URL`

2. Create your GitHub repository and push:

```bash
git add .
git commit -m "Prepare production deploy"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

3. Import the GitHub repo into Vercel and set environment variables:
- `DATABASE_URL` (Neon pooled URL)
- `DIRECT_URL` (Neon direct URL)
- `NEXTAUTH_SECRET` (long random string)
- `NEXTAUTH_URL` (your Vercel URL, e.g. `https://your-app.vercel.app`)
- `APP_URL` (same as `NEXTAUTH_URL`)
- `MOCK_MODE=false`
- `ALLOW_INSECURE_CREDENTIALS_AUTH=false`
- `NEXT_PUBLIC_ALLOW_INSECURE_CREDENTIALS_AUTH=false`
- `EMAIL_SERVER` and `EMAIL_FROM` (required for email magic-link auth)

4. Configure Vercel Build & Deploy:
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `.next`
- Run migrations after first deploy and whenever schema changes:

```bash
npx prisma migrate deploy
```

5. Verify:
- sign up a manager account
- create team setup data
- submit a check-in as a team member
- validate manager dashboard/reporting updates

## API Endpoints

- `POST /api/goals/annual`
- `POST /api/goals/quarterly`
- `POST /api/goals/personal`
- `PATCH /api/goals/personal/:id`
- `POST /api/progress`
- `GET /api/checkins/:weekStart`
- `POST /api/checkins/:weekStart/submit`
- `GET /api/users/:id/checkin-preference`
- `PATCH /api/users/:id/checkin-preference`
- `GET /api/manager/dashboard`
- `POST /api/jobs/send-weekly-prompts`
- `POST /api/jobs/send-reminders`

## Notes

- Biweekly cadence uses an anchor week (`anchorWeekStartDate`).
- Switching to biweekly resets anchor to current week.
- A user can submit only if due for that week.
