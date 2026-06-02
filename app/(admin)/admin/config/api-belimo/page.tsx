import { ApiBelimoPanel } from '@/components/admin/api-belimo-panel';
import { getBelimoConnectionStatus } from '@/lib/belimo';
import { getIngestHealthSummary } from '@/lib/ingest-health';

export const dynamic = 'force-dynamic';

export default async function ApiBelimoPage() {
  const [belimo, health] = await Promise.all([getBelimoConnectionStatus(), getIngestHealthSummary()]);
  return <ApiBelimoPanel belimo={belimo} health={health} />;
}
