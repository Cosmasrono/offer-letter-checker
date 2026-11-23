import Link from "next/link";
import { Suspense } from "react";
import { adminStats, CHART_DAYS } from "@/lib/admin-stats";
import { isDatabaseConfigured } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const number = new Intl.NumberFormat("en-KE");
const date = (value: Date) => value.toLocaleDateString("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" });

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card p-5">
      <p className="muted text-sm font-medium">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      {note && <p className="muted mt-1 text-sm">{note}</p>}
    </div>
  );
}

/** Uploads per day: one series, so one brand hue and no legend; each bar names its day and count on hover/focus. */
function UploadsChart({ data }: { data: { day: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const label = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Uploads per day</h2>
        <p className="muted text-sm">Last {CHART_DAYS} days · Nairobi time</p>
      </div>
      <div className="admin-chart mt-5" role="img" aria-label={`Uploads per day: ${data.map((d) => `${label(d.day)} ${d.count}`).join(", ")}`}>
        {data.map((d) => (
          <div key={d.day} className="admin-bar-slot" tabIndex={0} aria-label={`${label(d.day)}: ${d.count} uploads`}>
            <span className="admin-bar-tip">{label(d.day)} · {d.count}</span>
            <span className="admin-bar" style={{ height: `${(d.count / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="admin-chart-axis muted mt-2 flex justify-between text-xs">
        <span>{label(data[0].day)}</span><span>{label(data[data.length - 1].day)}</span>
      </div>
      <details className="mt-3 text-sm">
        <summary className="muted cursor-pointer">Show as a table</summary>
        <table className="mt-2 w-full text-left"><tbody>
          {data.map((d) => <tr key={d.day} className="border-t border-slate-200 dark:border-slate-800"><td className="py-1">{label(d.day)}</td><td className="py-1 text-right tabular-nums">{d.count}</td></tr>)}
        </tbody></table>
      </details>
    </div>
  );
}

async function Dashboard() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return <div className="card p-6"><h2 className="font-semibold">Administrator access required</h2><Link href="/sign-in?next=/admin" className="btn-primary mt-4">Sign in</Link></div>;
  }
  if (!isDatabaseConfigured()) return <p>Storage is unavailable.</p>;
  const stats = await adminStats();
  const active = [...stats.rows].filter((row) => row.uploads > 0).sort((a, b) => b.uploads - a.uploads).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Registered users" value={number.format(stats.users)} note={`+${number.format(stats.newUsers)} in the last 7 days`} />
        <Stat label="Total uploads" value={number.format(stats.totalUploads)} note={`+${number.format(stats.uploadsWeek)} in the last 7 days`} />
        <Stat label="Uploads by members / guests" value={`${number.format(stats.memberUploads)} / ${number.format(stats.guestUploads)}`} note={`${number.format(stats.activeUsers)} users have uploaded`} />
        <Stat label="Paid checks" value={number.format(stats.payments)} note={`KES ${number.format(stats.revenueKes)} received`} />
      </div>
      <p className="muted text-sm">
        High-risk results: <strong className="text-slate-800 dark:text-slate-200">{number.format(stats.highRisk)}</strong> of {number.format(stats.totalUploads)} uploads.
        {" "}Upload counts start {date(stats.countedFrom)}: reports are deleted after 30 days for privacy, so earlier uploads can&apos;t be counted
        {stats.trackingSince ? <>; every upload since {date(stats.trackingSince)} is counted permanently.</> : "; every new upload is now counted permanently."}
      </p>

      <UploadsChart data={stats.perDay} />

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Most active users</h2>
          <Link href="/admin/users" className="text-sm font-medium underline">All {number.format(stats.users)} users →</Link>
        </div>
        {active.length === 0 ? <p className="muted mt-3 text-sm">No signed-in uploads yet.</p> : (
          <ul className="mt-3 divide-y divide-slate-200 text-sm dark:divide-slate-800">
            {active.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-4 py-2.5">
                <span className="min-w-0"><span className="block truncate font-medium">{row.name || row.email}</span>{row.name && <span className="muted block truncate">{row.email}</span>}</span>
                <span className="shrink-0 text-right"><span className="block font-semibold tabular-nums">{number.format(row.uploads)} uploads</span>
                  <span className="muted block">{row.lastUploadAt ? `last ${date(row.lastUploadAt)}` : "never"}</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div><p className="eyebrow">Administration</p><h1 className="text-3xl font-semibold">Dashboard</h1></div>
      <Suspense fallback={<p className="muted">Loading dashboard…</p>}><Dashboard /></Suspense>
    </div>
  );
}
