import Link from "next/link";
import { Suspense } from "react";
import { adminStats, type AdminUserRow } from "@/lib/admin-stats";
import { isDatabaseConfigured } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const number = new Intl.NumberFormat("en-KE");
const date = (value: Date) => value.toLocaleDateString("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" });
const SORTS: Record<string, { label: string; compare: (a: AdminUserRow, b: AdminUserRow) => number }> = {
  joined: { label: "Newest", compare: (a, b) => b.joinedAt.getTime() - a.joinedAt.getTime() },
  uploads: { label: "Most uploads", compare: (a, b) => b.uploads - a.uploads || b.joinedAt.getTime() - a.joinedAt.getTime() },
  active: { label: "Recently active", compare: (a, b) => (b.lastUploadAt?.getTime() ?? 0) - (a.lastUploadAt?.getTime() ?? 0) },
  paid: { label: "Paid", compare: (a, b) => b.paidKes - a.paidKes || b.uploads - a.uploads },
};

async function Users({ searchParams }: { searchParams: PageProps<"/admin/users">["searchParams"] }) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return <p>Administrator access required.</p>;
  if (!isDatabaseConfigured()) return <p>Storage is unavailable.</p>;
  const stats = await adminStats();
  const sortKey = (await searchParams).sort;
  const sort = typeof sortKey === "string" && sortKey in SORTS ? sortKey : "joined";
  const rows = [...stats.rows].sort(SORTS[sort].compare);

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="muted text-sm">{number.format(stats.users)} registered · {number.format(stats.newUsers)} joined in the last 7 days · {number.format(stats.activeUsers)} have uploaded</p>
        <nav className="flex flex-wrap gap-1 text-sm" aria-label="Sort users">
          {Object.entries(SORTS).map(([key, { label }]) => (
            <Link key={key} href={`/admin/users?sort=${key}`} aria-current={sort === key ? "true" : undefined}
              className={`rounded-lg px-3 py-1.5 font-medium ${sort === key ? "bg-blue-700 text-white" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}>{label}</Link>
          ))}
        </nav>
      </div>
      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <tr><th className="px-3 py-2">User</th><th className="px-3 py-2">Joined</th><th className="px-3 py-2 text-right">Uploads</th>
              <th className="px-3 py-2">Last upload</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2">Role</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2.5"><span className="block font-medium">{row.name || "—"}</span><span className="muted block break-all">{row.email}</span></td>
                <td className="px-3 py-2.5 whitespace-nowrap">{date(row.joinedAt)}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{number.format(row.uploads)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{row.lastUploadAt ? date(row.lastUploadAt) : <span className="muted">Never</span>}</td>
                <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{row.payments ? `${row.payments} · KES ${number.format(row.paidKes)}` : <span className="muted">—</span>}</td>
                <td className="px-3 py-2.5">{row.isAdmin ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">Admin</span> : "User"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {stats.users > rows.length && <p className="muted mt-2 text-sm">Showing the newest {rows.length} accounts.</p>}
    </section>
  );
}

export default function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <div className="space-y-6">
      <div><p className="eyebrow">Administration</p><h1 className="text-3xl font-semibold">Users</h1></div>
      <Suspense fallback={<p className="muted">Loading users…</p>}><Users searchParams={searchParams} /></Suspense>
    </div>
  );
}
