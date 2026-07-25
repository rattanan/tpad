import ProtectedShell from "@/components/layout/protected-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell adminOnly>{children}</ProtectedShell>;
}
