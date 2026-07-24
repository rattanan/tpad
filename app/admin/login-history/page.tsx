import LogTable from "@/components/admin/log-table";
export default function LoginHistoryPage() { return <main className="simple-page security-width"><section className="simple-card"><p className="eyebrow">ADMINISTRATION</p><h1>Login history</h1><p>Successful, failed, locked and expired authentication events.</p><LogTable kind="login" /></section></main>; }
