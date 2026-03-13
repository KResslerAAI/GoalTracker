"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { decodeQuestionPrompt } from "@/lib/checkin-questions";
import { encodePrioritiesAnswer } from "@/lib/priorities";
import { formatDisplayDate } from "@/lib/date-format";

type CheckinQuestion = {
  id: string;
  key?: string;
  prompt: string;
  type: string;
  required: boolean;
};

type HistoryGoal = {
  id: string;
  title: string;
  progressType: "BOOLEAN" | "PERCENT" | "NUMERIC";
  unit?: string | null;
  valueBoolean?: boolean | null;
  valuePercent?: number | null;
  valueNumeric?: number | null;
};

type CheckinData = {
  due: boolean;
  checkin: { id: string; status: string; submittedAt?: string | null } | null;
  questions: CheckinQuestion[];
  previousPriorities?: string[];
  currentPriorities?: string[];
  currentAnswers?: Array<{
    questionId: string;
    textAnswer?: string | null;
    numberAnswer?: number | null;
    booleanAnswer?: boolean | null;
  }>;
  lastCheckinDate?: string | null;
  goals: Array<{
    id: string;
    title: string;
    description?: string | null;
    dueDate?: string | null;
    progressType: "BOOLEAN" | "PERCENT" | "NUMERIC";
    unit?: string | null;
    targetValue?: number | null;
    currentValueBoolean?: boolean | null;
    currentValuePercent?: number | null;
    currentValueNumeric?: number | null;
    currentProgressPercent?: number | null;
    previousValueBoolean?: boolean | null;
    previousValuePercent?: number | null;
    previousValueNumeric?: number | null;
    previousProgressPercent?: number | null;
    previousWeekStartDate?: string | null;
  }>;
  history?: Array<{
    id: string;
    weekStartDate: string;
    submittedAt: string;
    priorities: string[];
    answers: Array<{
      questionId: string;
      prompt: string;
      textAnswer?: string | null;
      numberAnswer?: number | null;
      booleanAnswer?: boolean | null;
    }>;
    goals: Array<{
      id: string;
      title: string;
      progressType: "BOOLEAN" | "PERCENT" | "NUMERIC";
      unit?: string | null;
      valueBoolean?: boolean | null;
      valuePercent?: number | null;
      valueNumeric?: number | null;
    }>;
  }>;
};

type SubmissionSummary = {
  goals: Array<{
    id: string;
    title: string;
    value: string;
  }>;
  priorities: string[];
  answers: Array<{
    questionId: string;
    prompt: string;
    value: string;
  }>;
};

function displayGoalTitle(title: string) {
  return title
    .replace(/^Q[1-4]\s*[-–—:]\s*/i, "")
    .replace(/^Quarter\s*[1-4]\s*[-–—:]\s*/i, "")
    .trim();
}

