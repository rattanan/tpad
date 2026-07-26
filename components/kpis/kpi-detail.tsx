"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/db/schema";
import BusinessFieldPicker, { type BusinessFieldOption } from "./business-field-picker";

type Formula = { type: string; businessFieldId?: string; value?: unknown; function?: string; operator?: string; expression?: Formula; left?: Formula; right?: Formula; numerator?: Formula; denominator?: Formula; current?: Formula; comparison?: Formula; arguments?: Formula[] };
type SourceField = { id: string; businessFieldId: string; role: string };
type AvailableField = BusinessFieldOption;
type EditState = { name: string; description: string; businessObjective: string; businessQuestion: string; measureType: string; aggregation: string; fieldId: string; nullHandling: string; divisionByZeroHandling: string; decimalPrecision: string; unit: string; currency: string; recommendedVisualization: string; displayFormat: string };
type Kpi = { id: string; code: string; name: string; description: string | null; businessObjective: string | null; businessQuestion: string | null; measureType: string; formulaAst?: Formula; nullHandling?: string; divisionByZeroHandling?: string; decimalPrecision?: number; unit?: string | null; currency?: string | null; status: string; certificationStatus: string; version: number; recommendedVisualization?: string | null; displayFormat?: string | null; sourceFields?: SourceField[]; versions?: Array<{ id: string; versionNumber: number; status: string; changeReason: string | null; approvedAt: string | null; createdAt: string }> };
type Lineage = { nodes: Array<{ id: string; type: string; label: string; physical?: string }>; edges: Array<{ source: string; target: string }> };

const draftStatuses = ["DRAFT", "CHANGES_REQUESTED"];
const badge = (value: string) => <span className={`bc-status ${value.toLowerCase()}`}>{value.replaceAll("_", " ")}</span>;
const fieldFromFormula = (formula?: Formula) => formula?.type === "aggregate" && formula.expression?.type === "field" ? formula.expression.businessFieldId ?? "" : "";

