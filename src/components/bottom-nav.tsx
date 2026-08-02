"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The app's primary navigation: a fixed bottom tab bar, thumb-reachable on
 * phones and the same centered bar on desktop. Role decides the tab set —
 * RD gets the RA tabs plus Admin. Account items (bell, sign out) live in the
 * slim top header, never here.
 */
export function BottomNav({ isRd }: { isRd: boolean }) {
  const pathname = usePathname();

  // Roster owns the whole building-browsing flow: picking a hallway, its
  // rooms, and the residents inside them.
  const tabs = [
    { href: "/", label: "Home", icon: <HomeIcon />, active: pathname === "/" },
    {
      href: "/roster",
      label: "Roster",
      icon: <UsersIcon />,
      active: ["/roster", "/hallways", "/rooms", "/residents"].some((p) =>
        pathname.startsWith(p),
      ),
    },
    {
      href: "/front-desk",
      label: "Front Desk",
      icon: <CalendarClockIcon />,
      active: pathname.startsWith("/front-desk"),
    },
    ...(isRd
      ? [
          {
            href: "/admin",
            label: "Admin",
            icon: <SlidersIcon />,
            active: pathname.startsWith("/admin"),
          },
        ]
      : []),
  ];

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-navy-dark/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-5xl items-stretch justify-around px-2">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={`my-1.5 flex min-w-16 flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 [touch-action:manipulation] ${
              tab.active
                ? "bg-white/15 text-white"
                : "text-white/55 transition-colors hover:text-white"
            }`}
          >
            {tab.icon}
            <span className="text-[11px] font-medium">{tab.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 10V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5M16 2v4M8 2v4M3 10h18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17" cy="17" r="4.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M17 15.2V17l1.4 1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
