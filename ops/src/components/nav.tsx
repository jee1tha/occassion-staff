"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import clsx from "clsx";

const ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/approvals", label: "Approvals" },
  { href: "/vendors", label: "Vendors" },
  { href: "/agents", label: "Agents & evals" },
  { href: "/models", label: "Models" },
  { href: "/settings", label: "ROI settings" },
];

export function Nav({ pending }: { pending: React.ReactNode }) {
  return (
    <Suspense fallback={<NavList path={null} pending={pending} />}>
      <CurrentNav pending={pending} />
    </Suspense>
  );
}

function CurrentNav({ pending }: { pending: React.ReactNode }) {
  return <NavList path={usePathname()} pending={pending} />;
}

function NavList({ path, pending }: { path: string | null; pending: React.ReactNode }) {
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {ITEMS.map((item) => {
        const active = path !== null && (item.href === "/" ? path === "/" : path.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex items-center justify-between gap-3 rounded-sm px-2.5 py-1.5 text-sm whitespace-nowrap",
              active ? "bg-ink text-paper" : "text-ink-2 hover:bg-sunk hover:text-ink",
            )}
          >
            {item.label}
            {item.href === "/approvals" && pending}
          </Link>
        );
      })}
    </nav>
  );
}
