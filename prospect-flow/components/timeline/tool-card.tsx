"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ToolCardProps = {
  /** Lucide icon representing the tool. */
  icon: ComponentType<{ className?: string }>;
  name: string;
  /** Shown while running, e.g. "querying company data…". */
  runningLabel: string;
  /** Shown once complete, e.g. "queried company + persona data". */
  doneLabel: string;
  /** Controlled: true while the agent is "working" on this tool. */
  running: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
};

/**
 * A tool-call card with a controlled running → done state. While `running`,
 * it shows a spinner and hides its body; once done it reveals results.
 * Collapsible after completion.
 */
export function ToolCard({
  icon: Icon,
  name,
  runningLabel,
  doneLabel,
  running,
  defaultOpen = true,
  children,
}: ToolCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const expanded = open && !running;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border bg-card shadow-sm transition-colors",
        running ? "border-brand/30" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={() => !running && setOpen((prev) => !prev)}
        disabled={running}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <Icon
          className={cn(
            "size-[18px] shrink-0 transition-colors",
            running ? "text-brand" : "text-muted-foreground",
          )}
        />

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{name}</span>
          <span className="block truncate text-[13px] text-muted-foreground">
            {running ? runningLabel : doneLabel}
          </span>
        </span>

        {running ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-brand" />
        ) : (
          <>
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
              <Check className="size-3.5" />
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground/70 transition-transform",
                open && "rotate-180",
              )}
            />
          </>
        )}
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border px-4 py-3.5 text-[13px]">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Small uppercase section label used inside tool bodies. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 text-[11px] font-medium tracking-[0.08em] text-muted-foreground/80 uppercase">
      {children}
    </div>
  );
}
