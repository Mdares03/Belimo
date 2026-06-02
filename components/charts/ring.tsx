export function Ring({ pct }: { pct: number }) {
  const color = pct < 50 ? "var(--color-bad)" : "var(--color-good)";
  return <div className="grid h-[82px] w-[82px] place-items-center rounded-full" style={{ background: `conic-gradient(${color} ${pct}%, var(--color-surface-3) 0)` }}><div className="grid h-[58px] w-[58px] place-items-center rounded-full bg-white"><span className="num text-lg font-extrabold">{pct}%</span></div></div>;
}
