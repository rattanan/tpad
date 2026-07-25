import ProtectedShell from "@/components/layout/protected-shell";
export default function MetadataLayout({ children }: { children: React.ReactNode }) { return <ProtectedShell dataSourceAccess>{children}</ProtectedShell>; }
