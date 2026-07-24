"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

type UserStatus = "ACTIVE" | "INACTIVE" | "LOCKED" | "ARCHIVED";
type Role = "ADMIN" | "DASHBOARD_CREATOR" | "DATA_SOURCE_CREATOR" | "VIEWER";

type User = {
  id: string;
  fullName: string;
  username: string;
  email: string;
  role: Role;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  createdBy: string | null;
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.66 3.58 3 8 3s8-1.34 8-3V5" /><path d="M4 12v7c0 1.66 3.58 3 8 3s8-1.34 8-3v-7" /></>,
    layout: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
    activity: <><path d="M3 12h4l3-9 4 18 3-9h4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56V20.3h-3v-.08A1.7 1.7 0 0 0 10.66 18.66a1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.56-1.04H5.3v-3h.08A1.7 1.7 0 0 0 6.94 9.92 1.7 1.7 0 0 0 6.6 8.04l-.06-.06 2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 11.64 4.7v-.08h3v.08a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06A1.7 1.7 0 0 0 19.34 9.92a1.7 1.7 0 0 0 1.56 1.04h.08v3h-.08A1.7 1.7 0 0 0 19.4 15Z" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
    filter: <path d="M4 5h16M7 12h10M10 19h4" />,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const roleClass: Record<Role, string> = {
  ADMIN: "role-admin", DASHBOARD_CREATOR: "role-creator", DATA_SOURCE_CREATOR: "role-data", VIEWER: "role-viewer",
};
const roleLabel: Record<Role, string> = { ADMIN: "Administrator", DASHBOARD_CREATOR: "Dashboard Creator", DATA_SOURCE_CREATOR: "Data Source Creator", VIEWER: "Viewer" };
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Never";

export default function Home() {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("All roles");
  const [status, setStatus] = useState("All status");
  const [showAdd, setShowAdd] = useState(false);
  const [notice, setNotice] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 2600); };
  const loadUsers = async () => { setLoading(true); const params = new URLSearchParams({ pageSize: "50" }); if (query) params.set("q", query); if (role !== "All roles") params.set("role", role); if (status !== "All status") params.set("status", status); const response = await fetch(`/api/admin/users?${params}`); const body = await response.json(); if (response.ok) { setUsers(body.items); setTotal(body.total); } else showNotice(body.error || "Unable to load users"); setLoading(false); };
  useEffect(() => { const timer = window.setTimeout(() => { void loadUsers(); }, 250); return () => window.clearTimeout(timer); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, role, status]);
  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const response = await fetch("/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fullName: data.get("fullName"), username: data.get("username"), email: data.get("email"), role: data.get("role"), status: "ACTIVE", password: data.get("password"), mustChangePassword: data.get("mustChangePassword") === "on" }) }); const body = await response.json(); if (!response.ok) return showNotice(body.error || "Unable to create user"); setShowAdd(false); showNotice("User created successfully"); await loadUsers(); }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">A</span><span>atlas<span className="brand-dot">.</span></span></div>
        <div className="workspace"><span className="workspace-icon">A</span><span><strong>Acme Analytics</strong><small>Enterprise workspace</small></span><Icon name="chevron" size={15} /></div>
        <nav>
          <p className="nav-label">WORKSPACE</p>
          <a><Icon name="grid" />Overview</a><a><Icon name="layout" />Dashboards</a><a><Icon name="database" />Data sources</a>
          <p className="nav-label nav-gap">ADMINISTRATION</p>
          <Link className="active" href="/admin/users"><Icon name="users" />User management<span className="nav-count">{total}</span></Link>
          <a><Icon name="shield" />Roles & permissions</a><Link href="/admin/audit-logs"><Icon name="activity" />Audit logs</Link><a><Icon name="settings" />Settings</a>
        </nav>
        <div className="sidebar-bottom"><div className="help-card"><span className="help-symbol">?</span><div><strong>Need help?</strong><span>Visit help center</span></div><Icon name="arrow" size={15} /></div><div className="account"><span className="avatar avatar-dark">NS</span><div><strong>Nattapong S.</strong><small>Administrator</small></div><Icon name="more" /></div></div>
      </aside>
      <section className="content">
        <header className="topbar"><div className="crumbs"><span>Administration</span><b>/</b><strong>User management</strong></div><div className="top-actions"><button className="icon-button" aria-label="Search"><Icon name="search" /></button><button className="icon-button notification" aria-label="Notifications"><Icon name="bell" /><i /></button><span className="top-avatar" aria-label="Signed in as Nattapong S.">NS</span></div></header>
        <div className="page-body">
          <div className="title-row"><div><p className="eyebrow">ADMINISTRATION</p><h1>User management</h1><p className="intro">Manage your team members, roles, and account access.</p></div><button className="primary-button" onClick={() => setShowAdd(true)}><Icon name="plus" />Add user</button></div>
          <div className="metrics"><div><span className="metric-icon blue"><Icon name="users" /></span><p>Total users</p><strong>{total}</strong><small>All managed accounts</small></div><div><span className="metric-icon green"><Icon name="shield" /></span><p>Active users</p><strong>{users.filter(u => u.status === "ACTIVE").length}</strong><small>Current result set</small></div><div><span className="metric-icon amber"><Icon name="activity" /></span><p>Must change password</p><strong>—</strong><small>Security policy enabled</small></div><div><span className="metric-icon red"><Icon name="shield" /></span><p>Locked accounts</p><strong>{users.filter(u => u.status === "LOCKED").length}</strong><small>Requires attention</small></div></div>
          <section className="table-card"><div className="table-toolbar"><div className="search-field"><Icon name="search" size={17} /><input aria-label="Search users" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email..." /></div><div className="filters"><label><span className="sr-only">Filter by role</span><select aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)}><option>All roles</option><option value="ADMIN">Administrator</option><option value="DASHBOARD_CREATOR">Dashboard Creator</option><option value="DATA_SOURCE_CREATOR">Data Source Creator</option><option value="VIEWER">Viewer</option></select><Icon name="chevron" size={14} /></label><label><span className="sr-only">Filter by status</span><select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}><option>All status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="LOCKED">Locked</option><option value="ARCHIVED">Archived</option></select><Icon name="chevron" size={14} /></label></div></div>
            <div className="table-wrap"><table><thead><tr><th>User <span className="sort">↕</span></th><th>Role <span className="sort">↕</span></th><th>Status</th><th>Last login <span className="sort">↕</span></th><th>Created <span className="sort">↕</span></th><th>Created by</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{users.map((user, index) => <tr key={user.id}><td><div className="person"><span className={`avatar avatar-${(index % 6) + 1}`}>{user.fullName.split(" ").map(part => part[0]).join("").slice(0, 2)}</span><span><strong>{user.fullName}</strong><small>@{user.username} · {user.email}</small></span></div></td><td><span className={`role-badge ${roleClass[user.role]}`}>{roleLabel[user.role]}</span></td><td><span className={`status ${user.status.toLowerCase()}`}><i />{user.status[0] + user.status.slice(1).toLowerCase()}</span></td><td className="date">{formatDate(user.lastLoginAt)}</td><td className="date">{formatDate(user.createdAt)}</td><td className="creator">{user.createdBy || "System"}</td><td><button className="more-button" aria-label={`Open ${user.fullName}`} onClick={() => window.location.assign(`/admin/users/${user.id}`)}><Icon name="more" size={19} /></button></td></tr>)}</tbody></table>{loading && <div className="empty">Loading users…</div>}{!loading && users.length === 0 && <div className="empty">No users match your filters.</div>}</div>
            <div className="table-footer"><span>Showing <strong>{users.length}</strong> of <strong>{total}</strong> users</span><div className="pagination"><button disabled>‹</button><button className="current">1</button><button disabled>›</button></div></div>
          </section>
        </div>
      </section>
      {showAdd && <div className="modal-backdrop" role="presentation"><form className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onSubmit={create}><button type="button" className="modal-close" aria-label="Close dialog" onClick={() => setShowAdd(false)}><Icon name="close" /></button><p className="eyebrow">NEW TEAM MEMBER</p><h2 id="dialog-title">Add a user</h2><p>Create an account and set initial workspace access.</p><div className="form-grid"><label>Full name<input name="fullName" required placeholder="e.g. Somchai Jai Dee" /></label><label>Username<input name="username" required minLength={3} placeholder="somchai" /></label><label>Email address<input name="email" required type="email" placeholder="name@acme.io" /></label><label>Role<select name="role"><option value="VIEWER">Viewer</option><option value="DASHBOARD_CREATOR">Dashboard Creator</option><option value="DATA_SOURCE_CREATOR">Data Source Creator</option><option value="ADMIN">Administrator</option></select></label><label>Initial password<input name="password" required type="password" minLength={10} placeholder="••••••••••" /></label></div><label className="check"><input name="mustChangePassword" type="checkbox" defaultChecked /> <span>Require password change on first login</span></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowAdd(false)}>Cancel</button><button className="primary-button" type="submit">Create user</button></div></form></div>}
      {notice && <div className="toast"><span>✓</span>{notice}</div>}
    </main>
  );
}
