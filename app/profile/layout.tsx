import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
export default async function ProfileLayout({ children }: { children: React.ReactNode }) { if (!(await getCurrentSession())) redirect("/login"); return children; }
