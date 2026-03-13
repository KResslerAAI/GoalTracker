import { CheckinCadence, CheckinStatus, GoalStatus, ProgressType, Role } from "@prisma/client";
import { progressToPercent } from "@/lib/progress";
import { decodePrioritiesAnswer } from "@/lib/priorities";

type MockUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  active: boolean;
  teamId: string | null;
};

type MockTeam = {
  id: string;
  name: string;
  timezone: string;
};

type MockPreference = {
  userId: string;
  cadence: CheckinCadence;
  anchorWeekStartDate: Date;
  timezone?: string | null;
  reminderMethod?: "TEAMS_MESSAGE" | "EMAIL" | "BOTH";
};

type MockGoal = {
  id: string;
  ownerUserId: string;
  quarterlyGoalId: string;
  title: string;
  description?: string;
  progressType: ProgressType;
  status: GoalStatus;
  targetValue?: number | null;
  unit?: string;
  dueDate?: Date | null;
};

type MockAnnualGoal = {
  id: string;
  teamId: string;
  title: string;
  description?: string;
  progressPercent: number;
  year: number;
  status: GoalStatus;
  createdById: string;
};

type MockQuarterlyGoal = {
  id: string;
  annualGoalId: string;
  quarter: number;
  title: string;
  description?: string;
  weight: number;
  status: GoalStatus;
};

type MockProgressEntry = {
  personalGoalId: string;
  weekStartDate: Date;
  valueBoolean?: boolean;
  valuePercent?: number;
  valueNumeric?: number;
  note?: string;
};

type MockStore = {
  usersById: Record<string, MockUser>;
  userIdByEmail: Record<string, string>;
  teamsById: Record<string, MockTeam>;
  preferencesByUserId: Record<string, MockPreference>;
  goalsById: Record<string, MockGoal>;
  annualGoalsById: Record<string, MockAnnualGoal>;
  quarterlyGoalsById: Record<string, MockQuarterlyGoal>;
  progressByGoalWeek: Record<string, MockProgressEntry>;
  checkinStatusByKey: Record<string, CheckinStatus>;
  checkinAnswersByKey: Record<string, Array<{ questionId: string; textAnswer?: string }>>;
  teamQuestionsByTeamId: Record<string, Array<{
    id: string;
    key: string;
    prompt: string;
    type: string;
    required: boolean;
    isDefault: boolean;
  }>>;
};

declare global {
  // eslint-disable-next-line no-var
  var mockStore: MockStore | undefined;
}

