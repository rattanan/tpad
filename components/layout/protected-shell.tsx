import { redirect } from "next/navigation";
import AppShell from "@/components/layout/app-shell";
import { getCurrentSession } from "@/lib/auth/session";

export default async function ProtectedShell({ children, adminOnly = false, dataSourceAccess = false }: { children: React.ReactNode; adminOnly?: boolean; dataSourceAccess?: boolean }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/change-password");
  if (adminOnly && session.user.role !== "ADMIN") redirect("/overview?error=forbidden");
  if (dataSourceAccess && session.user.role === "VIEWER") redirect("/overview?error=forbidden");
  return <AppShell user={session.user}>{children}</AppShell>;
}
