import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReportView } from "@/components/ReportView";
import { OfferConfirmationForm } from "@/components/OfferConfirmationForm";
import { canDownload, paymentsReady, reportPriceKes } from "@/lib/payments";
import { ReportPayment } from "@/components/ReportPayment";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";
import { isObjectId, toAnalysisReport } from "@/lib/reports";
import { canViewReport, getCurrentUser } from "@/lib/session";
import { ReportPrivacy } from "@/components/ReportPrivacy";
import { RecentReports, RememberReportRisk } from "@/components/RecentReports";
import type { RiskLevel } from "@/lib/types";
import { canManageReport, claimGuestReports } from "@/lib/report-privacy";
import { Icon } from "@/components/Icon";
import { isReportExpired } from "@/lib/privacy-policy";

async function SavedReport({ params, searchParams }: PageProps<"/report/[id]">) {
  const { id } = await params;
  if (!isObjectId(id) || !isDatabaseConfigured()) notFound();
  const [found, user] = await Promise.all([prisma.report.findUnique({ where: { id } }), getCurrentUser()]);
  if (!found || isReportExpired(found)) notFound();
  const query = await searchParams;

  if (!user) {
    // Results need an account. The scan is kept; signing in on this browser moves it into the account.
    const back = `/report/${id}${typeof query.token === "string" ? `?token=${encodeURIComponent(query.token)}` : ""}`;
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <span className="feature-icon mx-auto mb-4"><Icon name="lock" /></span>
        <h1 className="text-xl font-bold">Your scan is ready</h1>
        <p className="muted mt-2 text-sm leading-relaxed">Sign in or create a free account to see the results. Your report is saved to your account so you can come back to it.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href={`/sign-in?next=${encodeURIComponent(back)}`} className="btn-primary">Sign in to see results</Link>
          <Link href={`/sign-up?next=${encodeURIComponent(back)}`} className="btn-secondary">Create an account</Link>
        </div>
      </div>
    );
  }

  // A scan this browser made before signing in becomes this user's now (the guest cookie proves it is theirs).
  const report = !found.userId && await claimGuestReports(user) ? await prisma.report.findUnique({ where: { id } }) : found;
  // Someone else's report: to this user it doesn't exist.
  if (!report || !canViewReport(report, user)) notFound();

  const token = typeof query.token === "string" ? query.token : "";
  const unlocked = await canDownload(id, token, user);
  const privacy = <ReportPrivacy id={id} expiresAt={report.expiresAt?.toISOString() ?? null} canDelete={await canManageReport(report, user)} />;
  if (!unlocked) return <><ReportPayment reportId={id} priceKes={reportPriceKes()} paymentsReady={paymentsReady()} attemptedToken={token} />{privacy}</>;
  return (
    <>
    <ReportView
      report={toAnalysisReport(report)}
      saved={{
        id,
        userReported: Boolean(report.userReportedAt),
        priceKes: reportPriceKes(),
        paymentsReady: paymentsReady(),
        unlocked,
        // A confirmed payment's token unlocks both the findings and PDF.
        token: /^[a-f0-9]{48}$/.test(token) ? token : undefined,
        checkedAt: report.createdAt.toLocaleString("en-GB", {
          timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
        }),
      }}
    />
    <RememberReportRisk id={id} risk={report.riskLevel as RiskLevel} />
    {user?.isAdmin && report.kind !== "visa" && <OfferConfirmationForm reportId={id} token={token} />}
    {privacy}
    </>
  );
}

export default function ReportPage({ params, searchParams }: PageProps<"/report/[id]">) {
  return (
    <div className="space-y-6">
      <a href="#check-another" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
        <span aria-hidden>↓</span> Check another letter or message
      </a>
      <Suspense fallback={<ReportSkeleton />}>
        <SavedReport params={params} searchParams={searchParams} />
      </Suspense>
      <Suspense>
        <CheckAnother params={params} />
      </Suspense>
    </div>
  );
}

// A short way to the checker instead of a full upload form under every report; earlier checks stay listed.
async function CheckAnother({ params }: { params: PageProps<"/report/[id]">["params"] }) {
  const { id } = await params;
  return (
    <section id="check-another" className="grid scroll-mt-6 gap-6 lg:grid-cols-2" aria-label="Check another letter or message">
      <div className="card flex flex-col items-start justify-center gap-3 p-6">
        <h2 className="text-base font-semibold">Check another letter or message</h2>
        <p className="muted text-sm">Upload another offer letter, or paste a job ad or WhatsApp message.</p>
        <Link href="/#check" className="btn-primary">Check another letter</Link>
      </div>
      <RecentReports currentId={id} />
    </section>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading report">
      <div className="card h-56 animate-pulse" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card h-80 animate-pulse lg:col-span-2" />
        <div className="card h-80 animate-pulse" />
      </div>
    </div>
  );
}
