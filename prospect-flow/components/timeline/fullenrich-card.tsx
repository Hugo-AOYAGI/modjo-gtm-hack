import { Sparkles } from "lucide-react";
import { FieldLabel, ToolCard } from "@/components/timeline/tool-card";
import type { FullEnrichData } from "@/lib/types";

export function FullEnrichCard({ data, running }: { data: FullEnrichData; running: boolean }) {
  return (
    <ToolCard
      icon={Sparkles}
      name="FullEnrich"
      runningLabel="enriching contact details…"
      doneLabel="enriched champion contact"
      running={running}
    >
      <FieldLabel>Target</FieldLabel>
      <div className="mb-4 text-[13px] text-foreground">
        {data.targetName} · {data.targetTitle}, {data.targetCompany}
      </div>

      <FieldLabel>Enriched fields</FieldLabel>
      <div className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-2">
        {data.fields.map((field) => (
          <div key={field.label} className="contents">
            <div className="text-[13px] text-muted-foreground">{field.label}</div>
            <div className="text-[13px] text-foreground">{field.value}</div>
          </div>
        ))}
      </div>
    </ToolCard>
  );
}
