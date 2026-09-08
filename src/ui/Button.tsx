import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "dark" | "destructive";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "md" | "sm";
  /** A lucide icon, e.g. <Mic size={15} /> */
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  /** Full width — mobile save buttons */
  block?: boolean;
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-pill font-dmsans font-medium " +
  "whitespace-nowrap tracking-[-0.005em] border border-transparent cursor-pointer " +
  "transition-colors disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-eb-accent-top to-eb-accent text-white shadow-eb-primary hover:to-eb-accent-hover",
  secondary:
    "bg-gradient-to-b from-white to-eb-btn-bottom text-eb-text border-eb-border shadow-eb-btn hover:to-eb-row-hover",
  dark: "bg-eb-sidebar text-white shadow-eb-dark hover:bg-eb-sidebar-raised",
  destructive: "bg-white text-eb-red border-eb-red-border shadow-eb-btn hover:bg-eb-red-bg",
};

// forwardRef because Radix triggers (`asChild`) hand this component a ref — a
// plain function component drops it and the trigger never opens its dialog.
export const Button = React.forwardRef<HTMLButtonElement, Props>(function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  block,
  className,
  children,
  ...rest
}: Props, ref) {
  const iconOnly = !children;
  return (
    <button
      ref={ref}
      {...rest}
      className={cn(
        base,
        variants[variant],
        size === "sm" ? "h-8 text-[12.5px]" : "h-9 text-[13.5px]",
        iconOnly ? "p-0" : icon ? "pl-[14px] pr-4" : "px-[18px]",
        iconOnly && (size === "sm" ? "w-8" : "w-9"),
        block && "w-full",
        className,
      )}
    >
      {icon && (
        <span className={cn("flex", variant === "secondary" && children && "text-eb-secondary")}>
          {icon}
        </span>
      )}
      {children}
      {iconRight && <span className="flex">{iconRight}</span>}
    </button>
  );
});

/**
 * The Record control. Main label and chevron segment share one pill, split by a
 * 1px rule. `onMain` records; `onMenu` opens the source menu.
 */
export function SplitButton({
  icon,
  children,
  onMain,
  onMenu,
  className,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onMain?: () => void;
  onMenu?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-9 items-stretch overflow-hidden rounded-pill",
        "bg-gradient-to-b from-eb-accent-top to-eb-accent text-white shadow-eb-primary",
        className,
      )}
    >
      <button
        onClick={onMain}
        className="inline-flex items-center gap-2 pl-[14px] pr-4 font-dmsans text-[13.5px] font-medium"
      >
        {icon}
        {children}
      </button>
      <button
        onClick={onMenu}
        aria-label="Recording options"
        className="inline-flex w-8 items-center justify-center border-l border-white/[.22]"
      >
        <ChevronDown size={15} strokeWidth={2} />
      </button>
    </div>
  );
}
