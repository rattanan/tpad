import Link from "next/link";
import type { ReactNode } from "react";
import { IfsLogo } from "@/components/brand/ifs-logo";
import styles from "./landing.module.css";

const trustPoints = ["Governed Oracle data", "Traceable answers", "Role-based access", "Read-only queries"];

const copilotFeatures = [
  ["↗", "Ask follow-up questions", "Continue the conversation without rebuilding reports or writing SQL."],
  ["∑", "Understand KPI calculations", "See formulas, active filters, and the governed fields behind every KPI."],
  ["⌘", "Trace every answer", "Review source tables, business definitions, query logic, and refresh times."],
  ["◎", "Explore root causes", "Move from a headline metric to records, trends, and contributing factors."],
] as const;

const workflow = [
  ["01", "Business question", "Ask in natural language."],
  ["02", "Governed data", "Select approved context and KPIs."],
  ["03", "Query validation", "Check SQL, joins, formulas, and access."],
  ["04", "Traceable answer", "Return an answer with evidence."],
] as const;

const builderSteps = [
  "Select a dashboard layout", "Describe the business objective", "Define questions for each block",
  "AI recommends KPIs and visuals", "AI generates and validates queries", "Preview, review, and publish",
];

const insights = [
  { icon: "△", type: "Maintenance risk", confidence: "92", text: "Seven aircraft are likely to miss their planned return-to-service date.", metric: "7 aircraft · 3 critical", action: "Review maintenance plan" },
  { icon: "↗", type: "Cost anomaly", confidence: "96", text: "External maintenance cost increased 18% versus the three-month average.", metric: "+18% · $420K impact", action: "Inspect cost drivers" },
  { icon: "◇", type: "Inventory shortage", confidence: "89", text: "Three critical spare parts may fall below safety stock within 14 days.", metric: "3 parts · 14 days", action: "Review replenishment" },
  { icon: "✦", type: "Operational opportunity", confidence: "84", text: "Reassigning two teams could reduce overdue work orders by approximately 11%.", metric: "−11% overdue work", action: "Model the scenario" },
] as const;

const capabilityGroups = [
  ["01", "Conversational analytics", ["Natural-language questions", "Context-aware follow-ups", "Period and unit comparison", "Transaction-level drill down"]],
  ["02", "Trusted answers", ["KPI definitions and formulas", "Source lineage", "SQL and filter visibility", "Freshness and validation"]],
  ["03", "AI dashboard creation", ["Guided dashboard builder", "Recommended KPIs and charts", "Validated query generation", "Preview and approval workflow"]],
  ["04", "AI insights", ["Anomaly and trend detection", "Root-cause analysis", "Risk identification", "Recommended actions"]],
] as const;

const securityFeatures = ["Read-only database access", "Encrypted credentials", "Role-based permissions", "Audit logs", "Query limits and timeout", "Approved data sources", "Semantic Layer governance", "KPI catalogue", "SQL validation", "Sensitive-field masking"];

const promptSuggestions = [
  "What is causing fleet readiness to decline?", "Which maintenance activities should we prioritize?",
  "Where are we overspending?", "Which suppliers are creating operational risk?",
  "What should management focus on this week?", "What actions could improve this KPI?",
  "Compare performance with the previous quarter.", "Create an executive summary for management.",
];

function CTAButton({ href, children, secondary = false }: { href: string; children: ReactNode; secondary?: boolean }) {
  const className = secondary ? styles.ctaSecondary : styles.ctaPrimary;
  return href.startsWith("/") ? <Link href={href} className={className}>{children}<span aria-hidden="true">→</span></Link> : <a href={href} className={className}>{children}<span aria-hidden="true">→</span></a>;
}

function TrustBadge({ children }: { children: ReactNode }) {
  return <span className={styles.trustBadge}><i aria-hidden="true"/> {children}</span>;
}

function SectionHeading({ eyebrow, title, description, centered = false, inverse = false }: { eyebrow: string; title: ReactNode; description: string; centered?: boolean; inverse?: boolean }) {
  return <header className={`${styles.sectionHeading} ${centered ? styles.centered : ""} ${inverse ? styles.inverse : ""}`}>
    <p><span aria-hidden="true"/>{eyebrow}</p><h2>{title}</h2><div>{description}</div>
  </header>;
}

function CopilotMessage({ role, children, compact = false }: { role: "You" | "AI"; children: ReactNode; compact?: boolean }) {
  return <div className={`${styles.message} ${role === "You" ? styles.userMessage : styles.aiMessage} ${compact ? styles.compactMessage : ""}`}>
    <span>{role === "AI" ? <IfsLogo markOnly size="xs"/> : "You"}</span><p>{children}</p>
  </div>;
}

