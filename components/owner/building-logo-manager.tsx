'use client';

import { Button } from '@/components/ui/primitives';

export function BuildingLogoManager({ buildingId, logoUrl }: { buildingId: string; logoUrl: string | null }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="h-24 w-24 overflow-hidden rounded-sm border border-border bg-surface-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo del edificio" className="h-full w-full object-contain" />
          ) : (
            <div className="grid h-full place-items-center text-xs text-ink-3">Sin logo</div>
          )}
        </div>
        <form action="/api/buildings/logo" method="post" encType="multipart/form-data" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="buildingId" value={buildingId} />
          <input type="file" name="logo" accept="image/png,image/jpeg,image/svg+xml" required className="text-sm" />
          <Button type="submit" variant="ghost">Subir / reemplazar</Button>
        </form>
        <button
          type="button"
          className="rounded-sm border border-border-2 bg-surface px-3 py-2 text-xs font-bold"
          onClick={async () => {
            await fetch(`/api/buildings/logo?buildingId=${encodeURIComponent(buildingId)}`, { method: 'DELETE' });
            location.reload();
          }}
        >
          Quitar logo
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-3">Formatos: PNG/JPG/SVG · máximo 2MB · dimensión máxima 4096px.</p>
    </div>
  );
}
