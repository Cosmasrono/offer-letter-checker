"use client";

import { Fragment, useMemo, useState } from "react";
import type { Entities } from "@/lib/types";

// What the scan pulled out of the letter, so the reader can see where each detail sits in the text.
type MarkKind = "fee" | "payment" | "money" | "contact" | "website";
const MARKS: Record<MarkKind, { label: string; className: string; dot: string }> = {
  fee: {
    label: "Payment request",
    className: "rounded-sm bg-red-50 decoration-red-400 underline decoration-2 underline-offset-4 dark:bg-red-950/40",
    dot: "bg-red-500",
  },
  payment: {
    label: "Payment account",
    className: "rounded bg-red-100 px-0.5 font-semibold text-red-900 dark:bg-red-900/60 dark:text-red-100",
    dot: "bg-red-700",
  },
  money: {
    label: "Money",
    className: "rounded bg-amber-100 px-0.5 font-semibold text-amber-900 dark:bg-amber-900/50 dark:text-amber-100",
    dot: "bg-amber-500",
  },
  contact: {
    label: "Email / phone",
    className: "rounded bg-violet-100 px-0.5 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100",
    dot: "bg-violet-500",
  },
  website: {
    label: "Website",
    className: "rounded bg-sky-100 px-0.5 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100",
    dot: "bg-sky-500",
  },
};
const INLINE_KINDS: MarkKind[] = ["payment", "money", "contact", "website"];
const TEXT_LIMIT = 3000; // the backend keeps the first 3,000 characters of the checked text

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Extracted values can differ from the letter in spacing, so any run of whitespace matches any other.
const loosePattern = (value: string) => value.trim().split(/\s+/).map(escape).join("\\s+");
// Phone numbers are often written with spaces or dashes, or without the country code the scan added.
const phonePattern = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(-9);
  // An optional "+254 " / "00254 " / "0" in front, then the last nine digits with any separators.
  return digits.length >= 9 ? `(?:(?:\\+|00)?\\d{1,3}[\\s().-]*|0)?${digits.split("").join("[\\s().-]*")}` : loosePattern(value);
};

type Term = { kind: MarkKind; pattern: string };

function termsFor(entities: Entities): { fees: Term[]; inline: Term[] } {
  const clean = (values: string[] | undefined) => (values ?? []).filter((v) => v && v.trim().length >= 2);
  const inline: Term[] = [
    ...clean(entities.payment_accounts).map((v) => ({ kind: "payment" as const, pattern: loosePattern(v) })),
    ...clean(entities.money).map((v) => ({ kind: "money" as const, pattern: loosePattern(v) })),
    ...clean(entities.emails).map((v) => ({ kind: "contact" as const, pattern: loosePattern(v) })),
    ...clean(entities.phones).map((v) => ({ kind: "contact" as const, pattern: phonePattern(v) })),
    ...clean([...entities.urls, ...entities.domains]).map((v) => ({ kind: "website" as const, pattern: loosePattern(v) })),
  ];
  // Longer patterns first, so "KES 50,000" wins over "50,000" at the same position.
  inline.sort((a, b) => b.pattern.length - a.pattern.length);
  const fees = clean(entities.fee_mentions).map((v) => ({ kind: "fee" as const, pattern: loosePattern(v) }));
  return { fees, inline };
}

type Piece = { text: string; kind?: MarkKind };

/** Splits text into plain and highlighted pieces for the given terms (first match wins, case-insensitive). */
function split(text: string, terms: Term[]): Piece[] {
  if (terms.length === 0) return [{ text }];
  const regex = new RegExp(terms.map((t) => `(${t.pattern})`).join("|"), "gi");
  const pieces: Piece[] = [];
  let last = 0;
  for (const match of text.matchAll(regex)) {
    if (!match[0]) continue;
    const at = match.index ?? 0;
    if (at > last) pieces.push({ text: text.slice(last, at) });
    const group = match.slice(1).findIndex((g) => g !== undefined);
    pieces.push({ text: match[0], kind: terms[group]?.kind });
    last = at + match[0].length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last) });
  return pieces;
}

type Segment = { text: string; fee: boolean; inner: Piece[] };

function highlight(text: string, entities: Entities): Segment[] {
  const { fees, inline } = termsFor(entities);
  // Fee sentences are wrapped first; amounts and accounts inside them are still marked.
  return split(text, fees).map((piece) => ({ text: piece.text, fee: piece.kind === "fee", inner: split(piece.text, inline) }));
}

