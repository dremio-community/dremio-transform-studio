import * as React from "react";

import { cn } from "./utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-[32px] w-full min-w-0 rounded-button border border-border bg-input-background px-2 py-1 text-sm text-foreground outline-none transition-colors",
        "placeholder:text-muted-foreground",
        "hover:border-border-hover",
        "focus-visible:border-ring focus-visible:ring-0",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-background",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