function HeroVisual() {
  return <div className={styles.heroVisual} aria-label="AI Copilot exploring and verifying a maintenance dashboard">
    <div className={styles.visualGrid}/><div className={styles.visualGlow}/>
    <div className={`${styles.floatCard} ${styles.kpiFloat}`}><small>Maintenance cost</small><strong>$4.82M</strong><span>↑ 12.4% this month</span></div>
    <div className={`${styles.floatCard} ${styles.verifyFloat}`}><span className={styles.verified}>✓ Verified</span><small>Formula and source lineage available</small></div>
    <div className={`${styles.floatCard} ${styles.insightFloat}`}><i><IfsLogo markOnly size="xs"/></i><div><small>AI insight</small><strong>Unscheduled repairs explain 68% of the increase.</strong></div></div>
    <div className={styles.heroCopilot}>
      <div className={styles.panelTop}><span><i><IfsLogo markOnly size="xs"/></i> InsightFS Copilot</span><em>Governed</em></div>
      <CopilotMessage role="You" compact>Why did maintenance cost increase this month?</CopilotMessage>
      <CopilotMessage role="AI" compact>Maintenance cost increased <b>12.4%</b>, mainly from unscheduled engine repairs and higher external service expenses.</CopilotMessage>
      <div className={styles.quickActions}><button>View supporting data</button><button>Explain calculation</button><button>Show source query</button><button>Create analysis</button></div>
      <div className={styles.typing} aria-label="AI is ready"><span/><span/><span/></div>
    </div>
    <svg className={styles.connector} viewBox="0 0 700 620" aria-hidden="true"><path d="M90 130 C220 90 230 200 340 175 S520 100 630 170"/><path d="M120 485 C210 390 310 490 400 405 S540 350 650 440"/><circle cx="90" cy="130" r="4"/><circle cx="630" cy="170" r="4"/></svg>
  </div>;
}

function Header() {
  return <header className={styles.siteHeader}><Link href="/" className={styles.logoLink} aria-label="InsightFS home"><IfsLogo/></Link><nav aria-label="Public navigation"><a href="#copilot">AI Copilot</a><a href="#capabilities">Capabilities</a><a href="#security">Security</a><Link href="/login" className={styles.signIn}>Sign in</Link></nav></header>;
}

function HeroSection() {
  return <section className={styles.hero}><div className={styles.heroCopy}>
    <p className={styles.eyebrow}><span/>AI-POWERED DECISION INTELLIGENCE</p>
    <h1>Turn IFS data<br/>into <em>answers,<br/>insights, and<br/>better decisions.</em></h1>
    <p className={styles.heroLead}>Ask questions about your dashboards, verify the accuracy and origin of every metric, uncover hidden business insights, and create decision-ready dashboards with AI.</p>
    <div className={styles.heroActions}><CTAButton href="/login">Ask your data</CTAButton><CTAButton href="#copilot" secondary>Explore AI capabilities</CTAButton></div>
    <div className={styles.trustRow}>{trustPoints.map((item) => <TrustBadge key={item}>{item}</TrustBadge>)}</div>
  </div><HeroVisual/></section>;
}

function CopilotSection() {
  return <section id="copilot" className={`${styles.section} ${styles.copilotSection}`}><SectionHeading eyebrow="CONVERSATIONAL ANALYTICS" title={<>Ask your dashboard.<br/><em>Understand the answer.</em></>} description="InsightFS AI Copilot lets users explore dashboard data through natural conversation. Ask follow-up questions, inspect calculations, compare periods, identify root causes, and turn insights into action."/>
    <div className={styles.twoColumn}><div className={styles.conversationPanel}>
      <div className={styles.panelTop}><span><i><IfsLogo markOnly size="xs"/></i> Fleet operations</span><em>Live context</em></div>
      <CopilotMessage role="You">Is this Fleet Readiness KPI correct?</CopilotMessage>
      <CopilotMessage role="AI">Yes. The current readiness rate is <b>82.6%</b>, calculated from 38 available aircraft out of 46 active aircraft.</CopilotMessage>
      <CopilotMessage role="You">Which aircraft caused the decline?</CopilotMessage>
      <CopilotMessage role="AI">Three aircraft contributed most due to scheduled maintenance overruns.</CopilotMessage>
      <div className={styles.miniTable}><div><b>Aircraft</b><b>Type</b><b>Delay</b><b>Status</b></div><div><span>HS-ALC</span><span>Engine</span><span>6 days</span><em>Critical</em></div><div><span>HS-ALF</span><span>C-check</span><span>4 days</span><em>At risk</em></div><div><span>HS-ALK</span><span>Avionics</span><span>3 days</span><em>At risk</em></div></div>
    </div><div className={styles.featureStack}>{copilotFeatures.map(([icon, title, description]) => <article key={title} className={styles.featureCard}><i>{icon}</i><div><h3>{title}</h3><p>{description}</p></div></article>)}</div></div>
  </section>;
}

