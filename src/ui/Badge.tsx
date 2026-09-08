import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "green" | "amber" | "red" | "accent" | "neutral";

const tones: Record<Tone, string> = {
  green: "text-eb-green bg-eb-green-bg",
  amber: "text-eb-amber bg-eb-amber-bg",
  red: "text-eb-red bg-eb-red-bg",
  accent: "text-eb-accent-text bg-eb-accent-soft",
  neutral: "text-eb-secondary bg-eb-chip",
};

const dotTones: Record<Tone, string> = {
  green: "bg-eb-green",
  amber: "bg-eb-amber",
  red: "bg-eb-red",
  accent: "bg-eb-accent-text",
  neutral: "bg-eb-secondary",
};

/** Status badge. `dot` adds the 6px status dot (Summarized, Connected, Bot will join…). */
export function Badge({
  tone = "neutral",
  dot,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill py-[3px] pr-[9px] text-xs font-medium whitespace-nowrap font-dmsans",
        dot ? "pl-2" : "pl-[9px]",
        tones[tone],
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotTones[tone])} />}
      {children}
    </span>
  );
}