const defaultQuestions = [
  {
    id: "q-next-actions",
    key: "weekly_next_steps",
    prompt: "Weekly priorities",
    type: "short_answer",
    required: true,
    isDefault: true
  }
];

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function weekStart(candidate: Date) {
  const d = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth(), candidate.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function checkinKey(userId: string, weekStartDate: Date) {
  return `${userId}:${weekStartDate.toISOString().slice(0, 10)}`;
}

function goalWeekKey(personalGoalId: string, weekStartDate: Date) {
  return `${personalGoalId}:${weekStartDate.toISOString().slice(0, 10)}`;
}

function parseTracking(description?: string) {
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

function isDue(cadence: CheckinCadence, anchorWeekStartDate: Date, candidateWeek: Date) {
  if (cadence === CheckinCadence.WEEKLY) return true;
  const a = weekStart(anchorWeekStartDate).getTime();
  const c = weekStart(candidateWeek).getTime();
  const diffDays = Math.floor((c - a) / (24 * 60 * 60 * 1000));
  return diffDays % 14 === 0;
}

export const isMockMode = process.env.MOCK_MODE === "true";

function store(): MockStore {
  if (!global.mockStore) {
    global.mockStore = {
      usersById: {},
      userIdByEmail: {},
      teamsById: {},
      preferencesByUserId: {},
      goalsById: {},
      annualGoalsById: {},
      quarterlyGoalsById: {},
      progressByGoalWeek: {},
      checkinStatusByKey: {},
      checkinAnswersByKey: {},
      teamQuestionsByTeamId: {}
    };
  }
  // Backfill newly added keys for existing in-memory stores after hot reloads.
  global.mockStore.progressByGoalWeek = global.mockStore.progressByGoalWeek ?? {};
  global.mockStore.checkinStatusByKey = global.mockStore.checkinStatusByKey ?? {};
  global.mockStore.checkinAnswersByKey = global.mockStore.checkinAnswersByKey ?? {};
  global.mockStore.teamQuestionsByTeamId = global.mockStore.teamQuestionsByTeamId ?? {};
  // Backfill partial/corrupted annual goals created before stricter PATCH sanitization.
  for (const goal of Object.values(global.mockStore.annualGoalsById)) {
    if (!goal.title) goal.title = "Untitled Team Goal";
    if (!Number.isFinite(goal.year as number)) {
      const parsedYear = (() => {
        const match = goal.description?.match(/endDate (\d{4})-\d{2}-\d{2}\.$/);
        return match ? Number(match[1]) : NaN;
      })();
      goal.year = Number.isFinite(parsedYear) ? parsedYear : new Date().getUTCFullYear();
    }
    if (!Number.isFinite(goal.progressPercent as number)) goal.progressPercent = 0;
  }
  return global.mockStore;
}

export function getMockUserByEmail(email: string) {
  const s = store();
  const id = s.userIdByEmail[email.toLowerCase()];
  return id ? s.usersById[id] : null;
}

export function getMockUserById(id: string) {
  const s = store();
  return s.usersById[id] ?? null;
}

export function createMockUser(input: { email: string; name: string | null; role: Role }) {
  const s = store();
  const email = input.email.toLowerCase();
  if (s.userIdByEmail[email]) {
    throw new Error("An account with this email already exists. Please use Log In.");
  }
  const id = makeId("user");
  const user: MockUser = {
    id,
    email,
    name: input.name,
    role: input.role,
    active: true,
    teamId: null
  };
  s.usersById[id] = user;
  s.userIdByEmail[email] = id;
  return user;
}

export function updateMockUser(id: string, updates: Partial<Omit<MockUser, "id" | "email">>) {
  const s = store();
  const existing = s.usersById[id];
  if (!existing) return null;
  s.usersById[id] = { ...existing, ...updates };
  return s.usersById[id];
}

export function setupMockTeamForManager(managerId: string, teamName: string) {
  const s = store();
  const manager = s.usersById[managerId];
  if (!manager) {
    throw new Error("Unauthorized");
  }

  const teamId = makeId("team");
  s.teamsById[teamId] = { id: teamId, name: teamName, timezone: "UTC" };
  s.teamQuestionsByTeamId[teamId] = defaultQuestions;
  manager.teamId = teamId;
  manager.role = Role.MANAGER;

  return { teamId };
}

export function getMockTeam(teamId: string) {
  return store().teamsById[teamId] ?? null;
}

export function updateMockTeam(teamId: string, updates: Partial<Pick<MockTeam, "name" | "timezone">>) {
  const s = store();
  const existing = s.teamsById[teamId];
  if (!existing) return null;
  s.teamsById[teamId] = { ...existing, ...updates };
  return s.teamsById[teamId];
}

export function getOrCreateMockPreference(userId: string) {
  const s = store();
  const existing = s.preferencesByUserId[userId];
  if (existing) return existing;
  const created: MockPreference = {
    userId,
    cadence: CheckinCadence.WEEKLY,
    anchorWeekStartDate: weekStart(new Date()),
    timezone: null,
    reminderMethod: "BOTH"
  };
  s.preferencesByUserId[userId] = created;
  return created;
}

export function updateMockPreference(
  userId: string,
  cadence: CheckinCadence,
  timezone?: string,
  reminderMethod?: "TEAMS_MESSAGE" | "EMAIL" | "BOTH"
) {
  const existing = getOrCreateMockPreference(userId);
  const next: MockPreference = {
    ...existing,
    cadence,
    timezone: timezone ?? existing.timezone,
    reminderMethod: reminderMethod ?? existing.reminderMethod ?? "BOTH",
    anchorWeekStartDate: cadence === CheckinCadence.BIWEEKLY ? weekStart(new Date()) : existing.anchorWeekStartDate
  };
  store().preferencesByUserId[userId] = next;
  return next;
}

export function createMockAnnualGoal(input: {
  teamId: string;
  createdById: string;
  title: string;
  description?: string;
  year: number;
}) {
  const s = store();
  const id = makeId("annual");
  const goal: MockAnnualGoal = {
    id,
    teamId: input.teamId,
    createdById: input.createdById,
    title: input.title,
    description: input.description,
    progressPercent: 0,
    year: input.year,
    status: GoalStatus.ACTIVE
  };
  s.annualGoalsById[id] = goal;
  return goal;
}

export function listMockAnnualGoals(teamId: string) {
  return Object.values(store().annualGoalsById).filter((goal) => goal.teamId === teamId);
}

export function updateMockAnnualGoal(
  id: string,
  teamId: string,
  updates: Partial<Pick<MockAnnualGoal, "title" | "description" | "year" | "progressPercent" | "status">>
) {
  const s = store();
  const existing = s.annualGoalsById[id];
  if (!existing || existing.teamId !== teamId) return null;
  s.annualGoalsById[id] = { ...existing, ...updates };
  return s.annualGoalsById[id];
}

export function createMockQuarterlyGoal(input: {
  annualGoalId: string;
  quarter: number;
  title: string;
  description?: string;
  weight?: number;
}) {
  const s = store();
  const annual = s.annualGoalsById[input.annualGoalId];
  if (!annual) {
    throw new Error("Annual goal not found");
  }
  const id = makeId("quarter");
  const goal: MockQuarterlyGoal = {
    id,
    annualGoalId: input.annualGoalId,
    quarter: input.quarter,
    title: input.title,
    description: input.description,
    weight: input.weight ?? 1,
    status: GoalStatus.ACTIVE
  };
  s.quarterlyGoalsById[id] = goal;
  return goal;
}

export function listMockQuarterlyGoals(teamId: string) {
  const s = store();
  return Object.values(s.quarterlyGoalsById).filter((goal) => {
    const annual = s.annualGoalsById[goal.annualGoalId];
    return annual?.teamId === teamId;
  });
}

export function updateMockQuarterlyGoal(
  id: string,
  teamId: string,
  updates: Partial<Pick<MockQuarterlyGoal, "title" | "description" | "quarter" | "weight" | "status">>
) {
  const s = store();
  const existing = s.quarterlyGoalsById[id];
  if (!existing) return null;
  const annual = s.annualGoalsById[existing.annualGoalId];
  if (!annual || annual.teamId !== teamId) return null;
  s.quarterlyGoalsById[id] = { ...existing, ...updates };
  return s.quarterlyGoalsById[id];
}

export function createMockPersonalGoal(input: {
  ownerUserId: string;
  quarterlyGoalId: string;
  title: string;
  description?: string;
  progressType: ProgressType;
  targetValue?: number;
  unit?: string;
  dueDate?: string;
}) {
  const s = store();
  if (!s.quarterlyGoalsById[input.quarterlyGoalId]) {
    throw new Error("Quarterly goal not found");
  }
  const id = makeId("goal");
  const goal: MockGoal = {
    id,
    ownerUserId: input.ownerUserId,
    quarterlyGoalId: input.quarterlyGoalId,
    title: input.title,
    description: input.description,
    progressType: input.progressType,
    status: GoalStatus.ACTIVE,
    targetValue: input.targetValue,
    unit: input.unit,
    dueDate: input.dueDate ? new Date(input.dueDate) : null
  };
  s.goalsById[id] = goal;
  return goal;
}

export function updateMockPersonalGoal(
  id: string,
  ownerUserId: string,
  updates: Partial<Pick<MockGoal, "title" | "description" | "targetValue" | "unit" | "dueDate" | "status">>
) {
  const s = store();
  const existing = s.goalsById[id];
  if (!existing || existing.ownerUserId !== ownerUserId) return null;
  s.goalsById[id] = { ...existing, ...updates };
  return s.goalsById[id];
}

export function listMockPersonalGoals(ownerUserId: string) {
  const s = store();
  return Object.values(s.goalsById)
    .filter((goal) => goal.ownerUserId === ownerUserId && goal.status === GoalStatus.ACTIVE)
    .map((goal) => {
      const latest = getLatestProgressEntry(goal.id);
      return {
        ...goal,
        progressPercent: progressToPercent({
          progressType: goal.progressType,
          valueBoolean: latest?.valueBoolean,
          valuePercent: latest?.valuePercent,
          valueNumeric: latest?.valueNumeric,
          targetValue: goal.targetValue ?? null
        })
      };
    });
}

export function inviteMockTeamMember(input: { teamId: string; email: string; name?: string; role: Role }) {
  const s = store();
  const email = input.email.toLowerCase();
  const existingId = s.userIdByEmail[email];
  if (existingId) {
    const updated = updateMockUser(existingId, {
      name: input.name ?? s.usersById[existingId].name,
      role: input.role,
      teamId: input.teamId,
      active: true
    });
    return { userId: updated?.id ?? existingId };
  }

  const user = createMockUser({
    email,
    name: input.name ?? null,
    role: input.role
  });
  user.teamId = input.teamId;
  getOrCreateMockPreference(user.id);
  return { userId: user.id };
}

export function listMockTeamMembers(teamId: string) {
  const s = store();
  return Object.values(s.usersById)
    .filter((u) => u.teamId === teamId && u.role === Role.MEMBER && u.active)
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role
    }));
}