function VerificationPanel() {
  return <article className={styles.verificationPanel}><div className={styles.verificationTitle}><div><small>VERIFICATION RECORD</small><h3>Purchase Order Value</h3></div><span>✓ Verified</span></div>
    <dl><div><dt>Current value</dt><dd>$4.82M</dd></div><div><dt>Calculation</dt><dd><code>SUM(PURCHASE_ORDER_LINE_AMOUNT)</code></dd></div><div><dt>Filters</dt><dd>Released, Confirmed · Current month · Reporting currency</dd></div><div><dt>Data sources</dt><dd>PURCHASE_ORDER · PURCHASE_ORDER_LINE · SUPPLIER</dd></div><div><dt>Last refreshed</dt><dd>5 minutes ago</dd></div></dl>
    <div className={styles.panelActions}><button>View formula</button><button>View source fields</button><button>Review SQL</button><button>Report an issue</button></div>
  </article>;
}

function TrustSection() {
  return <section id="trust" className={`${styles.section} ${styles.trustSection}`}><SectionHeading eyebrow="EXPLAINABLE BY DESIGN" title={<>Trust every number.<br/><em>Verify every answer.</em></>} description="AI answers should never be a black box. InsightFS provides evidence, calculation details, source lineage, and validation checks for every important result." centered/>
    <div className={styles.workflow}>{workflow.map(([number, title, detail], index) => <article key={number}><span>{number}</span><i>{index === 0 ? "?" : index === 1 ? "◇" : index === 2 ? "✓" : "✦"}</i><h3>{title}</h3><p>{detail}</p>{index < workflow.length - 1 && <b aria-hidden="true">→</b>}</article>)}</div><VerificationPanel/>
  </section>;
}

function DashboardPreview() {
  const blocks = ["Fleet readiness", "Aircraft on ground", "Overdue work orders", "Maintenance cost", "Spare-parts risk", "Maintenance trend"];
  return <div className={styles.dashboardPreview}><div className={styles.dashboardBar}><span/><span/><span/><i><IfsLogo markOnly size="xs"/></i><small>Executive maintenance · AI draft</small></div><div className={styles.dashboardCanvas}>{blocks.map((item, index) => <article key={item} className={index === 5 ? styles.wideBlock : ""}><small>{item}</small>{index < 5 ? <><strong>{["82.6%", "8", "41", "$4.82M", "3"][index]}</strong><span className={index === 0 ? styles.good : ""}>{index === 0 ? "+2.1%" : "AI monitoring"}</span></> : <svg viewBox="0 0 280 70" preserveAspectRatio="none" aria-hidden="true"><path d="M0 58 C40 40 60 55 95 30 S150 45 185 20 S240 30 280 8"/></svg>}</article>)}</div></div>;
}

