"use client";
import Link from "next/link"; import { useEffect, useMemo, useState } from "react"; import { useRouter } from "next/navigation"; import type { Role } from "@/lib/db/schema"; import RelationshipCanvas from "./relationship-canvas";
type Model={id:string;dataSourceId:string;name:string;description:string|null;schemaName:string;version:number;status:string;updatedAt:string;publishedAt:string|null};
type Domain={id:string;name:string}; type ObjectRow={id:string;modelId:string;dataSourceId:string;physicalTableId:string;technicalName:string;databaseSchema:string;businessName:string;shortName:string|null;description:string|null;businessDomainId:string|null;objectType:string;recordGrain:string|null;approvalStatus:string;aiUsageAllowed:boolean;sensitivityLevel:string;layoutX:number;layoutY:number};
type Field={id:string;businessObjectId:string;physicalColumnName:string;businessName:string;description:string|null;physicalDataType:string;businessType:string;fieldRole:string;aggregationRule:string;sensitivityClassification:string;aiUsageAllowed:boolean;visibleToDashboardCreator:boolean;approvalStatus:string};
type Relationship={id:string;modelId:string;dataSourceId:string;sourceObjectId:string;sourceFieldId:string;targetObjectId:string;targetFieldId:string;joinType:"INNER"|"LEFT"|"RIGHT";cardinality:"ONE_TO_ONE"|"ONE_TO_MANY"|"MANY_TO_ONE"|"MANY_TO_MANY"|"UNKNOWN";direction:"BIDIRECTIONAL"|"SOURCE_TO_TARGET"|"TARGET_TO_SOURCE";isRequired:boolean;confidenceScore:number;sourceType:"DATABASE_CONSTRAINT"|"AI_SUGGESTED"|"MANUAL"|"COLUMN_PATTERN";validationStatus:string;approvalStatus:string;approvedBy:string|null;approvedAt:string|null;notes:string|null;version:number;createdBy:string;updatedBy:string;createdAt:string;updatedAt:string;deletedAt:string|null};
type Kpi={id:string;name:string;code:string;description:string|null;status:string;certificationStatus:string}; type Recommendation={id:string;recommendationType:string;targetType:string;suggestedValue:string;reason:string;confidenceScore:number;impact:string;status:string;evidence:string|null}; type Version={id:string;versionNumber:number;status:string;changeSummary:string|null;publishedAt:string|null;createdAt:string}; type Glossary={id:string;term:string;definition:string;language:string;approvalStatus:string}; type Review={id:string;reviewStage:string;status:string;requestedAt:string};
type Workspace={model:Model;domains:Domain[];objects:ObjectRow[];fields:Field[];relationships:Relationship[];kpis:Kpi[];recommendations:Recommendation[];versions:Version[];glossary:Glossary[];reviews:Review[]};
const tabs=["Overview","Business Objects","Fields","Relationships","KPI Catalogue","Validation","Versions","Audit Log"] as const;
const badge=(value:string)=><span className={`bc-status ${value.toLowerCase()}`}>{value.replaceAll("_"," ")}</span>;
export default function BusinessContextWorkspace({dataJson,role}:{dataJson:string;role:Role}){const data=JSON.parse(dataJson) as Workspace;const router=useRouter();const [tab,setTab]=useState<(typeof tabs)[number]>("Overview");const [busy,setBusy]=useState("");const [notice,setNotice]=useState("");const [error,setError]=useState("");const [validation,setValidation]=useState<{outcome:string;issues:Array<{code:string;severity:string;message:string}>}|null>(null);const editable=(role==="ADMIN"||role==="DATA_SOURCE_CREATOR")&&['DRAFT','CHANGES_REQUESTED'].includes(data.model.status);async function action(path:string,label:string,body:object={}){setBusy(label);setError("");setNotice("");const response=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await response.json();setBusy("");if(!response.ok){setError(result.error??"Action failed");return null;}setNotice(`${label} completed`);router.refresh();return result;}const fieldsByObject=useMemo(()=>new Map(data.objects.map((object)=>[object.id,data.fields.filter((field)=>field.businessObjectId===object.id)])),[data.objects,data.fields]);return <main className="bc-workspace"><header className="bc-model-head"><div><Link href="/business-context-models">← Business Context Models</Link><div className="bc-title-line"><h1>{data.model.name}</h1>{badge(data.model.status)}</div><p>{data.model.description||`${data.model.schemaName} governed business metadata`}</p><small>Oracle schema {data.model.schemaName} · Version {data.model.version} · Updated {new Date(data.model.updatedAt).toLocaleString()}</small></div><div className="bc-actions"><button className="secondary-button" disabled={Boolean(busy)} onClick={async()=>{const result=await action(`/api/business-context-models/${data.model.id}/validate`,"Validation");if(result)setValidation(result as typeof validation);setTab("Validation");}}>Validate</button>{editable&&['DRAFT','CHANGES_REQUESTED'].includes(data.model.status)&&<button className="primary-button" disabled={Boolean(busy)} onClick={()=>void action(`/api/business-context-models/${data.model.id}/submit-review`,"Submit review")}>Submit review</button>}{role==="ADMIN"&&data.model.status==="READY_FOR_REVIEW"&&<button className="primary-button" onClick={()=>void action(`/api/business-context-models/${data.model.id}/approve`,"Approval")}>Approve</button>}{role==="ADMIN"&&data.model.status==="APPROVED"&&<button className="primary-button" onClick={()=>void action(`/api/business-context-models/${data.model.id}/publish`,"Publish",{changeSummary:`Publish version ${data.model.version}`})}>Publish</button>}{data.model.status==="PUBLISHED"&&(role==="ADMIN"||role==="DATA_SOURCE_CREATOR")&&<button className="primary-button" onClick={()=>void action(`/api/business-context-models/${data.model.id}/create-version`,"Create version")}>Create new version</button>}</div></header>{error&&<div className="bc-alert error">{error}</div>}{notice&&<div className="bc-alert success">{notice}</div>}<nav className="bc-tabs" aria-label="Business Context sections">{tabs.map((item)=><button key={item} className={tab===item?"active":""} onClick={()=>setTab(item)}>{item}</button>)}</nav><section className="bc-tab-panel">{tab==="Overview"&&<Overview data={data}/>} {tab==="Business Objects"&&<ObjectsTab data={data} editable={editable}/>} {tab==="Fields"&&<FieldsTab modelId={data.model.id} fields={data.fields} editable={editable}/>} {tab==="Relationships"&&<RelationshipsTab data={data} fieldsByObject={fieldsByObject} editable={editable}/>} {tab==="KPI Catalogue"&&<KpisTab data={data} editable={editable}/>} {tab==="Validation"&&<ValidationTab result={validation}/>} {tab==="Versions"&&<VersionsTab data={data} role={role}/>} {tab==="Audit Log"&&<AuditTab model={data.model} role={role}/>}</section></main>}
function Overview({data}:{data:Workspace}){return <div className="bc-overview"><section className="bc-summary"><article><span>Business objects</span><strong>{data.objects.length}</strong><small>{data.objects.filter((item)=>item.approvalStatus==='APPROVED').length} approved</small></article><article><span>Business fields</span><strong>{data.fields.length}</strong><small>{data.fields.filter((item)=>item.visibleToDashboardCreator).length} dashboard-visible</small></article><article><span>Relationships</span><strong>{data.relationships.length}</strong><small>{data.relationships.filter((item)=>item.validationStatus==='VALID').length} validated</small></article><article><span>KPIs</span><strong>{data.kpis.length}</strong><small>{data.kpis.filter((item)=>['APPROVED','CERTIFIED'].includes(item.status)).length} production-ready</small></article></section><div className="bc-three"><article className="workspace-card"><p className="eyebrow">MODEL HEALTH</p><h2>Governance readiness</h2><ul className="bc-checklist"><li className={data.objects.every((item)=>item.recordGrain)?'ok':'warn'}>Record grains documented</li><li className={data.relationships.every((item)=>item.validationStatus!=='INVALID')?'ok':'warn'}>Relationship validation</li><li className={data.fields.every((item)=>item.sensitivityClassification==='NONE'||!item.aiUsageAllowed)?'ok':'warn'}>Sensitive AI exclusions</li></ul></article><article className="workspace-card"><p className="eyebrow">WORKFLOW</p><h2>Current stage</h2><div className="workflow-track">{['DRAFT','AI_ANALYSIS','DATA_STEWARD_REVIEW','TECHNICAL_VALIDATION','BUSINESS_OWNER_REVIEW','APPROVED','PUBLISHED'].map((stage,index)=><div className={index<=(['DRAFT','AI_ANALYZING','READY_FOR_REVIEW','READY_FOR_REVIEW','READY_FOR_REVIEW','APPROVED','PUBLISHED'].indexOf(data.model.status))?'done':''} key={stage}><span>{index+1}</span><small>{stage.replaceAll('_',' ')}</small></div>)}</div></article><article className="workspace-card"><p className="eyebrow">LATEST REVIEW</p><h2>{data.reviews[0]?.reviewStage.replaceAll('_',' ')||'No review request'}</h2><p>{data.reviews[0]?`${data.reviews[0].status} · ${new Date(data.reviews[0].requestedAt).toLocaleString()}`:'Submit the draft when validation is ready.'}</p></article></div></div>}
function ObjectsTab({ data, editable }: { data: Workspace; editable: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tables, setTables] = useState<TableOption[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableOption | null>(null);
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
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

  const mappedIds = new Set(data.objects.map((object) => object.physicalTableId));
  const availableTables = tables.filter((table) => !mappedIds.has(table.id));

  return <>
    <div className="bc-section-head">
      <div><p className="eyebrow">BUSINESS OBJECTS</p><h2>Physical-to-business mapping</h2></div>
      {editable && <button className="primary-button" onClick={() => setOpen(true)}>＋ Map object</button>}
    </div>
    <div className="bc-object-grid">{data.objects.map((object) => <article key={object.id}><div><span>{object.objectType.replaceAll("_", " ")}</span>{badge(object.approvalStatus)}</div><h3>{object.businessName}</h3><p>{object.description || "Business description pending review."}</p><dl><div><dt>Physical source</dt><dd>{object.databaseSchema}.{object.technicalName}</dd></div><div><dt>Record grain</dt><dd className={!object.recordGrain ? "missing" : ""}>{object.recordGrain || "Missing — required before approval"}</dd></div></dl><small>{fieldsCount(data.fields, object.id)} mapped fields</small></article>)}</div>
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
  const [descriptions,setDescriptions]=useState<Record<string,string>>(()=>Object.fromEntries(fields.map((field)=>[field.id,field.description??''])));
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  async function update(id:string,changes:object){setError('');const response=await fetch(`/api/business-fields/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(changes)});const body=await response.json();if(!response.ok){setError(body.error??'Unable to update Business Field');return false;}router.refresh();return true;}
  async function describe(field:Field){setBusy(`describe-${field.id}`);setError('');const response=await fetch(`/api/business-fields/${field.id}/describe`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const body=await response.json();setBusy('');if(!response.ok){setError(body.error??'AI description is unavailable');return;}setDescriptions((current)=>({...current,[field.id]:body.field.description??''}));router.refresh();}
  async function removeSelected(){if(!selected.size||!window.confirm(`Remove ${selected.size} selected Business Field${selected.size===1?'':'s'} from this draft?`))return;setBusy('remove');setError('');const response=await fetch(`/api/business-context-models/${modelId}/fields/remove`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fieldIds:[...selected]})});const body=await response.json();setBusy('');if(!response.ok){setError(body.error??'Unable to remove selected fields');return;}setSelected(new Set());router.refresh();}
  const allSelected=fields.length>0&&selected.size===fields.length;
  function toggle(id:string){setSelected((current)=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});}
  return <><div className="bc-section-head fields-section-head"><div><p className="eyebrow">BUSINESS FIELDS</p><h2>Meaning, role, and aggregation</h2></div><div><span>{fields.length} active fields</span>{editable&&<button className="danger-button fields-remove-button" disabled={!selected.size||Boolean(busy)} onClick={()=>void removeSelected()}>⌫ Remove selected {selected.size?`(${selected.size})`:''}</button>}</div></div>{error&&<div className="bc-alert error" role="alert">{error}</div>}<section className="table-card fields-table"><div className="table-wrap"><table><thead><tr>{editable&&<th className="field-select-cell"><input type="checkbox" checked={allSelected} aria-label="Select all Business Fields" onChange={()=>setSelected(allSelected?new Set():new Set(fields.map((field)=>field.id)))}/></th>}<th>Business field</th><th>Physical</th><th>Description</th><th>Business type</th><th>Role</th><th>Aggregation</th><th>Approval</th></tr></thead><tbody>{fields.map((field)=><tr key={field.id} className={selected.has(field.id)?'selected-field-row':''}>{editable&&<td className="field-select-cell"><input type="checkbox" checked={selected.has(field.id)} aria-label={`Select ${field.businessName}`} onChange={()=>toggle(field.id)}/></td>}<td><strong>{field.businessName}</strong></td><td><code>{field.physicalColumnName}</code><small className="ds-sub">{field.physicalDataType}</small></td><td className="field-description-cell">{editable?<div><textarea rows={2} value={descriptions[field.id]??''} onChange={(event)=>setDescriptions({...descriptions,[field.id]:event.target.value})} onBlur={()=>{const value=descriptions[field.id]?.trim()||null;if(value!==(field.description??null))void update(field.id,{description:value});}} placeholder="Explain the business meaning…" aria-label={`${field.businessName} description`}/><button type="button" className="field-ai-button" disabled={Boolean(busy)} onClick={()=>void describe(field)}>{busy===`describe-${field.id}`?<span className="button-spinner"/>:<span aria-hidden="true">✦</span>} AI summarize</button></div>:<span>{field.description||'Not described'}</span>}</td><td>{editable?<select value={field.businessType} onChange={(event)=>void update(field.id,{businessType:event.target.value})}>{['TEXT','NUMBER','CURRENCY','PERCENTAGE','BOOLEAN','DATE','DATETIME','DURATION','QUANTITY','STATUS','IDENTIFIER','UNKNOWN'].map((value)=><option key={value}>{value}</option>)}</select>:field.businessType}</td><td>{editable?<select value={field.fieldRole} onChange={(event)=>void update(field.id,{fieldRole:event.target.value})}>{['DIMENSION','MEASURE','IDENTIFIER','DATE_DIMENSION','STATUS_DIMENSION','FOREIGN_KEY','TECHNICAL_FIELD','SENSITIVE_FIELD','IGNORED'].map((value)=><option key={value}>{value}</option>)}</select>:field.fieldRole}</td><td>{editable?<select value={field.aggregationRule} onChange={(event)=>void update(field.id,{aggregationRule:event.target.value})}>{['SUM','AVERAGE','COUNT','COUNT_DISTINCT','MINIMUM','MAXIMUM','LATEST','EARLIEST','NONE','CUSTOM'].map((value)=><option key={value}>{value}</option>)}</select>:field.aggregationRule}</td><td>{badge(field.approvalStatus)}</td></tr>)}</tbody></table></div></section></>}
function RelationshipsTab({data,fieldsByObject,editable}:{data:Workspace;fieldsByObject:Map<string,Field[]>;editable:boolean}){const router=useRouter();const first=data.objects[0]?.id??'';const second=data.objects[1]?.id??first;const [form,setForm]=useState({sourceObjectId:first,sourceFieldId:fieldsByObject.get(first)?.[0]?.id??'',targetObjectId:second,targetFieldId:fieldsByObject.get(second)?.[0]?.id??'',joinType:'LEFT',cardinality:'MANY_TO_ONE'});async function create(){const response=await fetch(`/api/business-context-models/${data.model.id}/relationships`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});if(response.ok)router.refresh();}async function validate(id:string){await fetch(`/api/business-relationships/${id}/validate`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});router.refresh();}return <><div className="bc-section-head"><div><p className="eyebrow">RELATIONSHIP BUILDER</p><h2>Grain-aware object graph</h2></div><span>Drag objects · zoom · validate joins</span></div><RelationshipCanvas objects={data.objects as never[]} relationships={data.relationships as never[]} editable={editable}/>{editable&&data.objects.length>=2&&<div className="relationship-form"><label>Source object<select value={form.sourceObjectId} onChange={(event)=>{const id=event.target.value;setForm({...form,sourceObjectId:id,sourceFieldId:fieldsByObject.get(id)?.[0]?.id??''});}}>{data.objects.map((item)=><option value={item.id} key={item.id}>{item.businessName}</option>)}</select></label><label>Source field<select value={form.sourceFieldId} onChange={(event)=>setForm({...form,sourceFieldId:event.target.value})}>{(fieldsByObject.get(form.sourceObjectId)??[]).map((item)=><option value={item.id} key={item.id}>{item.businessName}</option>)}</select></label><label>Target object<select value={form.targetObjectId} onChange={(event)=>{const id=event.target.value;setForm({...form,targetObjectId:id,targetFieldId:fieldsByObject.get(id)?.[0]?.id??''});}}>{data.objects.map((item)=><option value={item.id} key={item.id}>{item.businessName}</option>)}</select></label><label>Target field<select value={form.targetFieldId} onChange={(event)=>setForm({...form,targetFieldId:event.target.value})}>{(fieldsByObject.get(form.targetObjectId)??[]).map((item)=><option value={item.id} key={item.id}>{item.businessName}</option>)}</select></label><label>Cardinality<select value={form.cardinality} onChange={(event)=>setForm({...form,cardinality:event.target.value})}>{['ONE_TO_ONE','ONE_TO_MANY','MANY_TO_ONE','MANY_TO_MANY','UNKNOWN'].map((item)=><option key={item}>{item}</option>)}</select></label><button className="primary-button" onClick={()=>void create()}>Connect fields</button></div>}<div className="relationship-list">{data.relationships.map((rel)=><article key={rel.id}><div><strong>{data.objects.find((item)=>item.id===rel.sourceObjectId)?.businessName} → {data.objects.find((item)=>item.id===rel.targetObjectId)?.businessName}</strong><small>{rel.joinType} · {rel.cardinality.replaceAll('_',' ')}</small></div>{badge(rel.validationStatus)}{editable&&<button className="secondary-button" onClick={()=>void validate(rel.id)}>Run read-only validation</button>}</article>)}</div></>}
function KpisTab({data,editable}:{data:Workspace;editable:boolean}){
  const router=useRouter();const [busy,setBusy]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');
  async function generate(){setBusy('generate');setError('');setNotice('');const response=await fetch(`/api/business-context-models/${data.model.id}/generate-kpis`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const body=await response.json();setBusy('');if(!response.ok){setError(body.error??'Unable to generate KPI drafts');return;}setNotice(`${body.createdCount} KPI draft${body.createdCount===1?'':'s'} created`);router.refresh();}
  async function remove(kpi:Kpi){if(!window.confirm(`Delete KPI draft “${kpi.name}”?`))return;setBusy(kpi.id);setError('');const response=await fetch(`/api/kpis/${kpi.id}`,{method:'DELETE'});const body=await response.json();setBusy('');if(!response.ok){setError(body.error??'Unable to delete KPI');return;}router.refresh();}
  return <><div className="bc-section-head"><div><p className="eyebrow">KPI CATALOGUE</p><h2>Measures built on governed context</h2></div><Link className="primary-button" href={`/kpi-catalogue?modelId=${data.model.id}`}>Open KPI Catalogue</Link></div>{editable&&<section className="kpi-ai-generator"><span aria-hidden="true">✦</span><div><strong>Generate relevant Draft KPIs with AI</strong><p>AI uses active Business Objects and eligible Measure or Identifier Fields. Every result remains a draft for review.</p></div><button className="secondary-button" disabled={Boolean(busy)} onClick={()=>void generate()}>{busy==='generate'&&<span className="button-spinner"/>}{busy==='generate'?'Generating drafts…':'Generate Draft KPIs'}</button></section>}{error&&<div className="bc-alert error" role="alert">{error}</div>}{notice&&<div className="bc-alert success" role="status">{notice}</div>}<div className="kpi-grid">{data.kpis.map((kpi)=><article className="kpi-context-card" key={kpi.id}><Link href={`/kpi-catalogue/${kpi.id}`}><span>{kpi.code}</span><h3>{kpi.name}</h3><p>{kpi.description||'Definition pending review.'}</p><footer>{badge(kpi.status)}<small>{kpi.certificationStatus.replaceAll('_',' ')}</small></footer></Link>{editable&&<button className="kpi-card-delete" type="button" disabled={Boolean(busy)} onClick={()=>void remove(kpi)} aria-label={`Delete ${kpi.name}`} title="Delete KPI"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M9 7l1-3h4l1 3m-9 0 1 13h10l1-13"/></svg></button>}</article>)}{!data.kpis.length&&<div className="workspace-empty"><span>∑</span><strong>No KPIs defined</strong><p>Generate governed drafts with AI or create one manually in KPI Catalogue.</p></div>}</div></>}
function ValidationTab({result}:{result:{outcome:string;issues:Array<{code:string;severity:string;message:string}>}|null}){return <><div className="bc-section-head"><div><p className="eyebrow">VALIDATION</p><h2>Publication readiness checks</h2></div>{result&&badge(result.outcome)}</div>{result?<div className="validation-list">{result.issues.map((issue,index)=><article className={issue.severity.toLowerCase()} key={`${issue.code}-${index}`}><span>{issue.severity}</span><div><strong>{issue.code.replaceAll('_',' ')}</strong><p>{issue.message}</p></div></article>)}</div>:<div className="workspace-empty"><span>✓</span><strong>Run validation</strong><p>Check record grains, field roles, aggregations, sensitivity rules, relationships, and KPI readiness.</p></div>}</>}
function VersionsTab({data,role}:{data:Workspace;role:Role}){const router=useRouter();async function rollback(id:string){if(!confirm('Publish a new version based on this snapshot? Historical versions will remain unchanged.'))return;await fetch(`/api/business-context-models/${data.model.id}/rollback`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceVersionId:id,changeSummary:'Governed rollback'})});router.refresh();}return <><div className="bc-section-head"><div><p className="eyebrow">IMMUTABLE HISTORY</p><h2>Published versions</h2></div><span>Rollback creates a new version</span></div><div className="version-list">{data.versions.map((version)=><article key={version.id}><span>v{version.versionNumber}</span><div><strong>{version.changeSummary||'Published Business Context snapshot'}</strong><small>{new Date(version.publishedAt||version.createdAt).toLocaleString()}</small></div>{badge(version.status)}{role==='ADMIN'&&<button className="secondary-button" onClick={()=>void rollback(version.id)}>Roll back from this</button>}</article>)}</div></>}
function AuditTab({model,role}:{model:Model;role:Role}){return <div className="workspace-empty"><span>⌕</span><strong>Append-only audit coverage</strong><p>Model, mapping, AI, relationship, KPI, test, approval, publication, and rollback actions include request and actor context.</p>{role==='ADMIN'&&<Link className="primary-button" href={`/admin/audit-logs?q=${model.id}`}>Open Audit Logs</Link>}</div>}
