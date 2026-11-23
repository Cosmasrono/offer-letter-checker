import Link from "next/link";
import { Suspense } from "react";
import { RiskBadge } from "@/components/ReportView";
import { activeReports } from "@/lib/privacy-policy";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";
import { SCAM_STATUS_LABELS, reportStatus } from "@/lib/scam-status";
import { getCurrentUser } from "@/lib/session";
import type { RiskLevel } from "@/lib/types";

const PAGE_SIZE = 100;
const RISKS = ["ALL", "HIGH", "MEDIUM", "LOW"] as const;
const when = (value: Date) => value.toLocaleString("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

async function Reports({ searchParams }: { searchParams: PageProps<"/admin/reports">["searchParams"] }) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return <p>Administrator access required.</p>;
  if (!isDatabaseConfigured()) return <p>Storage is unavailable.</p>;
  const riskParam = (await searchParams).risk;
  const risk = typeof riskParam === "string" && (RISKS as readonly string[]).includes(riskParam) ? riskParam : "ALL";
  const where = { AND: [activeReports(), ...(risk === "ALL" ? [] : [{ riskLevel: risk }])] };
  const [reports, total] = await Promise.all([
    prisma.report.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE_SIZE,
      select: { id: true, fileName: true, companyName: true, kind: true, riskLevel: true, score: true, createdAt: true, scamStatus: true, userReportedAt: true,
        user: { select: { email: true } } } }),
    prisma.report.count({ where }),
  ]);

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="muted text-sm">{total} stored report{total === 1 ? "" : "s"}{total > reports.length ? ` · showing the latest ${reports.length}` : ""} · reports are deleted after 30 days</p>
        <nav className="flex flex-wrap gap-1 text-sm" aria-label="Filter by risk">
          {RISKS.map((key) => (
            <Link key={key} href={key === "ALL" ? "/admin/reports" : `/admin/reports?risk=${key}`} aria-current={risk === key ? "true" : undefined}
              className={`rounded-lg px-3 py-1.5 font-medium ${risk === key ? "bg-blue-700 text-white" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
              {key === "ALL" ? "All" : key.charAt(0) + key.slice(1).toLowerCase()}
            </Link>
          ))}
        </nav>
      </div>
      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <tr><th className="px-3 py-2">Checked</th><th className="px-3 py-2">Employer / file</th><th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Risk</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Uploaded by</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {reports.map((report) => (
              <tr key={report.id}>
                <td className="px-3 py-2.5 whitespace-nowrap">{when(report.createdAt)}</td>
                <td className="px-3 py-2.5">
                  <Link href={`/report/${report.id}`} className="block font-medium underline-offset-2 hover:underline">{report.companyName || "Unknown employer"}</Link>
                  <span className="muted block break-all">{report.fileName}</span>
                </td>
                <td className="px-3 py-2.5 capitalize">{report.kind ?? "letter"}</td>
                <td className="px-3 py-2.5 whitespace-nowrap"><RiskBadge level={report.riskLevel as RiskLevel} /> <span className="muted tabular-nums">{report.score}</span></td>
                <td className="px-3 py-2.5 whitespace-nowrap">{SCAM_STATUS_LABELS[reportStatus(report)]}</td>
                <td className="px-3 py-2.5 break-all">{report.user?.email ?? <span className="muted">Guest</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  return (
    <div className="space-y-6">
      <div><p className="eyebrow">Administration</p><h1 className="text-3xl font-semibold">All reports</h1></div>
      <Suspense fallback={<p className="muted">Loading reports…</p>}><Reports searchParams={searchParams} /></Suspense>
    </div>
  );
}
