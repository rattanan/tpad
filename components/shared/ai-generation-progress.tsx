"use client";
import type { AiProgress } from "@/lib/ai/progress-client";

export default function AiGenerationProgress({ progress, elapsed }: { progress: AiProgress; elapsed: number }) {
  return <div className="ai-generation-progress" role="status" aria-live="polite"><div className="ai-generation-progress-head"><div><span className="ai-generation-live-dot" aria-hidden="true"/><strong>{progress.label}</strong></div><small>Live · {elapsed}s</small></div><p>{progress.detail}</p><div className="ai-generation-progress-track" aria-label={`${progress.percent}% complete`}><i style={{width:`${progress.percent}%`}}/></div><footer><span>{progress.percent}%</span><span>Processing stages are shown; private model reasoning is not exposed.</span></footer></div>;
}
