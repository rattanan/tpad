import {formatChartLabel} from "./chart-label";

export type InsightBlock = {
  id:string;
  title:string;
  description:string|null;
  businessQuestion:string|null;
  decisionSupported:string|null;
  blockType:string;
  visualizationType:string;
  position:{x:number;y:number;w:number;h:number};
};

export type InsightResult = {rows:Record<string,unknown>[];rowCount?:number};

const stopWords=new Set(["and","for","from","how","insight","of","the","to","what","which","with"]);
const tokens=(value:string)=>new Set(value.toLowerCase().replace(/[^a-z0-9]+/g," ").split(" ").filter(token=>token.length>2&&!stopWords.has(token)));
const numericValue=(row:Record<string,unknown>)=>Number(row.KPI_VALUE??row.kpi_value??Object.values(row).find(value=>Number.isFinite(Number(value)))??0);
const labelValue=(row:Record<string,unknown>)=>formatChartLabel(row.DIMENSION_VALUE??row.dimension_value??"Current");
const number=(value:number)=>value.toLocaleString("en-US",{maximumFractionDigits:6});

function overlap(a:Set<string>,b:Set<string>){let count=0;for(const token of a)if(b.has(token))count+=1;return count;}

function rankSource(current:InsightBlock,source:InsightBlock){
  const focus=`${current.title} ${current.description??""} ${current.businessQuestion??""} ${current.decisionSupported??""}`;
  const sourceText=`${source.title} ${source.description??""} ${source.businessQuestion??""} ${source.decisionSupported??""}`;
  const focusTokens=tokens(focus);const semantic=overlap(focusTokens,tokens(sourceText));
  const sourceBottom=source.position.y+source.position.h;const verticalGap=Math.abs(current.position.y-sourceBottom);
  const horizontalOverlap=Math.max(0,Math.min(current.position.x+current.position.w,source.position.x+source.position.w)-Math.max(current.position.x,source.position.x));
  let intent=0;const lower=focus.toLowerCase();
  if (/trend|change|movement|over time/.test(lower)&&["LINE","AREA"].includes(source.visualizationType))intent+=3;
  if (/risk|exception|attention|low|zero/.test(lower)&&["EXCEPTION_LIST","DETAIL_TABLE"].includes(source.blockType))intent+=3;
  if (/where|category|concentrat|site|warehouse|part/.test(lower)&&["DISTRIBUTION_CHART","COMPARISON_CHART"].includes(source.blockType))intent+=2;
  if (/summary|current|total|position/.test(lower)&&source.blockType==="KPI_CARD")intent+=1;
  return semantic*40+intent*18+horizontalOverlap*2+Math.max(0,18-verticalGap);
}

function finding(block:InsightBlock,result:InsightResult){
  const rows=result.rows;const values=rows.map(numericValue).filter(Number.isFinite);const first=values[0]??0;const last=values.at(-1)??first;
  if(block.blockType==="KPI_CARD"||block.visualizationType==="NUMBER")return `${block.title} is ${number(first)} for the current filters.`;
  if((["LINE","AREA"].includes(block.visualizationType)||block.blockType==="TREND_CHART")&&rows.length>1){
    const delta=last-first;const direction=delta>0?"increased":delta<0?"decreased":"remained unchanged";const change=delta===0?"":` by ${number(Math.abs(delta))}${first!==0?` (${number(Math.abs(delta/first*100))}%)`:""}`;
    return `${block.title} ${direction}${change}, from ${number(first)} on ${labelValue(rows[0])} to ${number(last)} on ${labelValue(rows.at(-1)!)}.`;
  }
  if(["EXCEPTION_LIST","DETAIL_TABLE"].includes(block.blockType)||block.visualizationType.includes("TABLE"))return `${block.title} contains ${result.rowCount??rows.length} visible record${(result.rowCount??rows.length)===1?"":"s"} for the current filters.`;
  const topRow=rows.reduce((best,row)=>numericValue(row)>numericValue(best)?row:best,rows[0]);const top=numericValue(topRow);const nonNegative=values.every(value=>value>=0);const total=values.reduce((sum,value)=>sum+value,0);const share=nonNegative&&total>0?` and represents ${number(top/total*100)}% of the visible total`:"";
  return `${labelValue(topRow)} is the largest visible contributor in ${block.title} at ${number(top)}${share}.`;
}

export function buildDynamicInsight(current:InsightBlock,blocks:InsightBlock[],results:Record<string,InsightResult|undefined>){
  if(/data availability|could not produce valid|were skipped/i.test(`${current.title} ${current.description??""}`)&&current.description)return {eyebrow:"DATA AVAILABILITY",text:current.description,note:"This note describes verified dashboard coverage and does not infer a business result.",sourceBlockId:null};
  const sources=blocks.filter(block=>block.blockType!=="TEXT_INSIGHT"&&results[block.id]?.rows.length).map(block=>({block,result:results[block.id]!,score:rankSource(current,block)})).sort((a,b)=>b.score-a.score||a.block.position.y-b.block.position.y||a.block.position.x-b.block.position.x);
  if(!sources.length)return null;
  const textBlocks=blocks.filter(block=>block.blockType==="TEXT_INSIGHT");const textIndex=Math.max(0,textBlocks.findIndex(block=>block.id===current.id));
  const signature=(block:InsightBlock)=>`${block.title}|${block.description??""}|${block.businessQuestion??""}|${block.decisionSupported??""}|${block.position.x},${block.position.y},${block.position.w},${block.position.h}`;
  const duplicateIndex=Math.max(0,textBlocks.filter(block=>signature(block)===signature(current)).findIndex(block=>block.id===current.id));
  const bestScore=sources[0].score;const tied=sources.filter(source=>source.score===bestScore);const primary=duplicateIndex>0?sources[duplicateIndex%sources.length]:(tied[textIndex%tied.length]??sources[0]);
  const focus=current.decisionSupported||current.businessQuestion||current.description;
  return {eyebrow:`LIVE INSIGHT · ${primary.block.blockType.replaceAll("_"," ")}`,text:finding(primary.block,primary.result),note:`Based on ${primary.block.title}. No cause is inferred without supporting data.${focus?` Focus: ${focus}`:""}`,sourceBlockId:primary.block.id};
}
