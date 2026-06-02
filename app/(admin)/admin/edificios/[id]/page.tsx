import { BuildingDetailClient } from "./building-detail-client";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <BuildingDetailClient id={id} />; }
