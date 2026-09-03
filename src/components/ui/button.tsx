import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80",
        outline: "border border-input bg-background hover:bg-secondary hover:text-secondary-foreground active:bg-secondary/80",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70",
        ghost: "hover:bg-secondary hover:text-secondary-foreground active:bg-secondary/80",
        link: "text-accent underline-offset-4 hover:underline",
        accent: "bg-ember text-white hover:bg-ember-deep active:bg-ember-dark rounded-xl font-medium",
        recording: "bg-recording text-recording-foreground hover:bg-recording/90 active:bg-recording/80",
      },
      // Heights are touch-first: every interactive size clears the 44px
      // tap target on coarse pointers and tightens up on mouse (`md:`).
      size: {
        default: "h-11 px-4 py-2 md:h-8 md:px-3 md:py-1.5",
        sm: "h-10 rounded-md px-3 text-xs md:h-7 md:px-2.5",
        lg: "h-11 rounded-md px-5 md:h-9 md:px-4",
        xl: "h-12 rounded-md px-6 md:h-10",
        icon: "h-11 w-11 md:h-8 md:w-8",
        iconLg: "h-11 w-11 md:h-10 md:w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
