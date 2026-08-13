"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Role } from "@prisma/client";
import { weekStart, addDays } from "@/lib/date";
import { formatDisplayDate } from "@/lib/date-format";
import { decodePrioritiesAnswer } from "@/lib/priorities";
import { decodeQuestionPrompt } from "@/lib/checkin-questions";

// ── Types ────────────────────────────────────────────────────────────────────

type Member = {
  userId: string;
  name: string | null;
  email: string;
  cadence: "WEEKLY" | "BIWEEKLY";
  dueThisWeek: boolean;
  submitted: boolean;
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatCheckinProgressValue(entry: CheckinDetail["progress"][number]): string {
  if (entry.progressType === "BOOLEAN") {
    return entry.valueBoolean == null ? "—" : entry.valueBoolean ? "Complete" : "Not complete";
  }
  if (entry.progressType === "PERCENT") {
    return entry.valuePercent == null ? "—" : `${entry.valuePercent.toFixed(0)}%`;
  }
  if (entry.progressType === "NUMERIC") {
    if (entry.valueNumeric == null) return "—";
    const val = entry.valueNumeric.toLocaleString();
    const unit = entry.unit ?? "";
    if (unit === "$") return `$${val}`;
    if (unit === "%") return `${val}%`;
    return unit ? `${val} ${unit}` : val;
  }
  return "—";
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TeamCheckinsPage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;

  const [weekIso, setWeekIso] = useState<string>(() =>
    toIso(weekStart(new Date()))
  );
  const currentWeekIso = toIso(weekStart(new Date()));

  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  // Map of userId → CheckinDetail | "loading" | "error"
  const [details, setDetails] = useState<Record<string, CheckinDetail | "loading" | "error">>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // ── Fetch member list ────────────────────────────────────────────────────

  const fetchMembers = useCallback(async (iso: string) => {
    setMembersLoading(true);
    setMembersError(null);
    setDetails({});
    setExpanded({});
    try {
      const res = await fetch(`/api/manager/dashboard?weekStart=${iso}`);
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json() as { members: Member[] };
      setMembers(json.members ?? []);
    } catch (e) {
      setMembersError((e as Error).message);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role === Role.MANAGER) fetchMembers(weekIso);
  }, [weekIso, role, fetchMembers]);

  // ── Fetch individual detail ─────────────────────────────────────────────

  async function toggleMember(userId: string) {
    if (expanded[userId]) {
      setExpanded((prev) => ({ ...prev, [userId]: false }));
      return;
    }
    setExpanded((prev) => ({ ...prev, [userId]: true }));
    if (details[userId]) return; // already fetched
    setDetails((prev) => ({ ...prev, [userId]: "loading" }));
    try {
      const res = await fetch(`/api/manager/checkins?userId=${userId}&weekStart=${weekIso}`);
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json() as CheckinDetail;
      setDetails((prev) => ({ ...prev, [userId]: json }));
    } catch {
      setDetails((prev) => ({ ...prev, [userId]: "error" }));
    }
  }

  // ── Week navigation ──────────────────────────────────────────────────────

  function prevWeek() {
    setWeekIso((iso) => toIso(addDays(new Date(`${iso}T00:00:00.000Z`), -7)));
  }

  function nextWeek() {
    setWeekIso((iso) => toIso(addDays(new Date(`${iso}T00:00:00.000Z`), 7)));
  }

  // ── Auth guard ────────────────────────────────────────────────────────────

  if (status === "loading") {
    return (
      <div className="page-shell">
        <section className="card"><p className="small">Loading…</p></section>
      </div>
    );
  }

  if (role !== Role.MANAGER) {
    return (
      <div className="page-shell">
        <section className="card">
          <p className="small" style={{ color: "#b91c1c" }}>You must be a manager to view this page.</p>
        </section>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isCurrentWeek = weekIso === currentWeekIso;

  return (
    <div className="page-shell">
      {/* Page header */}
      <section className="card">
        <div className="section-head">
          <h1>Team Check-ins</h1>
          <p className="small">Review what your team members submitted each week.</p>
        </div>
      </section>

      {/* Week navigator */}
      <section className="card">
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <button type="button" className="outline-button" onClick={prevWeek}>← Previous week</button>
          <span style={{ fontWeight: 500 }}>Week of {formatDisplayDate(weekIso)}</span>
          <button type="button" className="outline-button" onClick={nextWeek} disabled={isCurrentWeek}>
            Next week →
          </button>
        </div>
      </section>

      {/* Member list */}
      {membersLoading && (
        <section className="card"><p className="small">Loading team members…</p></section>
      )}
      {membersError && (
        <section className="card">
          <p className="small" style={{ color: "#b91c1c" }}>{membersError}</p>
        </section>
      )}

      {!membersLoading && !membersError && members.length === 0 && (
        <section className="card">
          <p className="small">No team members found.</p>
        </section>
      )}

      {!membersLoading && !membersError && members.map((member) => {
        const detail = details[member.userId];
        const isExpanded = expanded[member.userId] ?? false;

        return (
          <section key={member.userId} className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 500 }}>{member.name ?? member.email}</span>
                {member.name && <span className="small" style={{ color: "#777" }}>{member.email}</span>}
                <span className={`badge ${member.submitted ? "green" : "yellow"}`}>
                  {member.submitted ? "Submitted" : "Not submitted"}
                </span>
                <span className="badge" style={{ background: "#f0f0f0", color: "#555" }}>
                  {member.cadence === "BIWEEKLY" ? "Bi-weekly" : "Weekly"}
                </span>
              </div>
              {member.submitted && (
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => toggleMember(member.userId)}
                >
                  {isExpanded ? "Collapse" : "View submission"}
                </button>
              )}
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div style={{ marginTop: "1rem", borderTop: "1px solid #e5e5e5", paddingTop: "1rem" }}>
                {detail === "loading" && <p className="small">Loading…</p>}
                {detail === "error" && <p className="small" style={{ color: "#b91c1c" }}>Failed to load check-in details.</p>}
                {detail && detail !== "loading" && detail !== "error" && (
                  <CheckinDetailView detail={detail} />
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ── CheckinDetailView ─────────────────────────────────────────────────────────

function CheckinDetailView({ detail }: { detail: CheckinDetail }) {
  return (
    <div className="grid" style={{ gap: "1rem" }}>
      <p className="small" style={{ margin: 0, color: "#666" }}>
        Submitted {formatDisplayDate(detail.submittedAt)}
      </p>

      {/* Goal progress */}
      {detail.progress.length > 0 && (
        <div className="grid" style={{ gap: "0.5rem" }}>
          <strong>Goal progress</strong>
          {detail.progress.map((entry) => (
            <div key={entry.personalGoalId} className="visual-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
              <span className="small">{entry.title}</span>
              <span className="small" style={{ flexShrink: 0, fontWeight: 500, color: "#333" }}>
                {formatCheckinProgressValue(entry)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Question answers */}
      {detail.answers.length > 0 && (
        <div className="grid" style={{ gap: "0.5rem" }}>
          <strong>Responses</strong>
          {detail.answers.map((answer) => {
            const decoded = decodeQuestionPrompt(answer.prompt);
            const prompt = decoded.prompt;

            if (answer.key === "weekly_next_steps") {
              const priorities = decodePrioritiesAnswer(answer.textAnswer);
              return (
                <div key={answer.questionId} className="visual-card">
                  <strong className="small">{prompt}</strong>
                  {priorities.length > 0 ? (
                    <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.2rem" }}>
                      {priorities.map((item) => <li key={item} className="small">{item}</li>)}
                    </ul>
                  ) : (
                    <p className="small" style={{ margin: "0.4rem 0 0" }}>No priorities listed.</p>
                  )}
                </div>
              );
            }

            const answerText =
              answer.textAnswer ??
              (answer.numberAnswer != null ? String(answer.numberAnswer) : null) ??
              (answer.booleanAnswer != null ? (answer.booleanAnswer ? "Yes" : "No") : null) ??
              "—";

            return (
              <div key={answer.questionId} className="visual-card">
                <strong className="small">{prompt}</strong>
                <p className="small" style={{ margin: "0.4rem 0 0" }}>{answerText}</p>
              </div>
            );
          })}
        </div>
      )}

      {detail.progress.length === 0 && detail.answers.length === 0 && (
        <p className="small" style={{ color: "#777" }}>No data submitted.</p>
      )}
    </div>
  );
}
