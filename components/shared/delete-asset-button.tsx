"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  assetId: string;
  assetName: string;
  assetType: "dashboard" | "KPI" | "Business Context Model";
  endpoint: string;
  returnHref: string;
};

export default function DeleteAssetButton({ assetId, assetName, assetType, endpoint, returnHref }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleId = `delete-${assetType.toLowerCase()}-${assetId}-title`;

  async function remove() {
    setBusy(true);
    setError("");
    const response = await fetch(endpoint, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      setBusy(false);
      setError(result.error || `Unable to delete ${assetType}`);
      return;
    }
    router.push(returnHref);
    router.refresh();
  }

  return <>
    <div className="asset-delete-dock"><button className="asset-delete-trigger" onClick={() => setOpen(true)} aria-label={`Delete ${assetType}`} title={`Delete ${assetType}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M9 7l1-3h4l1 3m-9 0 1 13h10l1-13"/></svg></button></div>
    {open && <div className="modal-backdrop asset-delete-backdrop" onMouseDown={() => !busy && setOpen(false)}>
      <section className="modal asset-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
        <span className="asset-delete-icon" aria-hidden="true">!</span>
        <p className="eyebrow">DESTRUCTIVE ACTION</p>
        <h2 id={titleId}>Delete {assetType}?</h2>
        <p><strong>{assetName}</strong> will disappear from active lists and cannot be selected for new work.</p>
        <div className="asset-delete-note">Version history, audit records, and existing published snapshots are retained for governance.</div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button className="secondary-button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button className="danger-button" disabled={busy} onClick={() => void remove()}>{busy && <span className="button-spinner"/>}{busy ? "Deleting…" : `Delete ${assetType}`}</button></div>
      </section>
    </div>}
  </>;
}
