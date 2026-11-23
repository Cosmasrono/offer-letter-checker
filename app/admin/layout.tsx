import Link from "next/link";
import { Suspense } from "react";
import { AdminNav } from "@/components/AdminNav";
import { Icon } from "@/components/Icon";
import { signOut } from "@/lib/auth-actions";
import { getCurrentUser } from "@/lib/session";

/** Admin area: its own shell with a sidebar. The public header and footer are hidden here (see .admin-shell in globals.css). */
async function AdminShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return (
      <div className="admin-shell admin-shell-locked">
        <div className="card mx-auto max-w-md p-8 text-center">
          <span className="feature-icon mx-auto mb-4"><Icon name="lock" /></span>
          <h1 className="text-xl font-bold">Administrator access required</h1>
          <p className="muted mt-2 text-sm">Sign in with an administrator account to open the admin area.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {!user && <Link href="/sign-in?next=/admin" className="btn-primary">Sign in</Link>}
            <Link href="/" className="btn-secondary">Back to the site</Link>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/admin" className="admin-brand" aria-label="Admin dashboard">
          <span className="brand-mark"><Icon name="shield" className="h-5 w-5" /></span>
          <span><span className="block text-sm font-semibold">Offer Letter Checker</span><span className="admin-brand-tag">Admin</span></span>
        </Link>
        <AdminNav />
        <div className="admin-sidebar-footer">
          <p className="admin-user" title={user.email}><span className="admin-avatar" aria-hidden>{(user.name || user.email).slice(0, 1)}</span><span className="min-w-0 truncate">{user.name || user.email}</span></p>
          <Link href="/" className="admin-nav-link"><Icon name="globe" className="h-[18px] w-[18px] shrink-0" /><span>View site</span></Link>
          <form action={signOut}><button type="submit" className="admin-nav-link w-full"><Icon name="arrow" className="h-[18px] w-[18px] shrink-0" /><span>Sign out</span></button></form>
        </div>
      </aside>
      <div className="admin-content">{children}</div>
    </div>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <Suspense fallback={<div className="admin-shell admin-shell-locked"><p className="muted">Loading…</p></div>}><AdminShell>{children}</AdminShell></Suspense>;
}
