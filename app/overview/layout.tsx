import ProtectedShell from "@/components/layout/protected-shell";
export default function OverviewLayout({ children }: { children: React.ReactNode }) { return <ProtectedShell>{children}</ProtectedShell>; }
