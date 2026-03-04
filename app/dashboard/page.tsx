"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { decodeQuestionPrompt } from "@/lib/checkin-questions";
import { decodePrioritiesAnswer } from "@/lib/priorities";
import { formatDisplayDate } from "@/lib/date-format";

type DashboardData = {
  compliance: {
    dueUsers: number;
    submitted: number;
    completionPercent: number;
  };
  members: Array<{
    userId: string;
    name: string | null;
    email: string;
    cadence: "WEEKLY" | "BIWEEKLY";
    dueThisWeek: boolean;
    submitted: boolean;
    progressPercent: number;
    health: "green" | "yellow" | "red";
  }>;
  teamGoals: Array<{
    id: string;
    title: string;
    description?: string | null;
    startDate: string;
    endDate: string;
    progressPercent: number;
    health?: "green" | "yellow" | "red";
    tracking?: {
      unit: string;
      targetValue: number;
      progressValue: number;
    } | null;
    personalGoals: Array<{
      id: string;
      title: string;
      ownerName: string | null;
      ownerEmail: string;
      progressPercent: number;
    }>;
  }>;
};

type ReportPayload = {
  startDate: string;
  endDate: string;
  teamGoals: Array<{
    id: string;
    title: string;
    status: "ACTIVE" | "COMPLETE" | "ARCHIVED";
    progressPercent: number;
    year: number;
    contributors: Array<{
      id: string;
      title: string;
      ownerName: string | null;
      ownerEmail: string;
      status: "ACTIVE" | "COMPLETE" | "ARCHIVED";
      dueDate?: string | null;
      progressPercent: number;
    }>;
  }>;
};

type CheckinDetail = {
  userId: string;
  name: string | null;
  email: string;
  weekStartDate: string;
  submittedAt: string;
  progress: Array<{
    personalGoalId: string;
    title: string;
    progressType: "BOOLEAN" | "PERCENT" | "NUMERIC";
    unit?: string | null;
    targetValue?: number | null;
    valueBoolean?: boolean | null;
    valuePercent?: number | null;
    valueNumeric?: number | null;
  }>;
  answers: Array<{
    questionId: string;
    prompt: string;
    key?: string | null;
    type?: string | null;
    textAnswer?: string | null;
    numberAnswer?: number | null;
    booleanAnswer?: boolean | null;
  }>;
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatValue(value: number, unit: string) {
  if (unit === "$") return `$${value.toLocaleString()}`;
  if (unit === "%") return `${value.toLocaleString()}%`;
  if (unit === "#") return `${value.toLocaleString()} #`;
  return `${value.toLocaleString()} ${unit}`;
}

function formatDraftInput(raw: string, allowDecimal: boolean) {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  const integerPartRaw = parts[0] ?? "";
  const integerPart = integerPartRaw.replace(/^0+(?=\d)/, "");
  const intWithCommas = (integerPart || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  if (!allowDecimal) {
    return intWithCommas;
  }

  const hasDot = cleaned.includes(".");
  const decimalPart = (parts[1] ?? "").slice(0, 2);
  if (hasDot) {
    return `${intWithCommas}.${decimalPart}`;
  }

  return intWithCommas;
}

function ProgressBar({ value }: { value: number }) {
  const percent = clampPercent(value);
  return (
    <>
      <div className="progress-track" aria-label="Progress">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="progress-label-row">
        <span className="small">{percent.toFixed(0)}%</span>
        <span className="small">100%</span>
      </div>
    </>
  );
}

function DonutProgress({ value }: { value: number }) {
  const percent = clampPercent(value);
  return (
    <div style={{ position: "relative", width: 132, height: 132, display: "grid", placeItems: "center" }}>
      <div className="donut" style={{ ["--p" as string]: percent, ["--donut-size" as string]: "128px" } as CSSProperties} />
      <span className="donut-label" style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: "1rem" }}>
        {percent.toFixed(0)}%
      </span>
    </div>
  );
}

function currentFiscalRange() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const startYear = m >= 1 ? y : y - 1;
  const startDate = `${startYear}-02-01`;
  const endDate = `${startYear + 1}-01-31`;
  return { startDate, endDate };
}

function currentWeekStartISO() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function formatCheckinProgressValue(entry: CheckinDetail["progress"][number]) {
  if (entry.progressType === "BOOLEAN") return entry.valueBoolean ? "Complete" : "Incomplete";
  if (entry.progressType === "PERCENT") return `${Number(entry.valuePercent ?? 0).toFixed(0)}%`;
  if (entry.unit === "$") return `$${Number(entry.valueNumeric ?? 0).toLocaleString()}`;
  if (entry.unit === "#") return `${Number(entry.valueNumeric ?? 0).toLocaleString()} #`;
  if (entry.unit) return `${Number(entry.valueNumeric ?? 0).toLocaleString()} ${entry.unit}`;
  return Number(entry.valueNumeric ?? 0).toLocaleString();
}

