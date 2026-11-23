"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";

const LINKS = [
  { href: "/admin", label: "Dashboard", icon: "clock" },
  { href: "/admin/users", label: "Users", icon: "shield" },
  { href: "/admin/reports", label: "All reports", icon: "file" },
  { href: "/admin/scams", label: "Scam review", icon: "warning" },
  { href: "/admin/verification", label: "Verification sources", icon: "building" },
] as const;

/** Admin sidebar links; the current section is highlighted. Sub-pages (e.g. /admin/users?sort=…) keep their parent lit. */
export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="admin-nav" aria-label="Admin">
      {LINKS.map((link) => {
        const active = link.href === "/admin" ? path === "/admin" : path.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className="admin-nav-link">
            <Icon name={link.icon} className="h-[18px] w-[18px] shrink-0" />
            <span>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
