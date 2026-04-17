import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-button text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        // Primary: teal bg → darker teal on hover
        default:
          "bg-primary text-primary-foreground hover:bg-sidebar-primary",
        // Destructive: red bg → darker red on hover
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive-hover",
        // Outline: white bg, border, foreground text
        outline:
          "border border-border bg-card text-foreground hover:bg-grey-hover",
        // Secondary: white bg, grey text, thin border → light grey on hover
        secondary:
          "bg-card text-secondary-foreground border border-border hover:bg-background",
        // Ghost: transparent bg, accent text → tinted bg on hover
        ghost:
          "text-accent hover:bg-background-hover",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[32px] px-[8px] min-w-[100px]",
        sm:      "h-[32px] px-[8px] min-w-[100px]",
        lg:      "h-[40px] px-4 min-w-[100px]",
        icon:    "size-[32px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean;
    }
>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
});
Button.displayName = "Button";

export { Button, buttonVariants };