export default function KpiDetail({ kpiJson, fieldsJson, role }: { kpiJson: string; fieldsJson: string; role: Role }) {
  const kpi = JSON.parse(kpiJson) as Kpi;
  const fields = JSON.parse(fieldsJson) as AvailableField[];
  const router = useRouter();
  const [tab, setTab] = useState("Definition");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [lineage, setLineage] = useState<Lineage | null>(null);
  const simpleFormula = Boolean(fieldFromFormula(kpi.formulaAst));
  const [edit, setEdit] = useState({
    name: kpi.name, description: kpi.description ?? "", businessObjective: kpi.businessObjective ?? "", businessQuestion: kpi.businessQuestion ?? "",
    measureType: kpi.measureType, aggregation: kpi.formulaAst?.function ?? "SUM", fieldId: fieldFromFormula(kpi.formulaAst),
    nullHandling: kpi.nullHandling ?? "IGNORE", divisionByZeroHandling: kpi.divisionByZeroHandling ?? "NULL", decimalPrecision: String(kpi.decimalPrecision ?? 2),
    unit: kpi.unit ?? "", currency: kpi.currency ?? "", recommendedVisualization: kpi.recommendedVisualization ?? "", displayFormat: kpi.displayFormat ?? "",
  });
  const [test, setTest] = useState({ expectedResult: "", tolerance: "0" });
  const canManage = role === "ADMIN" || role === "DATA_SOURCE_CREATOR";
  const editable = canManage && draftStatuses.includes(kpi.status);

  async function post(path: string, label: string, body: object = {}) {
    setBusy(label); setError("");
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json(); setBusy("");
    if (!response.ok) { setError(data.error ?? "Action failed"); return null; }
    setResult(data); router.refresh(); return data;
  }
  async function saveDraft() {
    setBusy("Save KPI"); setError("");
    const formulaAst = simpleFormula && edit.fieldId ? { type: "aggregate", function: edit.aggregation, expression: { type: "field", businessFieldId: edit.fieldId } } : undefined;
    const { aggregation: _aggregation, fieldId: _fieldId, ...changes } = edit;
    void _aggregation; void _fieldId;
    const response = await fetch(`/api/kpis/${kpi.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...changes, decimalPrecision: Number(edit.decimalPrecision), formulaAst }) });
    const data = await response.json(); setBusy("");
    if (!response.ok) { setError(data.error ?? "Save failed"); return; }
    setResult(data); router.refresh();
  }
  async function loadLineage() {
    setBusy("Lineage"); const response = await fetch(`/api/kpis/${kpi.id}/lineage`); const data = await response.json(); setBusy("");
    if (response.ok) setLineage(data); else setError(data.error ?? "Could not load lineage");
  }

  const tabs = ["Definition", "Validation", "Lineage", "Version history"];
  return <main className="bc-workspace">
    <header className="bc-model-head kpi-detail-head"><div><Link href="/kpi-catalogue">← KPI Catalogue</Link><div className="bc-title-line"><span className="kpi-code">{kpi.code}</span><h1>{kpi.name}</h1>{badge(kpi.status)}</div><p>{kpi.description || "Business description pending."}</p><small>Version {kpi.version} · {kpi.certificationStatus.replaceAll("_", " ")}</small></div>
      <div className="bc-actions">{canManage && ["APPROVED", "CERTIFIED"].includes(kpi.status) && <button className="primary-button" onClick={() => { const reason = window.prompt("Change summary for this editable draft"); if (reason !== null) void post(`/api/kpis/${kpi.id}/create-version`, "Create draft", { changeSummary: reason }); }}>Create editable draft</button>}{canManage && <button className="secondary-button" onClick={async () => { await post(`/api/kpis/${kpi.id}/validate`, "Validation"); setTab("Validation"); }}>Validate</button>}{canManage && draftStatuses.includes(kpi.status) && <button className="primary-button" onClick={() => void post(`/api/kpis/${kpi.id}/submit-review`, "Submit review")}>Submit review</button>}{role === "ADMIN" && kpi.status === "UNDER_REVIEW" && <button className="primary-button" onClick={() => void post(`/api/kpis/${kpi.id}/approve`, "Approve")}>Approve</button>}{role === "ADMIN" && kpi.status === "APPROVED" && <button className="primary-button" onClick={() => void post(`/api/kpis/${kpi.id}/certify`, "Certify")}>Certify</button>}</div>
    </header>
    {error && <div className="bc-alert error">{error}</div>}
    <nav className="bc-tabs" aria-label="KPI sections">{tabs.map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</nav>
    <section className="bc-tab-panel">
      {tab === "Definition" && (editable ? <EditVersion edit={edit} setEdit={setEdit} fields={fields} simpleFormula={simpleFormula} busy={busy} saveDraft={saveDraft} /> : <DefinitionView kpi={kpi} fields={fields} />)}
      {tab === "Version history" && <section><div className="bc-section-head"><div><p className="eyebrow">IMMUTABLE SNAPSHOTS</p><h2>KPI version history</h2></div></div><div className="mapping-list">{kpi.versions?.map((item) => <article key={item.id}><div><strong>Version {item.versionNumber}</strong><small>{item.changeReason || "Approved KPI snapshot"}</small></div>{badge(item.status)}<time>{new Date(item.approvedAt || item.createdAt).toLocaleString()}</time></article>)}{!kpi.versions?.length && <div className="workspace-empty"><strong>No approved version snapshots</strong><p>A snapshot is created when the KPI is approved.</p></div>}</div></section>}
      {tab === "Validation" && <section className="test-lab"><div><p className="eyebrow">VALIDATE AND VERIFY</p><h2>Definition checks</h2><p>Validation checks the KPI definition. An optional result check compares the live KPI value with your expected value; it never changes the KPI.</p></div>{canManage && <div className="test-form verification-form"><label>Expected result <input value={test.expectedResult} onChange={(event) => setTest({ ...test, expectedResult: event.target.value })} inputMode="decimal" placeholder="Optional, e.g. 1250" /><small>Leave blank to run without a pass/fail comparison.</small></label><label>Tolerance <input value={test.tolerance} onChange={(event) => setTest({ ...test, tolerance: event.target.value })} inputMode="decimal" /><small>Allowed difference from the expected result.</small></label><button className="secondary-button" disabled={Boolean(busy)} onClick={() => void post(`/api/kpis/${kpi.id}/test`, "Verify result", test)}>Verify result</button></div>}{result && <pre className="result-preview">{JSON.stringify(result, null, 2)}</pre>}</section>}
      {tab === "Lineage" && <section><div className="bc-section-head"><div><p className="eyebrow">END-TO-END TRACEABILITY</p><h2>Source metadata → KPI</h2></div><button className="secondary-button" onClick={() => void loadLineage()}>{busy === "Lineage" ? "Loading…" : "Load lineage"}</button></div>{lineage ? <div className="lineage-flow">{lineage.nodes.map((node, index) => <div key={node.id}><article><span>{node.type.replaceAll("_", " ")}</span><strong>{node.label}</strong>{node.physical && <small>{node.physical}</small>}</article>{index < lineage.nodes.length - 1 && <b>→</b>}</div>)}</div> : <div className="workspace-empty"><span>⌁</span><strong>Load governed lineage</strong><p>Viewer-safe projections hide physical table and column names.</p></div>}</section>}
    </section>
  </main>;
}

function EditVersion({ edit, setEdit, fields, simpleFormula, busy, saveDraft }: { edit: EditState; setEdit: (value: EditState) => void; fields: AvailableField[]; simpleFormula: boolean; busy: string; saveDraft: () => Promise<void> }) {
  const update = <K extends keyof EditState>(key: K, value: EditState[K]) => setEdit({ ...edit, [key]: value });
  return <section className="edit-version"><div className="edit-version-intro"><p className="eyebrow">EDITING DRAFT VERSION</p><h2>Definition, calculation, source, and display</h2><p>Everything that can be changed is in one place. Source mapping is updated automatically from the formula you save.</p></div><div className="edit-form-grid"><section><h3>Business definition</h3><label>KPI name<input value={edit.name} onChange={(event) => update("name", event.target.value)} /></label><label>Description<textarea rows={3} value={edit.description} onChange={(event) => update("description", event.target.value)} /></label><label>Business objective<textarea rows={3} value={edit.businessObjective} onChange={(event) => update("businessObjective", event.target.value)} /></label><label>Business question<textarea rows={3} value={edit.businessQuestion} onChange={(event) => update("businessQuestion", event.target.value)} /></label><label>Measure type<select value={edit.measureType} onChange={(event) => update("measureType", event.target.value)}>{["ADDITIVE", "SEMI_ADDITIVE", "NON_ADDITIVE", "RATIO", "COUNT"].map((value) => <option key={value}>{value}</option>)}</select></label></section><section><h3>Calculation and source</h3>{simpleFormula ? <><label>Aggregation<select value={edit.aggregation} onChange={(event) => update("aggregation", event.target.value)}>{["SUM", "AVERAGE", "COUNT", "COUNT_DISTINCT", "MINIMUM", "MAXIMUM"].map((value) => <option key={value}>{value}</option>)}</select></label><BusinessFieldPicker label="Formula field" value={edit.fieldId} fields={fields} onChange={(fieldId) => update("fieldId", fieldId)} helpText="Changing this also updates the KPI’s source mapping." /></> : <div className="bc-alert">This is a complex formula. Its source mapping is shown in Lineage and is protected from a simple-form edit.</div>}<label>Null handling<select value={edit.nullHandling} onChange={(event) => update("nullHandling", event.target.value)}>{["IGNORE", "ZERO", "ERROR"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Division by zero<select value={edit.divisionByZeroHandling} onChange={(event) => update("divisionByZeroHandling", event.target.value)}>{["NULL", "ZERO", "ERROR"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Decimal precision<input type="number" min="0" max="10" value={edit.decimalPrecision} onChange={(event) => update("decimalPrecision", event.target.value)} /></label></section><section><h3>Display</h3><label>Unit<input value={edit.unit} onChange={(event) => update("unit", event.target.value)} placeholder="e.g. orders" /></label><label>Currency<input value={edit.currency} onChange={(event) => update("currency", event.target.value.toUpperCase())} placeholder="e.g. THB" /></label><label>Recommended visualization<select value={edit.recommendedVisualization} onChange={(event) => update("recommendedVisualization", event.target.value)}><option value="">No recommendation</option>{["KPI card", "Line chart", "Bar chart", "Table", "Gauge"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Display format<input value={edit.displayFormat} onChange={(event) => update("displayFormat", event.target.value)} placeholder="e.g. #,##0.00" /></label></section></div><button className="primary-button save-draft-button" disabled={Boolean(busy) || !edit.name} onClick={() => void saveDraft()}>{busy === "Save KPI" && <span className="button-spinner" />}Save draft version</button></section>;
}

function DefinitionView({ kpi, fields }: { kpi: Kpi; fields: AvailableField[] }) {
  const formulaFieldId = fieldFromFormula(kpi.formulaAst);
  const formulaField = fields.find((field) => field.id === formulaFieldId);
  const dashboardEligibility = ["APPROVED", "CERTIFIED"].includes(kpi.status) ? "Selectable" : "Blocked until approval";
  return <div className="kpi-definition-view"><section><h2>Business definition</h2><div className="kpi-detail-grid"><Info title="KPI name" value={kpi.name} /><Info title="Description" value={kpi.description} /><Info title="Business objective" value={kpi.businessObjective} /><Info title="Business question" value={kpi.businessQuestion} /><Info title="Measure type" value={kpi.measureType.replaceAll("_", " ")} /></div></section><section><h2>Calculation and source</h2><div className="kpi-detail-grid"><Info title="Aggregation" value={kpi.formulaAst?.function ?? kpi.formulaAst?.type.replaceAll("_", " ")} /><Info title="Formula field" value={formulaField ? `${formulaField.businessName} · ${formulaField.businessObjectName} (${formulaField.fieldRole})` : formulaFieldId || "Complex formula"} /><Info title="Null handling" value={kpi.nullHandling} /><Info title="Division by zero" value={kpi.divisionByZeroHandling} /><Info title="Decimal precision" value={String(kpi.decimalPrecision ?? 2)} /></div></section><section><h2>Display</h2><div className="kpi-detail-grid"><Info title="Unit" value={kpi.unit} /><Info title="Currency" value={kpi.currency} /><Info title="Recommended visualization" value={kpi.recommendedVisualization} /><Info title="Display format" value={kpi.displayFormat} /></div></section><section><h2>Governance</h2><div className="kpi-detail-grid"><Info title="Status" value={kpi.status.replaceAll("_", " ")} /><Info title="Certification" value={kpi.certificationStatus.replaceAll("_", " ")} /><Info title="Version" value={`v${kpi.version}`} /><Info title="Dashboard eligibility" value={dashboardEligibility} /></div></section></div>;
}

function Info({ title, value }: { title: string; value?: string | null }) { return <article className="kpi-info"><span>{title}</span><strong>{value || "Not defined"}</strong></article>; }
