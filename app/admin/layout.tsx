import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { canManageUsers } from "@/lib/auth/permissions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!canManageUsers(session.user.role)) redirect("/profile?error=forbidden");
  if (session.user.mustChangePassword) redirect("/change-password");
  return children;
}