export function removeMockTeamMember(teamId: string, userId: string) {
  const s = store();
  const user = s.usersById[userId];
  if (!user || user.teamId !== teamId || user.role !== Role.MEMBER) {
    return null;
  }
  user.teamId = null;
  return { ok: true, userId };
}

export function getMockDashboard(teamId: string, weekStartDate: Date) {
  const s = store();
  const members = Object.values(s.usersById).filter((u) => u.teamId === teamId && u.role === Role.MEMBER && u.active);
  const rows = members.map((member) => {
    const pref = getOrCreateMockPreference(member.id);
    const dueThisWeek = isDue(pref.cadence, pref.anchorWeekStartDate, weekStartDate);
    const submitted = s.checkinStatusByKey[checkinKey(member.id, weekStartDate)] === CheckinStatus.SUBMITTED;
    const goals = Object.values(s.goalsById).filter((g) => g.ownerUserId === member.id && g.status === GoalStatus.ACTIVE);
    const goalPercents = goals.map((goal) => {
      const entry = s.progressByGoalWeek[goalWeekKey(goal.id, weekStartDate)];
      return progressToPercent({
        progressType: goal.progressType,
        valueBoolean: entry?.valueBoolean,
        valuePercent: entry?.valuePercent,
        valueNumeric: entry?.valueNumeric,
        targetValue: goal.targetValue ?? null
      });
    });
    const progressPercent = goalPercents.length
      ? goalPercents.reduce((acc, percent) => acc + percent, 0) / goalPercents.length
      : 0;
    const health = progressPercent >= 70 ? "green" : progressPercent >= 40 ? "yellow" : "red";

    return {
      userId: member.id,
      name: member.name,
      email: member.email,
      cadence: pref.cadence,
      dueThisWeek,
      submitted,
      progressPercent,
      health
    };
  });

  const dueUsers = rows.filter((m) => m.dueThisWeek);
  const submitted = dueUsers.filter((m) => m.submitted).length;

  const teamGoals = Object.values(s.annualGoalsById)
    .filter((goal) => goal.teamId === teamId && goal.status === GoalStatus.ACTIVE)
    .map((annual) => {
      const quarterly = Object.values(s.quarterlyGoalsById).filter((q) => q.annualGoalId === annual.id);
      const personal = quarterly.flatMap((q) =>
        Object.values(s.goalsById).filter((g) => g.quarterlyGoalId === q.id && g.status === GoalStatus.ACTIVE)
      );
      const personalRows = personal.map((g) => {
        const owner = s.usersById[g.ownerUserId];
        const entry = s.progressByGoalWeek[goalWeekKey(g.id, weekStartDate)];
        return {
          id: g.id,
          title: g.title,
          ownerName: owner?.name ?? owner?.email ?? "Unknown",
          ownerEmail: owner?.email ?? "",
          progressPercent: progressToPercent({
            progressType: g.progressType,
            valueBoolean: entry?.valueBoolean,
            valuePercent: entry?.valuePercent,
            valueNumeric: entry?.valueNumeric,
            targetValue: g.targetValue ?? null
          })
        };
      });
      return {
        id: annual.id,
        title: annual.title,
        startDate: `${annual.year}-01-01`,
        endDate: `${annual.year}-12-31`,
        progressPercent: annual.progressPercent,
        tracking: (() => {
          const fromAnnual = parseTracking(annual.description);
          const fromQuarterly = quarterly.map((q) => parseTracking(q.description)).find((t) => Boolean(t));
          const parsed = fromAnnual ?? fromQuarterly ?? null;
          if (!parsed) return null;
          return {
            unit: parsed.unit,
            targetValue: parsed.targetValue,
            progressValue: (annual.progressPercent / 100) * parsed.targetValue
          };
        })(),
        personalGoals: personalRows
      };
    });

  return {
    compliance: {
      dueUsers: dueUsers.length,
      submitted,
      completionPercent: dueUsers.length ? (submitted / dueUsers.length) * 100 : 0
    },
    members: rows,
    teamGoals
  };
}

