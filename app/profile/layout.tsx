import ProtectedShell from "@/components/layout/protected-shell";
export default async function ProfileLayout({ children }: { children: React.ReactNode }) { return <ProtectedShell>{children}</ProtectedShell>; }
