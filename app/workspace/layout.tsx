import { redirect } from "next/navigation";
import ProtectedShell from "@/components/layout/protected-shell";
import { getCurrentSession } from "@/lib/auth/session";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.user.role === "VIEWER") redirect("/dashboards?error=workspace-forbidden");
  return <ProtectedShell>{children}</ProtectedShell>;
}
