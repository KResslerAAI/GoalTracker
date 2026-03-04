import "./globals.css";
import { ReactNode } from "react";
import { AuthControls } from "@/components/auth-controls";
import { AppSessionProvider } from "@/components/session-provider";
import { AppNav } from "@/components/app-nav";

export const metadata = {
  title: "Pathfinder Goal Tracker",
  description: "Track annual, quarterly, and personal goals"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppSessionProvider>
          <main>
            <header className="app-header">
              <div className="brand-block" aria-label="Pathfinder brand">
                <img className="brand-logo" src="/pathfinder_color_white.png" alt="Automation Anywhere Pathfinder logo" />
              </div>
              <div className="header-actions">
                <span className="app-title-text">GOAL TRACKER</span>
                <div className="header-nav-row">
                  <AppNav />
                  <AuthControls />
                </div>
              </div>
            </header>
            {children}
          </main>
        </AppSessionProvider>
      </body>
    </html>
  );
}
