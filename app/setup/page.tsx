"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Role } from "@prisma/client";
import { formatDisplayDate } from "@/lib/date-format";

type UnitType = "PERCENT" | "DOLLAR" | "COUNT" | "OTHER";

type AnnualGoal = {
  id: string;
  title: string;
  description?: string | null;
  year: number;
};

type QuarterlyGoal = {
  id: string;
  annualGoalId: string;
  quarter: number;
  title: string;
  description?: string | null;
  weight: number;
};

type TeamMember = {
  id: string;
  name: string | null;
  email: string;
  role: "MANAGER" | "MEMBER";
};

type TeamSummary = {
  teamId: string | null;
  name: string | null;
};

type SetupGoal = {
  annualId: string;
  quarterlyId: string | null;
  title: string;
  description: string;
  year: number;
  quarter: number | null;
  weight: number | null;
};

type EditableGoalState = {
  goalSentence: string;
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

function toUnitType(unit: string): { unitType: UnitType; otherUnit: string } {
  if (unit === "%") return { unitType: "PERCENT", otherUnit: "" };
  if (unit === "$") return { unitType: "DOLLAR", otherUnit: "" };
  if (unit === "#") return { unitType: "COUNT", otherUnit: "" };
  return { unitType: "OTHER", otherUnit: unit };
}

function quarterFromDate(dateString: string) {
  const d = new Date(`${dateString}T00:00:00.000Z`);
  return Math.floor(d.getUTCMonth() / 3) + 1;
}

function trackingDescription(unit: string, startValue: number, endValue: number, startDate: string, endDate: string) {
  return `Tracking: unit ${unit}, start ${startValue}${unit}, target ${endValue}${unit}, startDate ${startDate}, endDate ${endDate}.`;
}

function quarterRange(year: number, quarter: number) {
  const monthStart = (quarter - 1) * 3 + 1;
  const monthEnd = monthStart + 2;
  const startDate = `${year}-${String(monthStart).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, monthEnd, 0));
  const endDateIso = `${year}-${String(monthEnd).padStart(2, "0")}-${String(endDate.getUTCDate()).padStart(2, "0")}`;
  return { startDate, endDate: endDateIso };
}

function parseValueWithUnit(raw: string, unit: string) {
  const trimmed = raw.trim();
  if (trimmed.endsWith(unit)) {
    const numericPart = trimmed.slice(0, Math.max(trimmed.length - unit.length, 0)).trim();
    const parsed = Number(numericPart);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTrackingDescription(description?: string | null) {
  if (!description) return null;
  const match = description.match(
    /^Tracking: unit (.*), start (.*), target (.*), startDate (\d{4}-\d{2}-\d{2}), endDate (\d{4}-\d{2}-\d{2})\.$/
  );
  if (!match) return null;

  const unit = match[1];
  const startRaw = match[2];
  const endRaw = match[3];
  const startDate = match[4];
  const endDate = match[5];

  return {
    unit,
    startValue: parseValueWithUnit(startRaw, unit),
    endValue: parseValueWithUnit(endRaw, unit),
    startDate,
    endDate
  };
}

function toEditableState(goal: SetupGoal): EditableGoalState {
  const parsed = parseTrackingDescription(goal.description);
  if (parsed) {
    const unitParts = toUnitType(parsed.unit);
    return {
      goalSentence: goal.title,
      unitType: unitParts.unitType,
      otherUnit: unitParts.otherUnit,
      startValue: parsed.startValue,
      endValue: parsed.endValue,
      startDate: parsed.startDate,
      endDate: parsed.endDate
    };
  }

  const fallbackRange = quarterRange(goal.year, goal.quarter ?? 1);
  return {
    goalSentence: goal.title,
    unitType: "PERCENT",
    otherUnit: "",
    startValue: 0,
    endValue: 100,
    startDate: fallbackRange.startDate,
    endDate: fallbackRange.endDate
  };
}

export default function SetupPage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;
  const hasExistingTeam = Boolean(session?.user?.teamId);

  const [teamName, setTeamName] = useState("My Team");
  const [teamMessage, setTeamMessage] = useState<string | null>(null);
  const [teamCreatedNow, setTeamCreatedNow] = useState(false);

  const [goalSentence, setGoalSentence] = useState("");
  const [unitType, setUnitType] = useState<UnitType>("PERCENT");
  const [otherUnit, setOtherUnit] = useState("");
  const [startValue, setStartValue] = useState(0);
  const [endValue, setEndValue] = useState(100);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [goalsMessage, setGoalsMessage] = useState<string | null>(null);
  const [teamGoals, setTeamGoals] = useState<SetupGoal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);

  const [editingGoalKey, setEditingGoalKey] = useState<string | null>(null);
  const [editingGoal, setEditingGoal] = useState<EditableGoalState | null>(null);

  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [membersMessage, setMembersMessage] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);

  const hasTeam = useMemo(() => hasExistingTeam || teamCreatedNow, [hasExistingTeam, teamCreatedNow]);

  const loadTeam = async () => {
    const res = await fetch("/api/setup/team");
    const body = await res.json();
    if (!res.ok) {
      setTeamMessage(body.error ?? "Failed to load team");
      return;
    }

    const team = body as TeamSummary;
    if (team.name) setTeamName(team.name);
    if (team.teamId) setTeamCreatedNow(true);
  };

  const loadTeamGoals = async () => {
    if (!hasTeam) {
      setTeamGoals([]);
      return;
    }

    setGoalsLoading(true);
    try {
      const [annualRes, quarterlyRes] = await Promise.all([fetch("/api/goals/annual"), fetch("/api/goals/quarterly")]);
      const annualBody = await annualRes.json();
      const quarterlyBody = await quarterlyRes.json();

      if (!annualRes.ok) {
        throw new Error(annualBody.error ?? "Failed to load annual goals");
      }
      if (!quarterlyRes.ok) {
        throw new Error(quarterlyBody.error ?? "Failed to load team goals");
      }

      const annualGoals = annualBody as AnnualGoal[];
      const quarterlyByAnnual = new Map<string, QuarterlyGoal>();
      for (const quarterly of quarterlyBody as QuarterlyGoal[]) {
        if (!quarterlyByAnnual.has(quarterly.annualGoalId)) {
          quarterlyByAnnual.set(quarterly.annualGoalId, quarterly);
        }
      }

      const merged = annualGoals.map((annual) => {
        const quarterly = quarterlyByAnnual.get(annual.id);
        return {
          annualId: annual.id,
          quarterlyId: quarterly?.id ?? null,
          title: quarterly?.title ?? annual.title ?? "Untitled Team Goal",
          description: quarterly?.description ?? annual.description ?? "",
          year: annual.year,
          quarter: quarterly?.quarter ?? null,
          weight: quarterly?.weight ?? null
        } satisfies SetupGoal;
      });

      setTeamGoals(merged);
    } catch (error) {
      setGoalsMessage((error as Error).message);
    } finally {
      setGoalsLoading(false);
    }
  };

  const loadMembers = async () => {
    if (!hasTeam) {
      setMembers([]);
      return;
    }

    const res = await fetch("/api/invitations");
    const body = await res.json();
    if (!res.ok) {
      setMembersMessage(body.error ?? "Failed to load team members");
      return;
    }

    setMembers(body);
  };

  useEffect(() => {
    loadTeam().catch(() => undefined);
  }, []);

  useEffect(() => {
    loadTeamGoals().catch(() => undefined);
    loadMembers().catch(() => undefined);
  }, [hasTeam]);

  const createTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTeamMessage(null);

    const response = await fetch("/api/setup/team", {
      method: hasTeam ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamName })
    });

    const body = await response.json();
    if (!response.ok) {
      setTeamMessage(body.error ?? "Setup failed");
      return;
    }

    setTeamCreatedNow(true);
    setTeamMessage(hasTeam ? "Team details updated." : "Team created. You can now add members below.");
    await Promise.all([loadTeamGoals(), loadMembers()]);
  };

  const addMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMembersMessage(null);

    if (!hasTeam) {
      setMembersMessage("Create a team first.");
      return;
    }

    const res = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: memberEmail,
        name: memberName,
        role: "MEMBER"
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setMembersMessage(data.error ?? "Failed to add team member");
      return;
    }

    setMemberName("");
    setMemberEmail("");
    setMembersMessage("Team member added.");
    await loadMembers();
  };

  const removeMember = async (memberId: string) => {
    setMembersMessage(null);
    const res = await fetch("/api/invitations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: memberId })
    });
    const body = await res.json();
    if (!res.ok) {
      setMembersMessage(body.error ?? "Failed to remove team member");
      return;
    }
    setMembersMessage("Team member removed.");
    await loadMembers();
  };

  const createTeamGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGoalsMessage(null);

    if (!hasTeam) {
      setGoalsMessage("Create a team first.");
      return;
    }

    if (!startDate || !endDate) {
      setGoalsMessage("Please select both start date and end date.");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setGoalsMessage("End date must be on or after start date.");
      return;
    }

    const unit = resolveUnit(unitType, otherUnit);
    const year = new Date(`${endDate}T00:00:00.000Z`).getUTCFullYear();
    const quarter = quarterFromDate(endDate);
    const description = trackingDescription(unit, startValue, endValue, startDate, endDate);

    const annualRes = await fetch("/api/goals/annual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: goalSentence,
        description,
        year
      })
    });
    const annualBody = await annualRes.json();
    if (!annualRes.ok) {
      setGoalsMessage(annualBody.error ?? "Failed to create team goal");
      return;
    }

    const quarterlyRes = await fetch("/api/goals/quarterly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        annualGoalId: annualBody.id,
        quarter,
        title: goalSentence,
        description,
        weight: 1
      })
    });
    const quarterlyBody = await quarterlyRes.json();
    if (!quarterlyRes.ok) {
      setGoalsMessage(quarterlyBody.error ?? "Failed to finalize team goal");
      return;
    }

    setGoalSentence("");
    setStartValue(0);
    setEndValue(unitType === "PERCENT" ? 100 : 10);
    setStartDate("");
    setEndDate("");
    setGoalsMessage("Team goal added.");
    await loadTeamGoals();
  };

  const startEditingGoal = (goal: SetupGoal) => {
    setEditingGoalKey(goal.annualId);
    setEditingGoal(toEditableState(goal));
    setGoalsMessage(null);
  };

  const cancelEditingGoal = () => {
    setEditingGoalKey(null);
    setEditingGoal(null);
  };

  const saveGoalChanges = async (goal: SetupGoal) => {
    if (!editingGoal) return;
    setGoalsMessage(null);

    if (!editingGoal.goalSentence.trim()) {
      setGoalsMessage("Goal sentence is required.");
      return;
    }
    if (!editingGoal.startDate || !editingGoal.endDate) {
      setGoalsMessage("Please select both start date and end date.");
      return;
    }
    if (new Date(editingGoal.startDate) > new Date(editingGoal.endDate)) {
      setGoalsMessage("End date must be on or after start date.");
      return;
    }

    const unit = resolveUnit(editingGoal.unitType, editingGoal.otherUnit);
    const year = new Date(`${editingGoal.endDate}T00:00:00.000Z`).getUTCFullYear();
    const quarter = quarterFromDate(editingGoal.endDate);
    const description = trackingDescription(
      unit,
      editingGoal.startValue,
      editingGoal.endValue,
      editingGoal.startDate,
      editingGoal.endDate
    );

    const annualRes = await fetch(`/api/goals/annual/${goal.annualId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editingGoal.goalSentence,
        description,
        year
      })
    });
    const annualBody = await annualRes.json();
    if (!annualRes.ok) {
      setGoalsMessage(annualBody.error ?? "Failed to update annual goal");
      return;
    }

    if (goal.quarterlyId) {
      const quarterlyRes = await fetch(`/api/goals/quarterly/${goal.quarterlyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quarter,
          title: editingGoal.goalSentence,
          description,
          weight: goal.weight ?? 1
        })
      });
      const quarterlyBody = await quarterlyRes.json();
      if (!quarterlyRes.ok) {
        setGoalsMessage(quarterlyBody.error ?? "Failed to update team goal");
        return;
      }
    }

    setGoalsMessage("Team goal updated.");
    setEditingGoalKey(null);
    setEditingGoal(null);
    await loadTeamGoals();
  };

  const retireTeamGoal = async (goal: SetupGoal) => {
    setGoalsMessage(null);
    const annualRes = await fetch(`/api/goals/annual/${goal.annualId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ARCHIVED" })
    });
    const annualBody = await annualRes.json();
    if (!annualRes.ok) {
      setGoalsMessage(annualBody.error ?? "Failed to retire team goal");
      return;
    }

    if (goal.quarterlyId) {
      const quarterlyRes = await fetch(`/api/goals/quarterly/${goal.quarterlyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED" })
      });
      const quarterlyBody = await quarterlyRes.json();
      if (!quarterlyRes.ok) {
        setGoalsMessage(quarterlyBody.error ?? "Failed to retire team goal");
        return;
      }
    }

    setGoalsMessage("Team goal retired. It remains available in yearly reports.");
    await loadTeamGoals();
  };

  return (
    <div className="page-shell narrow">
      <section className="card">
        <div className="section-head">
          <h1>Team Setup</h1>
          <p className="small">Use expandable sections to set up your team and goals.</p>
        </div>
      </section>

      {status !== "loading" && role !== Role.MANAGER && (
        <section className="card">
          <p className="small">Only managers can access Team Setup.</p>
        </section>
      )}

      {status !== "loading" && role !== Role.MANAGER ? null : (
        <>
          <details className="section-expander" open>
            <summary>1. Team Details & Members</summary>
            <div className="section-expander-content grid" style={{ gap: "0.9rem" }}>
              <form onSubmit={createTeam} className="grid" style={{ gap: "0.7rem" }}>
                <label>
                  Team name
                  <input required value={teamName} onChange={(e) => setTeamName(e.target.value)} />
                </label>
                <button type="submit">{hasTeam ? "Update Team Name" : "Create Team"}</button>
              </form>
              {teamMessage && <p className="small">{teamMessage}</p>}

              <form onSubmit={addMember} className="grid" style={{ gap: "0.7rem" }}>
                <label>
                  Name
                  <input value={memberName} onChange={(e) => setMemberName(e.target.value)} />
                </label>
                <label>
                  Email
                  <input type="email" required value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} />
                </label>
                <button type="submit" disabled={!hasTeam}>Add Team Member</button>
              </form>
              {!hasTeam && <p className="small">Create the team first to enable member invites.</p>}
              {membersMessage && <p className="small">{membersMessage}</p>}

              <div className="grid grid-2" style={{ gap: "0.7rem" }}>
                {members.map((member) => (
                  <article key={member.id} className="visual-card">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.6rem", alignItems: "center" }}>
                      <strong>{member.name ?? "Unnamed member"}</strong>
                      <button type="button" onClick={() => removeMember(member.id)}>Remove</button>
                    </div>
                    <p className="small" style={{ margin: "0.35rem 0 0" }}>{member.email}</p>
                  </article>
                ))}
                {hasTeam && members.length === 0 && <p className="small">No team members added yet.</p>}
              </div>
            </div>
          </details>

          <details className="section-expander" open>
            <summary>2. Team Goals</summary>
            <div className="section-expander-content grid" style={{ gap: "0.9rem" }}>
              <form onSubmit={createTeamGoal} className="grid" style={{ gap: "0.7rem" }}>
                <label>
                  Goal (written sentence)
                  <input
                    required
                    value={goalSentence}
                    onChange={(e) => setGoalSentence(e.target.value)}
                    placeholder="Example: Increase enterprise retention from 82% to 90%."
                  />
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
                    <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </label>
                  <label>
                    End date
                    <input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </label>
                </div>
                <button type="submit" disabled={!hasTeam || !goalSentence.trim()}>Add Team Goal</button>
              </form>
              {!hasTeam && <p className="small">Create the team first to enable goal creation.</p>}
              {goalsMessage && <p className="small">{goalsMessage}</p>}

              <h3 style={{ margin: 0 }}>Team Goals Added</h3>
              {goalsLoading && <p className="small">Loading goals...</p>}
              {!goalsLoading && teamGoals.length === 0 && <p className="small">No team goals yet.</p>}

              <div className="grid" style={{ gap: "0.7rem" }}>
                {teamGoals.map((goal) => {
                  const parsed = parseTrackingDescription(goal.description);
                  const isEditing = editingGoalKey === goal.annualId && editingGoal;

                  if (isEditing && editingGoal) {
                    return (
                      <div key={goal.annualId} className="visual-card">
                        <div className="grid" style={{ gap: "0.7rem" }}>
                          <label>
                            Goal (written sentence)
                            <input
                              value={editingGoal.goalSentence}
                              onChange={(e) => setEditingGoal({ ...editingGoal, goalSentence: e.target.value })}
                            />
                          </label>
                          <label>
                            Unit of measurement
                            <select
                              value={editingGoal.unitType}
                              onChange={(e) => setEditingGoal({ ...editingGoal, unitType: e.target.value as UnitType })}
                            >
                              <option value="PERCENT">%</option>
                              <option value="DOLLAR">$</option>
                              <option value="COUNT">#</option>
                              <option value="OTHER">Other</option>
                            </select>
                          </label>
                          {editingGoal.unitType === "OTHER" && (
                            <label>
                              Other unit
                              <input
                                value={editingGoal.otherUnit}
                                onChange={(e) => setEditingGoal({ ...editingGoal, otherUnit: e.target.value })}
                              />
                            </label>
                          )}
                          <div className="grid grid-2" style={{ gap: "0.7rem" }}>
                            <label>
                              Starting value
                              <input
                                type="number"
                                value={editingGoal.startValue}
                                onChange={(e) => setEditingGoal({ ...editingGoal, startValue: Number(e.target.value) })}
                              />
                            </label>
                            <label>
                              Target value
                              <input
                                type="number"
                                value={editingGoal.endValue}
                                onChange={(e) => setEditingGoal({ ...editingGoal, endValue: Number(e.target.value) })}
                              />
                            </label>
                          </div>
                          <div className="grid grid-2" style={{ gap: "0.7rem" }}>
                            <label>
                              Start date
                              <input
                                type="date"
                                value={editingGoal.startDate}
                                onChange={(e) => setEditingGoal({ ...editingGoal, startDate: e.target.value })}
                              />
                            </label>
                            <label>
                              End date
                              <input
                                type="date"
                                value={editingGoal.endDate}
                                onChange={(e) => setEditingGoal({ ...editingGoal, endDate: e.target.value })}
                              />
                            </label>
                          </div>
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button type="button" onClick={() => saveGoalChanges(goal)}>Save Changes</button>
                            <button type="button" onClick={cancelEditingGoal}>Cancel</button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <article key={goal.annualId} className="visual-card" style={{ display: "grid", gap: "0.6rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong>{goal.title}</strong>
                        <div style={{ display: "flex", gap: "0.45rem" }}>
                          <button type="button" onClick={() => startEditingGoal(goal)}>Edit</button>
                          <button type="button" onClick={() => retireTeamGoal(goal)}>Retire</button>
                        </div>
                      </div>

                      {parsed ? (
                        <>
                          <div className="grid grid-2" style={{ gap: "0.55rem" }}>
                            <div className="card" style={{ padding: "0.6rem" }}>
                              <p className="small" style={{ margin: 0 }}>Start</p>
                              <strong>{formatDisplayDate(parsed.startDate)}</strong>
                            </div>
                            <div className="card" style={{ padding: "0.6rem" }}>
                              <p className="small" style={{ margin: 0 }}>End</p>
                              <strong>{formatDisplayDate(parsed.endDate)}</strong>
                            </div>
                          </div>
                          <p className="small" style={{ margin: 0 }}>
                            Unit: {parsed.unit} • Baseline: {parsed.startValue} • Target: {parsed.endValue}
                          </p>
                        </>
                      ) : (
                        <p className="small" style={{ margin: 0 }}>{goal.description || "No tracking details"}</p>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
