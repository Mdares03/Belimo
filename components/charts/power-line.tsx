'use client';

type Point = { hour: string; ton: number | null };

function formatTonTick(value: number) {
  if (value <= 0) return '0';
  if (value < 10) return value.toFixed(1);
  return Math.round(value).toLocaleString('en-US');
}

export function PowerLine({ points }: { points: Point[] }) {
  const numeric = points.map((p, idx) => ({ idx, ton: p.ton ?? 0 }));
  const max = Math.max(1, ...numeric.map((p) => p.ton));
  const width = 760;
  const height = 180;

  const padLeft = 46;
  const padRight = 14;
  const padTop = 12;
  const padBottom = 24;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const ticks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({ ratio, value: max * ratio }));

  const path = numeric
    .map((p) => {
      const x = padLeft + (p.idx / Math.max(1, numeric.length - 1)) * plotWidth;
      const y = padTop + (1 - p.ton / max) * plotHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="mt-4 overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[620px] w-full rounded-sm border border-border bg-surface-2">
        {ticks.map((tick) => {
          const y = padTop + (1 - tick.ratio) * plotHeight;
          return (
            <g key={`tick-${tick.ratio}`}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="currentColor" strokeOpacity="0.15" strokeDasharray="3 3" />
              <text x={padLeft - 6} y={y + 3} textAnchor="end" className="fill-ink-3 text-[9px] font-semibold">
                {formatTonTick(tick.value)}
              </text>
            </g>
          );
        })}

        <line x1={padLeft} y1={padTop} x2={padLeft} y2={height - padBottom} stroke="currentColor" strokeOpacity="0.2" />
        <line x1={padLeft} y1={height - padBottom} x2={width - padRight} y2={height - padBottom} stroke="currentColor" strokeOpacity="0.2" />

        <polyline fill="none" stroke="currentColor" strokeWidth="2.2" points={path} className="text-accent" />
        {numeric.map((p) => {
          const x = padLeft + (p.idx / Math.max(1, numeric.length - 1)) * plotWidth;
          const y = padTop + (1 - p.ton / max) * plotHeight;
          return <circle key={`${p.idx}-${p.ton}`} cx={x} cy={y} r="2.7" className="fill-accent" />;
        })}
      </svg>
      <div className="mt-2 flex min-w-[620px] items-start text-[11px] text-ink-3">
        {points.map((point) => (
          <div key={`${point.hour}-${point.ton ?? 'na'}`} className="w-0 flex-1 text-center" title={`${point.hour} · ${point.ton?.toFixed(2) ?? 'N/D'} TON`}>
            {point.hour}
          </div>
        ))}
      </div>
    </div>
  );
}
