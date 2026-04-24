"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef } from "react";

export function AuthControls() {
  const { data: session, status } = useSession();
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

  function closeMenu() {
    if (detailsRef.current) detailsRef.current.open = false;
  }

  useEffect(() => {
    closeMenu();
  }, [pathname]);

  if (status === "loading") {
    return <span className="small">Loading...</span>;
  }

  if (!session?.user) {
    return <Link className="login-pill" href="/login">Log in</Link>;
  }

  return (
    <details ref={detailsRef} className="nav-dropdown user-dropdown" onMouseEnter={openMenu} onMouseLeave={scheduleClose}>
      <summary className="nav-link">{session.user.name ?? "Account"}</summary>
      <div className="dropdown-menu">
        <Link href="/goals" onClick={closeMenu}>My Goals</Link>
        <Link href="/settings" onClick={closeMenu}>Settings</Link>
        <button
          type="button"
          className="dropdown-action"
          onClick={() => {
            closeMenu();
            signOut({ callbackUrl: "/" });
          }}
        >
          Log out
        </button>
      </div>
    </details>
  );
}
