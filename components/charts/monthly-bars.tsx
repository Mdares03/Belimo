"use client";

import { useState } from "react";

type MonthBar = { id?: string; label: string; value: number; tonHr?: number; current?: boolean };

function formatTonHrTick(value: number) {
  if (value <= 0) return "0";
  if (value < 10) return value.toFixed(1);
  return Math.round(value).toLocaleString("en-US");
}

export function MonthlyBars({ data }: { data: MonthBar[] }) {
  const [active, setActive] = useState<string | null>(null);
  const maxTonHr = Math.max(1, ...data.map((month) => month.tonHr ?? month.value));
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({ ratio, value: maxTonHr * ratio }));

  return (
    <div className="mt-4 grid grid-cols-[54px_1fr] gap-2">
      <div className="relative h-28">
        {ticks.map((tick) => (
          <div
            key={tick.ratio}
            className="absolute right-0 -translate-y-1/2 text-[10px] font-semibold text-ink-3"
            style={{ bottom: `${tick.ratio * 100}%` }}
          >
            {formatTonHrTick(tick.value)}
          </div>
        ))}
      </div>

      <div>
        <div className="relative h-28">
          <div className="pointer-events-none absolute inset-0">
            {ticks.map((tick) => (
              <div
                key={`grid-${tick.ratio}`}
                className="absolute left-0 right-0 border-t border-dashed border-border"
                style={{ bottom: `${tick.ratio * 100}%` }}
              />
            ))}
          </div>

          <div
            className="relative grid h-full gap-2.5 px-0.5"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, data.length)}, minmax(0, 1fr))` }}
          >
            {data.map((month) => {
              const id = month.id ?? month.label;
              const isActive = active === id;
              const tonHr = month.tonHr ?? month.value;
              const pct = Math.max(0, Math.min(100, (tonHr / maxTonHr) * 100));

              return (
                <div key={id} className="group relative flex h-full items-end justify-center">
                  {isActive && (
                    <div className="pointer-events-none absolute -top-6 z-10 rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-white">
                      {Math.round(tonHr).toLocaleString("en-US")} TON-hr
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label={`${month.label}: ${Math.round(tonHr).toLocaleString("en-US")} TON-hr`}
                    className={month.current || isActive
                      ? "w-full max-w-[34px] rounded-t-lg rounded-b bg-ink-2 transition"
                      : "w-full max-w-[34px] rounded-t-lg rounded-b bg-ink-3/55 transition group-hover:bg-ink-3/80"}
                    style={{ height: `${pct}%` }}
                    onMouseEnter={() => setActive(id)}
                    onMouseLeave={() => setActive((prev) => (prev === id ? null : prev))}
                    onFocus={() => setActive(id)}
                    onBlur={() => setActive((prev) => (prev === id ? null : prev))}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="mt-2 grid gap-2.5 px-0.5"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, data.length)}, minmax(0, 1fr))` }}
        >
          {data.map((month) => {
            const id = month.id ?? month.label;
            return (
              <div key={`label-${id}`} className={month.current ? "text-center text-[11px] font-semibold text-accent-ink" : "text-center text-[11px] font-semibold text-ink-3"}>
                {month.label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
