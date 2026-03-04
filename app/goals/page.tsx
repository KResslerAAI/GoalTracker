"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDisplayDate } from "@/lib/date-format";

type QuarterlyGoal = {
  id: string;
  title: string;
};

type PersonalGoal = {
  id: string;
  title: string;
  description?: string | null;
  unit?: string | null;
  targetValue?: number | null;
  dueDate?: string | null;
  progressPercent?: number;
};

type UnitType = "PERCENT" | "DOLLAR" | "COUNT" | "OTHER";

type EditDraft = {
  title: string;
  unitType: UnitType;
  otherUnit: string;
  startValue: number;
  endValue: number;
  startDate: string;
  endDate: string;
};

function resolveUnit(unitType: UnitType, otherUnit: string) {
  if (unitType === "PERCENT") return "%";
  if (unitType === "DOLLAR") return "$";
  if (unitType === "COUNT") return "#";
  return otherUnit.trim() || "units";
}

function toUnitType(unit: string | null | undefined): { unitType: UnitType; otherUnit: string } {
  if (unit === "%") return { unitType: "PERCENT", otherUnit: "" };
  if (unit === "$") return { unitType: "DOLLAR", otherUnit: "" };
  if (unit === "#") return { unitType: "COUNT", otherUnit: "" };
  if (!unit) return { unitType: "PERCENT", otherUnit: "" };
  return { unitType: "OTHER", otherUnit: unit };
}

function parseTrackingDescription(description?: string | null) {
  if (!description) return null;
  const match = description.match(
    /^Tracking: unit (.*), start (.*), target (.*), startDate (\d{4}-\d{2}-\d{2}), endDate (\d{4}-\d{2}-\d{2})\.$/
  );
  if (!match) return null;

  return {
    unit: match[1],
    startValueRaw: match[2],
    targetValueRaw: match[3],
    startDate: match[4],
    endDate: match[5]
  };
}

function parseNumber(raw: string, unit: string) {
  const stripped = raw.replace(unit, "").trim();
  const parsed = Number(stripped);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toEditDraft(goal: PersonalGoal): EditDraft {
  const parsed = parseTrackingDescription(goal.description);
  const unitData = toUnitType(parsed?.unit ?? goal.unit);

  return {
    title: goal.title,
    unitType: unitData.unitType,
    otherUnit: unitData.otherUnit,
    startValue: parsed ? parseNumber(parsed.startValueRaw, parsed.unit) : 0,
    endValue: parsed ? parseNumber(parsed.targetValueRaw, parsed.unit) : Number(goal.targetValue ?? 0),
    startDate: parsed?.startDate ?? "",
    endDate: parsed?.endDate ?? (goal.dueDate ? new Date(goal.dueDate).toISOString().slice(0, 10) : "")
  };
}

function clampPercent(value: number | undefined) {
  const raw = Number(value ?? 0);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, raw));
}

function DonutProgress({ value }: { value: number }) {
  const percent = clampPercent(value);
  return (
    <div style={{ position: "relative", width: 132, height: 132, display: "grid", placeItems: "center" }}>
      <div className="donut" style={{ ["--p" as string]: percent, ["--donut-size" as string]: "128px" }} />
      <span className="donut-label" style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: "1rem" }}>
        {percent.toFixed(0)}%
      </span>
    </div>
  );
}

