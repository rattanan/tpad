import ProtectedShell from "@/components/layout/protected-shell";
export default async function DataSourcesLayout({ children }: { children: React.ReactNode }) { return <ProtectedShell dataSourceAccess>{children}</ProtectedShell>; }
