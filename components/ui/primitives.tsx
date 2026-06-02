import { clsx } from "clsx";
import type { ReactNode } from "react";

export type Tone = "good" | "warn" | "bad" | "neutral" | "accent";

const toneClass: Record<Tone, string> = {
  good: "bg-good-soft text-good-ink [&_.dot]:bg-good",
  warn: "bg-warn-soft text-warn-ink [&_.dot]:bg-warn",
  bad: "bg-bad-soft text-bad-ink [&_.dot]:bg-bad",
  neutral: "bg-surface-3 text-ink-2 [&_.dot]:bg-ink-3",
  accent: "bg-accent-soft text-accent-ink [&_.dot]:bg-accent",
};

export function Button({ children, variant = "solid", size = "md", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost"; size?: "sm" | "md" }) {
  return <button className={clsx("inline-flex items-center justify-center gap-2 rounded-sm font-bold transition hover:-translate-y-px", size === "sm" ? "px-3 py-2 text-xs" : "px-5 py-3 text-sm", variant === "solid" ? "bg-accent text-white shadow-[0_6px_16px_-6px_rgba(0,84,118,.7)]" : "border border-border-2 bg-surface text-ink shadow-card hover:bg-surface-2", className)} {...props}>{children}</button>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("card", className)}>{children}</div>;
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold", toneClass[tone])}><span className="dot h-[7px] w-[7px] rounded-full" />{children}</span>;
}

export function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[11px] bg-surface-3 text-[13px] font-bold text-ink-2">{initials}</span>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx("w-full rounded-sm border border-border-2 bg-surface px-4 py-2.5 text-sm text-ink shadow-card placeholder:text-ink-3", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx("rounded-sm border border-border-2 bg-surface py-2.5 pl-4 pr-9 text-sm text-ink shadow-card", props.className)} />;
}

export function PageHead({ title, children }: { title: string; children: ReactNode }) {
  return <div className="mb-6"><h1 className="text-[27px] font-extrabold tracking-tight">{title}</h1><p className="mt-1.5 max-w-[60ch] text-ink-2">{children}</p></div>;
}

export function StatusDot({ status }: { status: string }) {
  const cls = status === "OK" ? "bg-good" : status === "ALERTA" ? "bg-warn" : status === "ERROR" ? "bg-bad" : "bg-ink-3";
  return <span className={clsx("inline-block h-[9px] w-[9px] rounded-full", cls)} />;
}
