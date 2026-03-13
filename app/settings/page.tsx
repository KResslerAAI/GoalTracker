"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useSession } from "next-auth/react";

type Preference = {
  userId: string;
  cadence: "WEEKLY" | "BIWEEKLY";
  anchorWeekStartDate: string;
  timezone?: string | null;
  reminderMethod?: "TEAMS_MESSAGE" | "EMAIL" | "BOTH";
};

type ReminderMethod = "TEAMS_MESSAGE" | "EMAIL" | "BOTH";

function reminderStorageKey(userId: string) {
  return `checkin-reminder-method:${userId}`;
}

function loadReminderMethod(userId: string): ReminderMethod | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(reminderStorageKey(userId));
  if (raw === "TEAMS_MESSAGE" || raw === "EMAIL" || raw === "BOTH") return raw;
  return null;
}

function saveReminderMethod(userId: string, method: ReminderMethod) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(reminderStorageKey(userId), method);
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const [role, setRole] = useState<"MANAGER" | "MEMBER">((session?.user?.role as "MANAGER" | "MEMBER") ?? "MEMBER");
  const [pref, setPref] = useState<Preference | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleMessage, setRoleMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/users/${userId}/checkin-preference`)
      .then((r) => r.json())
      .then((serverPref: Preference) => {
        const stored = loadReminderMethod(userId);
        const reminderMethod = stored ?? serverPref.reminderMethod ?? "BOTH";
        setPref({ ...serverPref, reminderMethod });
      })
      .catch((e) => setError(String(e)));
  }, [userId]);

  useEffect(() => {
    const currentRole = session?.user?.role as "MANAGER" | "MEMBER" | undefined;
    if (currentRole) setRole(currentRole);
  }, [session?.user?.role]);

  const update = async (cadence: "WEEKLY" | "BIWEEKLY", reminderMethod: ReminderMethod) => {
    if (!userId) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/users/${userId}/checkin-preference`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cadence,
          reminderMethod,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Update failed");
      }
      saveReminderMethod(userId, reminderMethod);
      setPref({ ...data, reminderMethod });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const updateRole = async (nextRole: "MANAGER" | "MEMBER") => {
    if (!userId) return;
    setSaving(true);
    setError(null);
    setRoleMessage(null);
    try {
      const res = await fetch(`/api/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update role");
      }
      setRole(nextRole);
      setRoleMessage("Role updated. Please sign in again to refresh permissions.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-shell narrow">
      <section className="card">
        <div className="section-head">
          <h1>Settings</h1>
          <p className="small">Manage your check-in cadence here. Use <Link href="/goals">My Goals</Link> for goal setup.</p>
        </div>
        <div className="action-row" style={{ marginTop: "0.8rem" }}>
          <Link href="/goals">
            <button type="button">Go to My Goals</button>
          </Link>
        </div>

        {!userId && (
          <p className="small">
            Sign in to load your settings. <Link href="/login">Go to login</Link>.
          </p>
        )}
        {pref && (
          <div className="grid" style={{ gap: "0.7rem" }}>
            <label>
              Account role
              <select
                value={role}
                onChange={(e) => updateRole(e.target.value as "MANAGER" | "MEMBER")}
                disabled={saving}
              >
                <option value="MEMBER">Team Member</option>
                <option value="MANAGER">Manager</option>
              </select>
            </label>
            <label>
              Cadence
              <select
                value={pref.cadence}
                onChange={(e) => update(e.target.value as "WEEKLY" | "BIWEEKLY", pref.reminderMethod ?? "BOTH")}
                disabled={saving}
              >
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Every other week</option>
              </select>
            </label>
            <label>
              How do you want to be reminded to complete your check-in?
              <select
                value={pref.reminderMethod ?? "BOTH"}
                onChange={(e) => update(pref.cadence, e.target.value as ReminderMethod)}
                disabled={saving}
              >
                <option value="TEAMS_MESSAGE">Teams Message</option>
                <option value="EMAIL">Email</option>
                <option value="BOTH">Both</option>
              </select>
            </label>
          </div>
        )}
        {roleMessage && (
          <div className="action-row" style={{ marginTop: "0.55rem" }}>
            <p className="small" style={{ margin: 0, color: "#047857" }}>{roleMessage}</p>
            <button type="button" onClick={() => signOut({ callbackUrl: "/login" })}>Sign Out</button>
          </div>
        )}
        {error && <p className="small" style={{ color: "#b91c1c" }}>{error}</p>}
      </section>
    </div>
  );
}
