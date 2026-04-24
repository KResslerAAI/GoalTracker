"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Role } from "@prisma/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>(Role.MEMBER);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const useCredentialsAuth = true;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const callbackUrl = mode === "signup"
        ? role === Role.MANAGER
          ? "/setup"
          : "/settings"
        : "/dashboard";

      if (mode === "signup") {
        const signupResponse = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, name, role })
        });
        const signupBody = await signupResponse.json();

        if (!signupResponse.ok) {
          setError(signupBody.error ?? "Could not create account. Please try again.");
          return;
        }
      }

      const result = await signIn(useCredentialsAuth ? "credentials" : "email", {
        email,
        name,
        redirect: false,
        callbackUrl
      });

      if (result?.error) {
        if (!useCredentialsAuth) {
          setError("Could not send sign-in email. Check email settings and try again.");
        } else if (mode === "signup") {
          setError("Account created, but sign in failed. Switch to Log In and try again.");
        } else {
          setError("Could not log in. If you're new here, switch to Sign Up first.");
        }
        return;
      }

      if (!useCredentialsAuth) {
        setMessage("Check your inbox for a secure sign-in link.");
        return;
      }

      if (mode === "signup") {
        router.push(callbackUrl);
        return;
      }

      const me = await fetch("/api/auth/session").then((res) => res.json() as Promise<{ user?: { role?: Role; teamId?: string | null } }>);
      const userRole = me.user?.role;
      const hasTeam = Boolean(me.user?.teamId);

      if (userRole === Role.MANAGER) {
        router.push(hasTeam ? "/dashboard" : "/setup");
        return;
      }

      router.push("/settings");
    } catch {
      setError("Something went wrong while contacting auth services. Please try again.");
    }
  };

  return (
    <section className="card">
      <div className="section-head">
        <h1>{mode === "login" ? "Log In" : "Sign Up"}</h1>
        <p className="small">
        {mode === "login" ? "Sign in with an existing account." : "Create a new account and choose your role."}
        </p>
      </div>
      <div className="action-row" style={{ marginBottom: "0.8rem" }}>
        <button type="button" onClick={() => setMode("login")} disabled={mode === "login"}>
          Log In
        </button>
        <button type="button" onClick={() => setMode("signup")} disabled={mode === "signup"}>
          Sign Up
        </button>
      </div>
      <form onSubmit={onSubmit} className="grid" style={{ gap: "0.7rem" }}>
        {mode === "signup" && (
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value={Role.MEMBER}>Team Member</option>
              <option value={Role.MANAGER}>Manager</option>
            </select>
          </label>
        )}
        {(mode === "signup" || useCredentialsAuth) && (
          <label>
            Name {mode === "signup" ? "" : "(optional)"}
            <input value={name} onChange={(e) => setName(e.target.value)} required={mode === "signup"} />
          </label>
        )}
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit">{mode === "login" ? "Continue" : "Create Account"}</button>
      </form>
      {error && <p className="small" style={{ color: "#b91c1c" }}>{error}</p>}
      {message && <p className="small" style={{ color: "#047857" }}>{message}</p>}
    </section>
  );
}