export function getMockMemberDashboard(userId: string) {
  const s = store();
  const user = s.usersById[userId];
  if (!user || !user.teamId) {
    throw new Error("No team assigned");
  }

  const team = s.teamsById[user.teamId];
  const teamGoals = Object.values(s.annualGoalsById)
    .filter((goal) => goal.teamId === user.teamId && goal.status === GoalStatus.ACTIVE)
    .map((annual) => {
      const quarterly = Object.values(s.quarterlyGoalsById).filter((q) => q.annualGoalId === annual.id);
      const personalGoals = quarterly
        .flatMap((q) => Object.values(s.goalsById).filter((g) => g.quarterlyGoalId === q.id && g.ownerUserId === user.id && g.status === GoalStatus.ACTIVE))
        .map((goal) => {
          const latest = getLatestProgressEntry(goal.id);
          return {
            id: goal.id,
            title: goal.title,
            dueDate: goal.dueDate ?? null,
            unit: goal.unit ?? null,
            targetValue: goal.targetValue ?? null,
            progressPercent: progressToPercent({
              progressType: goal.progressType,
              valueBoolean: latest?.valueBoolean,
              valuePercent: latest?.valuePercent,
              valueNumeric: latest?.valueNumeric,
              targetValue: goal.targetValue ?? null
            })
          };
        });

      const fromAnnual = parseTracking(annual.description);
      const fromQuarterly = quarterly.map((q) => parseTracking(q.description)).find((tracking) => Boolean(tracking));
      const tracking = fromAnnual ?? fromQuarterly ?? null;

      return {
        id: annual.id,
        title: annual.title,
        startDate: `${annual.year}-01-01`,
        endDate: `${annual.year}-12-31`,
        progressPercent: annual.progressPercent,
        tracking: tracking
          ? {
              unit: tracking.unit,
              targetValue: tracking.targetValue,
              progressValue: (annual.progressPercent / 100) * tracking.targetValue
            }
          : null,
        personalGoals
      };
    });

  return {
    name: user.name ?? user.email,
    teamName: team?.name ?? "Team",
    teamGoals
  };
}

