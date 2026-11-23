import type { AnalysisReport, CheckedItem, Finding, RequiredField, SampleLetter, RiskLevel, Severity } from "@/lib/types";
import { DownloadReport } from "./DownloadReport";
import { ReportTabs } from "./ReportTabs";
import { ReportScamButton } from "./ReportScamButton";
import { SCAM_STATUS_LABELS } from "@/lib/scam-status";
import { verificationSummary } from "@/lib/verification";
import { VisaReport } from "./VisaReport";
import { LetterText } from "./LetterText";

// Never say "genuine": the best we can honestly report is that no major red flags were found.
type Verdict = { label: string; light: "red" | "amber" | "green" | "off"; accent: string; text: string; ring: string };
const VERDICTS: Record<RiskLevel, Verdict> = {
  HIGH: { label: "Fraud signals found", light: "red", accent: "bg-red-600", text: "text-red-700 dark:text-red-400", ring: "stroke-red-600" },
  MEDIUM: {
    label: "Unverified - check carefully before you act",
    light: "amber",
    accent: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    ring: "stroke-amber-500",
  },
  LOW: {
    label: "No major red flags found",
    light: "green",
    accent: "bg-emerald-600",
    text: "text-emerald-700 dark:text-emerald-400",
    ring: "stroke-emerald-600",
  },
};
const NOT_CHECKED: Verdict = {
  label: "Not checked - no text could be read",
  light: "off",
  accent: "bg-slate-400",
  text: "text-slate-600 dark:text-slate-400",
  ring: "stroke-slate-400",
};
const MAIN_REASONS = 5;

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  info: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  const style = SEVERITY_STYLES[level === "HIGH" ? "critical" : level === "MEDIUM" ? "medium" : "info"];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}>{level}</span>;
}

function TrafficLight({ active }: { active: Verdict["light"] }) {
  const lamp = (colour: "red" | "amber" | "green", on: string) => (
    <span
      className={`block h-5 w-5 rounded-full transition-colors ${active === colour ? on : "bg-slate-600/40 dark:bg-slate-700"}`}
    />
  );
  return (
    <div aria-hidden className="flex w-9 shrink-0 flex-col items-center gap-1.5 rounded-xl bg-slate-900 p-2 shadow-inner dark:bg-black">
      {lamp("red", "bg-red-500 shadow-[0_0_12px_2px_rgba(239,68,68,0.7)]")}
      {lamp("amber", "bg-amber-400 shadow-[0_0_12px_2px_rgba(251,191,36,0.7)]")}
      {lamp("green", "bg-emerald-500 shadow-[0_0_12px_2px_rgba(16,185,129,0.7)]")}
    </div>
  );
}

