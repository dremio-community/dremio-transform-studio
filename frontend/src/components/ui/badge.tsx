import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-button border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 gap-1 transition-colors overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-background text-foreground",
        secondary:
          "border-transparent bg-grey-hover text-secondary-foreground",
        destructive:
          "border-transparent bg-status-error-bg text-status-error",
        success:
          "border-transparent bg-status-success-bg text-status-success",
        warning:
          "border-transparent bg-status-warning-bg text-status-warning",
        info:
          "border-transparent bg-status-info-bg text-status-info",
        outline:
          "text-foreground border-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
