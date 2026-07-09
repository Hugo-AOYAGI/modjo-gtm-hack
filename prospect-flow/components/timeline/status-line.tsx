import { Check } from "lucide-react";

export function StatusLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5 px-1 text-[13px] text-muted-foreground">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
        <Check className="size-3.5" />
      </span>
      {text}
    </div>
  );
}