function formatLastCheckinDate(value?: string | null) {
  if (!value) return "Not yet";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function parseTrackingDescription(description?: string | null) {
  if (!description) return null;
  const match = description.match(
    /^Tracking: unit (.*), start (.*), target (.*), startDate (\d{4}-\d{2}-\d{2}), endDate (\d{4}-\d{2}-\d{2})\.$/
  );
  if (!match) return null;
  return {
    unit: match[1],
    targetValue: match[3].replace(match[1], "").trim(),
    startDate: match[4],
    endDate: match[5]
  };
}

function clampPercent(value: number | null | undefined) {
  return Math.max(0, Math.min(100, Number(value ?? 0)));
}

function formatPreviousValue(goal: CheckinData["goals"][number]) {
  if (goal.previousWeekStartDate == null) return "No previous update yet";
  if (goal.progressType === "BOOLEAN") return goal.previousValueBoolean ? "Complete" : "Not complete";
  if (goal.progressType === "PERCENT") return `${Number(goal.previousValuePercent ?? 0).toFixed(0)}%`;
  const numeric = Number(goal.previousValueNumeric ?? 0);
  if (goal.unit === "$") return `$${numeric.toLocaleString()}`;
  if (goal.unit === "#") return `${numeric.toLocaleString()} #`;
  if (goal.unit) return `${numeric.toLocaleString()} ${goal.unit}`;
  return numeric.toLocaleString();
}

function formatSubmittedGoalValue(goal: CheckinData["goals"][number], value: boolean | number) {
  if (goal.progressType === "BOOLEAN") return value ? "Complete" : "Not complete";
  if (goal.progressType === "PERCENT") return `${Number(value).toFixed(0)}%`;
  const numeric = Number(value);
  if (goal.unit === "$") return `$${numeric.toLocaleString()}`;
  if (goal.unit === "#") return `${numeric.toLocaleString()} #`;
  if (goal.unit) return `${numeric.toLocaleString()} ${goal.unit}`;
  return numeric.toLocaleString();
}

function formatHistoryAnswerValue(answer: {
  textAnswer?: string | null;
  numberAnswer?: number | null;
  booleanAnswer?: boolean | null;
}) {
  if (answer.textAnswer && answer.textAnswer.trim()) return answer.textAnswer.trim();
  if (typeof answer.numberAnswer === "number") return String(answer.numberAnswer);
  if (typeof answer.booleanAnswer === "boolean") return answer.booleanAnswer ? "Yes" : "No";
  return "No response";
}

function formatHistoryGoalValue(goal: HistoryGoal) {
  if (goal.progressType === "BOOLEAN") return goal.valueBoolean ? "Complete" : "Not complete";
  if (goal.progressType === "PERCENT") return `${Number(goal.valuePercent ?? 0).toFixed(0)}%`;
  const numeric = Number(goal.valueNumeric ?? 0);
  if (goal.unit === "$") return `$${numeric.toLocaleString()}`;
  if (goal.unit === "#") return `${numeric.toLocaleString()} #`;
  if (goal.unit) return `${numeric.toLocaleString()} ${goal.unit}`;
  return numeric.toLocaleString();
}

export default function CheckinPage({ params }: { params: { weekStart: string } }) {
  const [data, setData] = useState<CheckinData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [submissionSummary, setSubmissionSummary] = useState<SubmissionSummary | null>(null);
  const [priorityActions, setPriorityActions] = useState<Record<string, "complete" | "carry_forward" | "remove">>({});
  const [newPriorities, setNewPriorities] = useState<string[]>(["", "", ""]);

  const loadCheckin = async () => {
    const response = await fetch(`/api/checkins/${params.weekStart}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error ?? "Failed to load check-in");
    }
    setData(body);
  };

  useEffect(() => {
    loadCheckin()
      .catch((e) => setError((e as Error).message));
  }, [params.weekStart]);

  useEffect(() => {
    const previous = data?.previousPriorities ?? [];
    const next: Record<string, "complete" | "carry_forward" | "remove"> = {};
    for (const item of previous) {
      next[item] = "remove";
    }
    setPriorityActions(next);
  }, [data?.previousPriorities]);

  useEffect(() => {
    const submittedPriorities = data?.currentPriorities?.length
      ? data.currentPriorities
      : [];
    const next = submittedPriorities.length ? [...submittedPriorities] : ["", "", ""];
    while (next.length < 3) next.push("");
    setNewPriorities(next.slice(0, 5));
  }, [data?.currentPriorities]);

  const questions = data?.questions ?? [];
  const nextActionsQuestion = questions.find(
    (q) =>
      q.key === "weekly_next_steps" ||
      q.prompt.toLowerCase().includes("3-5 things you'll do in the next week")
  );
  const additionalQuestions = questions.filter((q) => q !== nextActionsQuestion);
  const currentAnswersByQuestionId = useMemo(() => {
    const entries = (data?.currentAnswers ?? []).map((answer) => [answer.questionId, answer] as const);
    return Object.fromEntries(entries);
  }, [data?.currentAnswers]);
  const hasSubmittedCurrentWeek = data?.checkin?.status === "SUBMITTED";
  const formKey = useMemo(() => JSON.stringify({
    submittedAt: data?.checkin?.submittedAt ?? null,
    goals: (data?.goals ?? []).map((goal) => ({
      id: goal.id,
      currentValueBoolean: goal.currentValueBoolean ?? null,
      currentValuePercent: goal.currentValuePercent ?? null,
      currentValueNumeric: goal.currentValueNumeric ?? null
    })),
    priorities: data?.currentPriorities ?? [],
    answers: data?.currentAnswers ?? []
  }), [data?.checkin?.submittedAt, data?.goals, data?.currentPriorities, data?.currentAnswers]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSavedMessage(null);
    const form = new FormData(e.currentTarget);

    const answers = additionalQuestions.map((q) => {
      const { meta } = decodeQuestionPrompt(q.prompt);
      const effectiveType = meta.type ?? q.type;

      if (effectiveType === "multiple_choice") {
        const selected = form.getAll(`question-${q.id}`).map(String);
        return {
          questionId: q.id,
          textAnswer: selected.join(", ")
        };
      }

      return {
        questionId: q.id,
        textAnswer: String(form.get(`question-${q.id}`) ?? "")
      };
    });

    const mergedPriorities = nextActionsQuestion
      ? [...new Set([
          ...(data?.previousPriorities ?? []).filter((priority) => priorityActions[priority] === "carry_forward"),
          ...newPriorities.map((item) => item.trim()).filter(Boolean)
        ])].slice(0, 5)
      : [];

    if (nextActionsQuestion) {
      answers.push({
        questionId: nextActionsQuestion.id,
        textAnswer: encodePrioritiesAnswer(mergedPriorities)
      });
    }

    const progress = (data?.goals ?? []).map((goal) => {
      if (goal.progressType === "BOOLEAN") {
        return {
          personalGoalId: goal.id,
          valueBoolean: form.get(`goal-${goal.id}`) === "on"
        };
      }

      const value = Number(form.get(`goal-${goal.id}`) ?? 0);
      if (goal.progressType === "PERCENT") {
        return { personalGoalId: goal.id, valuePercent: value };
      }

      return { personalGoalId: goal.id, valueNumeric: value };
    });

    const nextSummary: SubmissionSummary = {
      goals: (data?.goals ?? []).map((goal) => {
        const submittedValue = goal.progressType === "BOOLEAN"
          ? progress.find((entry) => entry.personalGoalId === goal.id)?.valueBoolean ?? false
          : goal.progressType === "PERCENT"
            ? progress.find((entry) => entry.personalGoalId === goal.id)?.valuePercent ?? 0
            : progress.find((entry) => entry.personalGoalId === goal.id)?.valueNumeric ?? 0;

        return {
          id: goal.id,
          title: displayGoalTitle(goal.title),
          value: formatSubmittedGoalValue(goal, submittedValue)
        };
      }),
      priorities: mergedPriorities,
      answers: additionalQuestions.map((q) => ({
        questionId: q.id,
        prompt: decodeQuestionPrompt(q.prompt).prompt,
        value: answers.find((answer) => answer.questionId === q.id)?.textAnswer?.trim() || "No response"
      }))
    };

    const res = await fetch(`/api/checkins/${params.weekStart}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers, progress })
    });

    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Submission failed");
      return;
    }

    setSubmissionSummary(nextSummary);
    setSavedMessage("Check-in saved.");
    await loadCheckin();
  };

  const preventEnterSubmit = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter") return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const tagName = target.tagName;
    if (tagName === "TEXTAREA") return;
    if (tagName === "BUTTON") return;
    event.preventDefault();
  };

  if (error) {
    return <p className="small" style={{ color: "#b91c1c" }}>{error}</p>;
  }

  if (!data) {
    return <p className="small">Loading check-in...</p>;
  }

  if (!data.due) {
    return (
      <section className="card">
        <h1 style={{ marginTop: 0 }}>Check-in Not Due</h1>
        <p className="small">Your cadence is set so no check-in is required this week.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="section-head">
        <h1>Update Your Progress and Share Feedback</h1>
        <p className="small">
          You checked in last on {formatLastCheckinDate(data.lastCheckinDate)}. What&apos;s changed since then?
        </p>
      </div>
      {savedMessage ? (
        <div className="card" style={{ padding: "0.8rem", marginBottom: "0.8rem" }}>
          <p className="small" style={{ margin: 0 }}>{savedMessage}</p>
        </div>
      ) : null}

      {(hasSubmittedCurrentWeek || submissionSummary) ? (
        <section className="visual-card" style={{ display: "grid", gap: "0.65rem", marginBottom: "0.8rem" }}>
          <h2 style={{ margin: 0 }}>Current Saved Check-in</h2>
          <p className="small" style={{ margin: 0 }}>
            {data.checkin?.submittedAt
              ? `Last saved ${formatDisplayDate(data.checkin.submittedAt.slice(0, 10))}.`
              : "Your current week submission is saved."}
          </p>
          <div className="grid" style={{ gap: "0.55rem" }}>
            {(submissionSummary?.goals ?? data.goals.map((goal) => ({
              id: goal.id,
              title: displayGoalTitle(goal.title),
              value: goal.progressType === "BOOLEAN"
                ? formatSubmittedGoalValue(goal, Boolean(goal.currentValueBoolean))
                : formatSubmittedGoalValue(
                    goal,
                    Number(goal.progressType === "PERCENT" ? goal.currentValuePercent ?? 0 : goal.currentValueNumeric ?? 0)
                  )
            }))).map((goal) => (
              <div key={goal.id} className="card" style={{ padding: "0.7rem" }}>
                <strong>{goal.title}</strong>
                <p className="small" style={{ margin: "0.25rem 0 0" }}>{goal.value}</p>
              </div>
            ))}
          </div>
          <div className="grid" style={{ gap: "0.55rem" }}>
            <strong>Saved priorities</strong>
            {(data.currentPriorities ?? submissionSummary?.priorities ?? []).length ? (
              <div className="grid" style={{ gap: "0.45rem" }}>
                {(data.currentPriorities ?? submissionSummary?.priorities ?? []).map((priority) => (
                  <div key={priority} className="card" style={{ padding: "0.65rem" }}>
                    <p className="small" style={{ margin: 0 }}>{priority}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="small" style={{ margin: 0 }}>No priorities saved yet.</p>
            )}
          </div>
        </section>
      ) : null}

      <form key={formKey} onSubmit={submit} onKeyDown={preventEnterSubmit} className="grid" style={{ gap: "0.8rem" }}>
          <h2 style={{ margin: 0 }}>Goal Progress</h2>
          {(data.goals ?? []).map((goal) => (
            <div key={goal.id} className="visual-card" style={{ display: "grid", gap: "0.65rem" }}>
              <div style={{ display: "grid", gap: "0.15rem" }}>
                <strong>{displayGoalTitle(goal.title)}</strong>
                <p className="small" style={{ margin: 0 }}>
                  {(() => {
                    const parsed = parseTrackingDescription(goal.description);
                    const unit = parsed?.unit ?? goal.unit ?? "";
                    const targetValue = parsed?.targetValue ?? (goal.targetValue != null ? String(goal.targetValue) : "");
                    const start = parsed?.startDate;
                    const end = parsed?.endDate ?? goal.dueDate;
                    if (!targetValue && !end && !start) return "Target details not set.";
                    return `Target: ${targetValue}${unit} between ${formatDisplayDate(start)} and ${formatDisplayDate(end)}.`;
                  })()}
                </p>
                <p className="small" style={{ margin: "0.2rem 0 0" }}>
                  Previous update: {formatPreviousValue(goal)}
                  {goal.previousWeekStartDate ? ` (${formatDisplayDate(goal.previousWeekStartDate)})` : ""}.
                </p>
                <div className="progress-track" style={{ marginTop: "0.2rem" }}>
                  <div className="progress-fill" style={{ width: `${clampPercent(goal.previousProgressPercent)}%` }} />
                </div>
                <div className="progress-label-row">
                  <span className="small">{clampPercent(goal.previousProgressPercent).toFixed(0)}%</span>
                  <span className="small">100%</span>
                </div>
                {hasSubmittedCurrentWeek ? (
                  <p className="small" style={{ margin: "0.2rem 0 0" }}>
                    Current saved update: {goal.progressType === "BOOLEAN"
                      ? formatSubmittedGoalValue(goal, Boolean(goal.currentValueBoolean))
                      : formatSubmittedGoalValue(
                          goal,
                          Number(goal.progressType === "PERCENT" ? goal.currentValuePercent ?? 0 : goal.currentValueNumeric ?? 0)
                        )}.
                  </p>
                ) : null}
              </div>
              <label>
                {goal.progressType === "BOOLEAN" ? "Mark complete this week" : "Update your progress as of today."}
                {goal.progressType === "BOOLEAN" ? (
                  <input type="checkbox" name={`goal-${goal.id}`} defaultChecked={Boolean(goal.currentValueBoolean)} />
                ) : (
                  <input
                    style={{ marginTop: "0.4rem" }}
                    type="number"
                    name={`goal-${goal.id}`}
                    defaultValue={
                      goal.progressType === "PERCENT"
                        ? goal.currentValuePercent ?? ""
                        : goal.currentValueNumeric ?? ""
                    }
                    min={goal.progressType === "PERCENT" ? 0 : undefined}
                    max={goal.progressType === "PERCENT" ? 100 : undefined}
                    step={goal.unit === "$" ? "0.01" : "1"}
                    placeholder={
                      goal.progressType === "PERCENT"
                        ? "0-100"
                        : goal.unit === "$"
                          ? "Amount in dollars"
                          : goal.unit === "#"
                            ? "Count"
                            : goal.unit
                              ? `Value in ${goal.unit}`
                              : "Progress value"
                    }
                  />
                )}
              </label>
            </div>
          ))}

          <section className="visual-card" style={{ display: "grid", gap: "0.7rem" }}>
            <h2 style={{ margin: 0 }}>Priorities</h2>
            <p className="small" style={{ margin: 0 }}>
              Mark last week&apos;s priorities as complete, move them forward, or remove them.
            </p>

            {(data.previousPriorities ?? []).length > 0 ? (
              <div className="grid" style={{ gap: "0.55rem" }}>
                {(data.previousPriorities ?? []).map((priority) => (
                  <div key={priority} className="card" style={{ padding: "0.6rem" }}>
                    <strong>{priority}</strong>
                    <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.45rem", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className={priorityActions[priority] === "complete" ? "priority-action-button selected" : "priority-action-button"}
                        onClick={() => setPriorityActions({ ...priorityActions, [priority]: "complete" })}
                      >
                        Complete
                      </button>
                      <button
                        type="button"
                        className={priorityActions[priority] === "carry_forward" ? "priority-action-button selected" : "priority-action-button"}
                        onClick={() => setPriorityActions({ ...priorityActions, [priority]: "carry_forward" })}
                      >
                        Move Forward
                      </button>
                      <button
                        type="button"
                        className={priorityActions[priority] === "remove" ? "priority-action-button selected" : "priority-action-button"}
                        onClick={() => setPriorityActions({ ...priorityActions, [priority]: "remove" })}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="small" style={{ margin: 0 }}>No priorities from the prior check-in.</p>
            )}

            <div className="grid" style={{ gap: "0.55rem" }}>
              <strong>Add priorities for next week (up to 5 total)</strong>
              {newPriorities.map((value, idx) => (
                <input
                  key={`priority-${idx}`}
                  value={value}
                  onChange={(e) => {
                    const next = [...newPriorities];
                    next[idx] = e.target.value;
                    setNewPriorities(next);
                  }}
                  placeholder={`Priority ${idx + 1}`}
                />
              ))}
              <button
                type="button"
                onClick={() => setNewPriorities([...newPriorities, ""])}
                disabled={newPriorities.length >= 5}
              >
                Add Another Priority
              </button>
            </div>
          </section>

          <h2 style={{ margin: 0, marginTop: "0.25rem" }}>Additional Check-in Questions</h2>
          {additionalQuestions.map((q) => {
            const decoded = decodeQuestionPrompt(q.prompt);
            const prompt = decoded.prompt;
            const meta = decoded.meta;
            const effectiveType = meta.type ?? q.type;

            if (effectiveType === "single_choice" && meta.options?.length) {
              return (
                <fieldset key={q.id} style={{ border: "none", padding: 0, margin: 0 }}>
                  <legend>{prompt}</legend>
                  {meta.options.map((opt) => (
                    <label key={`${q.id}-${opt}`} style={{ display: "block" }}>
                      <input
                        type="radio"
                        name={`question-${q.id}`}
                        value={opt}
                        required={q.required}
                        defaultChecked={currentAnswersByQuestionId[q.id]?.textAnswer === opt}
                      /> {opt}
                    </label>
                  ))}
                </fieldset>
              );
            }

            if (effectiveType === "multiple_choice" && meta.options?.length) {
              return (
                <fieldset key={q.id} style={{ border: "none", padding: 0, margin: 0 }}>
                  <legend>{prompt}</legend>
                  {meta.options.map((opt) => (
                    <label key={`${q.id}-${opt}`} style={{ display: "block" }}>
                      <input
                        type="checkbox"
                        name={`question-${q.id}`}
                        value={opt}
                        defaultChecked={(currentAnswersByQuestionId[q.id]?.textAnswer ?? "").split(", ").includes(opt)}
                      /> {opt}
                    </label>
                  ))}
                </fieldset>
              );
            }

            if (effectiveType === "ranking") {
              const rankMax = meta.rankMax ?? 5;
              return (
                <label key={q.id}>
                  {prompt}
                  <select
                    name={`question-${q.id}`}
                    required={q.required}
                    defaultValue={currentAnswersByQuestionId[q.id]?.textAnswer ?? ""}
                  >
                    <option value="" disabled>Select rank</option>
                    {Array.from({ length: rankMax }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={String(n)}>{n}</option>
                    ))}
                  </select>
                </label>
              );
            }

            if (effectiveType === "likert") {
              const likertOptions = [
                "Strongly disagree",
                "Disagree",
                "Neutral",
                "Agree",
                "Strongly agree"
              ];
              return (
                <fieldset key={q.id} style={{ border: "none", padding: 0, margin: 0 }}>
                  <legend>{prompt}</legend>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                      gap: "0.75rem",
                      marginTop: "0.55rem",
                      alignItems: "start"
                    }}
                  >
                    {likertOptions.map((opt) => (
                      <label
                        key={`${q.id}-${opt}`}
                        style={{
                          display: "grid",
                          gap: "0.35rem",
                          justifyItems: "center",
                          textAlign: "center"
                        }}
                      >
                        <input
                          type="radio"
                          name={`question-${q.id}`}
                          value={opt}
                          required={q.required}
                          defaultChecked={currentAnswersByQuestionId[q.id]?.textAnswer === opt}
                        />
                        <span className="small">{opt}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            }

            return (
              <label key={q.id}>
                {prompt}
                <textarea
                  name={`question-${q.id}`}
                  required={q.required}
                  defaultValue={currentAnswersByQuestionId[q.id]?.textAnswer ?? ""}
                />
              </label>
            );
          })}

          <button type="submit">Submit check-in</button>
        </form>

      <section className="visual-card" style={{ display: "grid", gap: "0.7rem", marginTop: "0.8rem" }}>
        <div className="section-head" style={{ marginBottom: 0 }}>
          <h2 style={{ margin: 0 }}>Previous Check-ins</h2>
          <p className="small" style={{ margin: 0 }}>
            Review your personal check-in history.
          </p>
        </div>
        {(data.history ?? []).length ? (
          <div className="grid" style={{ gap: "0.7rem" }}>
            {(data.history ?? []).map((entry) => (
              <details key={entry.id} className="card" style={{ padding: "0.8rem" }}>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                  Week of {formatDisplayDate(entry.weekStartDate)}
                </summary>
                <div className="grid" style={{ gap: "0.7rem", marginTop: "0.7rem" }}>
                  <p className="small" style={{ margin: 0 }}>
                    Submitted on {formatDisplayDate(entry.submittedAt.slice(0, 10))}.
                  </p>
                  <div className="grid" style={{ gap: "0.45rem" }}>
                    <strong>Goal progress</strong>
                    {entry.goals.map((goal) => (
                      <div key={goal.id} className="card" style={{ padding: "0.65rem" }}>
                        <strong>{displayGoalTitle(goal.title)}</strong>
                        <p className="small" style={{ margin: "0.2rem 0 0" }}>
                          {formatHistoryGoalValue(goal)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="grid" style={{ gap: "0.45rem" }}>
                    <strong>Priorities</strong>
                    {entry.priorities.length ? entry.priorities.map((priority) => (
                      <div key={priority} className="card" style={{ padding: "0.65rem" }}>
                        <p className="small" style={{ margin: 0 }}>{priority}</p>
                      </div>
                    )) : <p className="small" style={{ margin: 0 }}>No priorities submitted.</p>}
                  </div>
                  <div className="grid" style={{ gap: "0.45rem" }}>
                    <strong>Additional responses</strong>
                    {entry.answers.length ? entry.answers.map((answer) => (
                      <div key={answer.questionId} className="card" style={{ padding: "0.65rem" }}>
                        <strong>{decodeQuestionPrompt(answer.prompt).prompt}</strong>
                        <p className="small" style={{ margin: "0.2rem 0 0" }}>{formatHistoryAnswerValue(answer)}</p>
                      </div>
                    )) : <p className="small" style={{ margin: 0 }}>No additional responses.</p>}
                  </div>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className="small" style={{ margin: 0 }}>No prior check-ins yet.</p>
        )}
      </section>
    </section>
  );
}
