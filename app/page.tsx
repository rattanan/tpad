"use client";

import { useMemo, useState } from "react";

type UserStatus = "Active" | "Inactive" | "Locked";
type Role = "Administrator" | "Dashboard Creator" | "Data Source Creator" | "Viewer";

type User = {
  id: number;
  name: string;
  email: string;
  initials: string;
  role: Role;
  status: UserStatus;
  lastLogin: string;
  created: string;
  creator: string;
};

const users: User[] = [
  { id: 1, name: "Nattapong Saengsuwan", email: "nattapong@acme.io", initials: "NS", role: "Administrator", status: "Active", lastLogin: "Today, 09:41", created: "15 Jan 2025", creator: "System" },
  { id: 2, name: "Pimchanok Rattanakul", email: "pimchanok@acme.io", initials: "PR", role: "Dashboard Creator", status: "Active", lastLogin: "Today, 08:24", created: "09 Feb 2025", creator: "Nattapong S." },
  { id: 3, name: "Kritsada Wongsiri", email: "kritsada@acme.io", initials: "KW", role: "Data Source Creator", status: "Active", lastLogin: "Yesterday, 16:18", created: "28 Feb 2025", creator: "Nattapong S." },
  { id: 4, name: "Arisa Charoen", email: "arisa@acme.io", initials: "AC", role: "Viewer", status: "Inactive", lastLogin: "12 Mar 2025", created: "03 Mar 2025", creator: "Pimchanok R." },
  { id: 5, name: "Thanawat P.", email: "thanawat@acme.io", initials: "TP", role: "Viewer", status: "Locked", lastLogin: "08 Mar 2025", created: "05 Mar 2025", creator: "Nattapong S." },
  { id: 6, name: "Sirinapa Boonsri", email: "sirinapa@acme.io", initials: "SB", role: "Dashboard Creator", status: "Active", lastLogin: "04 Mar 2025", created: "18 Feb 2025", creator: "Nattapong S." },
];

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
  Administrator: "role-admin", "Dashboard Creator": "role-creator", "Data Source Creator": "role-data", Viewer: "role-viewer",
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("All roles");
  const [status, setStatus] = useState("All status");
  const [showAdd, setShowAdd] = useState(false);
  const [notice, setNotice] = useState("");
  const filtered = useMemo(() => users.filter((user) =>
    (role === "All roles" || user.role === role) && (status === "All status" || user.status === status) &&
    `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase())), [query, role, status]);

  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 2600); };
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">A</span><span>atlas<span className="brand-dot">.</span></span></div>
        <div className="workspace"><span className="workspace-icon">A</span><span><strong>Acme Analytics</strong><small>Enterprise workspace</small></span><Icon name="chevron" size={15} /></div>
        <nav>
          <p className="nav-label">WORKSPACE</p>
          <a><Icon name="grid" />Overview</a><a><Icon name="layout" />Dashboards</a><a><Icon name="database" />Data sources</a>
          <p className="nav-label nav-gap">ADMINISTRATION</p>
          <a className="active"><Icon name="users" />User management<span className="nav-count">24</span></a>
          <a><Icon name="shield" />Roles & permissions</a><a><Icon name="activity" />Audit logs</a><a><Icon name="settings" />Settings</a>
        </nav>
        <div className="sidebar-bottom"><div className="help-card"><span className="help-symbol">?</span><div><strong>Need help?</strong><span>Visit help center</span></div><Icon name="arrow" size={15} /></div><div className="account"><span className="avatar avatar-dark">NS</span><div><strong>Nattapong S.</strong><small>Administrator</small></div><Icon name="more" /></div></div>
      </aside>
      <section className="content">
        <header className="topbar"><div className="crumbs"><span>Administration</span><b>/</b><strong>User management</strong></div><div className="top-actions"><button className="icon-button"><Icon name="search" /></button><button className="icon-button notification"><Icon name="bell" /><i /></button><span className="top-avatar">NS</span></div></header>
        <div className="page-body">
          <div className="title-row"><div><p className="eyebrow">ADMINISTRATION</p><h1>User management</h1><p className="intro">Manage your team members, roles, and account access.</p></div><button className="primary-button" onClick={() => setShowAdd(true)}><Icon name="plus" />Add user</button></div>
          <div className="metrics"><div><span className="metric-icon blue"><Icon name="users" /></span><p>Total users</p><strong>24</strong><small><em>+3</em> this month</small></div><div><span className="metric-icon green"><Icon name="shield" /></span><p>Active users</p><strong>21</strong><small>87.5% of total</small></div><div><span className="metric-icon amber"><Icon name="activity" /></span><p>Pending invite</p><strong>2</strong><small>Expires in 7 days</small></div><div><span className="metric-icon red"><Icon name="shield" /></span><p>Locked accounts</p><strong>1</strong><small>Requires attention</small></div></div>
          <section className="table-card"><div className="table-toolbar"><div className="search-field"><Icon name="search" size={17} /><input aria-label="Search users" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email..." /></div><div className="filters"><label><select value={role} onChange={(e) => setRole(e.target.value)}><option>All roles</option><option>Administrator</option><option>Dashboard Creator</option><option>Data Source Creator</option><option>Viewer</option></select><Icon name="chevron" size={14} /></label><label><select value={status} onChange={(e) => setStatus(e.target.value)}><option>All status</option><option>Active</option><option>Inactive</option><option>Locked</option></select><Icon name="chevron" size={14} /></label><button className="filter-button"><Icon name="filter" size={16} />Filters</button></div></div>
            <div className="table-wrap"><table><thead><tr><th>User <span className="sort">↕</span></th><th>Role <span className="sort">↕</span></th><th>Status</th><th>Last login <span className="sort">↕</span></th><th>Created <span className="sort">↕</span></th><th>Created by</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map((user) => <tr key={user.id}><td><div className="person"><span className={`avatar avatar-${user.id}`}>{user.initials}</span><span><strong>{user.name}</strong><small>{user.email}</small></span></div></td><td><span className={`role-badge ${roleClass[user.role]}`}>{user.role}</span></td><td><span className={`status ${user.status.toLowerCase()}`}><i />{user.status}</span></td><td className="date">{user.lastLogin}</td><td className="date">{user.created}</td><td className="creator">{user.creator}</td><td><button className="more-button" aria-label={`Actions for ${user.name}`} onClick={() => showNotice(`Actions opened for ${user.name}`)}><Icon name="more" size={19} /></button></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty">No users match your filters.</div>}</div>
            <div className="table-footer"><span>Showing <strong>{filtered.length}</strong> of <strong>24</strong> users</span><div className="pagination"><button disabled>‹</button><button className="current">1</button><button>2</button><button>3</button><button>›</button></div></div>
          </section>
        </div>
      </section>
      {showAdd && <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button className="modal-close" onClick={() => setShowAdd(false)}><Icon name="close" /></button><p className="eyebrow">NEW TEAM MEMBER</p><h2 id="dialog-title">Add a user</h2><p>Invite a teammate and set their workspace access.</p><div className="form-grid"><label>Full name<input placeholder="e.g. Somchai Jai Dee" /></label><label>Email address<input type="email" placeholder="name@acme.io" /></label><label>Role<select><option>Viewer</option><option>Dashboard Creator</option><option>Data Source Creator</option><option>Administrator</option></select></label><label>Initial password<input type="password" placeholder="••••••••••" /></label></div><label className="check"><input type="checkbox" defaultChecked /> <span>Require password change on first login</span></label><div className="modal-actions"><button className="secondary-button" onClick={() => setShowAdd(false)}>Cancel</button><button className="primary-button" onClick={() => { setShowAdd(false); showNotice("User invitation created successfully"); }}>Create user</button></div></section></div>}
      {notice && <div className="toast"><span>✓</span>{notice}</div>}
    </main>
  );
}
