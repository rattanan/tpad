"use client";

import { useState } from "react";
import { buildFunnelSeries, buildPieSeries, type CategoricalChartValue } from "@/lib/dashboards/chart-series";

const colors = ["#5f248f", "#7f43a7", "#9d67bb", "#bb8dce", "#d3b5df", "#8a7896"];
const polar = (center: number, radius: number, angle: number) => ({ x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) });
const slicePath = (start: number, end: number) => {
  const center = 90; const radius = 72; const first = polar(center, radius, start); const last = polar(center, radius, end);
  return `M ${center} ${center} L ${first.x} ${first.y} A ${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${last.x} ${last.y} Z`;
};
const formatted = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function PieChart({ values, title }: { values: CategoricalChartValue[]; title: string }) {
  const [active, setActive] = useState<number | null>(null); const series = buildPieSeries(values); const total = series.reduce((sum, item) => sum + item.value, 0); const slices=series.map((item,index)=>{const previous=series.slice(0,index).reduce((sum,candidate)=>sum+candidate.value,0);const start=-Math.PI/2+(total?previous/total*Math.PI*2:0);const end=start+(total?item.value/total*Math.PI*2:0);return{item,start,end};});
  return <div className="viewer-pie-chart"><svg viewBox="0 0 180 180" role="img" aria-label={`${title} pie chart`}>
    {slices.map(({item,start,end}, index) => { const percent = total ? item.value / total * 100 : 0; return <path key={`${item.label}-${index}`} d={slicePath(start, end)} fill={colors[index % colors.length]} className={active === index ? "active" : ""} tabIndex={0} role="img" aria-label={`${item.label}: ${formatted(item.value)}, ${percent.toFixed(1)} percent`} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(index)} onBlur={() => setActive(null)}><title>{item.label}: {formatted(item.value)} ({percent.toFixed(1)}%)</title></path>; })}
  </svg><ul aria-label="Pie chart values">{series.map((item, index) => <li key={`${item.label}-${index}`}><i style={{ backgroundColor: colors[index % colors.length] }}/><span>{item.label}</span><strong>{total ? (item.value / total * 100).toFixed(1) : "0.0"}%</strong><small>{formatted(item.value)}</small></li>)}</ul></div>;
}

export function FunnelChart({ values, title, orderedStages = [] }: { values: CategoricalChartValue[]; title: string; orderedStages?: string[] }) {
  const series = buildFunnelSeries(values, orderedStages); const maximum = Math.max(1, ...series.map((item) => item.value));
  return <ol className="viewer-funnel" aria-label={`${title} funnel chart`}>{series.map((item, index) => { const previous = index ? series[index - 1].value : item.value; const conversion = previous > 0 ? item.value / previous * 100 : 0; const width = Math.max(28, item.value / maximum * 100); return <li key={`${item.label}-${index}`} tabIndex={0} aria-label={`${item.label}: ${formatted(item.value)}${index ? `, ${conversion.toFixed(1)} percent of previous stage` : ""}`}><div className="funnel-stage" style={{ width: `${width}%`, backgroundColor: colors[Math.min(index, colors.length - 1)] }}><span>{item.label}</span><strong>{formatted(item.value)}</strong></div>{index > 0 && <small>{conversion.toFixed(1)}% of previous stage</small>}</li>; })}</ol>;
}
