import { MailCheck } from "lucide-react";
import type { EmailData } from "@/lib/types";

export function EmailCard({ data }: { data: EmailData }) {
  const label = data.recipientKind === "prospect" ? "Prospect" : "BDR (you)";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
          <MailCheck className="size-4" />
        </span>
        <span className="text-sm font-semibold text-foreground">Email sent</span>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="space-y-1 pl-9.5 text-[13px]">
        <div>
          <span className="text-muted-foreground">To </span>
          <span className="text-foreground">{data.to}</span>
        </div>
        <div className="font-medium text-foreground">{data.subject}</div>
        <div className="text-muted-foreground">{data.preview}</div>
      </div>
    </div>
  );
}