export default function GoalsPage() {
  const [quarterlyGoals, setQuarterlyGoals] = useState<QuarterlyGoal[]>([]);
  const [personalGoals, setPersonalGoals] = useState<PersonalGoal[]>([]);
  const [quarterlyGoalId, setQuarterlyGoalId] = useState("");
  const [goalSentence, setGoalSentence] = useState("");
  const [unitType, setUnitType] = useState<UnitType>("PERCENT");
  const [otherUnit, setOtherUnit] = useState("");
  const [startValue, setStartValue] = useState(0);
  const [endValue, setEndValue] = useState(100);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  const hasGoalsToCreate = quarterlyGoals.length > 0;

  const load = async () => {
    const [qRes, pRes] = await Promise.all([fetch("/api/goals/quarterly/available"), fetch("/api/goals/personal")]);
    const qBody = await qRes.json();
    const pBody = await pRes.json();

    if (qRes.ok) {
      setQuarterlyGoals(qBody);
      if (qBody[0]?.id && !quarterlyGoalId) setQuarterlyGoalId(qBody[0].id);
    }
    if (pRes.ok) setPersonalGoals(pBody);
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  const createGoal = async () => {
    setMessage(null);
    const unit = resolveUnit(unitType, otherUnit);

    if (!startDate || !endDate) {
      setMessage("Please select both start date and end date.");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setMessage("End date must be on or after start date.");
      return;
    }

    const res = await fetch("/api/goals/personal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quarterlyGoalId,
        title: goalSentence,
        description: `Tracking: unit ${unit}, start ${startValue}${unit}, target ${endValue}${unit}, startDate ${startDate}, endDate ${endDate}.`,
        progressType: unit === "%" ? "PERCENT" : "NUMERIC",
        targetValue: endValue,
        unit,
        dueDate: new Date(`${endDate}T00:00:00.000Z`).toISOString()
      })
    });
    const body = await res.json();
    if (!res.ok) {
      setMessage(body.error ?? "Failed to create goal");
      return;
    }

    setGoalSentence("");
    setStartValue(0);
    setEndValue(unitType === "PERCENT" ? 100 : 10);
    setStartDate("");
    setEndDate("");
    setMessage("Goal added.");
    await load();
  };

  const startEditing = (goal: PersonalGoal) => {
    setEditingGoalId(goal.id);
    setEditDraft(toEditDraft(goal));
    setMessage(null);
  };

  const cancelEditing = () => {
    setEditingGoalId(null);
    setEditDraft(null);
  };

  const saveGoalEdits = async (goal: PersonalGoal) => {
    if (!editDraft) return;

    if (!editDraft.title.trim()) {
      setMessage("Goal title is required.");
      return;
    }
    if (!editDraft.startDate || !editDraft.endDate) {
      setMessage("Please set both start and end date.");
      return;
    }
    if (new Date(editDraft.startDate) > new Date(editDraft.endDate)) {
      setMessage("End date must be on or after start date.");
      return;
    }

    const unit = resolveUnit(editDraft.unitType, editDraft.otherUnit);
    const description = `Tracking: unit ${unit}, start ${editDraft.startValue}${unit}, target ${editDraft.endValue}${unit}, startDate ${editDraft.startDate}, endDate ${editDraft.endDate}.`;

    const res = await fetch(`/api/goals/personal/${goal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editDraft.title,
        description,
        targetValue: editDraft.endValue,
        unit,
        dueDate: new Date(`${editDraft.endDate}T00:00:00.000Z`).toISOString()
      })
    });
    const body = await res.json();
    if (!res.ok) {
      setMessage(body.error ?? "Failed to update goal");
      return;
    }

    setMessage("Goal updated.");
    setEditingGoalId(null);
    setEditDraft(null);
    await load();
  };

  const retireGoal = async (goalId: string) => {
    setMessage(null);
    const res = await fetch(`/api/goals/personal/${goalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ARCHIVED" })
    });
    const body = await res.json();
    if (!res.ok) {
      setMessage(body.error ?? "Failed to retire goal");
      return;
    }
    setMessage("Goal retired. It remains available in yearly reports.");
    await load();
  };

  const orderedGoals = useMemo(
    () => [...personalGoals].sort((a, b) => (b.dueDate ?? "").localeCompare(a.dueDate ?? "")),
    [personalGoals]
  );

  return (
    <div className="page-shell">
      <section className="card">
        <div className="section-head">
          <h1>My Goals</h1>
          <p className="small">Create personal goals and track progress with clear timelines.</p>
        </div>
      </section>

      <details className="section-expander create-goal-expander">
        <summary>Create Goal</summary>
        <div className="section-expander-content">
          {!hasGoalsToCreate && <p className="small">No team goals available yet. Ask your manager to add team goals.</p>}
          {hasGoalsToCreate && (
            <div className="grid" style={{ gap: "0.7rem" }}>
              <label>
                Team goal this supports
                <select value={quarterlyGoalId} onChange={(e) => setQuarterlyGoalId(e.target.value)}>
                  {quarterlyGoals.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Goal (written sentence)
                <input value={goalSentence} onChange={(e) => setGoalSentence(e.target.value)} />
              </label>
              <label>
                Unit of measurement
                <select value={unitType} onChange={(e) => setUnitType(e.target.value as UnitType)}>
                  <option value="PERCENT">%</option>
                  <option value="DOLLAR">$</option>
                  <option value="COUNT">#</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              {unitType === "OTHER" && (
                <label>
                  Other unit
                  <input value={otherUnit} onChange={(e) => setOtherUnit(e.target.value)} />
                </label>
              )}
              <div className="grid grid-2" style={{ gap: "0.7rem" }}>
                <label>
                  Starting value
                  <input type="number" value={startValue} onChange={(e) => setStartValue(Number(e.target.value))} />
                </label>
                <label>
                  Target value
                  <input type="number" value={endValue} onChange={(e) => setEndValue(Number(e.target.value))} />
                </label>
              </div>
              <div className="grid grid-2" style={{ gap: "0.7rem" }}>
                <label>
                  Start date
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </label>
                <label>
                  End date
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </label>
              </div>
              <button type="button" disabled={!quarterlyGoalId || !goalSentence.trim()} onClick={createGoal}>
                Add Goal
              </button>
            </div>
          )}
          {message && <p className="small">{message}</p>}
        </div>
      </details>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Current Goals</h2>
        <div className="goal-cards-grid goal-cards-full-width">
          {orderedGoals.map((goal) => {
            const parsed = parseTrackingDescription(goal.description);
            const progress = clampPercent(goal.progressPercent);
            const isEditing = editingGoalId === goal.id && editDraft;

            if (isEditing && editDraft) {
              return (
                <article key={goal.id} className="visual-card goal-card">
                  <label>
                    Goal title
                    <input value={editDraft.title} onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })} />
                  </label>
                  <label>
                    Unit of measurement
                    <select
                      value={editDraft.unitType}
                      onChange={(e) => setEditDraft({ ...editDraft, unitType: e.target.value as UnitType })}
                    >
                      <option value="PERCENT">%</option>
                      <option value="DOLLAR">$</option>
                      <option value="COUNT">#</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </label>
                  {editDraft.unitType === "OTHER" && (
                    <label>
                      Other unit
                      <input
                        value={editDraft.otherUnit}
                        onChange={(e) => setEditDraft({ ...editDraft, otherUnit: e.target.value })}
                      />
                    </label>
                  )}
                  <div className="grid grid-2" style={{ gap: "0.55rem" }}>
                    <label>
                      Start value
                      <input
                        type="number"
                        value={editDraft.startValue}
                        onChange={(e) => setEditDraft({ ...editDraft, startValue: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      Target value
                      <input
                        type="number"
                        value={editDraft.endValue}
                        onChange={(e) => setEditDraft({ ...editDraft, endValue: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                  <div className="grid grid-2" style={{ gap: "0.55rem" }}>
                    <label>
                      Start date
                      <input
                        type="date"
                        value={editDraft.startDate}
                        onChange={(e) => setEditDraft({ ...editDraft, startDate: e.target.value })}
                      />
                    </label>
                    <label>
                      End date
                      <input
                        type="date"
                        value={editDraft.endDate}
                        onChange={(e) => setEditDraft({ ...editDraft, endDate: e.target.value })}
                      />
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="button" onClick={() => saveGoalEdits(goal)}>Save</button>
                    <button type="button" onClick={cancelEditing}>Cancel</button>
                  </div>
                </article>
              );
            }

            return (
              <article key={goal.id} className="visual-card team-goal-card">
                <div className="team-goal-top">
                  <div className="team-goal-main">
                    <div className="team-goal-title-wrap">
                      <strong className="team-goal-title">{goal.title}</strong>
                      <p className="small team-goal-subtitle">
                        {parsed
                          ? `Target: ${parsed.targetValueRaw} between ${formatDisplayDate(parsed.startDate)} and ${formatDisplayDate(parsed.endDate)}`
                          : `Target: ${goal.targetValue ?? "-"}${goal.unit ?? ""} between ${formatDisplayDate(goal.dueDate)} and ${formatDisplayDate(goal.dueDate)}`}
                      </p>
                    </div>
                    <div className="action-row">
                      <button type="button" className="goal-action-pill" onClick={() => startEditing(goal)}>Edit</button>
                      <button type="button" className="goal-action-pill" onClick={() => retireGoal(goal.id)}>Retire</button>
                    </div>
                  </div>
                  <DonutProgress value={progress} />
                </div>
              </article>
            );
          })}
          {orderedGoals.length === 0 && <p className="small">No goals yet.</p>}
        </div>
      </section>
    </div>
  );
}