function countKinds(segments: Segment[]) {
  const counts = new Map<MarkKind, number>();
  for (const s of segments) {
    if (s.fee) counts.set("fee", (counts.get("fee") ?? 0) + 1);
    for (const p of s.inner) if (p.kind) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1);
  }
  return counts;
}

function Highlighted({ segments, active }: { segments: Segment[]; active: Set<MarkKind> }) {
  return (
    <>
      {segments.map((segment, i) => {
        const inner = segment.inner.map((p, j) =>
          p.kind && active.has(p.kind) ? (
            <mark key={j} title={MARKS[p.kind].label} className={`${MARKS[p.kind].className} [box-decoration-break:clone]`}>{p.text}</mark>
          ) : (
            <Fragment key={j}>{p.text}</Fragment>
          ),
        );
        return segment.fee && active.has("fee") ? (
          <span key={i} title={MARKS.fee.label} className={`${MARKS.fee.className} [box-decoration-break:clone]`}>{inner}</span>
        ) : (
          <Fragment key={i}>{inner}</Fragment>
        );
      })}
    </>
  );
}

type LetterTextProps = {
  text: string;
  entities: Entities;
  fileName?: string;
  originalText?: string | null;
  originalLanguage?: string | null;
};

/** The letter as it was read, with the money, payment requests and contacts the scan found highlighted in place. */
export function LetterText({ text, entities, fileName, originalText, originalLanguage }: LetterTextProps) {
  const segments = useMemo(() => highlight(text, entities), [text, entities]);
  const counts = useMemo(() => countKinds(segments), [segments]);
  const present = (["fee", ...INLINE_KINDS] as MarkKind[]).filter((k) => counts.get(k));
  const [active, setActive] = useState<Set<MarkKind>>(() => new Set(present));
  const [showOriginal, setShowOriginal] = useState(false);
  const translated = Boolean(originalText && originalLanguage);
  const toggle = (kind: MarkKind) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  return (
    <section className="card flex flex-col overflow-hidden lg:sticky lg:top-[110px] lg:max-h-[calc(100vh-130px)]" aria-labelledby="letter-heading">
      <div className="border-b border-[var(--line)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id="letter-heading" className="text-base font-semibold">The letter we checked</h2>
            {fileName && <p className="muted mt-0.5 truncate text-xs" title={fileName}>{fileName}</p>}
          </div>
          {translated && (
            <div role="tablist" aria-label="Letter language" className="flex rounded-lg border border-[var(--line)] p-0.5 text-xs font-semibold">
              {[false, true].map((original) => (
                <button key={String(original)} type="button" role="tab" aria-selected={showOriginal === original} onClick={() => setShowOriginal(original)}
                  className={`rounded-md px-2.5 py-1 ${showOriginal === original ? "bg-blue-700 text-white" : "muted hover:text-[var(--ink)]"}`}>
                  {original ? originalLanguage : "English"}
                </button>
              ))}
            </div>
          )}
        </div>
        {present.length > 0 && !showOriginal && (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Highlight details">
            {present.map((kind) => (
              <button key={kind} type="button" aria-pressed={active.has(kind)} onClick={() => toggle(kind)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity ${active.has(kind) ? "border-[var(--line)]" : "border-dashed border-[var(--line)] opacity-50"}`}>
                <span aria-hidden className={`h-2 w-2 rounded-full ${MARKS[kind].dot}`} />
                {MARKS[kind].label} <span className="muted tabular-nums">{counts.get(kind)}</span>
              </button>
            ))}
          </div>
        )}
        {translated && (
          <p className="muted mt-3 text-xs">
            Translated from {originalLanguage} by AI before checking. Names, amounts and contacts were kept as written.
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[var(--surface-soft)] p-3 sm:p-5">
        <article
          dir={showOriginal ? "auto" : undefined}
          lang={showOriginal && originalLanguage === "Arabic" ? "ar" : undefined}
          className="mx-auto max-w-prose rounded-md border border-[var(--line)] bg-[var(--paper)] px-5 py-6 text-[15px] leading-7 whitespace-pre-wrap break-words shadow-sm sm:px-8 sm:py-8"
        >
          {showOriginal ? originalText : <Highlighted segments={segments} active={active} />}
        </article>
        {!showOriginal && text.length >= TEXT_LIMIT && (
          <p className="muted mx-auto mt-3 max-w-prose text-center text-xs">Showing the first 3,000 characters, which is the part that was checked.</p>
        )}
      </div>
    </section>
  );
}
