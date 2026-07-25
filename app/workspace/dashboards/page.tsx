import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { listDashboards } from "@/lib/dashboards/service";

export default async function WorkspaceDashboardsPage() {
  const session = await getCurrentSession(); if (!session) redirect("/login"); const items = await listDashboards(session.user);
  return <main className="workspace-page dashboard-index"><header className="dashboard-page-head"><div><p className="eyebrow">CREATOR WORKSPACE</p><h1>Manage dashboards</h1><p>Build, review, publish, and version governed IFS dashboards.</p></div>{hasPermission(session.user.role,"CREATE_DASHBOARD")&&<Link className="primary-button" href="/workspace/dashboards/new">＋ Create dashboard</Link>}</header><section className="dashboard-summary"><article><span>All dashboards</span><strong>{items.length}</strong></article><article><span>Draft and review</span><strong>{items.filter((item)=>["DRAFT","READY_FOR_REVIEW","IN_REVIEW","CHANGES_REQUESTED"].includes(item.status)).length}</strong></article><article><span>Published</span><strong>{items.filter((item)=>item.status==="PUBLISHED").length}</strong></article></section><div className="dashboard-list">{items.map((item)=><Link href={`/workspace/dashboards/${item.id}/edit`} key={item.id}><div className="dashboard-list-icon">▦</div><div><span>{item.category}</span><h2>{item.name}</h2><p>{item.description||"Business purpose and governed metrics."}</p><small>Updated {new Date(item.updatedAt).toLocaleString()}</small></div><em className={`dashboard-status ${item.status.toLowerCase()}`}>{item.status.replaceAll("_"," ")}</em></Link>)}{!items.length&&<div className="workspace-empty"><span>▦</span><strong>No dashboard projects yet</strong><p>Start with a business purpose, published context, and guided layout.</p></div>}</div></main>;
}
