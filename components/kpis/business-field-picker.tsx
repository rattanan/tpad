"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type BusinessFieldOption = {
  id: string;
  businessName: string;
  businessObjectName: string;
  businessType: string;
  fieldRole: string;
};

type SampleState = { status: "idle" | "loading" | "loaded" | "error"; values: string[]; masked: boolean };

export default function BusinessFieldPicker({ label, value, fields, onChange, helpText }: {
  label: string;
  value: string;
  fields: BusinessFieldOption[];
  onChange: (fieldId: string) => void;
  helpText?: string;
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [samples, setSamples] = useState<Record<string, SampleState>>({});
  const [sampleAttempt, setSampleAttempt] = useState(0);
  const selected = fields.find((field) => field.id === value);
  const sample = value ? samples[value] : undefined;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return fields;
    return fields.filter((field) => `${field.businessName} ${field.businessObjectName} ${field.businessType} ${field.fieldRole}`.toLowerCase().includes(needle));
  }, [fields, query]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  useEffect(() => {
    if (!value) return;
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 35_000);
    void fetch(`/api/business-fields/${value}/sample`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { values?: unknown[]; masked?: boolean };
        if (!response.ok) throw new Error("Sample data unavailable");
        if (active) setSamples((current) => ({ ...current, [value]: { status: "loaded", values: (body.values ?? []).map(String), masked: Boolean(body.masked) } }));
      })
      .catch(() => {
        if (active) setSamples((current) => ({ ...current, [value]: { status: "error", values: [], masked: false } }));
      });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [value, sampleAttempt]);

  function choose(fieldId: string) {
    onChange(fieldId);
    setOpen(false);
    setQuery("");
  }

  return <div className="business-field-control" ref={rootRef} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
    <span className="business-field-label" id={`${id}-label`}>{label}</span>
    <button className="business-field-trigger" type="button" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-label ${id}-value`} aria-controls={`${id}-listbox`} onClick={() => setOpen((current) => !current)}>
      <span id={`${id}-value`}>{selected ? <><strong>{selected.businessName}</strong><small>{selected.businessObjectName} · {selected.fieldRole.replaceAll("_", " ")}</small></> : <small>Select an approved Business Field</small>}</span>
      <span aria-hidden="true">⌄</span>
    </button>
    {open && <div className="business-field-popover">
      <label className="business-field-search" htmlFor={`${id}-search`}><span>⌕</span><input ref={searchRef} id={`${id}-search`} type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search field, object, type, or role…" /></label>
      <div className="business-field-results" aria-live="polite"><span>{filtered.length.toLocaleString()} matching fields</span>{query && <button type="button" onClick={() => setQuery("")}>Clear</button>}</div>
      <div className="business-field-list" id={`${id}-listbox`} role="listbox" aria-label={label}>
        {filtered.map((field) => <button type="button" role="option" aria-selected={field.id === value} className={field.id === value ? "selected" : ""} key={field.id} onClick={() => choose(field.id)}>
          <span className="business-field-icon" aria-hidden="true">ƒ</span>
          <span><strong>{field.businessName}</strong><small>{field.businessObjectName}</small></span>
          <span className="business-field-meta"><em>{field.fieldRole.replaceAll("_", " ")}</em><small>{field.businessType}</small></span>
        </button>)}
        {!filtered.length && <div className="business-field-empty"><strong>No fields found</strong><span>Try another field or object name.</span></div>}
      </div>
    </div>}
    {selected && <div className="business-field-sample" aria-live="polite">
      <span>Sample data{sample?.masked ? " · masked" : ""}</span>
      {(!sample || sample.status === "loading") && <small>Loading sample values…</small>}
      {sample?.status === "loaded" && (sample.values.length ? <div>{sample.values.map((item, index) => <code key={`${item}-${index}`}>{item || "(empty)"}</code>)}</div> : <small>No sample values returned.</small>)}
      {sample?.status === "error" && <small>Sample data is unavailable. <button type="button" onClick={() => { setSamples((current) => ({ ...current, [value]: { status: "loading", values: [], masked: false } })); setSampleAttempt((attempt) => attempt + 1); }}>Retry</button></small>}
    </div>}
    {helpText && <small className="business-field-help">{helpText}</small>}
  </div>;
}
