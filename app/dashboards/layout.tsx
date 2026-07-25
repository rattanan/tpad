import ProtectedShell from "@/components/layout/protected-shell";
export default function DashboardsLayout({ children }: { children: React.ReactNode }) { return <ProtectedShell>{children}</ProtectedShell>; }