export function getMockCheckinData(userId: string, weekStartDate: Date, teamId: string | null) {
  const s = store();
  const pref = getOrCreateMockPreference(userId);
  const due = isDue(pref.cadence, pref.anchorWeekStartDate, weekStartDate);
  if (!due) {
    return { due: false, checkin: null };
  }

  const goals = Object.values(s.goalsById)
    .filter((g) => g.ownerUserId === userId && g.status === GoalStatus.ACTIVE)
    .map((goal) => {
      const current = s.progressByGoalWeek[goalWeekKey(goal.id, weekStartDate)];
      const previous = Object.values(s.progressByGoalWeek)
        .filter((entry) => entry.personalGoalId === goal.id && entry.weekStartDate.getTime() < weekStartDate.getTime())
        .sort((a, b) => b.weekStartDate.getTime() - a.weekStartDate.getTime())[0];
      return {
        ...goal,
        currentValueBoolean: current?.valueBoolean ?? null,
        currentValuePercent: current?.valuePercent ?? null,
        currentValueNumeric: current?.valueNumeric ?? null,
        currentProgressPercent: progressToPercent({
          progressType: goal.progressType,
          valueBoolean: current?.valueBoolean,
          valuePercent: current?.valuePercent,
          valueNumeric: current?.valueNumeric,
          targetValue: goal.targetValue
        }),
        previousValueBoolean: previous?.valueBoolean ?? null,
        previousValuePercent: previous?.valuePercent ?? null,
        previousValueNumeric: previous?.valueNumeric ?? null,
        previousProgressPercent: progressToPercent({
          progressType: goal.progressType,
          valueBoolean: previous?.valueBoolean,
          valuePercent: previous?.valuePercent,
          valueNumeric: previous?.valueNumeric,
          targetValue: goal.targetValue
        }),
        previousWeekStartDate: previous?.weekStartDate.toISOString().slice(0, 10) ?? null
      };
    });
  const questions = teamId ? s.teamQuestionsByTeamId[teamId] ?? defaultQuestions : defaultQuestions;
  const key = checkinKey(userId, weekStartDate);
  const submitted = s.checkinStatusByKey[key] === CheckinStatus.SUBMITTED;
  const previousPriorities: string[] = [];
  const currentPriorities: string[] = [];
  let lastCheckinDate: string | null = null;
  const nextActionsQuestion = questions.find((q) => q.key === "weekly_next_steps");
  const currentAnswers = (s.checkinAnswersByKey[key] ?? []).map((answer) => ({
    questionId: answer.questionId,
    textAnswer: answer.textAnswer ?? null,
    numberAnswer: null,
    booleanAnswer: null
  }));

  if (nextActionsQuestion) {
    const currentAnswer = currentAnswers.find((answer) => answer.questionId === nextActionsQuestion.id);
    currentPriorities.push(...decodePrioritiesAnswer(currentAnswer?.textAnswer ?? undefined));
  }

  if (nextActionsQuestion) {
    const submittedWeeks = Object.entries(s.checkinStatusByKey)
      .filter(([key, status]) => key.startsWith(`${userId}:`) && status === CheckinStatus.SUBMITTED)
      .map(([entryKey]) => entryKey.split(":")[1])
      .filter((iso) => iso < weekStartDate.toISOString().slice(0, 10))
      .sort();
    const latest = submittedWeeks[submittedWeeks.length - 1];
    if (submitted) {
      lastCheckinDate = weekStartDate.toISOString().slice(0, 10);
    } else if (latest) {
      lastCheckinDate = latest;
    }
    if (latest) {
      const prevKey = `${userId}:${latest}`;
      const answer = (s.checkinAnswersByKey[prevKey] ?? []).find((a) => a.questionId === nextActionsQuestion.id);
      previousPriorities.push(...decodePrioritiesAnswer(answer?.textAnswer));
    }
  }

  const history = Object.entries(s.checkinStatusByKey)
    .filter(([entryKey, status]) => entryKey.startsWith(`${userId}:`) && status === CheckinStatus.SUBMITTED)
    .map(([entryKey]) => entryKey.split(":")[1])
    .sort((a, b) => b.localeCompare(a))
    .map((iso) => {
      const answers = s.checkinAnswersByKey[`${userId}:${iso}`] ?? [];
      const priorities = nextActionsQuestion
        ? decodePrioritiesAnswer(answers.find((answer) => answer.questionId === nextActionsQuestion.id)?.textAnswer)
        : [];
      return {
        id: `${userId}:${iso}`,
        weekStartDate: iso,
        submittedAt: `${iso}T00:00:00.000Z`,
        priorities,
        answers: answers
          .filter((answer) => answer.questionId !== nextActionsQuestion?.id)
          .map((answer) => ({
            questionId: answer.questionId,
            prompt: questions.find((question) => question.id === answer.questionId)?.prompt ?? "Question",
            textAnswer: answer.textAnswer ?? null,
            numberAnswer: null,
            booleanAnswer: null
          })),
        goals: goals.map((goal) => {
          const entry = s.progressByGoalWeek[goalWeekKey(goal.id, new Date(`${iso}T00:00:00.000Z`))];
          return {
            id: goal.id,
            title: goal.title,
            progressType: goal.progressType,
            unit: goal.unit ?? null,
            valueBoolean: entry?.valueBoolean ?? null,
            valuePercent: entry?.valuePercent ?? null,
            valueNumeric: entry?.valueNumeric ?? null
          };
        })
      };
    });

  return {
    due: true,
    checkin: submitted
      ? {
          id: key,
          status: CheckinStatus.SUBMITTED,
          submittedAt: `${weekStartDate.toISOString().slice(0, 10)}T00:00:00.000Z`
        }
      : null,
    questions,
    goals,
    previousPriorities,
    currentPriorities,
    currentAnswers,
    lastCheckinDate,
    history
  };
}

