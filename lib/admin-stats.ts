import "server-only";
import { prisma } from "./prisma";

const DAY = 24 * 60 * 60 * 1000;
export const CHART_DAYS = 14;
const guest = { OR: [{ userId: null }, { userId: { isSet: false } }] };

export type AdminUserRow = {
  id: string; name: string | null; email: string; isAdmin: boolean; joinedAt: Date;
  uploads: number; lastUploadAt: Date | null; payments: number; paidKes: number;
};

/** Nairobi calendar day, so a scan at 01:00 EAT isn't counted on the previous (UTC) day. Matches the scan route. */
const dayKey = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });

/**
 * Usage counts for the admin dashboard. Uploads come from the counters the scan route keeps (UsageCounter and each
 * user's uploadCount, which outlive the reports), plus any stored report made before counting began. Reports older
 * than that have already been deleted for privacy and can't be counted.
 */
export async function adminStats(now = new Date()) {
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const chartStart = new Date(now.getTime() - (CHART_DAYS - 1) * DAY);
  const counters = new Map((await prisma.usageCounter.findMany()).map((c) => [c.key, c]));
  const counted = (key: string) => counters.get(key)?.count ?? 0;
  const countingSince = counters.get("total")?.startedAt ?? now;
  const legacy = { createdAt: { lt: countingSince } };

  const [legacyReports, legacyWeek, guestLegacy, highLegacy, paid, legacyByUser, paidByUser, recentLegacy, users, newUsers, userRows, oldestReport] = await Promise.all([
    prisma.report.count({ where: legacy }),
    prisma.report.count({ where: { createdAt: { gte: weekAgo, lt: countingSince } } }),
    prisma.report.count({ where: { AND: [legacy, guest] } }),
    prisma.report.count({ where: { ...legacy, riskLevel: "HIGH" } }),
    prisma.payment.aggregate({ where: { status: "SUCCESS" }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.report.groupBy({ by: ["userId"], where: legacy, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.payment.groupBy({ by: ["userId"], where: { status: "SUCCESS" }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.report.findMany({ where: { createdAt: { gte: chartStart, lt: countingSince } }, select: { createdAt: true } }),
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 500,
      select: { id: true, name: true, email: true, role: true, createdAt: true, uploadCount: true, lastUploadAt: true } }),
    prisma.report.findFirst({ where: legacy, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);

  const legacyMap = new Map(legacyByUser.filter((g) => g.userId).map((g) => [g.userId!, { count: g._count._all, last: g._max.createdAt }]));
  const paidMap = new Map(paidByUser.filter((g) => g.userId).map((g) => [g.userId!, { count: g._count._all, kes: g._sum.amount ?? 0 }]));

  const perDay = new Map<string, number>();
  for (let i = 0; i < CHART_DAYS; i++) {
    const key = dayKey(new Date(chartStart.getTime() + i * DAY));
    perDay.set(key, counted(`day:${key}`));
  }
  for (const { createdAt } of recentLegacy) {
    const key = dayKey(createdAt);
    if (perDay.has(key)) perDay.set(key, perDay.get(key)! + 1);
  }
  let countedWeek = 0;
  for (let i = 0; i < 7; i++) countedWeek += counted(`day:${dayKey(new Date(now.getTime() - i * DAY))}`);

  const totalUploads = counted("total") + legacyReports;
  const guestUploads = counted("guest") + guestLegacy;
  const rows: AdminUserRow[] = userRows.map((u) => {
    const old = legacyMap.get(u.id);
    const last = [u.lastUploadAt, old?.last ?? null].filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    return {
      id: u.id, name: u.name, email: u.email, isAdmin: u.role === "ADMIN", joinedAt: u.createdAt,
      uploads: u.uploadCount + (old?.count ?? 0), lastUploadAt: last,
      payments: paidMap.get(u.id)?.count ?? 0, paidKes: paidMap.get(u.id)?.kes ?? 0,
    };
  });

  return {
    users, newUsers, totalUploads, uploadsWeek: countedWeek + legacyWeek, guestUploads, memberUploads: totalUploads - guestUploads,
    highRisk: counted("high") + highLegacy, payments: paid._count._all, revenueKes: paid._sum.amount ?? 0,
    activeUsers: rows.filter((r) => r.uploads > 0).length,
    perDay: [...perDay.entries()].map(([day, count]) => ({ day, count })),
    rows, countedFrom: oldestReport?.createdAt ?? countingSince, trackingSince: counters.has("total") ? countingSince : null,
  };
}
