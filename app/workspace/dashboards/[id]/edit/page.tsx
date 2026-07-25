import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { getDashboardWorkspace } from "@/lib/dashboards/service";
import DashboardBuilder from "@/components/dashboards/dashboard-builder";
import DeleteAssetButton from "@/components/shared/delete-asset-button";
import PublishSettings from "@/components/dashboards/publish-settings";
export default async function DashboardEditPage({params}:{params:Promise<{id:string}>}){const session=await getCurrentSession();if(!session)redirect("/login");let data;try{data=await getDashboardWorkspace((await params).id,session.user);}catch(error){if(error instanceof Error&&error.message.toLowerCase().includes("not found"))notFound();throw error;}return <><PublishSettings dashboard={data.dashboard} canPublish={data.permissions.canPublish}/><DashboardBuilder dataJson={JSON.stringify(data)}/>{data.permissions.canDelete&&<DeleteAssetButton assetId={data.dashboard.id} assetName={data.dashboard.name} assetType="dashboard" endpoint={`/api/dashboards/${data.dashboard.id}`} returnHref="/workspace/dashboards"/>}</>}