export function submitMockCheckin(userId: string, weekStartDate: Date) {
  store().checkinStatusByKey[checkinKey(userId, weekStartDate)] = CheckinStatus.SUBMITTED;
  return { ok: true };
}

export function getMockManagerCheckinDetail(teamId: string, userId: string, weekStartDate: Date) {
  const s = store();
  const member = s.usersById[userId];
  if (!member || member.teamId !== teamId || member.role !== Role.MEMBER) {
    throw new Error("Team member not found");
  }

  const key = checkinKey(userId, weekStartDate);
  if (s.checkinStatusByKey[key] !== CheckinStatus.SUBMITTED) {
    throw new Error("No submitted check-in for this member and week");
  }

  const questions = s.teamQuestionsByTeamId[teamId] ?? defaultQuestions;
  const answers = (s.checkinAnswersByKey[key] ?? []).map((answer) => {
    const question = questions.find((q) => q.id === answer.questionId);
    return {
      questionId: answer.questionId,
      prompt: question?.prompt ?? "Question",
      key: question?.key ?? null,
      type: question?.type ?? "short_answer",
      textAnswer: answer.textAnswer ?? null
    };
  });

  const progress = Object.values(s.goalsById)
    .filter((goal) => goal.ownerUserId === userId)
    .map((goal) => {
      const entry = s.progressByGoalWeek[goalWeekKey(goal.id, weekStartDate)];
      return {
        personalGoalId: goal.id,
        title: goal.title,
        progressType: goal.progressType,
        unit: goal.unit ?? null,
        targetValue: goal.targetValue ?? null,
        valueBoolean: entry?.valueBoolean ?? null,
        valuePercent: entry?.valuePercent ?? null,
        valueNumeric: entry?.valueNumeric ?? null
      };
    });

  return {
    userId: member.id,
    name: member.name ?? null,
    email: member.email,
    weekStartDate: weekStartDate.toISOString().slice(0, 10),
    submittedAt: weekStartDate.toISOString(),
    progress,
    answers
  };
}

