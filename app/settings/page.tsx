"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  const [pref, setPref] = useState<Preference | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="page-shell narrow">
      <section className="card">
        <div className="section-head">
          <h1>Settings</h1>
          <p className="small">Manage your check-in cadence here. Use <Link href="/goals">My Goals</Link> for goal setup.</p>
        </div>

        {!userId && (
          <p className="small">
            Sign in to load your settings. <Link href="/login">Go to login</Link>.
          </p>
        )}
        {pref && (
          <div className="grid" style={{ gap: "0.7rem" }}>
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
        {error && <p className="small" style={{ color: "#b91c1c" }}>{error}</p>}
      </section>
    </div>
  );
}