function ScoreRing({ score, verdict, reviewed = false }: { score: number; verdict: Verdict; reviewed?: boolean }) {
  const circumference = 2 * Math.PI * 42;
  return (
    <div className="relative h-20 w-20 shrink-0 sm:h-28 sm:w-28">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r="42" className="fill-none stroke-slate-200 dark:stroke-slate-800" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r="42"
          className={`fill-none ${verdict.ring}`}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold tabular-nums sm:text-3xl ${verdict.text}`}>{score}</span>
        <span className="text-[9px] font-medium text-slate-500 uppercase sm:text-[10px]">{reviewed ? "scan risk / 100" : "risk / 100"}</span>
      </div>
    </div>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const good = finding.points < 0;
  return (
    <li className="flex gap-3 py-3.5">
      <span className={`mt-0.5 h-fit w-[4.5rem] shrink-0 rounded-md px-2 py-0.5 text-center text-[11px] font-semibold uppercase ${SEVERITY_STYLES[good ? "info" : finding.severity]}`}>
        {good ? "good" : finding.severity}
      </span>
      <div className="min-w-0">
        <p className="font-medium text-slate-900 dark:text-slate-100">{finding.title}</p>
        <p className="muted mt-0.5 text-sm leading-relaxed">{finding.detail}</p>
      </div>
    </li>
  );
}

function DetailList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs break-all text-slate-800 dark:bg-slate-800 dark:text-slate-200">
            {item}
          </span>
        ))}
      </dd>
    </div>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-6 ${className}`}>
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const isWebAddress = (value: string) => /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(value.trim());

/** "17 Nov 2026, 17:07" in Nairobi time, instead of a raw ISO timestamp. */
function readableTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-GB", {
    timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const CHECK_MARKS: Record<CheckedItem["status"], { icon: string; label: string; className: string }> = {
  PASS: { icon: "✓", label: "Passed", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
  WARN: { icon: "!", label: "Needs checking", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  FAIL: { icon: "✗", label: "Failed", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  NOT_CHECKED: { icon: "N/A", label: "Not available", className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
};

/** Every value the scan validated, the standard it was tested against and the outcome, including passes. */
function WhatWeChecked({ items }: { items: CheckedItem[] }) {
  const counts = (["PASS", "FAIL", "WARN", "NOT_CHECKED"] as const).map((s) => [s, items.filter((i) => i.status === s).length] as const);
  return (
    <Panel title="What we checked">
      <p className="mt-2 flex flex-wrap gap-2 text-xs">
        {counts.filter(([, n]) => n > 0).map(([s, n]) => (
          <span key={s} className={`rounded-full px-2.5 py-1 font-semibold ${CHECK_MARKS[s].className}`}>
            {CHECK_MARKS[s].icon} {n} {CHECK_MARKS[s].label.toLowerCase()}
          </span>
        ))}
      </p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th scope="col" className="w-16 px-3 py-2 text-center">Result</th>
              <th scope="col" className="px-3 py-2">Check</th>
              <th scope="col" className="px-3 py-2">Tested against</th>
              <th scope="col" className="px-3 py-2">Found in this letter</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {items.map((item, i) => {
              const mark = CHECK_MARKS[item.status];
              // Only real addresses become links: a company name in a website row ("Website content") is not a URL.
              const urls = item.group.startsWith("Website") ? item.subject.split(", ").filter(isWebAddress) : [];
              const link = urls.length ? urls : null;
              return (
                <tr key={`${item.group}-${item.subject}-${i}`} className="align-top">
                  <td className="px-3 py-2.5 text-center">
                    <span title={mark.label} className={`inline-flex min-w-7 justify-center rounded-md px-1.5 py-0.5 text-xs font-bold ${mark.className}`}>
                      {mark.icon}
                    </span>
                    <span className="sr-only">{mark.label}</span>
                  </td>
                  <td className="px-3 py-2.5 font-medium">{item.group}</td>
                  <td className="muted px-3 py-2.5">{item.against}</td>
                  <td className="px-3 py-2.5">
                    <span className="block break-all font-medium">
                      {link ? link.map((url) => (
                        <a key={url} href={/^https?:\/\//.test(url) ? url : `https://${url}`} target="_blank" rel="noopener noreferrer nofollow"
                          className="mr-2 text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">{url} ↗</a>
                      )) : item.subject}
                    </span>
                    <span className="muted block">{item.result}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted mt-2 text-xs">Website links come from the letter or a search. Check they really belong to the employer before trusting them.</p>
    </Panel>
  );
}

const BREAKDOWN_ITEMS = 4;

/** Briefly shows which findings added or removed points, mirroring the backend's scoring in analyzer.py. */
function ScoreBreakdown({ score, findings }: { score: number; findings: Finding[] }) {
  const scored = findings.filter((f) => f.points !== 0).sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  const total = Math.max(0, Math.min(100, scored.reduce((sum, f) => sum + f.points, 0)));
  const shown = scored.slice(0, BREAKDOWN_ITEMS);
  return (
    <div className="mt-4 max-w-2xl rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/60">
      <p className="font-semibold">Why {score}/100?</p>
      {shown.length === 0 ? (
        <p className="muted mt-1">No check added or removed points.</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {shown.map((f) => (
            <li key={f.id} className="flex gap-2">
              <span className={`w-9 shrink-0 text-right font-semibold tabular-nums ${f.points > 0 ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                {f.points > 0 ? `+${f.points}` : `−${-f.points}`}
              </span>
              <span>{f.title}</span>
            </li>
          ))}
          {scored.length > shown.length && <li className="muted pl-11">and {scored.length - shown.length} smaller item(s) listed below</li>}
        </ul>
      )}
      {score > total && <p className="mt-1">Raised to {score} because a serious warning sets a minimum score.</p>}
      <p className="muted mt-1 text-xs">0–29 low risk · 30–59 medium · 60+ high</p>
    </div>
  );
}

// What a missing item means in each section. "scored" only marks gaps red; the rules check never changes the risk score.
const CHECKLIST_SECTIONS: { name: string; note: string; scored: boolean }[] = [
  { name: "Offer terms", note: "Core terms every genuine offer states.", scored: true },
  { name: "Letter details", note: "What a formal letter from a real employer carries.", scored: true },
  { name: "Full contract", note: "Often given in the full contract instead. Ask for them.", scored: false },
  { name: "Employer & safety", note: "Good to see. Missing ones are not suspicious on their own.", scored: false },
];

/** Three concrete actions for this letter, and where to verify, instead of generic advice. */
function NextSteps({ report }: { report: AnalysisReport }) {
  const ids = new Set(report.findings.map((f) => f.id.split(":")[0]));
  const company = report.company_name ?? "the employer";
  const register = report.checked_items?.find((i) => i.group === "Company register" && i.result.startsWith("Not looked up automatically."));
  const brand = report.findings.find((f) => f.id === "brand_impersonation");
  const steps: string[] = [];
  if (ids.has("fee_request") || ids.has("payment_channel")) steps.push("Do not pay anything. Genuine employers pay visa, medical, ticket and recruitment costs themselves.");
  if (ids.has("exit_penalty")) steps.push("Do not sign the clause that makes you pay visa costs if you leave early. Ask for it to be removed.");
  if (brand) steps.push(`Check the job on ${company}'s official careers website and contact it through the official contacts below, not the letter's.`);
  steps.push(register ? register.result.replace("Not looked up automatically. Search", "Verify the company: search") + "."
    : `Verify ${company} yourself: find its official website or registration and confirm this offer with its HR.`);
  if (report.risk_level !== "LOW") steps.push("Do not send your passport, ID or bank details until the employer is confirmed.");
  else steps.push("Even with a low score, confirm the offer with the employer before sending documents.");
  return (
    <Panel title="What to do now">
      <ol className="mt-3 space-y-2.5 text-sm">
        {steps.slice(0, 3).map((step, i) => (
          <li key={step} className="flex gap-3">
            <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">{i + 1}</span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      {report.verify_links.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          <span className="muted w-full text-xs font-semibold uppercase tracking-wide">Verify officially</span>
          {report.verify_links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm">{l.label} ↗</a>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** Second, optional step: the offer letter checked against the expected terms. It never changes the risk score. */
function RulesCheck({ fields, sample }: { fields: RequiredField[]; sample: SampleLetter | null }) {
  const main = fields.filter((f) => (f.section ?? (f.essential ? "Offer terms" : "Full contract")) === "Offer terms");
  const found = main.filter((f) => f.found).length;
  return (
    <details className="group space-y-6">
      <summary className="card flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-6 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-base font-semibold">Step 2: Check against the rules (optional)</span>
          <span className="muted block text-sm">
            See whether this letter contains what a genuine offer for this country should state ({found} of {main.length} main terms found). This does not change the risk score above.
          </span>
        </span>
        <span className="btn-secondary shrink-0 group-open:hidden">Check against the rules</span>
        <span className="btn-secondary hidden shrink-0 group-open:inline-flex">Hide rules check</span>
      </summary>
      <ContractChecklist fields={fields} />
      {sample && <SampleLetterPreview sample={sample} />}
    </details>
  );
}

/** The letter's contacts next to the ones the employer publishes or is known by, so the reader can compare. */
function CompareContacts({ report }: { report: AnalysisReport }) {
  const known = report.company_contacts ?? [];
  const letter = [...report.entities.emails.map((v) => ({ kind: "Email", value: v })), ...report.entities.phones.map((v) => ({ kind: "Phone", value: v }))];
  if (known.length === 0 && letter.length === 0) return null;
  const employer = report.company_name ?? "the employer";
  return (
    <Panel title="Compare contacts">
      <p className="muted mt-1 text-sm">
        Some employers use personal emails, so an unlisted email is not proof of a scam. Compare the letter&apos;s contacts with the ones {employer} publishes, and contact the employer through an official one before you send documents or money.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">In this letter</h3>
          {letter.length ? (
            <ul className="mt-2 space-y-1.5 text-sm">
              {letter.map((c) => <li key={c.kind + c.value} className="break-all"><span className="muted">{c.kind}:</span> {c.value}</li>)}
            </ul>
          ) : <p className="muted mt-2 text-sm">No email or phone number in the letter.</p>}
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{employer}&apos;s known contacts</h3>
          {known.length ? (
            <ul className="mt-2 space-y-1.5 text-sm">
              {known.map((c) => (
                <li key={c.kind + c.value} className="flex flex-wrap items-baseline gap-x-2">
                  {c.in_letter && <span className="rounded-md bg-green-100 px-1.5 text-xs font-bold text-green-800 dark:bg-green-950 dark:text-green-300">✓ matches letter</span>}
                  <span className="muted">{c.kind === "email domain" ? "Email ending" : c.kind[0].toUpperCase() + c.kind.slice(1)}:</span>
                  {c.kind === "website"
                    ? <a href={c.source_url || c.value} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">{c.value} ↗</a>
                    : <span className="break-all font-medium">{c.value}</span>}
                  <span className="muted w-full text-xs">{c.source}</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted mt-2 text-sm">No published contacts were found automatically. Find the employer&apos;s official website yourself and compare.</p>}
        </div>
      </div>
    </Panel>
  );
}

/** Preview of a letter with the expected terms. Shown here only: no download or print, and not in the PDF. */
function SampleLetterPreview({ sample }: { sample: SampleLetter }) {
  return (
    <Panel title="Sample offer letter (preview only)">
      <p className="muted mt-1 text-sm">
        Your letter is missing some expected details. This sample shows what a complete offer would contain, so you can see what to ask the employer for.
        Items in [brackets] are missing from your letter. It is not a real offer and cannot be downloaded.
      </p>
      <div className="relative mt-4 select-none overflow-hidden rounded-lg border border-dashed border-slate-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-950" aria-label="Sample letter preview, not a real offer">
        <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center text-4xl font-black tracking-widest text-slate-200/70 [transform:rotate(-20deg)] dark:text-slate-800/70">SAMPLE — NOT A REAL OFFER</span>
        <p className="relative mb-3 text-sm font-semibold">{sample.title}</p>
        <div className="relative space-y-0.5 text-sm leading-relaxed">
          {sample.lines.map((line, i) => line.trim() === "" ? <div key={i} className="h-3" /> : (
            <p key={i} className={line.startsWith("  ") ? "pl-4" : ""}>
              {line.split(/(\[[^\]]+\])/).map((part, j) => part.startsWith("[")
                ? <mark key={j} className="rounded bg-amber-100 px-1 text-amber-900 dark:bg-amber-950 dark:text-amber-200">{part}</mark>
                : <span key={j}>{part}</span>)}
            </p>
          ))}
        </div>
      </div>
      {sample.placeholders.length > 0 && (
        <p className="mt-3 text-sm"><strong>Ask the employer for:</strong> {sample.placeholders.join(", ").toLowerCase()}.</p>
      )}
    </Panel>
  );
}

/** The full list of what an offer letter is tested against, grouped by section, with the wording found. */
function ContractChecklist({ fields }: { fields: RequiredField[] }) {
  // Reports saved before sections existed only knew core terms and full-contract items.
  const sectionOf = (f: RequiredField) => f.section ?? (f.essential ? "Offer terms" : "Full contract");
  const found = fields.filter((f) => f.found).length;
  return (
    <Panel title={`Offer letter checklist (${found} of ${fields.length} found)`}>
      <p className="muted mt-1 text-sm">Compared with: {fields[0].source}. Stated terms are not proof the offer is genuine.</p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th scope="col" className="w-16 px-3 py-2 text-center">Result</th>
              <th scope="col" className="px-3 py-2">Item</th>
              <th scope="col" className="px-3 py-2">What we look for</th>
              <th scope="col" className="px-3 py-2">Found in this letter</th>
            </tr>
          </thead>
          {CHECKLIST_SECTIONS.map((section) => {
            const rows = fields.filter((f) => sectionOf(f) === section.name);
            if (rows.length === 0) return null;
            const ok = rows.filter((f) => f.found).length;
            return (
              <tbody key={section.name} className="divide-y divide-slate-200 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                <tr className="bg-slate-50/60 dark:bg-slate-900/40">
                  <th scope="rowgroup" colSpan={4} className="px-3 py-2 text-left">
                    <span className="font-semibold">{section.name}</span>
                    <span className="muted ml-2 font-normal">{ok} of {rows.length} found · {section.note}</span>
                  </th>
                </tr>
                {rows.map((f) => {
                  const mark = f.found ? CHECK_MARKS.PASS : section.scored ? CHECK_MARKS.FAIL : CHECK_MARKS.NOT_CHECKED;
                  return (
                    <tr key={f.id} className="align-top">
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex min-w-7 justify-center rounded-md px-1.5 py-0.5 text-xs font-bold ${mark.className}`}>
                          {f.found ? "✓" : section.scored ? "✗" : "–"}
                        </span>
                        <span className="sr-only">{f.found ? "Found" : "Missing"}</span>
                      </td>
                      <td className="px-3 py-2 font-medium">{f.label}</td>
                      <td className="muted px-3 py-2">{f.looks_for || "—"}</td>
                      <td className="px-3 py-2">{f.evidence ? <q className="break-words">{f.evidence}</q> : <span className="muted">Not found</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>
    </Panel>
  );
}

type ReportViewProps = {
  report: AnalysisReport;
  // Saved reports can be reported as scams and downloaded as a PDF.
  saved?: {
    id: string;
    userReported: boolean;
    priceKes: number;
    paymentsReady: boolean;
    unlocked: boolean; // the signed-in user already paid, or is an admin
    token?: string; // unlock token from a paid check, for the PDF download
    checkedAt: string;
  };
};

export function ReportView({ report, saved }: ReportViewProps) {
  const verification = verificationSummary(report);
  const confirmation = report.offer_confirmation;
  const notChecked = !report.text_excerpt.trim();
  const expiredSponsorship = report.findings.some(finding => finding.id === "cos_expired");
  const reviewed = report.scam_status === "CONFIRMED_SCAM" || report.scam_status === "CLEARED";
  const verdict = notChecked ? NOT_CHECKED : report.scam_status === "CONFIRMED_SCAM" ? { ...VERDICTS.HIGH, label: "Confirmed scam — reviewed" }
    : report.scam_status === "CLEARED" ? { ...NOT_CHECKED, label: "Scam report dismissed — reviewed" }
    : report.kind === "visa" && report.risk_level === "HIGH" ? { ...VERDICTS.HIGH, label: "High risk — visa validity or document differences" }
    : report.risk_level === "HIGH" && expiredSponsorship ? { ...VERDICTS.HIGH, label: "High risk — expired sponsorship" } : VERDICTS[report.risk_level];
  // Findings arrive sorted by severity, so the first few are the main reasons.
  // A 0-point caution (e.g. "employer could not be confirmed") is a warning, not a good sign.
  const isCaution = (f: Finding) => f.points > 0 || (f.points === 0 && f.severity !== "info" && report.kind !== "visa");
  const redFlags = report.findings.filter(isCaution);
  const mainReasons = redFlags.slice(0, MAIN_REASONS);
  const otherFlags = redFlags.slice(MAIN_REASONS);
  const goodSigns = report.findings.filter((f) => !isCaution(f));
  const e = report.entities;
  const checkedTab = Boolean(report.checked_items?.length || report.required_fields?.length || report.kind === "letter");
  const subtitle = [report.job_title, report.country_name, saved && `checked ${saved.checkedAt}`].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden">
        <div className={`absolute inset-x-0 top-0 h-1.5 ${verdict.accent}`} />
        <div className="flex gap-5 p-5 sm:p-8">
          {/* The coloured label and score already show the risk; on a phone the light only narrows the text. */}
          <div className="hidden sm:block"><TrafficLight active={verdict.light} /></div>
          <div className="min-w-0 flex-1">
            {/* Score sits beside the name on every screen, so a phone sees the verdict without scrolling. */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className={`text-sm font-bold tracking-wide uppercase ${verdict.text}`}>{verdict.label}</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight break-words sm:text-3xl">
                  {report.company_name ?? (report.kind === "visa" ? "Visa / permit check" : report.kind === "message" ? "Job ad or message" : "Unknown employer")}
                </h1>
                {subtitle && <p className="muted mt-1 text-sm">{subtitle}</p>}
              </div>
              {!notChecked && <ScoreRing score={report.score} verdict={verdict} reviewed={reviewed} />}
            </div>
            <p className="mt-4 max-w-3xl leading-relaxed text-slate-800 dark:text-slate-200">{reviewed && <strong>Original scan assessment: </strong>}{report.summary}</p>
            {!notChecked && report.kind !== "visa" && <ScoreBreakdown score={report.score} findings={report.findings} />}
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 dark:border-slate-800 dark:bg-slate-900/60">
          <p className="text-xs text-slate-500 sm:max-w-[16rem]">
            {report.ai_used ? "Automated checks with an AI assessment" : "Automated document and content checks"} · Review the findings before your next step.
          </p>
          {saved && !notChecked && (
            <div className="flex flex-wrap items-center gap-3 sm:justify-end">
              <DownloadReport compact reportId={saved.id} priceKes={saved.priceKes} paymentsReady={saved.paymentsReady} unlocked={saved.unlocked} token={saved.token} />
              <ReportScamButton reportId={saved.id} alreadyReported={saved.userReported} scamStatus={report.scam_status} />
            </div>
          )}
        </div>
      </section>

      {expiredSponsorship && <section role="alert" className="rounded-xl border border-red-300 bg-red-50 p-6 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
        <h2 className="font-semibold">Do not use this CoS for a new visa application</h2>
        <p className="mt-2 text-sm">The stated use-by date has passed. Do not pay on the strength of this document as current sponsorship. Request a current record and confirm the sponsor independently.</p>
        <p className="mt-2 text-sm">This validity warning does not prove that the original historical document was forged or that an earlier visa application was invalid.</p>
      </section>}
      {report.visa && <VisaReport visa={report.visa} />}
      {!notChecked && report.kind !== "visa" && <NextSteps report={report} />}
      <ReportTabs tabs={[
        { id: "flags", label: report.kind === "visa" ? "Findings" : "Red flags", count: redFlags.length, content: <>
      <Panel title="Main reasons">
          {mainReasons.length === 0 ? (
            <p className="muted mt-2 text-sm">
              {notChecked ? "Nothing could be checked." : "No red flags were found in the checks we could run."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {mainReasons.map((f) => (
                <FindingRow key={f.id} finding={f} />
              ))}
            </ul>
          )}
          {otherFlags.length > 0 && (
            <details className="group mt-1">
              <summary className="cursor-pointer text-sm font-semibold text-blue-700 dark:text-blue-400">
                Show {otherFlags.length} more red flag{otherFlags.length === 1 ? "" : "s"}
              </summary>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {otherFlags.map((f) => (
                  <FindingRow key={f.id} finding={f} />
                ))}
              </ul>
            </details>
          )}
          {goodSigns.length > 0 && (
            <>
              <h3 className="mt-6 text-sm font-semibold text-slate-500 uppercase">{report.kind === "visa" ? "Document observations" : "Good signs"}</h3>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {goodSigns.map((f) => (
                  <FindingRow key={f.id} finding={f} />
                ))}
              </ul>
            </>
          )}
      </Panel>
        </> },
        ...(checkedTab ? [{ id: "checked", label: "What we checked", content: <>
      {(report.checked_items?.length ?? 0) > 0 && <WhatWeChecked items={report.checked_items!} />}
      {report.kind === "letter" && <CompareContacts report={report} />}
      {(report.required_fields?.length ?? 0) > 0 && <RulesCheck fields={report.required_fields!} sample={report.sample_letter ?? null} />}
        </> }] : []),
        ...(!notChecked ? [{ id: "letter", label: report.kind === "message" ? "The message" : "The letter", content: <>
      <LetterText text={report.text_excerpt} entities={report.entities} fileName={report.file_name}
          originalText={report.original_text} originalLanguage={report.original_language} />
      
        </> }] : []),
        { id: "evidence", label: "Evidence", content: (
        <>
          {report.warnings.length > 0 && (
            <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              {report.warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          )}
          {Boolean(report.memory_matches?.length) && <Panel title="Matches to earlier scam cases">
            <p className="muted mt-2 text-sm">These matches help the checker recognise reused wording and contact or payment details. Previous letters’ private contents are not shown.</p>
            <ul className="mt-4 space-y-4">{report.memory_matches?.map(match => <li key={match.status}>
              <strong className="text-sm">{SCAM_STATUS_LABELS[match.status]}</strong>
              <p className="muted mt-1 text-sm">{match.case_count} distinct pattern(s){match.template_similarity !== null && ` · ${Math.round(match.template_similarity * 100)}% wording similarity`}</p>
              {match.matching_details.length > 0 && <p className="mt-1 text-sm break-all">Matching details: {match.matching_details.map(detail => detail.replace(/^[A-Z]+:/, "")).join(", ")}</p>}
            </li>)}</ul>
          </Panel>}
          {report.scam_status && (reviewed || report.scam_status === "REPORTED_SCAM") && <Panel title="Tracked report status">
            <p className="mt-2 font-semibold">{SCAM_STATUS_LABELS[report.scam_status]}</p>
            {report.review_note && <p className="mt-2 text-sm">Reviewer’s reason: {report.review_note}</p>}
            {report.reviewed_at && <p className="muted mt-2 text-xs">Reviewed {report.reviewed_at}</p>}
            <p className="muted mt-2 text-sm">{reviewed ? "The review outcome is tracked separately from the original scan score. Dismissing a scam report does not authenticate the job offer." : "Automated warnings and user reports remain unconfirmed until an administrator reviews the evidence."}</p>
          </Panel>}
          {report.kind !== "visa" && confirmation && <Panel title="Employer confirmation">
            <p className="mt-2 font-semibold">{confirmation?.status === "CONFIRMED" && report.scam_status !== "CONFIRMED_SCAM" ? "Employer-confirmed offer — recorded by reviewer" : confirmation?.status === "DENIED" ? "Employer denied this offer — recorded by reviewer" : "Offer not confirmed by the employer"}</p>
            {confirmation && <div className="mt-3 space-y-2 text-sm"><p>{confirmation.note}</p>
              {confirmation.status !== "REVOKED" && <><p>Offer reference: {confirmation.offer_reference} · Role: {confirmation.job_title}</p><p>Employer contact used: {confirmation.employer_contact}</p>
                <p>Employer response: {confirmation.confirmed_at} · Recorded: {confirmation.recorded_at}</p>
                {confirmation.source_url.startsWith("https://") && <a href={confirmation.source_url} target="_blank" rel="noopener noreferrer" className="inline-block underline">Independent contact source ↗</a>}</>}
            </div>}
            <p className="muted mt-2 text-sm">An automated score or matching company record cannot confirm a private offer. A reviewer must record direct employer confirmation of the offer, recruiter and terms. The original scan risk remains visible.</p>
          </Panel>}
          {Boolean(report.source_checks?.length) && (
            <Panel title="Company, website and agency evidence">
              <p className="muted mt-2 text-sm">Compare the letter with the sources below. A matching website or business record does not confirm who sent the letter or whether the job exists.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {report.source_checks?.map((check, index) => (
                  <div key={`${check.check}:${index}`} className="min-w-0 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">{{ employer: "Employer registration", agency: "Recruitment agency", website: "Website comparison", discovery: "Independent website search", email: "Original recruiter email", sponsorship: "UK sponsorship document", sponsor_registry: "Current Home Office sponsor register", care_provider: "England care-provider registration" }[check.check]}</h3>
                      <span className="text-xs font-semibold">{{ MATCHED: "Details matched", MISMATCH: "Details differ", NOT_FOUND: "Not found in source", UNAVAILABLE: "Check unavailable", UNVERIFIED: "Unverified", NOT_APPLICABLE: "Not applicable" }[check.status]}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium">{check.subject}</p>
                    <p className="muted mt-2 text-sm leading-relaxed">{check.detail}</p>
                    {check.record_name && <p className="mt-2 text-xs">Record: {[check.record_name, check.record_id, check.record_status].filter(Boolean).join(" · ")}</p>}
                    {Boolean(check.comparisons?.length) && <div className="mt-4 space-y-4">{check.comparisons?.map((comparison) => <div key={comparison.field} className="border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
                      <p className="flex flex-wrap justify-between gap-2 font-semibold"><span>{comparison.field}</span><span className={comparison.status === "MISMATCH" ? "text-amber-700 dark:text-amber-400" : ""}>{{ MATCHED: "Matched", MISMATCH: "Different", UNVERIFIED: "Unverified" }[comparison.status]}</span></p>
                      <p className="mt-2 break-words"><strong>Letter:</strong> {comparison.letter_value}</p>
                      <p className="mt-1 break-words"><strong>Source:</strong> {comparison.source_value}</p>
                      <p className="muted mt-1 leading-relaxed">{comparison.detail}</p>
                    </div>)}</div>}
                    {Boolean(check.checked_pages?.length) && <details className="mt-3 text-xs"><summary className="cursor-pointer font-medium">Pages checked</summary><ul className="mt-2 space-y-1">{check.checked_pages?.filter(url => url.startsWith("https://")).map(url => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer" className="break-all underline">{url}</a></li>)}</ul></details>}
                    {check.source_url.startsWith("https://") && <a href={check.source_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-medium text-blue-700 underline dark:text-blue-400">{check.source_name} ↗</a>}
                    <p className="muted mt-2 text-xs">Checked: {readableTime(check.checked_at)}{check.source_updated_at && <> · Data from: {readableTime(check.source_updated_at)}</>}</p>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          <Panel title="Verification completeness">
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><strong>{{ LIMITED: "Limited evidence", PARTIAL: "Partial evidence", COMPLETE: "All listed checks supported" }[verification.level]}</strong>
              <span className="text-sm">{verification.resolved} of {verification.required} checks have conclusive comparisons</span></div>
            <p className="muted mt-2 text-sm">This measures the supporting evidence available. It is separate from scam risk and is not a probability that the offer is genuine. Conflicts still need resolving.</p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">{verification.items.map(item => <div key={item.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <dt className="flex flex-wrap justify-between gap-2 text-sm font-semibold"><span>{item.label}</span><span>{{ SUPPORTED: "Supported", CONFLICT: "Conflict", UNVERIFIED: "Unverified", NOT_APPLICABLE: "Not applicable" }[item.status]}</span></dt>
              <dd className="muted mt-2 text-xs leading-relaxed">{item.detail}</dd>
            </div>)}</dl>
          </Panel>
    {report.checks_not_run.length > 0 && (
                <Panel title="What we could not check automatically">
                  <ul className="muted mt-3 list-disc space-y-2 pl-5 text-sm">
                    {report.checks_not_run.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </Panel>
    )}
          <Panel title="Details found">
            <dl className="mt-4 grid gap-5 sm:grid-cols-2">
              <DetailList label="Emails" items={e.emails} />
              <DetailList label="Phone numbers" items={e.phones} />
              <DetailList label="Websites / domains" items={e.domains} />
              <DetailList label="Amounts of money" items={e.money} />
              <DetailList label="Payment details (M-Pesa, bank, crypto)" items={e.payment_accounts ?? []} />
              <DetailList
                label="Recruitment agency"
                items={[e.agency_name, e.agency_licence && `Licence ${e.agency_licence}`].filter((v): v is string => Boolean(v))}
              />
            </dl>
          </Panel>
        </>
        ) },
      ]} />

      <p className="text-center text-xs text-slate-500">
        This is an automated risk assessment, not a legal verdict. A low score does not guarantee an offer is real - always
        confirm directly with the employer through contact details you find yourself.
      </p>
    </div>
  );
}
