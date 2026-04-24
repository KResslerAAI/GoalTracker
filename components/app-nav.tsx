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

  function closeMenu() {
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
  }

  useEffect(() => {
    closeMenu();
  }, [pathname]);

  return (
    <nav className="app-nav">
      <Link className="nav-link" href="/checkin">Check-in</Link>
      {status !== "loading" && role === Role.MANAGER && (
        <details ref={detailsRef} className="nav-dropdown" onMouseLeave={closeMenu}>
          <summary className="nav-link">Manager Tools</summary>
          <div className="dropdown-menu">
            <Link href="/setup" onClick={closeMenu}>Team Setup</Link>
            <Link href="/dashboard" onClick={closeMenu}>Manager Dashboard</Link>
            <Link href="/questions" onClick={closeMenu}>Check-in Questions</Link>
          </div>
        </details>
      )}
    </nav>
  );
}
