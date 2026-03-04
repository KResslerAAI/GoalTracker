import Link from "next/link";

export default function HomePage() {
  return (
    <div className="page-shell" style={{ gap: "1.2rem" }}>
      <section className="hero-card">
        <p className="eyebrow">Pathfinder</p>
        <h1 style={{ margin: 0 }}>Goal Tracker</h1>
        <p className="small" style={{ maxWidth: 720 }}>
          Team goal tracking with weekly or biweekly check-ins, typed progress updates, and manager visibility.
        </p>
      </section>

      <section className="grid grid-2">
        <div className="card">
          <h2>Manager</h2>
          <p className="small">Create team goals, monitor submission compliance, and coach with clear progress views.</p>
          <Link href="/dashboard">Open dashboard</Link>
        </div>
        <div className="card">
          <h2>Team Member</h2>
          <p className="small">Set personal goals, choose check-in cadence, and submit weekly check-ins.</p>
          <Link href="/goals">Open my goals</Link>
        </div>
      </section>
    </div>
  );
}
