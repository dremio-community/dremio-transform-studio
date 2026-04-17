"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, XCircle, Info, X } from "lucide-react";

import { cn } from "./utils";

type AlertVariant = "warning" | "error" | "success" | "fyi";

interface AlertProps extends React.ComponentProps<"div"> {
  variant?: AlertVariant;
  multiLine?: boolean;
  message?: React.ReactNode;
  extra?: React.ReactNode;
  action?: React.ReactNode;
  onAction?: () => void;
  dismissible?: boolean;
  onDismiss?: () => void;
}

const bgMap: Record<AlertVariant, string> = {
  warning: "bg-status-warning-bg",
  error:   "bg-status-error-bg",
  success: "bg-status-success-bg",
  fyi:     "bg-status-info-bg",
};

const iconColorMap: Record<AlertVariant, string> = {
  warning: "text-status-warning",
  error:   "text-status-error",
  success: "text-status-success",
  fyi:     "text-status-info",
};

function StatusIcon({ variant }: { variant: AlertVariant }) {
  const cls = cn("shrink-0", iconColorMap[variant]);
  switch (variant) {
    case "warning": return <AlertTriangle size={20} className={cls} />;
    case "error":   return <XCircle size={20} className={cls} />;
    case "success": return <CheckCircle2 size={20} className={cls} />;
    case "fyi":     return <Info size={20} className={cls} />;
  }
}

function Alert({
  className,
  variant = "fyi",
  multiLine = false,
  message,
  extra,
  action,
  onAction,
  dismissible = false,
  onDismiss,
  children,
  ...props
}: AlertProps) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(
        "flex gap-2 px-2 py-1.5 w-full",
        bgMap[variant],
        multiLine ? "items-start" : "h-[32px] items-center",
        className,
      )}
      {...props}
    >
      <StatusIcon variant={variant} />

      {multiLine ? (
        <div className="flex flex-col gap-2 flex-1 min-w-0 text-xs text-foreground">
          <p className="whitespace-pre-wrap">
            {message}
            {extra && expanded && (
              <>
                {"  "}
                <button type="button" onClick={() => setExpanded(false)} className="underline underline-offset-2">
                  Show less
                </button>
              </>
            )}
          </p>
          {extra && (
            <p className="whitespace-pre-wrap">
              {expanded ? extra : (
                <>
                  {extra}{" "}
                  <button type="button" onClick={() => setExpanded(true)} className="underline underline-offset-2">
                    Show more
                  </button>
                </>
              )}
            </p>
          )}
          {children}
        </div>
      ) : (
        <p className="flex-1 min-w-0 text-xs text-foreground">
          {message}
          {children}
        </p>
      )}

      {!multiLine && action && (
        <button
          type="button"
          onClick={onAction}
          className={cn("shrink-0 text-xs font-semibold", iconColorMap[variant])}
        >
          {action}
        </button>
      )}

      {dismissible && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="shrink-0 text-icon-default hover:text-foreground transition-colors"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("font-semibold text-xs", className)} {...props} />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("text-xs text-foreground", className)} {...props} />
  );
}

export { Alert, AlertTitle, AlertDescription };
export type { AlertVariant, AlertProps };