function downloadReportXlsx(startDate: string, endDate: string) {
  const url = `/api/reports/yearly/export?startDate=${startDate}&endDate=${endDate}`;
  window.open(url, "_blank");
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [teamProgressDraft, setTeamProgressDraft] = useState<Record<string, string>>({});
  const [savingGoalId, setSavingGoalId] = useState<string | null>(null);
  const fiscal = currentFiscalRange();
  const [reportStartDate, setReportStartDate] = useState(fiscal.startDate);
  const [reportEndDate, setReportEndDate] = useState(fiscal.endDate);
  const [reportData, setReportData] = useState<ReportPayload | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [selectedCheckinUserId, setSelectedCheckinUserId] = useState<string | null>(null);
  const [checkinDetail, setCheckinDetail] = useState<CheckinDetail | null>(null);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkinError, setCheckinError] = useState<string | null>(null);
  const weekStartForDashboard = currentWeekStartISO();

  useEffect(() => {
    fetch(`/api/manager/dashboard?weekStart=${weekStartForDashboard}`)
      .then(async (r) => {
        const text = await r.text();
        let body: Record<string, unknown> = {};
        try {
          body = text ? JSON.parse(text) : {};
        } catch {
          if (!r.ok) {
            throw new Error("Dashboard API returned non-JSON response. Check server logs.");
          }
        }
        if (!r.ok) {
          if (r.status === 403 || r.status === 401) {
            throw new Error("Log in and complete /setup before using the manager dashboard.");
          }
          throw new Error((body.error as string) ?? "Failed to load dashboard");
        }
        return body as DashboardData;
      })
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [weekStartForDashboard]);

  const loadReport = async (startDate: string, endDate: string) => {
    setReportError(null);
    const res = await fetch(`/api/reports/yearly?startDate=${startDate}&endDate=${endDate}`);
    const body = await res.json();
    if (!res.ok) {
      setReportError(body.error ?? "Failed to load report");
      return;
    }
    setReportData(body);
  };

  useEffect(() => {
    loadReport(reportStartDate, reportEndDate).catch((e) => setReportError((e as Error).message));
  }, []);

  useEffect(() => {
    if (!data) return;
    const next: Record<string, string> = {};
    for (const goal of data.teamGoals) {
      const raw = goal.tracking ? goal.tracking.progressValue : clampPercent(goal.progressPercent);
      next[goal.id] = raw.toLocaleString("en-US", {
        maximumFractionDigits: goal.tracking?.unit === "$" ? 2 : 0
      });
    }
    setTeamProgressDraft(next);
  }, [data]);

  const saveTeamGoalProgress = async (goalId: string) => {
    if (!data) return;
    setSavingGoalId(goalId);
    setError(null);
    try {
      const goal = data.teamGoals.find((item) => item.id === goalId);
      if (!goal) return;
      const sanitized = String(teamProgressDraft[goalId] ?? "0").replace(/[^0-9.]/g, "");
      const draftValue = Number(sanitized || "0");
      const clampedValue = goal.tracking
        ? Math.max(0, Math.min(goal.tracking.targetValue, draftValue))
        : clampPercent(draftValue);
      const res = await fetch(`/api/goals/annual/${goalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          goal.tracking
            ? { progressValue: clampedValue }
            : { progressPercent: clampedValue }
        )
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to save team progress");
      }

      setData({
        ...data,
        teamGoals: data.teamGoals.map((goal) =>
          goal.id === goalId
            ? {
                ...goal,
                progressPercent: goal.tracking
                  ? Math.max(0, Math.min(100, (clampedValue / goal.tracking.targetValue) * 100))
                  : clampedValue,
                tracking: goal.tracking ? { ...goal.tracking, progressValue: clampedValue } : goal.tracking
              }
            : goal
        )
      });
      setTeamProgressDraft({
        ...teamProgressDraft,
        [goalId]: clampedValue.toLocaleString("en-US", {
          maximumFractionDigits: goal.tracking?.unit === "$" ? 2 : 0
        })
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingGoalId(null);
    }
  };

  const loadMemberCheckinDetail = async (userId: string) => {
    setCheckinError(null);
    setCheckinLoading(true);
    setSelectedCheckinUserId(userId);
    try {
      const res = await fetch(`/api/manager/checkins?userId=${userId}&weekStart=${weekStartForDashboard}`);
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to load check-in detail");
      }
      setCheckinDetail(body as CheckinDetail);
    } catch (e) {
      setCheckinDetail(null);
      setCheckinError((e as Error).message);
    } finally {
      setCheckinLoading(false);
    }
  };

  return (
    <div className="page-shell">
      <section className="card">
        <div className="section-head">
          <h1>Manager Dashboard</h1>
          <p className="small">Track team check-ins, update team goals, and review progress reports.</p>
        </div>
        {!data && !error && <p className="small">Loading...</p>}
        {error && <p className="small" style={{ color: "#b91c1c" }}>{error}</p>}
      </section>

      {data && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Team Member Check-Ins Due This Week</h2>
          <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
            {data.members
              .filter((member) => member.dueThisWeek)
              .map((member) => (
                <button
                  key={member.userId}
                  type="button"
                  className={`manager-checkin-chip ${member.submitted ? "submitted" : "pending"} ${selectedCheckinUserId === member.userId ? "active" : ""}`}
                  disabled={!member.submitted}
                  onClick={() => {
                    if (!member.submitted) return;
                    loadMemberCheckinDetail(member.userId).catch((e) => setCheckinError((e as Error).message));
                  }}
                >
                  {member.name ?? member.email}
                </button>
              ))}
            {data.members.filter((member) => member.dueThisWeek).length === 0 && (
              <p className="small" style={{ margin: 0 }}>No team members due this week.</p>
            )}
          </div>
          {checkinLoading && <p className="small" style={{ marginTop: "0.6rem", marginBottom: 0 }}>Loading check-in details...</p>}
          {checkinError && <p className="small" style={{ marginTop: "0.6rem", marginBottom: 0, color: "#b91c1c" }}>{checkinError}</p>}
          {checkinDetail && (
            <div className="card" style={{ display: "grid", gap: "0.65rem", marginTop: "0.7rem" }}>
              <div>
                <strong>{checkinDetail.name ?? checkinDetail.email}</strong>
                <p className="small" style={{ margin: 0 }}>
                  Submitted: {formatDisplayDate(checkinDetail.submittedAt)}
                </p>
              </div>

              <div className="grid" style={{ gap: "0.5rem" }}>
                <strong>Goal Progress</strong>
                {checkinDetail.progress.map((entry) => (
                  <div key={entry.personalGoalId} className="card" style={{ padding: "0.6rem" }}>
                    <strong>{entry.title}</strong>
                    <p className="small" style={{ margin: 0 }}>{formatCheckinProgressValue(entry)}</p>
                  </div>
                ))}
                {checkinDetail.progress.length === 0 && <p className="small">No goal updates submitted.</p>}
              </div>

              <div className="grid" style={{ gap: "0.5rem" }}>
                <strong>Feedback</strong>
                {checkinDetail.answers.map((answer) => {
                  const decoded = decodeQuestionPrompt(answer.prompt);
                  const prompt = decoded.prompt;
                  if (answer.key === "weekly_next_steps") {
                    const priorities = decodePrioritiesAnswer(answer.textAnswer);
                    return (
                      <div key={answer.questionId} className="card" style={{ padding: "0.6rem" }}>
                        <strong>{prompt}</strong>
                        {priorities.length > 0 ? (
                          <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1rem" }}>
                            {priorities.map((item) => <li key={item} className="small">{item}</li>)}
                          </ul>
                        ) : (
                          <p className="small" style={{ margin: "0.4rem 0 0" }}>No priorities listed.</p>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={answer.questionId} className="card" style={{ padding: "0.6rem" }}>
                      <strong>{prompt}</strong>
                      <p className="small" style={{ margin: "0.4rem 0 0" }}>
                        {answer.textAnswer ?? (answer.numberAnswer != null ? String(answer.numberAnswer) : answer.booleanAnswer != null ? String(answer.booleanAnswer) : "-")}
                      </p>
                    </div>
                  );
                })}
                {checkinDetail.answers.length === 0 && <p className="small">No additional feedback submitted.</p>}
              </div>
            </div>
          )}
        </section>
      )}

      {data && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Team Goals Rollup</h2>
          <div className="grid" style={{ gap: "0.75rem" }}>
            {data.teamGoals.map((goal) => (
              <div key={goal.id} className="visual-card team-goal-card">
                <div className="team-goal-top">
                  <div className="team-goal-main">
                    <div className="team-goal-header">
                      <div className="team-goal-title-wrap">
                        <strong className="team-goal-title">{goal.title}</strong>
                        <p className="small team-goal-subtitle">
                          {goal.tracking
                            ? `Target: ${formatValue(goal.tracking.targetValue, goal.tracking.unit)} between ${formatDisplayDate(goal.startDate)} and ${formatDisplayDate(goal.endDate)}`
                            : `Between ${formatDisplayDate(goal.startDate)} and ${formatDisplayDate(goal.endDate)}`}
                        </p>
                      </div>
                      <Link className="nav-link" href="/setup">Edit Goal Details</Link>
                    </div>
                    <div className="team-goal-update-row">
                      <label className="team-goal-update-label">
                        Team goal progress update {goal.tracking ? `(${goal.tracking.unit})` : "(%)"}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={teamProgressDraft[goal.id] ?? ""}
                          onChange={(e) =>
                            setTeamProgressDraft({
                              ...teamProgressDraft,
                              [goal.id]: formatDraftInput(e.target.value, goal.tracking?.unit === "$")
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="team-goal-save"
                        onClick={() => saveTeamGoalProgress(goal.id)}
                        disabled={savingGoalId === goal.id}
                      >
                        {savingGoalId === goal.id ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                  <DonutProgress value={goal.progressPercent} />
                </div>

                <details className="team-goal-expander">
                  <summary>
                    <span>
                      Individual Contributions
                      <span className="small" style={{ marginLeft: "0.5rem" }}>
                        ({goal.personalGoals.length})
                      </span>
                    </span>
                  </summary>
                  <div className="grid team-goal-contributors">
                    {goal.personalGoals.map((personalGoal) => (
                      <div key={personalGoal.id} className="card team-goal-contributor-card">
                        <div className="team-goal-contributor-header">
                          <strong>{personalGoal.title}</strong>
                        </div>
                        <p className="small team-goal-contributor-owner">
                          {personalGoal.ownerName ?? personalGoal.ownerEmail}
                        </p>
                        <ProgressBar value={personalGoal.progressPercent} />
                      </div>
                    ))}
                    {goal.personalGoals.length === 0 && <p className="small">No individual goals mapped yet.</p>}
                  </div>
                </details>
              </div>
            ))}
            {data.teamGoals.length === 0 && <p className="small">No team goals found.</p>}
          </div>
        </section>
      )}

      {data && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Team Status</h2>
          <div className="grid" style={{ gap: "0.75rem" }}>
            {data.members.map((member) => (
              <div key={member.userId} className="visual-card" style={{ display: "grid", gap: "0.55rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong>{member.name ?? member.email}</strong>
                    <p className="small" style={{ margin: 0 }}>
                      {member.email} • {member.cadence}
                    </p>
                  </div>
                  <span className={`badge ${member.health}`}>{member.health}</span>
                </div>
                <ProgressBar value={member.progressPercent} />
                <p className="small" style={{ marginBottom: 0 }}>
                  Due this week: {member.dueThisWeek ? "Yes" : "No"} • Submitted: {member.submitted ? "Yes" : "No"}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Report</h2>
        <p className="small">Review goals in a selected date range, including archived goals.</p>
        <div className="grid grid-2" style={{ maxWidth: 520 }}>
          <label>
            Start date
            <input type="date" value={reportStartDate} onChange={(e) => setReportStartDate(e.target.value)} />
          </label>
          <label>
            End date
            <input type="date" value={reportEndDate} onChange={(e) => setReportEndDate(e.target.value)} />
          </label>
        </div>
        <div style={{ marginTop: "0.85rem" }}>
          <button type="button" onClick={() => loadReport(reportStartDate, reportEndDate).catch((e) => setReportError((e as Error).message))}>
            Run Report
          </button>
          <button type="button" style={{ marginLeft: "0.6rem" }} onClick={() => downloadReportXlsx(reportStartDate, reportEndDate)}>
            Download .xlsx
          </button>
        </div>
        {reportError && <p className="small" style={{ color: "#b91c1c" }}>{reportError}</p>}

        <div className="grid" style={{ gap: "0.75rem", marginTop: "1rem" }}>
          <div className="visual-card">
            <h3 style={{ marginTop: 0 }}>Team Goals</h3>
            <div className="grid" style={{ gap: "0.5rem" }}>
              {(reportData?.teamGoals ?? []).map((goal) => (
                <details key={goal.id} className="section-expander">
                  <summary>
                    <span>
                      <strong>{goal.title}</strong>
                      <span className="small" style={{ marginLeft: "0.5rem" }}>
                        {goal.status} • {goal.progressPercent.toFixed(0)}%
                      </span>
                    </span>
                  </summary>
                  <div className="section-expander-content">
                    <ProgressBar value={goal.progressPercent} />
                    <div className="grid" style={{ gap: "0.5rem", marginTop: "0.7rem" }}>
                      {(goal.contributors ?? []).map((entry) => (
                        <div key={entry.id} className="card" style={{ padding: "0.65rem" }}>
                          <strong>{entry.title}</strong>
                          <p className="small" style={{ margin: "0.2rem 0 0" }}>
                            {entry.ownerName ?? entry.ownerEmail} • {entry.status} • Due: {formatDisplayDate(entry.dueDate)}
                          </p>
                          <ProgressBar value={entry.progressPercent} />
                        </div>
                      ))}
                      {(goal.contributors ?? []).length === 0 && <p className="small">No individual contributions mapped.</p>}
                    </div>
                  </div>
                </details>
              ))}
              {(reportData?.teamGoals ?? []).length === 0 && <p className="small">No team goals in this date range.</p>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
