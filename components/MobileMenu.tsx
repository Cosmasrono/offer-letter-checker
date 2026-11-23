"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/#check", label: "Check an offer" },
  { href: "/visa", label: "Check a visa" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#questions", label: "FAQs" },
  { href: "/history", label: "My reports" },
];

/** Phone-width navigation: the header links don't fit beside the brand, so they open from a menu button. */
export function MobileMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="mobile-menu">
      <button type="button" className="mobile-menu-button" aria-expanded={open} aria-controls="mobile-menu-panel"
        aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((value) => !value)}>
        <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <nav id="mobile-menu-panel" className="mobile-menu-panel" aria-label="Menu">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</Link>
          ))}
        </nav>
      )}
    </div>
  );
}
