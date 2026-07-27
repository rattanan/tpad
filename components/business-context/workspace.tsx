"use client";
import Link from "next/link"; import { useEffect, useMemo, useState } from "react"; import { useRouter } from "next/navigation"; import type { Role } from "@/lib/db/schema"; import { readAiProgressResponse, type AiProgress } from "@/lib/ai/progress-client"; import AiGenerationProgress from "@/components/shared/ai-generation-progress"; import RelationshipCanvas from "./relationship-canvas";
type Model={id:string;dataSourceId:string;name:string;description:string|null;schemaName:string;version:number;status:string;updatedAt:string;publishedAt:string|null};
type Domain={id:string;name:string}; type ObjectRow={id:string;modelId:string;dataSourceId:string;physicalTableId:string;technicalName:string;databaseSchema:string;businessName:string;shortName:string|null;description:string|null;businessDomainId:string|null;objectType:string;recordGrain:string|null;approvalStatus:string;aiUsageAllowed:boolean;sensitivityLevel:string;layoutX:number;layoutY:number};
type Field={id:string;businessObjectId:string;businessObjectName:string;physicalColumnName:string;businessName:string;description:string|null;physicalDataType:string;businessType:string;fieldRole:string;aggregationRule:string;sensitivityClassification:string;aiUsageAllowed:boolean;visibleToDashboardCreator:boolean;approvalStatus:string};
type Relationship={id:string;modelId:string;dataSourceId:string;sourceObjectId:string;sourceFieldId:string;targetObjectId:string;targetFieldId:string;joinType:"INNER"|"LEFT"|"RIGHT";cardinality:"ONE_TO_ONE"|"ONE_TO_MANY"|"MANY_TO_ONE"|"MANY_TO_MANY"|"UNKNOWN";direction:"BIDIRECTIONAL"|"SOURCE_TO_TARGET"|"TARGET_TO_SOURCE";isRequired:boolean;confidenceScore:number;sourceType:"DATABASE_CONSTRAINT"|"AI_SUGGESTED"|"MANUAL"|"COLUMN_PATTERN";validationStatus:string;approvalStatus:string;approvedBy:string|null;approvedAt:string|null;notes:string|null;version:number;createdBy:string;updatedBy:string;createdAt:string;updatedAt:string;deletedAt:string|null};
type Kpi={id:string;name:string;code:string;description:string|null;status:string;certificationStatus:string}; type Recommendation={id:string;recommendationType:string;targetType:string;suggestedValue:string;reason:string;confidenceScore:number;impact:string;status:string;evidence:string|null}; type Version={id:string;versionNumber:number;status:string;changeSummary:string|null;publishedAt:string|null;createdAt:string}; type Glossary={id:string;term:string;definition:string;language:string;approvalStatus:string}; type Review={id:string;reviewStage:string;status:string;requestedAt:string};
type BusinessIntent={domain:string;primaryObjective:string;businessConcepts:string[];requiredDataCategories:string[];preferredDimensions:string[];preferredMeasures:string[];businessQuestions:string[];businessSummary:string};
type DraftField={id?:string;sourceColumnName:string;businessName:string;dataType:string;role:string;aggregation?:string;selected:boolean;score:number;profile:{totalRowCount?:number;sampleSize:number;nonNullCount:number;nonNullRatio?:number;nullRatio:number;distinctCount:number;distinctRatio?:number;zeroRatio?:number;blankRatio?:number;dominantValueRatio?:number;sampleValues:string[];profileMode?:string};reasons:string[]};
type DraftTable={tableId:string;sourceTableName:string;businessName:string;businessCategory:string;role:string;relevanceScore:number;rowCount:number;selectedFieldCount:number;excludedFieldCount:number;reasons:string[];fields:DraftField[]};
type BusinessContextDraft={modelName:string;modelDescription:string|null;businessDomain:string;businessObjective:string;businessSummary:string;businessQuestions:string[];dataCoverage:string[];selectedTables:DraftTable[];warnings:string[]};
type Workspace={model:Model;businessIntent:BusinessIntent;domains:Domain[];objects:ObjectRow[];fields:Field[];relationships:Relationship[];kpis:Kpi[];recommendations:Recommendation[];versions:Version[];glossary:Glossary[];reviews:Review[]};
type ObjectPreview={columns:Array<{name:string;dataType:string;sensitivityType:string}>;rows:Array<Record<string,unknown>>;rowLimit:number};
const tabs=["Overview","Business Objects","Fields","Relationships","KPI Catalogue","Validation","Versions","Audit Log"] as const;
const badge=(value:string)=><span className={`bc-status ${value.toLowerCase()}`}>{value.replaceAll("_"," ")}</span>;
export default function BusinessContextWorkspace({dataJson,role}:{dataJson:string;role:Role}){const data=JSON.parse(dataJson) as Workspace;const router=useRouter();const [tab,setTab]=useState<(typeof tabs)[number]>("Overview");const [busy,setBusy]=useState("");const [notice,setNotice]=useState("");const [error,setError]=useState("");const [validation,setValidation]=useState<{outcome:string;issues:Array<{code:string;severity:string;message:string}>}|null>(null);const editable=(role==="ADMIN"||role==="DATA_SOURCE_CREATOR")&&['DRAFT','CHANGES_REQUESTED'].includes(data.model.status);async function action(path:string,label:string,body:object={}){setBusy(label);setError("");setNotice("");const response=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await response.json();setBusy("");if(!response.ok){setError(result.error??"Action failed");return null;}setNotice(`${label} completed`);router.refresh();return result;}const fieldsByObject=useMemo(()=>new Map(data.objects.map((object)=>[object.id,data.fields.filter((field)=>field.businessObjectId===object.id)])),[data.objects,data.fields]);return <main className="bc-workspace"><header className="bc-model-head"><div><Link href="/business-context-models">← Business Context Models</Link><div className="bc-title-line"><h1>{data.model.name}</h1>{badge(data.model.status)}</div><p>{data.model.description||`${data.model.schemaName} governed business metadata`}</p><small>Oracle schema {data.model.schemaName} · Version {data.model.version} · Updated {new Date(data.model.updatedAt).toLocaleString()}</small></div><div className="bc-actions"><button className="secondary-button" disabled={Boolean(busy)} onClick={async()=>{const result=await action(`/api/business-context-models/${data.model.id}/validate`,"Validation");if(result)setValidation(result as typeof validation);setTab("Validation");}}>Validate</button>{editable&&['DRAFT','CHANGES_REQUESTED'].includes(data.model.status)&&<button className="primary-button" disabled={Boolean(busy)} onClick={()=>void action(`/api/business-context-models/${data.model.id}/submit-review`,"Submit review")}>Submit review</button>}{role==="ADMIN"&&data.model.status==="READY_FOR_REVIEW"&&<button className="primary-button" onClick={()=>void action(`/api/business-context-models/${data.model.id}/approve`,"Approval")}>Approve</button>}{role==="ADMIN"&&data.model.status==="APPROVED"&&<button className="primary-button" onClick={()=>void action(`/api/business-context-models/${data.model.id}/publish`,"Publish",{changeSummary:`Publish version ${data.model.version}`})}>Publish</button>}{data.model.status==="PUBLISHED"&&(role==="ADMIN"||role==="DATA_SOURCE_CREATOR")&&<button className="primary-button" onClick={()=>void action(`/api/business-context-models/${data.model.id}/create-version`,"Create version")}>Create new version</button>}</div></header>{error&&<div className="bc-alert error">{error}</div>}{notice&&<div className="bc-alert success">{notice}</div>}<nav className="bc-tabs" aria-label="Business Context sections">{tabs.map((item)=><button key={item} className={tab===item?"active":""} onClick={()=>setTab(item)}>{item}</button>)}</nav><section className="bc-tab-panel">{tab==="Overview"&&<Overview data={data}/>} {tab==="Business Objects"&&<ObjectsTab data={data} editable={editable}/>} {tab==="Fields"&&<FieldsTab modelId={data.model.id} fields={data.fields} editable={editable}/>} {tab==="Relationships"&&<RelationshipsTab data={data} fieldsByObject={fieldsByObject} editable={editable}/>} {tab==="KPI Catalogue"&&<KpisTab data={data} editable={editable} role={role}/>} {tab==="Validation"&&<ValidationTab result={validation}/>} {tab==="Versions"&&<VersionsTab data={data} role={role}/>} {tab==="Audit Log"&&<AuditTab model={data.model} role={role}/>}</section></main>}
function Overview({data}:{data:Workspace}){return <div className="bc-overview"><section className="bc-intent-summary"><div><p className="eyebrow">BUSINESS CONTEXT SUMMARY</p><h2>{data.businessIntent.domain}</h2><p>{data.businessIntent.businessSummary}</p></div><dl><div><dt>Primary objective</dt><dd>{data.businessIntent.primaryObjective}</dd></div><div><dt>Expected coverage</dt><dd>{data.businessIntent.businessConcepts.join(" · ")}</dd></div></dl><div><strong>Business questions</strong><ul>{data.businessIntent.businessQuestions.slice(0,5).map((question)=><li key={question}>{question}</li>)}</ul></div></section><section className="bc-summary"><article><span>Business objects</span><strong>{data.objects.length}</strong><small>{data.objects.filter((item)=>item.approvalStatus==='APPROVED').length} approved</small></article><article><span>Business fields</span><strong>{data.fields.length}</strong><small>{data.fields.filter((item)=>item.visibleToDashboardCreator).length} dashboard-visible</small></article><article><span>Relationships</span><strong>{data.relationships.length}</strong><small>{data.relationships.filter((item)=>item.validationStatus==='VALID').length} validated</small></article><article><span>KPIs</span><strong>{data.kpis.length}</strong><small>{data.kpis.filter((item)=>['APPROVED','CERTIFIED'].includes(item.status)).length} production-ready</small></article></section><div className="bc-three"><article className="workspace-card"><p className="eyebrow">MODEL HEALTH</p><h2>Governance readiness</h2><ul className="bc-checklist"><li className={data.objects.every((item)=>item.recordGrain)?'ok':'warn'}>Record grains documented</li><li className={data.relationships.every((item)=>item.validationStatus!=='INVALID')?'ok':'warn'}>Relationship validation</li><li className={data.fields.every((item)=>item.sensitivityClassification==='NONE'||!item.aiUsageAllowed)?'ok':'warn'}>Sensitive AI exclusions</li></ul></article><article className="workspace-card"><p className="eyebrow">WORKFLOW</p><h2>Current stage</h2><div className="workflow-track">{['DRAFT','AI_ANALYSIS','DATA_STEWARD_REVIEW','TECHNICAL_VALIDATION','BUSINESS_OWNER_REVIEW','APPROVED','PUBLISHED'].map((stage,index)=><div className={index<=(['DRAFT','AI_ANALYZING','READY_FOR_REVIEW','READY_FOR_REVIEW','READY_FOR_REVIEW','APPROVED','PUBLISHED'].indexOf(data.model.status))?'done':''} key={stage}><span>{index+1}</span><small>{stage.replaceAll('_',' ')}</small></div>)}</div></article><article className="workspace-card"><p className="eyebrow">LATEST REVIEW</p><h2>{data.reviews[0]?.reviewStage.replaceAll('_',' ')||'No review request'}</h2><p>{data.reviews[0]?`${data.reviews[0].status} · ${new Date(data.reviews[0].requestedAt).toLocaleString()}`:'Submit the draft when validation is ready.'}</p></article></div></div>}
function ObjectsTab({ data, editable }: { data: Workspace; editable: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tables, setTables] = useState<TableOption[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableOption | null>(null);
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<AiProgress | null>(null);
  const [generationElapsed, setGenerationElapsed] = useState(0);
  const [draft, setDraft] = useState<BusinessContextDraft | null>(null);
  const [savingField, setSavingField] = useState("");
  const [showExcluded, setShowExcluded] = useState(false);
  const [removing, setRemoving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewObject, setPreviewObject] = useState<ObjectRow | null>(null);
  const [preview, setPreview] = useState<ObjectPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [editingObject, setEditingObject] = useState<ObjectRow | null>(null);
  const [savingObject, setSavingObject] = useState(false);
  const [objectForm, setObjectForm] = useState({ businessName: "", description: "", recordGrain: "", objectType: "UNKNOWN" });
  const [form, setForm] = useState({ physicalTableId: "", businessName: "", recordGrain: "", objectType: "UNKNOWN" });

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        schema: data.model.schemaName,
        pageSize: "50",
      });
      if (query.trim()) params.set("q", query.trim());

      try {
        const response = await fetch(`/api/data-sources/${data.model.dataSourceId}/tables?${params}`, { signal: controller.signal });
        const body = await response.json() as TableResponse;
        if (!response.ok) throw new Error(body.error || "Unable to search synchronized objects");
        setTables(body.items ?? []);
        setTotal(body.total ?? 0);
      } catch (loadError) {
        if ((loadError as Error).name !== "AbortError") {
          setTables([]);
          setTotal(0);
          setError(loadError instanceof Error ? loadError.message : "Unable to search synchronized objects");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query.trim() ? 300 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [data.model.dataSourceId, data.model.schemaName, open, query]);

  function selectTable(table: TableOption) {
    setSelectedTable(table);
    setForm((current) => ({
      ...current,
      physicalTableId: table.id,
      businessName: table.businessName || toBusinessName(table.tableName),
      objectType: table.objectType === "VIEW" ? "VIEW" : "UNKNOWN",
    }));
  }

  async function create() {
    setCreating(true);
    setError("");
    try {
      const response = await fetch(`/api/business-context-models/${data.model.id}/business-objects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, mapFields: true, aiUsageAllowed: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to map business object");
      setOpen(false);
      setSelectedTable(null);
      setQuery("");
      setForm({ physicalTableId: "", businessName: "", recordGrain: "", objectType: "UNKNOWN" });
      router.refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to map business object");
    } finally {
      setCreating(false);
    }
  }

  async function generateDrafts() {
    setGenerating(true); setError(""); setNotice(""); setGenerationElapsed(0); setGenerationProgress({ stage: "CONNECTING", label: "Starting governed discovery", detail: "Opening a live progress connection to the Business Object generator.", percent: 2 });
    try {
      const response = await fetch(`/api/business-context-models/${data.model.id}/generate-business-objects`, { method: "POST", headers: { Accept: "text/event-stream" } });
      const body = await readAiProgressResponse<{createdCount:number;skippedNonMeasureCount:number;skippedEmptyCount:number;generationMode?:string;draft:BusinessContextDraft}>(response, setGenerationProgress);
      const fallback=body.generationMode?.includes("FALLBACK")?" · governed fallback used after the AI provider was slow or unavailable":"";
      setDraft(body.draft);
      setNotice(`${body.createdCount} Draft Business Object${body.createdCount === 1 ? "" : "s"} created${body.skippedNonMeasureCount ? ` · ${body.skippedNonMeasureCount} irrelevant, empty, or lower-ranked object${body.skippedNonMeasureCount === 1 ? "" : "s"} skipped` : ""}${body.skippedEmptyCount ? ` · ${body.skippedEmptyCount} object${body.skippedEmptyCount === 1 ? "" : "s"} without eligible populated fields skipped` : ""}${fallback}`);
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to generate Draft Business Objects"); }
    finally { setGenerating(false); }
  }

  useEffect(() => { if (!generating) return; const started = Date.now(); const timer = window.setInterval(() => setGenerationElapsed(Math.floor((Date.now() - started) / 1000)), 1000); return () => window.clearInterval(timer); }, [generating]);

  async function updateDraftField(tableId:string, field:DraftField, changes:Partial<DraftField>) {
    if (!field.id) return;
    setSavingField(field.id); setError("");
    const next={...field,...changes};
    const fieldRole=next.selected?(next.role==="measure"?"MEASURE":next.role==="date"?"DATE_DIMENSION":next.role==="status"?"STATUS_DIMENSION":next.role==="identifier"?"IDENTIFIER":next.role==="relationship_key"?"FOREIGN_KEY":next.role==="technical"?"TECHNICAL_FIELD":"DIMENSION"):"IGNORED";
    try {
      const response=await fetch(`/api/business-fields/${field.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({businessName:next.businessName,fieldRole,aggregationRule:fieldRole==="MEASURE"?(next.aggregation||"SUM").toUpperCase():"NONE",aiUsageAllowed:next.selected,visibleToDashboardCreator:next.selected})});
      const body=await response.json();if(!response.ok)throw new Error(body.error||"Unable to update Draft Business Field");
      setDraft(current=>current?{...current,selectedTables:current.selectedTables.map(table=>table.tableId===tableId?{...table,selectedFieldCount:table.fields.filter(item=>(item.id===field.id?next:item).selected).length,excludedFieldCount:table.fields.filter(item=>!(item.id===field.id?next:item).selected).length,fields:table.fields.map(item=>item.id===field.id?next:item)}:table)}:current);
      setNotice(`${next.businessName} updated`);
    } catch(reason){setError(reason instanceof Error?reason.message:"Unable to update Draft Business Field");}
    finally{setSavingField("");}
  }

  async function removeObject(object: ObjectRow) {
    if (!window.confirm(`Remove ${object.businessName} and its mapped fields from this draft?`)) return;
    setRemoving(object.id); setError("");
    try {
      const response = await fetch(`/api/business-objects/${object.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to remove Business Object");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to remove Business Object"); }
    finally { setRemoving(""); }
  }

  function editObject(object:ObjectRow){setEditingObject(object);setObjectForm({businessName:object.businessName,description:object.description??"",recordGrain:object.recordGrain??"",objectType:object.objectType});setError("");}

  async function saveObject(){if(!editingObject)return;setSavingObject(true);setError("");try{const response=await fetch(`/api/business-objects/${editingObject.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...objectForm,description:objectForm.description||null,recordGrain:objectForm.recordGrain||null})});const body=await response.json();if(!response.ok)throw new Error(body.error||"Unable to update Business Object");setEditingObject(null);setNotice(`${objectForm.businessName} updated`);router.refresh();}catch(reason){setError(reason instanceof Error?reason.message:"Unable to update Business Object");}finally{setSavingObject(false);}}

  async function showSample(object: ObjectRow) {
    setPreviewObject(object); setPreview(null); setPreviewError(""); setPreviewLoading(true);
    try {
      const response = await fetch(`/api/data-sources/${object.dataSourceId}/tables/${object.physicalTableId}/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rowLimit: 10 }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load sample data");
      setPreview(body as ObjectPreview);
    } catch (reason) { setPreviewError(reason instanceof Error ? reason.message : "Unable to load sample data"); }
    finally { setPreviewLoading(false); }
  }

  useEffect(() => {
    if (!previewObject) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setPreviewObject(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [previewObject]);

  const mappedIds = new Set(data.objects.map((object) => object.physicalTableId));
  const availableTables = tables.filter((table) => !mappedIds.has(table.id));

  return <>
    <div className="bc-section-head">
      <div><p className="eyebrow">BUSINESS OBJECTS</p><h2>Physical-to-business mapping</h2></div>
      {editable && <div className="bc-object-actions"><button className="secondary-button" disabled={generating || Boolean(removing)} onClick={() => void generateDrafts()}>{generating && <span className="button-spinner" />} {generating ? "Checking tables…" : "✦ Generate draft business objects"}</button><button className="primary-button" onClick={() => setOpen(true)}>＋ Map object</button></div>}
    </div>
    {generating&&generationProgress&&<section className="ai-generation-panel"><AiGenerationProgress progress={generationProgress} elapsed={generationElapsed}/></section>}
    {error && !open && <div className="bc-alert error" role="alert">{error}</div>}
    {notice && <div className="bc-alert success" role="status">{notice}</div>}
    {draft&&<DraftReview draft={draft} editable={editable} savingField={savingField} showExcluded={showExcluded} setShowExcluded={setShowExcluded} updateField={updateDraftField}/>}
    <div className="bc-object-grid">{data.objects.map((object) => <article className={editable ? "has-object-admin" : ""} key={object.id}><button type="button" className="business-object-preview" aria-label={`View sample data for ${object.businessName}`} title="View top 10 sample rows" disabled={previewLoading} onClick={() => void showSample(object)}><TableIcon /></button>{editable&&<button type="button" className="business-object-edit" aria-label={`Edit ${object.businessName}`} title="Edit Business Object" disabled={savingObject||generating} onClick={()=>editObject(object)}><EditIcon/></button>}{editable && <button type="button" className="business-object-delete" aria-label={`Remove ${object.businessName}`} title="Remove Business Object" disabled={Boolean(removing) || generating} onClick={() => void removeObject(object)}>{removing === object.id ? <span className="button-spinner" /> : <TrashIcon />}</button>}<div><span>{object.objectType.replaceAll("_", " ")}</span>{badge(object.approvalStatus)}</div><h3>{object.businessName}</h3><p>{object.description || "Business description pending review."}</p><dl><div><dt>Physical source</dt><dd>{object.databaseSchema}.{object.technicalName}</dd></div><div><dt>Record grain</dt><dd className={!object.recordGrain ? "missing" : ""}>{editable?<button type="button" onClick={()=>editObject(object)}>{object.recordGrain||"Missing — click to define"}</button>:object.recordGrain||"Missing — required before approval"}</dd></div></dl><small>{fieldsCount(data.fields, object.id)} mapped fields</small></article>)}</div>
    {previewObject && <div className="modal-backdrop business-object-preview-backdrop" role="presentation" onMouseDown={() => setPreviewObject(null)}><section className="modal business-object-preview-modal" role="dialog" aria-modal="true" aria-labelledby="business-object-preview-title" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" aria-label="Close sample data" autoFocus onClick={() => setPreviewObject(null)}>×</button><p className="eyebrow">SAMPLE DATA · TOP 10</p><h2 id="business-object-preview-title">{previewObject.businessName}</h2><p>{previewObject.databaseSchema}.{previewObject.technicalName} · Read-only preview with sensitivity masking.</p>{previewLoading && <div className="business-object-preview-state" role="status"><span className="insight-spinner"/><strong>Loading sample data…</strong></div>}{previewError && <div className="bc-alert error" role="alert">{previewError}</div>}{preview && !previewLoading && <div className="business-object-preview-table"><table><thead><tr>{preview.columns.map((column) => <th key={column.name}><span>{column.name}</span><small>{column.dataType}</small></th>)}</tr></thead><tbody>{preview.rows.map((row, rowIndex) => <tr key={rowIndex}>{preview.columns.map((column) => <td key={column.name}><code>{formatPreviewValue(row[column.name])}</code></td>)}</tr>)}</tbody></table>{!preview.rows.length && <div className="business-object-preview-empty">No sample rows found.</div>}</div>}</section></div>}
    {editingObject&&<div className="modal-backdrop" role="presentation" onMouseDown={()=>!savingObject&&setEditingObject(null)}><section className="modal business-object-edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-business-object-title" onMouseDown={event=>event.stopPropagation()}><button type="button" className="modal-close" aria-label="Close" disabled={savingObject} onClick={()=>setEditingObject(null)}>×</button><p className="eyebrow">EDIT BUSINESS OBJECT</p><h2 id="edit-business-object-title">{editingObject.businessName}</h2><p className="business-object-edit-source">{editingObject.databaseSchema}.{editingObject.technicalName}</p><div className="form-stack"><label>Business name<input autoFocus value={objectForm.businessName} onChange={event=>setObjectForm({...objectForm,businessName:event.target.value})}/></label><label>Description<textarea rows={3} value={objectForm.description} onChange={event=>setObjectForm({...objectForm,description:event.target.value})} placeholder="Explain the business meaning of this object"/></label><label>Record grain <span className="field-required">Required before approval</span><input value={objectForm.recordGrain} onChange={event=>setObjectForm({...objectForm,recordGrain:event.target.value})} placeholder="One purchase order line per part, order, and line number"/><small>Describe exactly what one row represents. This protects KPIs from duplicate aggregation.</small></label><label>Object type<select value={objectForm.objectType} onChange={event=>setObjectForm({...objectForm,objectType:event.target.value})}>{["TRANSACTION","MASTER_DATA","REFERENCE_DATA","SNAPSHOT","AGGREGATE","BRIDGE","VIEW","UNKNOWN"].map(value=><option value={value} key={value}>{value.replaceAll("_"," ")}</option>)}</select></label></div>{error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="secondary-button" disabled={savingObject} onClick={()=>setEditingObject(null)}>Cancel</button><button className="primary-button" disabled={savingObject||objectForm.businessName.trim().length<2||objectForm.recordGrain.trim().length<3} onClick={()=>void saveObject()}>{savingObject&&<span className="button-spinner"/>}{savingObject?"Saving…":"Save Business Object"}</button></div></section></div>}
    {open && <div className="bc-drawer">
      <button onClick={() => setOpen(false)} aria-label="Close">×</button>
      <p className="eyebrow">MAP PHYSICAL METADATA</p>
      <h2>Add Business Object</h2>
      <div className="form-stack">
        <label htmlFor="business-object-search">Search Oracle table or view
          <span className="bc-object-search">
            <span aria-hidden="true">⌕</span>
            <input id="business-object-search" type="search" autoFocus autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a table, view, or business name…" />
            {loading && <span className="button-spinner bc-search-spinner" aria-label="Searching" />}
          </span>
        </label>
        <div className="bc-object-results-head" aria-live="polite">
          <span>{loading ? "Searching synchronized metadata…" : `${total.toLocaleString()} matching objects`}</span>
          {query && <button type="button" onClick={() => setQuery("")}>Clear</button>}
        </div>
        <div className="bc-object-picker" role="listbox" aria-label="Available Oracle tables and views" aria-busy={loading}>
          {availableTables.map((table) => <button type="button" role="option" aria-selected={form.physicalTableId === table.id} className={form.physicalTableId === table.id ? "selected" : ""} key={table.id} onClick={() => selectTable(table)}>
            <span className={`bc-picker-icon ${table.objectType.toLowerCase()}`} aria-hidden="true">{table.objectType === "TABLE" ? "▦" : "◫"}</span>
            <span><strong>{table.businessName || table.tableName}</strong><small>{table.schemaName}.{table.tableName}</small></span>
            <em>{table.objectType}</em>
          </button>)}
          {!loading && !availableTables.length && !error && <div className="bc-picker-empty"><strong>No available objects found</strong><span>{query ? "Try another table or view name." : "All matching objects may already be mapped."}</span></div>}
        </div>
        {selectedTable && <div className="bc-selected-object"><span>Selected physical object</span><strong>{selectedTable.schemaName}.{selectedTable.tableName}</strong></div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <label>Business name<input value={form.businessName} onChange={(event) => setForm({ ...form, businessName: event.target.value })} /></label>
        <label>Record grain<input value={form.recordGrain} onChange={(event) => setForm({ ...form, recordGrain: event.target.value })} placeholder="One purchase order line" /></label>
        <button className="primary-button" onClick={() => void create()} disabled={creating || !form.physicalTableId || !form.businessName}>{creating && <span className="button-spinner" aria-hidden="true" />}{creating ? "Mapping object…" : "Map object and columns"}</button>
      </div>
    </div>}
  </>;
}

function DraftReview({draft,editable,savingField,showExcluded,setShowExcluded,updateField}:{draft:BusinessContextDraft;editable:boolean;savingField:string;showExcluded:boolean;setShowExcluded:(value:boolean)=>void;updateField:(tableId:string,field:DraftField,changes:Partial<DraftField>)=>Promise<void>}){
  return <section className="bc-draft-review" aria-labelledby="draft-review-title">
    <header><div><p className="eyebrow">AI DRAFT REVIEW</p><h2 id="draft-review-title">{draft.businessDomain}</h2><p>{draft.businessSummary}</p></div></header>
    <div className="bc-draft-context"><div><span>Business objective</span><strong>{draft.businessObjective}</strong></div><div><span>Data coverage</span><strong>{draft.dataCoverage.join(" · ")}</strong></div><div><span>Questions to answer</span><ul>{draft.businessQuestions.slice(0,5).map(question=><li key={question}>{question}</li>)}</ul></div></div>
    {draft.warnings.map(warning=><div className="bc-alert" key={warning}>{warning}</div>)}
    <div className="bc-draft-toolbar"><strong>{draft.selectedTables.length} selected tables/views</strong><label><input type="checkbox" checked={showExcluded} onChange={event=>setShowExcluded(event.target.checked)}/> Show excluded fields</label></div>
    <div className="bc-draft-tables">{draft.selectedTables.map(table=><details open key={table.tableId}><summary><span><strong>{table.businessName}</strong><small>{table.sourceTableName} · {table.role} · {table.rowCount.toLocaleString()} estimated rows</small></span><span className="bc-score">{table.relevanceScore}<small>relevance</small></span><span>{table.selectedFieldCount} selected · {table.excludedFieldCount} excluded</span></summary><div className="bc-table-reasons">{table.reasons.map(reason=><span key={reason}>✓ {reason}</span>)}</div><div className="table-wrap bc-draft-field-table"><table><thead><tr><th>Use</th><th>Business field</th><th>Source / type</th><th>Analytical role</th><th>Aggregation</th><th>Profile &amp; evidence</th><th>Score</th></tr></thead><tbody>{table.fields.filter(field=>showExcluded||field.selected).map(field=><tr className={field.selected?"":"excluded"} key={field.sourceColumnName}><td><input type="checkbox" aria-label={`Use ${field.businessName}`} checked={field.selected} disabled={!editable||savingField===field.id} onChange={event=>void updateField(table.tableId,field,{selected:event.target.checked})}/></td><td><input aria-label={`Business name for ${field.sourceColumnName}`} defaultValue={field.businessName} disabled={!editable||savingField===field.id} onBlur={event=>{if(event.target.value!==field.businessName)void updateField(table.tableId,field,{businessName:event.target.value});}}/></td><td><code>{field.sourceColumnName}</code><small>{field.dataType}</small></td><td><select value={field.role} disabled={!editable||savingField===field.id} onChange={event=>void updateField(table.tableId,field,{role:event.target.value})}>{["identifier","dimension","description","date","status","measure","relationship_key","technical"].map(role=><option key={role} value={role}>{role.replaceAll("_"," ")}</option>)}</select></td><td>{field.role==="measure"?<select value={(field.aggregation||"sum").toLowerCase()} disabled={!editable||savingField===field.id} onChange={event=>void updateField(table.tableId,field,{aggregation:event.target.value})}><option value="sum">SUM</option><option value="average">AVERAGE</option><option value="minimum">MINIMUM</option><option value="maximum">MAXIMUM</option></select>:<span>—</span>}</td><td><div className="bc-profile"><span>{Math.round((field.profile.nonNullRatio??(field.profile.sampleSize?field.profile.nonNullCount/field.profile.sampleSize:0))*100)}% non-null</span><span>{field.profile.distinctCount.toLocaleString()} distinct</span>{field.profile.zeroRatio!==undefined&&<span>{Math.round(field.profile.zeroRatio*100)}% zero</span>}<small>{field.profile.profileMode==="SAMPLED_ESTIMATE"?`Profiled sample: ${field.profile.sampleSize.toLocaleString()} rows · `:""}{field.profile.sampleValues.slice(0,3).join(" · ")||"No safe sample values"}</small><em>{field.reasons.join(" · ")}</em></div></td><td><span className={`bc-field-score ${field.score>=60?"good":"low"}`}>{field.score}</span>{savingField===field.id&&<span className="button-spinner"/>}</td></tr>)}</tbody></table></div></details>)}</div>
  </section>
}

type TableOption = {
  id: string;
  schemaName: string;
  tableName: string;
  businessName?: string | null;
  objectType: "TABLE" | "VIEW";
};

type TableResponse = {
  items?: TableOption[];
  total?: number;
  error?: string;
};

function toBusinessName(value: string) {
  return value.replace(/_TAB$/, "").split("_").filter(Boolean).map((part) => part[0] + part.slice(1).toLowerCase()).join(" ");
}
const fieldsCount=(fields:Field[],id:string)=>fields.filter((field)=>field.businessObjectId===id).length;
function FieldsTab({modelId,fields,editable}:{modelId:string;fields:Field[];editable:boolean}){
  const router=useRouter();
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [descriptions,setDescriptions]=useState<Record<string,string>>(()=>Object.fromEntries(fields.map((field)=>[field.id,field.description?.trim()||field.businessName])));
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [objectFilter,setObjectFilter]=useState('');
  async function update(id:string,changes:object){setError('');const response=await fetch(`/api/business-fields/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(changes)});const body=await response.json();if(!response.ok){setError(body.error??'Unable to update Business Field');return false;}router.refresh();return true;}
  async function describe(field:Field){setBusy(`describe-${field.id}`);setError('');const response=await fetch(`/api/business-fields/${field.id}/describe`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const body=await response.json();setBusy('');if(!response.ok){setError(body.error??'AI description is unavailable');return;}setDescriptions((current)=>({...current,[field.id]:body.field.description??''}));router.refresh();}
  async function removeSelected(){if(!selected.size||!window.confirm(`Remove ${selected.size} selected Business Field${selected.size===1?'':'s'} from this draft?`))return;setBusy('remove');setError('');const response=await fetch(`/api/business-context-models/${modelId}/fields/remove`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fieldIds:[...selected]})});const body=await response.json();setBusy('');if(!response.ok){setError(body.error??'Unable to remove selected fields');return;}setSelected(new Set());router.refresh();}
  const objectOptions=useMemo(()=>[...new Map(fields.map((field)=>[field.businessObjectId,field.businessObjectName])).entries()].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name)),[fields]);
  const visibleFields=useMemo(()=>objectFilter?fields.filter((field)=>field.businessObjectId===objectFilter):fields,[fields,objectFilter]);
  const allSelected=visibleFields.length>0&&visibleFields.every((field)=>selected.has(field.id));
  function toggle(id:string){setSelected((current)=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});}
  function toggleAllVisible(){setSelected((current)=>{const next=new Set(current);for(const field of visibleFields){if(allSelected)next.delete(field.id);else next.add(field.id);}return next;});}
  const columnCount=editable?8:7;
  return <>
    <div className="bc-section-head fields-section-head">
      <div><p className="eyebrow">BUSINESS FIELDS</p><h2>Meaning, role, and aggregation</h2></div>
      <div>
        <label className="fields-object-filter">
          <span>Filter by object</span>
          <select value={objectFilter} onChange={(event)=>setObjectFilter(event.target.value)}>
            <option value="">All objects</option>
            {objectOptions.map((object)=><option key={object.id} value={object.id}>{object.name}</option>)}
          </select>
        </label>
        <span>{visibleFields.length===fields.length?`${fields.length} active fields`:`${visibleFields.length} of ${fields.length} fields`}</span>
        {editable&&<button className="danger-button fields-remove-button" disabled={!selected.size||Boolean(busy)} onClick={()=>void removeSelected()}>⌫ Remove selected {selected.size?`(${selected.size})`:''}</button>}
      </div>
    </div>
    {error&&<div className="bc-alert error" role="alert">{error}</div>}
    <section className="table-card fields-table"><div className="table-wrap"><table>
      <thead><tr>
        {editable&&<th className="field-select-cell"><input type="checkbox" checked={allSelected} aria-label="Select all visible Business Fields" onChange={toggleAllVisible}/></th>}
        <th>Business field</th><th>Object</th><th>Physical</th><th>Description</th><th>Business type</th><th>Role</th><th>Aggregation</th>
      </tr></thead>
      <tbody>
        {visibleFields.map((field)=><tr key={field.id} className={selected.has(field.id)?'selected-field-row':''}>
          {editable&&<td className="field-select-cell"><input type="checkbox" checked={selected.has(field.id)} aria-label={`Select ${field.businessName}`} onChange={()=>toggle(field.id)}/></td>}
          <td><strong>{field.businessName}</strong></td>
          <td className="field-object-cell"><strong>{field.businessObjectName}</strong></td>
          <td><code>{field.physicalColumnName}</code><small className="ds-sub">{field.physicalDataType}</small></td>
          <td className="field-description-cell">{editable?<div><textarea rows={2} value={descriptions[field.id]??field.businessName} onChange={(event)=>setDescriptions({...descriptions,[field.id]:event.target.value})} onBlur={()=>{const value=descriptions[field.id]?.trim()||field.businessName;if(value!==(field.description??null))void update(field.id,{description:value});}} aria-label={`${field.businessName} description`}/><button type="button" className="field-ai-button" title="Generate description with AI" aria-label={`Generate description for ${field.businessName}`} disabled={Boolean(busy)} onClick={()=>void describe(field)}>{busy===`describe-${field.id}`?<span className="button-spinner"/>:<span aria-hidden="true">✦</span>} AI</button></div>:<span>{field.description||field.businessName}</span>}</td>
          <td>{editable?<select value={field.businessType} onChange={(event)=>void update(field.id,{businessType:event.target.value})}>{['TEXT','NUMBER','CURRENCY','PERCENTAGE','BOOLEAN','DATE','DATETIME','DURATION','QUANTITY','STATUS','IDENTIFIER','UNKNOWN'].map((value)=><option key={value}>{value}</option>)}</select>:field.businessType}</td>
          <td>{editable?<select value={field.fieldRole} onChange={(event)=>void update(field.id,{fieldRole:event.target.value})}>{['DIMENSION','MEASURE','IDENTIFIER','DATE_DIMENSION','STATUS_DIMENSION','FOREIGN_KEY','TECHNICAL_FIELD','SENSITIVE_FIELD','IGNORED'].map((value)=><option key={value}>{value}</option>)}</select>:field.fieldRole}</td>
          <td>{editable?<select value={field.aggregationRule} onChange={(event)=>void update(field.id,{aggregationRule:event.target.value})}>{['SUM','AVERAGE','COUNT','COUNT_DISTINCT','MINIMUM','MAXIMUM','LATEST','EARLIEST','NONE','CUSTOM'].map((value)=><option key={value}>{value}</option>)}</select>:field.aggregationRule}</td>
        </tr>)}
        {!visibleFields.length&&<tr><td className="fields-empty-row" colSpan={columnCount}>No Business Fields match this object.</td></tr>}
      </tbody>
    </table></div></section>
  </>}
