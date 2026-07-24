import { notFound } from "next/navigation";
import UserDetailForm from "@/components/admin/user-detail-form";
import { getUser } from "@/lib/users/service";
export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) { const user = await getUser((await params).id); if (!user) notFound(); return <main className="simple-page"><section className="simple-card form-card"><p className="eyebrow">ADMINISTRATION / USERS</p><h1>{user.fullName}</h1><p>@{user.username} · Created {user.createdAt.toLocaleDateString()} · Last login {user.lastLoginAt?.toLocaleString() ?? "Never"}</p><UserDetailForm user={{ ...user, createdAt: user.createdAt.toISOString(), lastLoginAt: user.lastLoginAt?.toISOString() ?? null }} /></section></main>; }
