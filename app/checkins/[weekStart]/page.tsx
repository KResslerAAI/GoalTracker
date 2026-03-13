"use client";

import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
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

type CheckinData = {
  due: boolean;
  checkin: { id: string } | null;
  questions: CheckinQuestion[];
  previousPriorities?: string[];
  lastCheckinDate?: string | null;
  goals: Array<{
    id: string;
    title: string;
    description?: string | null;
    dueDate?: string | null;
    progressType: "BOOLEAN" | "PERCENT" | "NUMERIC";
    unit?: string | null;
    targetValue?: number | null;
    previousValueBoolean?: boolean | null;
    previousValuePercent?: number | null;
    previousValueNumeric?: number | null;
    previousProgressPercent?: number | null;
    previousWeekStartDate?: string | null;
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

export default function CheckinPage({ params }: { params: { weekStart: string } }) {
  const [data, setData] = useState<CheckinData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submissionSummary, setSubmissionSummary] = useState<SubmissionSummary | null>(null);
  const [priorityActions, setPriorityActions] = useState<Record<string, "complete" | "carry_forward" | "remove">>({});
  const [newPriorities, setNewPriorities] = useState<string[]>(["", "", ""]);

  useEffect(() => {
    fetch(`/api/checkins/${params.weekStart}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) {
          throw new Error(body.error ?? "Failed to load check-in");
        }
        return body;
      })
      .then(setData)
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

  const questions = data?.questions ?? [];
  const nextActionsQuestion = questions.find(
    (q) =>
      q.key === "weekly_next_steps" ||
      q.prompt.toLowerCase().includes("3-5 things you'll do in the next week")
  );
  const additionalQuestions = questions.filter((q) => q !== nextActionsQuestion);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
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
    setSubmitted(true);
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
      {submitted ? (
        <section className="grid" style={{ gap: "0.8rem" }}>
          <p className="small" style={{ margin: 0 }}>Submitted successfully.</p>

          <div className="visual-card" style={{ display: "grid", gap: "0.65rem" }}>
            <h2 style={{ margin: 0 }}>What You Submitted</h2>
            <div className="grid" style={{ gap: "0.55rem" }}>
              {submissionSummary?.goals.map((goal) => (
                <div key={goal.id} className="card" style={{ padding: "0.7rem" }}>
                  <strong>{goal.title}</strong>
                  <p className="small" style={{ margin: "0.25rem 0 0" }}>{goal.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="visual-card" style={{ display: "grid", gap: "0.65rem" }}>
            <h2 style={{ margin: 0 }}>Priorities</h2>
            {submissionSummary?.priorities.length ? (
              <div className="grid" style={{ gap: "0.55rem" }}>
                {submissionSummary.priorities.map((priority) => (
                  <div key={priority} className="card" style={{ padding: "0.7rem" }}>
                    <p className="small" style={{ margin: 0 }}>{priority}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="small" style={{ margin: 0 }}>No priorities submitted.</p>
            )}
          </div>

          <div className="visual-card" style={{ display: "grid", gap: "0.65rem" }}>
            <h2 style={{ margin: 0 }}>Additional Check-in Questions</h2>
            <div className="grid" style={{ gap: "0.55rem" }}>
              {submissionSummary?.answers.map((answer) => (
                <div key={answer.questionId} className="card" style={{ padding: "0.7rem" }}>
                  <strong>{answer.prompt}</strong>
                  <p className="small" style={{ margin: "0.25rem 0 0" }}>{answer.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <form onSubmit={submit} onKeyDown={preventEnterSubmit} className="grid" style={{ gap: "0.8rem" }}>
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
              </div>
              <label>
                {goal.progressType === "BOOLEAN" ? "Mark complete this week" : "Update your progress as of today."}
                {goal.progressType === "BOOLEAN" ? (
                  <input type="checkbox" name={`goal-${goal.id}`} />
                ) : (
                  <input
                    style={{ marginTop: "0.4rem" }}
                    type="number"
                    name={`goal-${goal.id}`}
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
                      <input type="radio" name={`question-${q.id}`} value={opt} required={q.required} /> {opt}
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
                      <input type="checkbox" name={`question-${q.id}`} value={opt} /> {opt}
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
                  <select name={`question-${q.id}`} required={q.required} defaultValue="">
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
                  {likertOptions.map((opt) => (
                    <label key={`${q.id}-${opt}`} style={{ display: "block" }}>
                      <input type="radio" name={`question-${q.id}`} value={opt} required={q.required} /> {opt}
                    </label>
                  ))}
                </fieldset>
              );
            }

            return (
              <label key={q.id}>
                {prompt}
                <textarea name={`question-${q.id}`} required={q.required} />
              </label>
            );
          })}

          <button type="submit">Submit check-in</button>
        </form>
      )}
    </section>
  );
}
