"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Role } from "@prisma/client";
import { useEffect, useRef } from "react";

export function AppNav() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;
  const pathname = usePathname();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openMenu() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (detailsRef.current) detailsRef.current.open = true;
  }

  function scheduleClose() {
    closeTimer.current = setTimeout(() => {
      if (detailsRef.current) detailsRef.current.open = false;
    }, 300);
  }

  useEffect(() => {
    if (detailsRef.current) detailsRef.current.open = false;
  }, [pathname]);

  return (
    <nav className="app-nav">
      <Link className="nav-link" href="/checkin">Check-in</Link>
      {status !== "loading" && role === Role.MANAGER && (
        <details
          ref={detailsRef}
          className="nav-dropdown"
          onMouseEnter={openMenu}
          onMouseLeave={scheduleClose}
        >
          <summary className="nav-link">Manager Tools</summary>
          <div className="dropdown-menu">
            <Link href="/setup" onClick={() => { if (detailsRef.current) detailsRef.current.open = false; }}>Team Setup</Link>
            <Link href="/dashboard" onClick={() => { if (detailsRef.current) detailsRef.current.open = false; }}>Manager Dashboard</Link>
            <Link href="/questions" onClick={() => { if (detailsRef.current) detailsRef.current.open = false; }}>Check-in Questions</Link>
          </div>
        </details>
      )}
    </nav>
  );
}
