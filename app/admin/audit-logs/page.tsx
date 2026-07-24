import LogTable from "@/components/admin/log-table";
export default function AuditLogsPage() { return <main className="simple-page security-width"><section className="simple-card"><p className="eyebrow">ADMINISTRATION</p><h1>Audit logs</h1><p>Append-only security and administration activity.</p><LogTable kind="audit" /></section></main>; }
