"use client";

import { useState, type ComponentProps } from "react";
import { ArrowUp, AudioLines, ChevronDown, Mic, Plus, Search } from "lucide-react";
import { Sunburst } from "@/components/timeline/sunburst";

// Cosmetic example prompts (the flow resolves to the top ICP match regardless).
const SUGGESTIONS = [
  "Enterprise AI, scaling sales",
  "AI platforms hiring AEs",
  "Dataiku",
];

export function LandingInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (target: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");

  function submit(target: string) {
    const trimmed = target.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
  }

  const hasText = value.trim().length > 0;

  return (
    <div className="flex min-h-[72vh] flex-col items-center justify-center">
      <div className="mb-8 flex items-center gap-3">
        <Sunburst className="size-8" />
        <h1 className="font-serif text-[2.5rem] leading-none font-normal tracking-tight text-foreground">
          Who are we targeting?
        </h1>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(value);
        }}
        className="w-full max-w-2xl rounded-3xl border border-border bg-card px-2.5 pt-3.5 pb-2.5 shadow-sm transition-shadow focus-within:shadow-md"
      >
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Name a company or paste a domain to prospect…"
          disabled={disabled}
          autoFocus
          className="w-full bg-transparent px-2.5 pt-1 pb-10 text-[15px] text-foreground outline-none placeholder:text-muted-foreground/80"
        />

        <div className="flex items-center gap-2">
          <IconGhost aria-label="Add">
            <Plus className="size-[18px]" />
          </IconGhost>

          <div className="flex items-center rounded-md border border-border p-0.5 text-[13px]">
            <span className="rounded-sm bg-secondary px-2.5 py-0.5 font-medium text-foreground">
              Chat
            </span>
            <span className="px-2.5 py-0.5 text-muted-foreground">Cowork</span>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="flex items-center gap-1 px-1.5 text-[13px] text-foreground">
              Opus 4.8
              <span className="text-muted-foreground">High</span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </span>
            {hasText ? (
              <button
                type="submit"
                disabled={disabled}
                aria-label="Send"
                className="flex size-8 items-center justify-center rounded-full bg-brand text-brand-foreground transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
              >
                <ArrowUp className="size-[18px]" />
              </button>
            ) : (
              <>
                <IconGhost aria-label="Dictate">
                  <Mic className="size-[18px]" />
                </IconGhost>
                <IconGhost aria-label="Voice">
                  <AudioLines className="size-[18px]" />
                </IconGhost>
              </>
            )}
          </div>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={disabled}
            onClick={() => submit(suggestion)}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-[13px] text-foreground/80 shadow-sm transition-colors hover:bg-secondary disabled:opacity-50"
          >
            <Search className="size-3.5 text-muted-foreground" />
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function IconGhost({
  children,
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      {...props}
    >
      {children}
    </button>
  );
}