function BuilderSection() {
  return <section className={`${styles.section} ${styles.builderSection}`}><div className={styles.builderIntro}><SectionHeading eyebrow="AI DASHBOARD CREATION" title={<>Describe the decision.<br/><em>AI builds the dashboard.</em></>} description="Start with a business objective—not a database table. AI recommends KPIs, charts, filters, and layouts, then generates validated queries using your governed data model."/>
    <div className={styles.promptBox}><small>DESCRIBE YOUR DASHBOARD</small><p>“Create an executive maintenance dashboard showing fleet readiness, overdue work orders, maintenance cost trend, aircraft downtime, and critical spare-part shortages.”</p><button aria-label="Submit dashboard prompt">✦ Generate plan <span>→</span></button></div><p className={styles.reviewLine}><b>AI suggests.</b> You review. <b>The business owner approves.</b></p></div>
    <div><DashboardPreview/><ol className={styles.builderSteps}>{builderSteps.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol></div>
  </section>;
}

function InsightCard({ item, index }: { item: typeof insights[number]; index: number }) {
  return <article className={styles.insightCard} style={{ "--delay": `${index * 90}ms` } as React.CSSProperties}><header><i>{item.icon}</i><div><small>{item.type}</small><span>{item.confidence}% confidence</span></div></header><p>{item.text}</p><div className={styles.confidence}><span style={{ width: `${item.confidence}%` }}/></div><small>SUPPORTING METRICS</small><strong>{item.metric}</strong><button>{item.action}<span>→</span></button></article>;
}

function InsightsSection() {
  return <section className={`${styles.section} ${styles.insightsSection}`}><SectionHeading eyebrow="PROACTIVE INTELLIGENCE" title={<>Your dashboard shows what happened.<br/><em>AI explains why.</em></>} description="InsightFS continuously analyzes dashboard metrics to detect trends, unusual changes, risks, opportunities, and recommended next steps." centered inverse/><div className={styles.insightGrid}>{insights.map((item, index) => <InsightCard key={item.type} item={item} index={index}/>)}</div></section>;
}

function AdvisorSection() {
  return <section className={`${styles.section} ${styles.advisorSection}`}><div><SectionHeading eyebrow="BUSINESS ADVISOR" title={<>From data questions<br/><em>to business guidance.</em></>} description="Use AI as a business advisor that understands your KPIs, operations, constraints, and historical performance."/><div className={styles.promptCloud}>{promptSuggestions.map((prompt) => <button key={prompt}>{prompt}<span>↗</span></button>)}</div></div>
    <article className={styles.advisorResponse}><div className={styles.advisorTop}><span><IfsLogo markOnly size="sm"/></span><div><small>INSIGHTFS ADVISOR</small><strong>Management briefing</strong></div><em>Based on governed data</em></div><p>“Fleet readiness declined primarily because of extended engine maintenance and delayed spare-part delivery. Management should prioritize three aircraft representing <b>61% of the readiness impact.</b>”</p><h3>Recommended actions</h3><ol><li><span>1</span>Escalate two delayed suppliers</li><li><span>2</span>Reallocate specialized technicians</li><li><span>3</span>Review high-duration work orders</li><li><span>4</span>Monitor readiness daily for seven days</li></ol><button>Open full analysis <span>→</span></button></article>
  </section>;
}

function CapabilitiesSection() {
  return <section id="capabilities" className={`${styles.section} ${styles.capabilitiesSection}`}><SectionHeading eyebrow="ONE INTELLIGENCE WORKSPACE" title={<>Everything between a question<br/><em>and a trusted decision.</em></>} description="A connected set of AI capabilities built on the same governed business context." centered/>
    <div className={styles.capabilityGrid}>{capabilityGroups.map(([number, title, items]) => <article key={title}><span>{number}</span><h3>{title}</h3><ul>{items.map((item) => <li key={item}>✓ {item}</li>)}</ul></article>)}</div>
  </section>;
}

function SecuritySection() {
  return <section id="security" className={`${styles.section} ${styles.securitySection}`}><div><SectionHeading eyebrow="ENTERPRISE GOVERNANCE" title={<>Enterprise AI,<br/><em>built on governed data.</em></>} description="AI can only access data permitted by the user’s role and approved business definitions." inverse/><div className={styles.securitySeal}><span>✓</span><p><b>Governance is enforced at every layer.</b><br/>Identity, semantic context, query execution, and audit evidence stay connected.</p></div></div><div className={styles.securityGrid}>{securityFeatures.map((feature, index) => <article key={feature}><i>{index % 3 === 0 ? "◇" : index % 3 === 1 ? "⌁" : "✓"}</i><span>{feature}</span></article>)}</div></section>;
}

function FinalCTA() {
  return <section className={styles.finalCta}><div className={styles.ctaGlow}/><p className={styles.eyebrow}><span/>YOUR DATA IS READY</p><h2>Stop searching through reports.<br/><em>Start asking your data.</em></h2><p>Connect Oracle and IFS data, create governed dashboards, and turn every dashboard into an intelligent conversation.</p><div><CTAButton href="/login">Start exploring</CTAButton><CTAButton href="#copilot" secondary>See how it works</CTAButton></div></section>;
}

function Footer() {
  return <footer className={styles.footer}><Link href="/" className={styles.logoLink} aria-label="InsightFS home"><IfsLogo size="sm"/></Link><p>AI Decision Intelligence for Oracle and IFS.</p><nav aria-label="Footer navigation"><a href="#copilot">AI Copilot</a><a href="#trust">Trust</a><a href="#security">Security</a></nav><small>© 2026 InsightFS</small></footer>;
}

export function LandingPage() {
  return <main className={styles.page}><Header/><HeroSection/><CopilotSection/><TrustSection/><BuilderSection/><InsightsSection/><AdvisorSection/><CapabilitiesSection/><SecuritySection/><FinalCTA/><Footer/></main>;
}
