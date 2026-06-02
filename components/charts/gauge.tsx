export function Gauge({ pct }: { pct: number }) {
  const dash = 308;
  const offset = dash - dash * (pct / 100);
  const angle = pct / 100 * 180 - 90;
  return <div className="relative mx-auto mt-1 h-[132px] w-[240px]">
    <svg viewBox="0 0 240 240" className="absolute left-0 top-0 h-[240px] w-[240px]">
      <path d="M22 122 A100 100 0 0 1 218 122" fill="none" stroke="var(--color-surface-3)" strokeWidth="18" strokeLinecap="round" />
      <path d="M22 122 A100 100 0 0 1 218 122" fill="none" stroke="var(--color-good)" strokeWidth="18" strokeLinecap="round" strokeDasharray={dash} strokeDashoffset={offset} />
    </svg>
    <div className="absolute bottom-2 left-1/2 h-0 w-0">
      <div className="absolute -bottom-1 -left-[3px] h-1.5 w-1.5 rounded-full bg-ink" />
      <div className="absolute bottom-0 -left-[1.5px] h-[92px] w-[3px] origin-bottom rounded bg-ink" style={{ transform: `rotate(${angle}deg)` }} />
    </div>
    <div className="absolute bottom-0 left-0 right-0 text-center"><div className="num text-[42px] font-extrabold leading-none tracking-tight">{pct}<span className="text-[22px]">%</span></div><div className="mt-0.5 text-xs text-ink-2">de tu mes típico</div></div>
  </div>;
}