function formatPreviewValue(value:unknown){if(value==null)return '—';if(typeof value==='object'){try{return JSON.stringify(value);}catch{return String(value);}}return String(value)}
function TableIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16M15 4v16"/></svg>}
function EditIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-.8 4 4-.8L18.5 7.9l-3.2-3.2L4 16Z"/><path d="m13.8 6.2 3.2 3.2"/></svg>}
function TrashIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>}
function RelationshipsTab({data,fieldsByObject,editable}:{data:Workspace;fieldsByObject:Map<string,Field[]>;editable:boolean}){const router=useRouter();const first=data.objects[0]?.id??'';const second=data.objects[1]?.id??first;const [form,setForm]=useState({sourceObjectId:first,sourceFieldId:fieldsByObject.get(first)?.[0]?.id??'',targetObjectId:second,targetFieldId:fieldsByObject.get(second)?.[0]?.id??'',joinType:'LEFT',cardinality:'MANY_TO_ONE'});async function create(){const response=await fetch(`/api/business-context-models/${data.model.id}/relationships`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});if(response.ok)router.refresh();}async function validate(id:string){await fetch(`/api/business-relationships/${id}/validate`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});router.refresh();}return <><div className="bc-section-head"><div><p className="eyebrow">RELATIONSHIP BUILDER</p><h2>Grain-aware object graph</h2></div><span>Drag objects · zoom · validate joins</span></div><RelationshipCanvas objects={data.objects as never[]} relationships={data.relationships as never[]} editable={editable}/>{editable&&data.objects.length>=2&&<div className="relationship-form"><label>Source object<select value={form.sourceObjectId} onChange={(event)=>{const id=event.target.value;setForm({...form,sourceObjectId:id,sourceFieldId:fieldsByObject.get(id)?.[0]?.id??''});}}>{data.objects.map((item)=><option value={item.id} key={item.id}>{item.businessName}</option>)}</select></label><label>Source field<select value={form.sourceFieldId} onChange={(event)=>setForm({...form,sourceFieldId:event.target.value})}>{(fieldsByObject.get(form.sourceObjectId)??[]).map((item)=><option value={item.id} key={item.id}>{item.businessName}</option>)}</select></label><label>Target object<select value={form.targetObjectId} onChange={(event)=>{const id=event.target.value;setForm({...form,targetObjectId:id,targetFieldId:fieldsByObject.get(id)?.[0]?.id??''});}}>{data.objects.map((item)=><option value={item.id} key={item.id}>{item.businessName}</option>)}</select></label><label>Target field<select value={form.targetFieldId} onChange={(event)=>setForm({...form,targetFieldId:event.target.value})}>{(fieldsByObject.get(form.targetObjectId)??[]).map((item)=><option value={item.id} key={item.id}>{item.businessName}</option>)}</select></label><label>Cardinality<select value={form.cardinality} onChange={(event)=>setForm({...form,cardinality:event.target.value})}>{['ONE_TO_ONE','ONE_TO_MANY','MANY_TO_ONE','MANY_TO_MANY','UNKNOWN'].map((item)=><option key={item}>{item}</option>)}</select></label><button className="primary-button" onClick={()=>void create()}>Connect fields</button></div>}<div className="relationship-list">{data.relationships.map((rel)=><article key={rel.id}><div><strong>{data.objects.find((item)=>item.id===rel.sourceObjectId)?.businessName} → {data.objects.find((item)=>item.id===rel.targetObjectId)?.businessName}</strong><small>{rel.joinType} · {rel.cardinality.replaceAll('_',' ')}</small></div>{badge(rel.validationStatus)}{editable&&<button className="secondary-button" onClick={()=>void validate(rel.id)}>Run read-only validation</button>}</article>)}</div></>}
function KpisTab({data,editable,role}:{data:Workspace;editable:boolean;role:Role}){
  type KpiAnalysis={businessProcess?:string;rowGrain?:string;importantEntities?:string[];recommendedDimensions?:string[];recommendedMeasures?:string[];businessQuestions?:string[];recommendedVisualizations?:string[];dataQualityWarnings?:string[];excludedColumns?:Array<{field:string;classification:string;reasons:string[]}>};
  type KpiResult={createdCount:number;profiledFieldCount:number;excludedFieldCount:number;generationMode?:string;analysis?:KpiAnalysis};
  type AutoCertifyResult={totalCount:number;certifiedCount:number;alreadyCertifiedCount:number;skippedCount:number;results:Array<{id:string;name:string;result:'CERTIFIED'|'ALREADY_CERTIFIED'|'SKIPPED';validationOutcome?:string;reason?:string}>};
  const router=useRouter();const [busy,setBusy]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');const [analysis,setAnalysis]=useState<KpiAnalysis|null>(null);const [progress,setProgress]=useState<AiProgress|null>(null);const [elapsed,setElapsed]=useState(0);const [autoResult,setAutoResult]=useState<AutoCertifyResult|null>(null);
  useEffect(()=>{if(busy!=='generate')return;const started=Date.now();const timer=window.setInterval(()=>setElapsed(Math.floor((Date.now()-started)/1000)),1000);return()=>window.clearInterval(timer);},[busy]);
  async function generate(){
    setBusy('generate');setError('');setNotice('');setAnalysis(null);setElapsed(0);setProgress({stage:'CONNECTING',label:'Starting governed analysis',detail:'Opening a live progress connection to the KPI generator.',percent:2});
    try{
      const response=await fetch(`/api/business-context-models/${data.model.id}/generate-kpis`,{method:'POST',headers:{'Content-Type':'application/json','Accept':'text/event-stream'},body:'{}'});
      const completed=await readAiProgressResponse<KpiResult>(response,setProgress);setProgress({stage:'COMPLETE',label:'Draft KPIs are ready',detail:'Profiling, candidate checks, and draft creation completed.',percent:100});setAnalysis(completed.analysis??null);
      const fallback=completed.generationMode?.includes('FALLBACK')?' · governed fallback used after the AI provider was slow or unavailable':'';
      setNotice(`${completed.createdCount} KPI draft${completed.createdCount===1?'':'s'} created · ${completed.profiledFieldCount} fields profiled · ${completed.excludedFieldCount} fields excluded${fallback}`);router.refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:'Unable to generate KPI drafts');}
    finally{setBusy('');}
  }
  async function remove(kpi:Kpi){if(!window.confirm(`Delete KPI draft “${kpi.name}”?`))return;setBusy(kpi.id);setError('');const response=await fetch(`/api/kpis/${kpi.id}`,{method:'DELETE'});const body=await response.json();setBusy('');if(!response.ok){setError(body.error??'Unable to delete KPI');return;}router.refresh();}
  async function autoCertify(){if(!window.confirm('Validate, approve, and certify every eligible KPI in this Business Context? KPIs with validation errors will be skipped.'))return;setBusy('auto-certify');setError('');setNotice('');setAutoResult(null);try{const response=await fetch(`/api/business-context-models/${data.model.id}/auto-certify-kpis`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const body=await response.json() as AutoCertifyResult&{error?:string};if(!response.ok)throw new Error(body.error||'Unable to auto approve and certify KPIs');setAutoResult(body);setNotice(`${body.certifiedCount} KPI${body.certifiedCount===1?'':'s'} approved and certified${body.alreadyCertifiedCount?` · ${body.alreadyCertifiedCount} already certified`:''}${body.skippedCount?` · ${body.skippedCount} skipped`:''}`);router.refresh();}catch(reason){setError(reason instanceof Error?reason.message:'Unable to auto approve and certify KPIs');}finally{setBusy('');}}
  return <><div className="bc-section-head"><div><p className="eyebrow">KPI CATALOGUE</p><h2>Measures built on governed context</h2></div><div className="kpi-catalogue-actions">{role==='ADMIN'&&data.kpis.some((kpi)=>kpi.status!=='CERTIFIED')&&<button className="secondary-button kpi-auto-certify" type="button" disabled={Boolean(busy)} onClick={()=>void autoCertify()}>{busy==='auto-certify'&&<span className="button-spinner"/>}{busy==='auto-certify'?'Validating KPIs…':'✓ Auto Approve & Certify'}</button>}<Link className="primary-button" href={`/kpi-catalogue?modelId=${data.model.id}`}>Open KPI Catalogue</Link></div></div>{editable&&<section className={`kpi-ai-generator ${busy==='generate'?'is-running':''}`}><span aria-hidden="true">✦</span><div><strong>Generate profiled Draft KPIs with AI</strong><p>Profiles up to 2,000 rows per object, classifies dimensions and measures, and excludes empty, constant, zero-only, technical, or high-null fields. Only governed non-sensitive sample values and statistics are sent to AI.</p></div><button className="secondary-button" disabled={Boolean(busy)} onClick={()=>void generate()}>{busy==='generate'&&<span className="button-spinner"/>}{busy==='generate'?'Generating…':'Generate Draft KPIs'}</button>{busy==='generate'&&progress&&<div className="kpi-ai-progress" role="status" aria-live="polite"><div className="kpi-ai-progress-head"><div><span className="kpi-ai-live-dot" aria-hidden="true"/><strong>{progress.label}</strong></div><small>Live · {elapsed}s</small></div><p>{progress.detail}</p><div className="kpi-ai-progress-track" aria-label={`${progress.percent}% complete`}><i style={{width:`${progress.percent}%`}}/></div><footer><span>{progress.percent}%</span><span>Processing stages are shown; private model reasoning is not exposed.</span></footer></div>}</section>}{error&&<div className="bc-alert error" role="alert">{error}</div>}{notice&&<div className="bc-alert success" role="status">{notice}</div>}{autoResult&&autoResult.skippedCount>0&&<details className="kpi-auto-result"><summary>{autoResult.skippedCount} KPI{autoResult.skippedCount===1?' was':'s were'} skipped — view reasons</summary><ul>{autoResult.results.filter((item)=>item.result==='SKIPPED').map((item)=><li key={item.id}><strong>{item.name}</strong><span>{item.reason||'Not eligible for certification'}</span></li>)}</ul></details>}{analysis&&<section className="kpi-analysis-result"><h3>AI business analysis</h3><div className="kpi-analysis-grid"><article><strong>Business process</strong><p>{analysis.businessProcess||'Not determined'}</p></article><article><strong>Row grain</strong><p>{analysis.rowGrain||'Not documented'}</p></article><article><strong>Important entities</strong><p>{analysis.importantEntities?.join(', ')||'—'}</p></article><article><strong>Dimensions</strong><p>{analysis.recommendedDimensions?.join(', ')||'—'}</p></article><article><strong>Measures</strong><p>{analysis.recommendedMeasures?.join(', ')||'—'}</p></article><article><strong>Business questions</strong><p>{analysis.businessQuestions?.join(' · ')||'—'}</p></article><article><strong>Visualizations</strong><p>{analysis.recommendedVisualizations?.join(', ')||'—'}</p></article><article><strong>Data quality warnings</strong><p>{analysis.dataQualityWarnings?.join(' · ')||'None'}</p></article></div>{Boolean(analysis.excludedColumns?.length)&&<details><summary>Excluded columns ({analysis.excludedColumns?.length})</summary><ul>{analysis.excludedColumns?.map((item)=><li key={`${item.field}-${item.classification}`}><strong>{item.field}</strong> · {item.classification.replaceAll('_',' ')} — {item.reasons.join(', ')}</li>)}</ul></details>}</section>}<div className="kpi-grid">{data.kpis.map((kpi)=><article className="kpi-context-card" key={kpi.id}><Link href={`/kpi-catalogue/${kpi.id}`}><span>{kpi.code}</span><h3>{kpi.name}</h3><p>{kpi.description||'Definition pending review.'}</p><footer>{badge(kpi.status)}<small>{kpi.certificationStatus.replaceAll('_',' ')}</small></footer></Link>{editable&&<button className="kpi-card-delete" type="button" disabled={Boolean(busy)} onClick={()=>void remove(kpi)} aria-label={`Delete ${kpi.name}`} title="Delete KPI"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M9 7l1-3h4l1 3m-9 0 1 13h10l1-13"/></svg></button>}</article>)}{!data.kpis.length&&<div className="workspace-empty"><span>∑</span><strong>No KPIs defined</strong><p>Generate governed drafts with AI or create one manually in KPI Catalogue.</p></div>}</div></>}
function ValidationTab({result}:{result:{outcome:string;issues:Array<{code:string;severity:string;message:string}>}|null}){return <><div className="bc-section-head"><div><p className="eyebrow">VALIDATION</p><h2>Publication readiness checks</h2></div>{result&&badge(result.outcome)}</div>{result?<div className="validation-list">{result.issues.map((issue,index)=><article className={issue.severity.toLowerCase()} key={`${issue.code}-${index}`}><span>{issue.severity}</span><div><strong>{issue.code.replaceAll('_',' ')}</strong><p>{issue.message}</p></div></article>)}</div>:<div className="workspace-empty"><span>✓</span><strong>Run validation</strong><p>Check record grains, field roles, aggregations, sensitivity rules, relationships, and KPI readiness.</p></div>}</>}
function VersionsTab({data,role}:{data:Workspace;role:Role}){const router=useRouter();async function rollback(id:string){if(!confirm('Publish a new version based on this snapshot? Historical versions will remain unchanged.'))return;await fetch(`/api/business-context-models/${data.model.id}/rollback`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceVersionId:id,changeSummary:'Governed rollback'})});router.refresh();}return <><div className="bc-section-head"><div><p className="eyebrow">IMMUTABLE HISTORY</p><h2>Published versions</h2></div><span>Rollback creates a new version</span></div><div className="version-list">{data.versions.map((version)=><article key={version.id}><span>v{version.versionNumber}</span><div><strong>{version.changeSummary||'Published Business Context snapshot'}</strong><small>{new Date(version.publishedAt||version.createdAt).toLocaleString()}</small></div>{badge(version.status)}{role==='ADMIN'&&<button className="secondary-button" onClick={()=>void rollback(version.id)}>Roll back from this</button>}</article>)}</div></>}
function AuditTab({model,role}:{model:Model;role:Role}){return <div className="workspace-empty"><span>⌕</span><strong>Append-only audit coverage</strong><p>Model, mapping, AI, relationship, KPI, test, approval, publication, and rollback actions include request and actor context.</p>{role==='ADMIN'&&<Link className="primary-button" href={`/admin/audit-logs?q=${model.id}`}>Open Audit Logs</Link>}</div>}
