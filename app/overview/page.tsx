import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { getDataSourceOverview } from "@/lib/data-sources/service";
import { listBusinessContextModels, listKpis } from "@/lib/business-context/service";
import { listDashboards } from "@/lib/dashboards/service";

export default async function OverviewPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const [sources, contexts, kpis, dashboards] = await Promise.all([
    getDataSourceOverview(session.user),
    listBusinessContextModels(session.user, { page: 1, pageSize: 100 }),
    listKpis(session.user, {}),
    listDashboards(session.user),
  ]);
  const publishedContexts = contexts.items.filter((item) => item.status === "PUBLISHED").length;
  const productionKpis = kpis.filter((item) => ["APPROVED", "CERTIFIED"].includes(item.status)).length;
  const publishedDashboards = dashboards.filter((item) => item.status === "PUBLISHED").length;
  const firstName = session.user.fullName.split(" ")[0];
  return <main className="workspace-page overview-page">
    <section className="workspace-welcome"><div><p className="eyebrow">WORKSPACE OVERVIEW</p><h1>Good to see you, {firstName}.</h1><p>Follow the governed path from synchronized Oracle metadata to trusted business definitions, KPIs, and decision-ready dashboards.</p></div><div className="welcome-signal"><span/><div><strong>Platform operational</strong><small>{sources.connected} connected · {sources.synced} synchronized</small></div></div></section>

    <section className="overview-pipeline" aria-label="IFS Insight asset summary">
      <Link href="/data-sources" className="overview-pipeline-card data"><span className="overview-card-icon">DB</span><div><small>DATA FOUNDATION</small><strong>{sources.total}</strong><p>Data sources</p><em>{sources.tables + sources.views} discovered objects</em></div><b>→</b></Link>
      <Link href="/business-context-models" className="overview-pipeline-card context"><span className="overview-card-icon">◇</span><div><small>BUSINESS MEANING</small><strong>{contexts.total}</strong><p>Business Context models</p><em>{publishedContexts} published</em></div><b>→</b></Link>
      <Link href="/kpi-catalogue" className="overview-pipeline-card kpi"><span className="overview-card-icon">KPI</span><div><small>GOVERNED MEASURES</small><strong>{kpis.length}</strong><p>KPI definitions</p><em>{productionKpis} approved or certified</em></div><b>→</b></Link>
      <Link href="/dashboards" className="overview-pipeline-card dashboard"><span className="overview-card-icon">▦</span><div><small>DECISION LAYER</small><strong>{dashboards.length}</strong><p>Dashboards</p><em>{publishedDashboards} published</em></div><b>→</b></Link>
    </section>

    <section className="overview-section-head"><div><p className="eyebrow">DATA FOUNDATION</p><h2>Oracle / IFS metadata coverage</h2><p>Latest synchronized metadata from the Data Sources you can access.</p></div>{session.user.role !== "VIEWER" && <Link href="/metadata">Explore metadata →</Link>}</section>
    <section className="metadata-coverage" aria-label="Metadata coverage">
      <article><span className="coverage-symbol table">▤</span><div><strong>{sources.tables.toLocaleString()}</strong><span>Tables</span><small>Physical Oracle tables</small></div></article>
      <article><span className="coverage-symbol view">◫</span><div><strong>{sources.views.toLocaleString()}</strong><span>Views</span><small>Governed database views</small></div></article>
      <article><span className="coverage-symbol column">┆</span><div><strong>{sources.columns.toLocaleString()}</strong><span>Columns</span><small>Available metadata fields</small></div></article>
      <article><span className="coverage-symbol sync">✓</span><div><strong>{sources.synced}/{sources.total}</strong><span>Sources synchronized</span><small>{sources.connected} currently connected</small></div></article>
    </section>

    <div className="overview-detail-grid">
      <section className="workspace-card overview-sources-card"><div className="workspace-card-head"><div><p className="eyebrow">RECENT SOURCES</p><h2>Data source inventory</h2></div>{session.user.role !== "VIEWER" && <Link href="/data-sources">View all</Link>}</div>{sources.recent.length ? <div className="source-summary source-summary-detailed">{sources.recent.map((source) => <Link href={`/data-sources/${source.id}`} key={source.id}><span className="source-symbol">DB</span><div><strong>{source.name}</strong><small>{source.environment} · {source.databaseType} · {source.defaultSchema || "All allowed schemas"}</small><span>{source.tables} tables <i/> {source.views} views <i/> {source.columns.toLocaleString()} columns</span></div><em className={source.connectionStatus.toLowerCase()}>{source.connectionStatus.replaceAll("_", " ")}</em></Link>)}</div> : <div className="workspace-empty"><span>✦</span><strong>{session.user.role === "VIEWER" ? "Governed analytics access" : "No data sources yet"}</strong><p>{session.user.role === "VIEWER" ? "Use published KPIs and dashboards without exposing physical metadata." : "Connect Oracle to start discovering IFS metadata."}</p></div>}</section>

      <section className="workspace-card"><div className="workspace-card-head"><div><p className="eyebrow">GOVERNED ANALYTICS</p><h2>From context to decisions</h2></div></div><div className="governed-stack"><Link href="/business-context-models"><span className="governed-step">01</span><div><strong>Business Context</strong><small>{contexts.items.reduce((sum, item) => sum + item.objectCount, 0)} objects · {contexts.items.reduce((sum, item) => sum + item.fieldCount, 0)} business fields</small></div><em>{publishedContexts} published</em></Link><Link href="/kpi-catalogue"><span className="governed-step">02</span><div><strong>KPI Catalogue</strong><small>Traceable formulas, owners, validation, and lineage</small></div><em>{productionKpis} ready</em></Link><Link href="/dashboards"><span className="governed-step">03</span><div><strong>Guided Dashboards</strong><small>Published context, locked KPI versions, safe previews</small></div><em>{publishedDashboards} live</em></Link></div></section>
    </div>

    <section className="overview-quick"><div><p className="eyebrow">QUICK ACTIONS</p><h2>Continue building</h2></div><div>{session.user.role !== "VIEWER" && <Link href="/metadata">Explore metadata <span>→</span></Link>}{session.user.role !== "VIEWER" && <Link href="/business-context-models">Manage Business Context <span>→</span></Link>}<Link href="/kpi-catalogue">Open KPI Catalogue <span>→</span></Link><Link href="/dashboards">View dashboards <span>→</span></Link></div></section>
  </main>;
}
