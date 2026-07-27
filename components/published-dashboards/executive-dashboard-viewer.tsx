"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SmartDashboardFilters,{defaultFilterState,type PublishedSmartFilter} from "./smart-dashboard-filters";
import {formatKpiValue} from "@/lib/dashboards/kpi-value-format";
import {createYAxisScale} from "@/lib/dashboards/chart-scale";
import {formatChartLabel} from "@/lib/dashboards/chart-label";
import {buildDynamicInsight} from "@/lib/dashboards/dynamic-insight";

const DashboardCopilot=dynamic(()=>import("./dashboard-copilot"),{ssr:false,loading:()=> <div className="copilot-loading"><span className="insight-spinner"/>Opening AI Copilot…</div>});
type Block={id:string;title:string;description:string|null;businessQuestion:string|null;decisionSupported:string|null;blockType:string;visualizationType:string;position:{x:number;y:number;w:number;h:number};visualizationConfig?:Record<string,unknown>;preview:{rows?:Record<string,unknown>[]} | null};
type Data={dashboard:{id:string;slug:string;name:string;description:string|null;category:string;publishedAt:string;lastDataRefreshAt:string|null;favorite:boolean};blocks:Block[];filters:PublishedSmartFilter[];capabilities:{export:boolean;underlyingData:boolean;drillDown:boolean;ai:boolean;executiveSummary:boolean};suggestedQuestions:string[]};
type Result={rows:Record<string,unknown>[];rowCount:number;durationMs:number;executedAt:string};
type ResultState={state:"loading"|"ready"|"error";data?:Result;error?:string};

