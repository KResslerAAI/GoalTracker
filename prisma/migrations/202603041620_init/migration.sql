-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MANAGER', 'MEMBER');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'COMPLETE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProgressType" AS ENUM ('BOOLEAN', 'PERCENT', 'NUMERIC');

-- CreateEnum
CREATE TYPE "CheckinCadence" AS ENUM ('WEEKLY', 'BIWEEKLY');

-- CreateEnum
CREATE TYPE "CheckinStatus" AS ENUM ('PENDING', 'SUBMITTED', 'MISSED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('FRIDAY_PROMPT', 'MONDAY_REMINDER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnualGoal" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "progressPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "year" INTEGER NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnualGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuarterlyGoal" (
    "id" TEXT NOT NULL,
    "annualGoalId" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuarterlyGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalGoal" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "quarterlyGoalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "progressType" "ProgressType" NOT NULL,
    "targetValue" DOUBLE PRECISION,
    "unit" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalProgressEntry" (
    "id" TEXT NOT NULL,
    "personalGoalId" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "valueBoolean" BOOLEAN,
    "valuePercent" DOUBLE PRECISION,
    "valueNumeric" DOUBLE PRECISION,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalProgressEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckinTemplateQuestion" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckinTemplateQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCheckinPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cadence" "CheckinCadence" NOT NULL DEFAULT 'WEEKLY',
    "anchorWeekStartDate" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCheckinPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyCheckin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "status" "CheckinStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyCheckinAnswer" (
    "id" TEXT NOT NULL,
    "checkinId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "textAnswer" TEXT,
    "numberAnswer" DOUBLE PRECISION,
    "booleanAnswer" BOOLEAN,

    CONSTRAINT "WeeklyCheckinAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailNotificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryStatus" TEXT NOT NULL,

    CONSTRAINT "EmailNotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("sessionToken")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "QuarterlyGoal_annualGoalId_quarter_title_key" ON "QuarterlyGoal"("annualGoalId", "quarter", "title");

-- CreateIndex
CREATE UNIQUE INDEX "GoalProgressEntry_personalGoalId_weekStartDate_key" ON "GoalProgressEntry"("personalGoalId", "weekStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "CheckinTemplateQuestion_teamId_key_key" ON "CheckinTemplateQuestion"("teamId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "UserCheckinPreference_userId_key" ON "UserCheckinPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyCheckin_userId_weekStartDate_key" ON "WeeklyCheckin"("userId", "weekStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "EmailNotificationLog_userId_weekStartDate_kind_key" ON "EmailNotificationLog"("userId", "weekStartDate", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualGoal" ADD CONSTRAINT "AnnualGoal_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualGoal" ADD CONSTRAINT "AnnualGoal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarterlyGoal" ADD CONSTRAINT "QuarterlyGoal_annualGoalId_fkey" FOREIGN KEY ("annualGoalId") REFERENCES "AnnualGoal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalGoal" ADD CONSTRAINT "PersonalGoal_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalGoal" ADD CONSTRAINT "PersonalGoal_quarterlyGoalId_fkey" FOREIGN KEY ("quarterlyGoalId") REFERENCES "QuarterlyGoal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalProgressEntry" ADD CONSTRAINT "GoalProgressEntry_personalGoalId_fkey" FOREIGN KEY ("personalGoalId") REFERENCES "PersonalGoal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckinTemplateQuestion" ADD CONSTRAINT "CheckinTemplateQuestion_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCheckinPreference" ADD CONSTRAINT "UserCheckinPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyCheckin" ADD CONSTRAINT "WeeklyCheckin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyCheckin" ADD CONSTRAINT "WeeklyCheckin_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyCheckinAnswer" ADD CONSTRAINT "WeeklyCheckinAnswer_checkinId_fkey" FOREIGN KEY ("checkinId") REFERENCES "WeeklyCheckin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyCheckinAnswer" ADD CONSTRAINT "WeeklyCheckinAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "CheckinTemplateQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailNotificationLog" ADD CONSTRAINT "EmailNotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