function getLatestProgressEntry(personalGoalId: string): MockProgressEntry | null {
  const candidates = Object.values(store().progressByGoalWeek)
    .filter((entry) => entry.personalGoalId === personalGoalId)
    .sort((a, b) => b.weekStartDate.getTime() - a.weekStartDate.getTime());
  return candidates[0] ?? null;
}

export function submitMockCheckinWithProgress(
  userId: string,
  weekStartDate: Date,
  answers: Array<{
    questionId: string;
    textAnswer?: string;
  }>,
  progress: Array<{
    personalGoalId: string;
    valueBoolean?: boolean;
    valuePercent?: number;
    valueNumeric?: number;
    note?: string;
  }>
) {
  const s = store();
  const key = checkinKey(userId, weekStartDate);
  s.checkinStatusByKey[key] = CheckinStatus.SUBMITTED;
  s.checkinAnswersByKey[key] = answers.map((answer) => ({
    questionId: answer.questionId,
    textAnswer: answer.textAnswer
  }));

  for (const update of progress) {
    const goal = s.goalsById[update.personalGoalId];
    if (!goal || goal.ownerUserId !== userId) {
      continue;
    }

    s.progressByGoalWeek[goalWeekKey(goal.id, weekStartDate)] = {
      personalGoalId: goal.id,
      weekStartDate,
      valueBoolean: update.valueBoolean,
      valuePercent: update.valuePercent,
      valueNumeric: update.valueNumeric,
      note: update.note
    };
  }

  return { ok: true };
}

