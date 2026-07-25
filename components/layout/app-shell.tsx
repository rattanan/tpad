"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Role } from "@/lib/db/schema";

type NavItem = { href: string; label: string; icon: IconName; exact?: boolean };
type IconName = "home" | "chart" | "database" | "catalog" | "users" | "key" | "audit" | "history" | "profile" | "security" | "menu" | "close" | "logout" | "spark";

const paths: Record<IconName, ReactNode> = {
  home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,
  chart: <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 16v-3m5 3V8m5 8v-5"/></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/></>,
  catalog: <><path d="M4 5h16M4 12h16M4 19h10"/><circle cx="18" cy="19" r="2"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6m3-3h-6"/></>,
  key: <><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9m-3 3 3 3m-6 0 3 3"/></>,
  audit: <><path d="M9 11h6M9 15h4"/><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
  profile: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  security: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>, close: <path d="m6 6 12 12M18 6 6 18"/>, logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h6v18h-6"/></>, spark: <><path d="m12 3 1.2 4.8L18 9l-4.8 1.2L12 15l-1.2-4.8L6 9l4.8-1.2Z"/><path d="m19 15 .6 2.4L22 18l-2.4.6L19 21l-.6-2.4L16 18l2.4-.6Z"/></>,
};

function Icon({ name }: { name: IconName }) { return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>; }
const roleLabels: Record<Role, string> = { ADMIN: "Administrator", DATA_SOURCE_CREATOR: "Data Source Creator", DASHBOARD_CREATOR: "Dashboard Creator", VIEWER: "Viewer" };

export default function AppShell({ user, children }: { user: { fullName: string; email: string; role: Role }; children: ReactNode }) {
  const pathname = usePathname(); const router = useRouter(); const [open, setOpen] = useState(false); const [loggingOut, setLoggingOut] = useState(false);
  const workspace: NavItem[] = [{ href: "/overview", label: "Overview", icon: "home", exact: true }, { href: "/dashboards", label: "Dashboards", icon: "chart" }];
  if (user.role !== "VIEWER") workspace.push({ href: "/data-sources", label: "Data Sources", icon: "database" }, { href: "/metadata", label: "Metadata Explorer", icon: "catalog" });
  const admin: NavItem[] = user.role === "ADMIN" ? [{ href: "/admin/users", label: "User Management", icon: "users" }, { href: "/admin/data-source-access", label: "Data Access", icon: "key" }, { href: "/admin/audit-logs", label: "Audit Logs", icon: "audit" }, { href: "/admin/login-history", label: "Login History", icon: "history" }] : [];
  const account: NavItem[] = [{ href: "/profile", label: "My Profile", icon: "profile", exact: true }, { href: "/profile/security", label: "Security & Sessions", icon: "security" }];
  const active = (item: NavItem) => item.exact ? pathname === item.href : pathname.startsWith(item.href);
  const title = [...workspace, ...admin, ...account].find(active)?.label ?? "Workspace";
  const initials = user.fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  async function logout() { setLoggingOut(true); await fetch("/api/auth/logout", { method: "POST" }); router.replace("/"); router.refresh(); }
  const group = (label: string, items: NavItem[]) => items.length ? <div className="shell-nav-group"><p>{label}</p>{items.map((item) => <Link key={item.href} href={item.href} className={active(item) ? "active" : ""} aria-current={active(item) ? "page" : undefined} onClick={() => setOpen(false)}><Icon name={item.icon}/><span>{item.label}</span>{item.href === "/dashboards" && <small>Phase 3</small>}</Link>)}</div> : null;
  return <div className="insight-shell">
    <button className="shell-mobile-toggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={open ? "close" : "menu"}/></button>
    {open && <button className="shell-scrim" aria-label="Close navigation" onClick={() => setOpen(false)}/>} 
    <aside className={`insight-sidebar ${open ? "open" : ""}`}>
      <Link className="insight-brand" href="/overview" onClick={() => setOpen(false)}><span className="insight-brand-mark"><Icon name="spark"/></span><span>IFS <b>Insight</b></span></Link>
      <div className="insight-workspace"><span>IFS</span><div><strong>Enterprise Workspace</strong><small>Oracle intelligence platform</small></div></div>
      <nav aria-label="Main navigation">{group("WORKSPACE", workspace)}{group("ADMINISTRATION", admin)}{group("ACCOUNT", account)}</nav>
      <div className="shell-account"><span className="shell-avatar">{initials}</span><div><strong>{user.fullName}</strong><small>{roleLabels[user.role]}</small></div><button onClick={logout} disabled={loggingOut} aria-label="Sign out" title="Sign out"><Icon name="logout"/></button></div>
    </aside>
    <section className="insight-main"><header className="insight-topbar"><div><span>IFS Insight</span><i>/</i><strong>{title}</strong></div><div className="shell-user"><span className="shell-role">{roleLabels[user.role]}</span><span className="shell-avatar">{initials}</span></div></header>{children}</section>
  </div>;
}