export default function ExecutiveDashboardViewer({initialJson}:{initialJson:string}){
  const data=JSON.parse(initialJson) as Data;const[favorite,setFavorite]=useState(data.dashboard.favorite);const[copilot,setCopilot]=useState(false);const[applied,setApplied]=useState<Record<string,(string|number|boolean|null)[]>>(()=>defaultFilterState(data.filters));const[results,setResults]=useState<Record<string,ResultState>>({});
  const filterPayload=useMemo(()=>Object.entries(applied).map(([filterId,values])=>({filterId,values})),[applied]);
  async function load(block:Block){if(block.blockType==="TEXT_INSIGHT")return;setResults(current=>({...current,[block.id]:{state:"loading"}}));try{const response=await fetch(`/api/published-dashboards/${data.dashboard.slug}/widgets/${block.id}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({filters:filterPayload})});const body=await response.json();if(!response.ok)throw new Error(body.error||"Widget could not be loaded");setResults(current=>({...current,[block.id]:{state:"ready",data:body}}));}catch(error){setResults(current=>({...current,[block.id]:{state:"error",error:error instanceof Error?error.message:"Widget could not be loaded"}}));}}
  useEffect(()=>{void fetch(`/api/published-dashboards/${data.dashboard.slug}/view`,{method:"POST"});data.blocks.forEach(block=>void load(block));},[data.dashboard.slug,JSON.stringify(filterPayload)]);// eslint-disable-line react-hooks/exhaustive-deps
  async function toggleFavorite(){const next=!favorite;setFavorite(next);const response=await fetch(`/api/published-dashboards/${data.dashboard.slug}/favorite`,{method:next?"POST":"DELETE"});if(!response.ok)setFavorite(!next);}
  return <main className="executive-viewer"><header className="viewer-head"><div><Link href="/dashboards">← Published dashboards</Link><p className="eyebrow">{data.dashboard.category} · PUBLISHED</p><h1>{data.dashboard.name}</h1><p>{data.dashboard.description}</p><small>Published {new Date(data.dashboard.publishedAt).toLocaleDateString()} · Data refreshed {data.dashboard.lastDataRefreshAt?new Date(data.dashboard.lastDataRefreshAt).toLocaleString():"on demand"}</small></div><div><button className="secondary-button viewer-favorite" onClick={()=>void toggleFavorite()}>{favorite?"★ Favorited":"☆ Favorite"}</button></div></header>{data.filters.length>0&&<SmartDashboardFilters dashboardSlug={data.dashboard.slug} filters={data.filters} values={applied} onApply={setApplied}/>}<section className="viewer-grid">{data.blocks.map(block=><ViewerWidget key={block.id} block={block} result={results[block.id]} allBlocks={data.blocks} allResults={results} onRetry={()=>void load(block)}/>)}</section>{data.capabilities.ai&&!copilot&&<button className="copilot-balloon" type="button" aria-label="Open InsightFS AI Copilot" aria-expanded={false} aria-controls="insightfs-copilot-panel" onClick={()=>setCopilot(true)}><span className="copilot-balloon-icon" aria-hidden="true">✦</span><span><strong>Ask InsightFS</strong><small>AI Copilot</small></span></button>}{copilot&&<DashboardCopilot dashboardSlug={data.dashboard.slug} dashboardName={data.dashboard.name} filters={filterPayload} suggestedQuestions={data.suggestedQuestions} canSummary={data.capabilities.executiveSummary} onClose={()=>setCopilot(false)}/>}</main>;
}

const rowValue=(row:Record<string,unknown>)=>Number(row.KPI_VALUE??row.kpi_value??Object.values(row).find(value=>Number.isFinite(Number(value)))??0);
function FittedViewerTable({rows}:{rows:Record<string,unknown>[]}){const columns=Object.keys(rows[0]||{});const visibleRows=rows.slice(0,6);return <div className="viewer-table-wrap"><table><thead><tr>{columns.map(key=><th key={key} title={key.replaceAll("_"," ")}>{key.replaceAll("_"," ")}</th>)}</tr></thead><tbody>{visibleRows.map((row,index)=><tr key={index}>{columns.map(key=>{const value=row[key]==null?"—":formatChartLabel(row[key]);return <td key={key} title={value}>{value}</td>;})}</tr>)}</tbody></table>{rows.length>visibleRows.length&&<small className="viewer-table-count">Showing {visibleRows.length} of {rows.length} rows</small>}</div>}
function DynamicInsight({block,blocks,results}:{block:Block;blocks:Block[];results:Record<string,ResultState>}){const insight=buildDynamicInsight(block,blocks,Object.fromEntries(Object.entries(results).map(([id,result])=>[id,result.data?{rows:result.data.rows,rowCount:result.data.rowCount}:undefined])));if(!insight)return <div className="text-insight"><span>INSIGHT</span><p>Waiting for validated dashboard results…</p></div>;return <div className="text-insight"><span>{insight.eyebrow}</span><p>{insight.text}</p><small>{insight.note}</small></div>}

type ChartValue={label:string;value:number};
const axisValue=(value:number)=>Math.abs(value)>=1_000_000?value.toLocaleString("en-US",{notation:"compact",maximumFractionDigits:1}):value.toLocaleString("en-US",{maximumFractionDigits:2});
function AxisChart({values,type,title}:{values:ChartValue[];type:string;title:string}){
  const[active,setActive]=useState<number|null>(null);const width=600;const height=250;const left=62;const right=18;const top=18;const bottom=43;const plotWidth=width-left-right;const plotHeight=height-top-bottom;const{maximum,range,ticks}=createYAxisScale(values.map(item=>item.value));const y=(value:number)=>top+(maximum-value)/range*plotHeight;const zeroY=y(0);const line=type==="LINE"||type==="AREA";const points=values.map((item,index)=>({item,x:left+(line?(values.length===1?plotWidth/2:index*plotWidth/(values.length-1)):(index+.5)*plotWidth/values.length),y:y(item.value)}));const activePoint=active===null?null:points[active];const tooltipLeft=activePoint?Math.min(88,Math.max(12,activePoint.x/width*100)):50;const tooltipTop=activePoint?Math.max(6,activePoint.y/height*100-4):50;const barWidth=Math.min(48,plotWidth/Math.max(1,values.length)*.62);
  return <div className="viewer-axis-chart" onMouseLeave={()=>setActive(null)}><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} ${type.toLowerCase().replaceAll("_"," ")} chart`}>
    <g className="chart-grid">{ticks.map((tick,index)=>{const tickY=top+index*plotHeight/(ticks.length-1);return <g key={`${tick}-${index}`}><line x1={left} x2={width-right} y1={tickY} y2={tickY}/><text x={left-9} y={tickY+4} textAnchor="end">{axisValue(tick)}</text></g>})}</g><line className="chart-axis" x1={left} x2={left} y1={top} y2={height-bottom}/><line className="chart-zero" x1={left} x2={width-right} y1={zeroY} y2={zeroY}/>
    {line&&<>{type==="AREA"&&<polygon className="chart-area" points={`${left},${zeroY} ${points.map(point=>`${point.x},${point.y}`).join(" ")} ${width-right},${zeroY}`}/>}<polyline className="chart-line" points={points.map(point=>`${point.x},${point.y}`).join(" ")}/></>}
    {points.map((point,index)=><g className={`chart-point ${active===index?"active":""}`} key={`${point.item.label}-${index}`} tabIndex={0} role="img" aria-label={`${point.item.label}: ${point.item.value.toLocaleString("en-US")}`} onMouseEnter={()=>setActive(index)} onFocus={()=>setActive(index)} onBlur={()=>setActive(null)}>{line?<><circle className="chart-point-hit" cx={point.x} cy={point.y} r="13"/><circle className="chart-point-dot" cx={point.x} cy={point.y} r="4.5"/></>:<rect className="chart-bar" x={point.x-barWidth/2} y={Math.min(point.y,zeroY)} width={barWidth} height={Math.max(2,Math.abs(zeroY-point.y))} rx="5"/>}<title>{point.item.label}: {point.item.value.toLocaleString("en-US")}</title><text className="chart-x-label" x={point.x} y={height-17} textAnchor="middle">{point.item.label.length>12?`${point.item.label.slice(0,11)}…`:point.item.label}</text></g>)}
  </svg>{activePoint&&<div className="viewer-chart-tooltip" role="status" style={{left:`${tooltipLeft}%`,top:`${tooltipTop}%`}}><span>{activePoint.item.label}</span><strong>{activePoint.item.value.toLocaleString("en-US",{maximumFractionDigits:6})}</strong></div>}</div>;
}

function ValueBarList({values}:{values:ChartValue[]}){
  const[active,setActive]=useState<number|null>(null);const max=Math.max(1,...values.map(item=>Math.abs(item.value)));
  return <div className="mini-bars" onMouseLeave={()=>setActive(null)}>{values.map((item,index)=><div className="viewer-value-bar" key={`${item.label}-${index}`} tabIndex={0} aria-label={`${item.label}: ${item.value.toLocaleString("en-US")}`} onMouseEnter={()=>setActive(index)} onFocus={()=>setActive(index)} onBlur={()=>setActive(null)}><span>{item.label}</span><i><b style={{width:`${Math.max(3,Math.abs(item.value)/max*100)}%`}}/></i><strong>{item.value.toLocaleString()}</strong>{active===index&&<div className="viewer-bar-tooltip" role="status"><span>{item.label}</span><strong>{item.value.toLocaleString("en-US",{maximumFractionDigits:6})}</strong></div>}</div>)}</div>;
}

function ViewerWidget({block,result,allBlocks,allResults,onRetry}:{block:Block;result?:ResultState;allBlocks:Block[];allResults:Record<string,ResultState>;onRetry:()=>void}){
  const rows=result?.data?.rows??block.preview?.rows??[];
  const values=rows.slice(0,10).map(row=>({label:formatChartLabel(row.DIMENSION_VALUE??row.dimension_value??"Current"),value:rowValue(row)}));
  const width=Math.min(12,Math.max(3,block.position.w||6));
  const tableWidget=block.visualizationType.includes("TABLE")||block.blockType.includes("TABLE")||block.blockType==="EXCEPTION_LIST";
  const axisChart=["LINE","AREA","BAR","STACKED_BAR"].includes(block.visualizationType);
  const emptyMessage=block.blockType==="EXCEPTION_LIST"?"No exception records match the current filters.":block.blockType==="TREND_CHART"?"Not enough historical data to display a trend.":"No data matches the current filters.";
  const kpiValue=formatKpiValue(values[0]?.value);

  return <article className={`viewer-widget span-${width}${tableWidget?" has-fitted-table":""}`}>
    <header><div><p>{block.blockType.replaceAll("_"," ")}</p><h2>{block.title}</h2></div>{result?.state==="ready"&&<span className="live-dot">LIVE</span>}</header>
    {block.description&&<p className="widget-description">{block.description}</p>}
    {result?.state==="loading"&&<div className="widget-state"><span className="insight-spinner"/><strong>Loading trusted data…</strong></div>}
    {result?.state==="error"&&<div className="widget-state error"><strong>Unable to load this insight</strong><p>{result.error}</p><button onClick={onRetry}>Retry</button></div>}
    {block.blockType==="TEXT_INSIGHT"&&<DynamicInsight block={block} blocks={allBlocks} results={allResults}/>}
    {result?.state!=="loading"&&result?.state!=="error"&&block.blockType!=="TEXT_INSIGHT"&&(!rows.length
      ?<div className="widget-empty"><strong>{emptyMessage}</strong></div>
      :block.visualizationType==="NUMBER"
        ?<div className="kpi-number"><strong className={`kpi-value ${kpiValue.sizeClass}`} title={`Full value: ${kpiValue.full}`} aria-label={`Full value ${kpiValue.full}`}>{kpiValue.display}</strong><span>{values[0]?.label}</span></div>
        :block.visualizationType==="PROGRESS"
          ?<div className="viewer-progress"><strong>{values[0]?.value.toLocaleString()}</strong><i><b style={{width:`${Math.min(100,Math.max(0,values[0]?.value||0))}%`}}/></i><span>Compared with the governed target</span></div>
          :tableWidget
            ?<FittedViewerTable rows={rows}/>
            :axisChart
              ?<AxisChart values={values} type={block.visualizationType} title={block.title}/>
              :<ValueBarList values={values}/>)}
    {result?.data&&<footer>Updated {new Date(result.data.executedAt).toLocaleTimeString()} · {result.data.durationMs} ms</footer>}
  </article>;
}