export function getMockCheckinTemplate(teamId: string) {
  const s = store();
  return s.teamQuestionsByTeamId[teamId] ?? defaultQuestions;
}

export function addMockCheckinTemplateQuestion(input: {
  teamId: string;
  key: string;
  prompt: string;
  type: string;
  required: boolean;
}) {
  const s = store();
  const existing = s.teamQuestionsByTeamId[input.teamId] ?? defaultQuestions;
  const next = [
    ...existing,
    {
      id: makeId("q"),
      key: input.key,
      prompt: input.prompt,
      type: input.type,
      required: input.required,
      isDefault: false
    }
  ];
  s.teamQuestionsByTeamId[input.teamId] = next;
  return next[next.length - 1];
}

export function updateMockCheckinTemplateQuestion(input: {
  teamId: string;
  id: string;
  prompt: string;
  type: string;
  required: boolean;
}) {
  const s = store();
  const questions = s.teamQuestionsByTeamId[input.teamId] ?? defaultQuestions;
  const idx = questions.findIndex((q) => q.id === input.id);
  if (idx === -1) {
    throw new Error("Question not found");
  }
  if (questions[idx].isDefault) {
    throw new Error("Default questions cannot be edited");
  }
  const next = [...questions];
  next[idx] = {
    ...next[idx],
    prompt: input.prompt,
    type: input.type,
    required: input.required
  };
  s.teamQuestionsByTeamId[input.teamId] = next;
  return next[idx];
}

export function deleteMockCheckinTemplateQuestion(teamId: string, id: string) {
  const s = store();
  const questions = s.teamQuestionsByTeamId[teamId] ?? defaultQuestions;
  const target = questions.find((q) => q.id === id);
  if (!target) {
    throw new Error("Question not found");
  }
  if (target.isDefault) {
    throw new Error("Default questions cannot be deleted");
  }
  s.teamQuestionsByTeamId[teamId] = questions.filter((q) => q.id !== id);
  return { ok: true };
}

function overlapsDateRange(start: Date, endExclusive: Date, annualYear: number) {
  const annualStart = new Date(Date.UTC(annualYear, 0, 1, 0, 0, 0));
  const annualEnd = new Date(Date.UTC(annualYear + 1, 0, 1, 0, 0, 0));
  return annualStart < endExclusive && annualEnd > start;
}

export function getMockRangeReport(userId: string, start: Date, endExclusive: Date) {
  const s = store();
  const user = s.usersById[userId];
  if (!user) {
    throw new Error("Unauthorized");
  }

  const teamGoals = user.role === Role.MANAGER && user.teamId
    ? Object.values(s.annualGoalsById)
        .filter((goal) => goal.teamId === user.teamId && overlapsDateRange(start, endExclusive, goal.year))
        .map((goal) => {
          const quarterlyIds = Object.values(s.quarterlyGoalsById)
            .filter((q) => q.annualGoalId === goal.id)
            .map((q) => q.id);
          const contributors = Object.values(s.goalsById)
            .filter((personal) => quarterlyIds.includes(personal.quarterlyGoalId))
            .map((personal) => {
              const owner = s.usersById[personal.ownerUserId];
              const latest = getLatestProgressEntry(personal.id);
              return {
                id: personal.id,
                title: personal.title,
                ownerName: owner?.name ?? null,
                ownerEmail: owner?.email ?? "",
                status: personal.status,
                dueDate: personal.dueDate,
                progressPercent: progressToPercent({
                  progressType: personal.progressType,
                  valueBoolean: latest?.valueBoolean,
                  valuePercent: latest?.valuePercent,
                  valueNumeric: latest?.valueNumeric,
                  targetValue: personal.targetValue ?? null
                })
              };
            });

          return {
            id: goal.id,
            title: goal.title,
            status: goal.status,
            progressPercent: goal.progressPercent,
            year: goal.year,
            contributors
          };
        })
    : [];

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: new Date(endExclusive.getTime() - 1).toISOString().slice(0, 10),
    teamGoals
  };
}

export function getMockYearlyReport(userId: string, year: number) {
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
  return getMockRangeReport(userId, start, endExclusive);
}
