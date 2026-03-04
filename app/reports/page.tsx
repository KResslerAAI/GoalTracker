"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDisplayDate } from "@/lib/date-format";

type ReportPayload = {
  startDate: string;
  endDate: string;
  personalGoals: Array<{
    id: string;
    title: string;
    status: "ACTIVE" | "COMPLETE" | "ARCHIVED";
    unit?: string | null;
    targetValue?: number | null;
    dueDate?: string | null;
    teamGoalTitle?: string | null;
    progressPercent: number;
  }>;
  teamGoals: Array<{
    id: string;
    title: string;
    status: "ACTIVE" | "COMPLETE" | "ARCHIVED";
    progressPercent: number;
    year: number;
  }>;
};

function currentFiscalRange() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const startYear = m >= 1 ? y : y - 1; // Feb-based FY
  const startDate = `${startYear}-02-01`;
  const endDate = `${startYear + 1}-01-31`;
  return { startDate, endDate };
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export default function ReportsPage() {
  const fiscal = currentFiscalRange();
  const [startDate, setStartDate] = useState(fiscal.startDate);
  const [endDate, setEndDate] = useState(fiscal.endDate);
  const [data, setData] = useState<ReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (rangeStart: string, rangeEnd: string) => {
    setError(null);
    const res = await fetch(`/api/reports/yearly?startDate=${rangeStart}&endDate=${rangeEnd}`);
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Failed to load report");
      return;
    }
    setData(body);
  };

  useEffect(() => {
    load(startDate, endDate).catch((e) => setError((e as Error).message));
  }, []);

  const groupedPersonal = useMemo(() => {
    const goals = data?.personalGoals ?? [];
    return {
      ACTIVE: goals.filter((g) => g.status === "ACTIVE"),
      COMPLETE: goals.filter((g) => g.status === "COMPLETE"),
      ARCHIVED: goals.filter((g) => g.status === "ARCHIVED")
    };
  }, [data?.personalGoals]);

  return (
    <div className="page-shell">
      <section className="card">
        <div className="section-head">
          <h1>Report</h1>
          <p className="small">Review goals for any date range, including archived goals.</p>
        </div>
        <div className="grid grid-2" style={{ maxWidth: 520 }}>
          <label>
            Start date
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label>
            End date
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
        </div>
        <div className="action-row" style={{ marginTop: "0.85rem" }}>
          <button type="button" onClick={() => load(startDate, endDate).catch((e) => setError((e as Error).message))}>
            Run Report
          </button>
        </div>
        {error && <p className="small" style={{ color: "#b91c1c" }}>{error}</p>}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Personal Goals</h2>
        <div className="grid" style={{ gap: "0.75rem" }}>
          {(["ACTIVE", "COMPLETE", "ARCHIVED"] as const).map((status) => (
            <div key={status} className="visual-card">
              <h3 style={{ marginTop: 0 }}>{status}</h3>
              <div className="grid" style={{ gap: "0.5rem" }}>
                {groupedPersonal[status].map((goal) => (
                  <div key={goal.id} className="card" style={{ padding: "0.65rem" }}>
                    <strong>{goal.title}</strong>
                    <p className="small" style={{ margin: "0.2rem 0 0" }}>
                      Team Goal: {goal.teamGoalTitle ?? "-"} • Due: {formatDisplayDate(goal.dueDate)}
                    </p>
                    <div className="progress-track" style={{ marginTop: "0.45rem" }}>
                      <div className="progress-fill" style={{ width: `${clampPercent(goal.progressPercent)}%` }} />
                    </div>
                    <div className="progress-label-row">
                      <span className="small">{clampPercent(goal.progressPercent).toFixed(0)}%</span>
                      <span className="small">100%</span>
                    </div>
                  </div>
                ))}
                {groupedPersonal[status].length === 0 && <p className="small">No {status.toLowerCase()} goals.</p>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Team Goals</h2>
        <div className="grid" style={{ gap: "0.6rem" }}>
          {(data?.teamGoals ?? []).map((goal) => (
            <div key={goal.id} className="visual-card">
              <strong>{goal.title}</strong>
              <p className="small" style={{ margin: "0.2rem 0" }}>Status: {goal.status}</p>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${clampPercent(goal.progressPercent)}%` }} />
              </div>
              <div className="progress-label-row">
                <span className="small">{clampPercent(goal.progressPercent).toFixed(0)}%</span>
                <span className="small">100%</span>
              </div>
            </div>
          ))}
          {(data?.teamGoals ?? []).length === 0 && <p className="small">No team goals for this year.</p>}
        </div>
      </section>
    </div>
  );
}
