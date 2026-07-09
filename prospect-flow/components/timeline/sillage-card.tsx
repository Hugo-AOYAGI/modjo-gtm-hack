import { Radar, TrendingUp } from "lucide-react";
import { FieldLabel, ToolCard } from "@/components/timeline/tool-card";
import { cn } from "@/lib/utils";
import type { SillageData } from "@/lib/types";

export function SillageCard({ data, running }: { data: SillageData; running: boolean }) {
  return (
    <ToolCard
      icon={Radar}
      name="Sillage"
      runningLabel="researching company + personas…"
      doneLabel="queried company + persona data"
      running={running}
    >
      <FieldLabel>Query</FieldLabel>
      <div className="mb-4 rounded-lg bg-secondary/70 p-3 font-mono text-[12px] leading-relaxed text-foreground/80">
        <div>
          <span className="text-muted-foreground">domain:</span> {data.domain}
        </div>
        <div>
          <span className="text-muted-foreground">looking_for:</span> {data.lookingFor}
        </div>
      </div>

      {data.signals && data.signals.length > 0 && (
        <>
          <FieldLabel>Signals</FieldLabel>
          <div className="mb-4 flex flex-col gap-1.5">
            {data.signals.map((signal) => (
              <div
                key={signal}
                className="flex items-start gap-2 rounded-lg border border-transparent bg-secondary/40 px-3 py-2 text-[12px] text-foreground/80"
              >
                <TrendingUp className="mt-0.5 size-3.5 shrink-0 text-brand" />
                <span>{signal}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <FieldLabel>{data.candidates.length} candidates</FieldLabel>
      <div className="flex flex-col gap-1.5">
        {data.candidates.map((candidate) => (
          <div
            key={candidate.name}
            className={cn(
              "flex items-center justify-between rounded-lg border px-3 py-2 text-[13px]",
              candidate.highlighted
                ? "border-brand/30 bg-brand-soft/60"
                : "border-transparent bg-secondary/40 text-muted-foreground",
            )}
          >
            <span>
              <span className={cn(candidate.highlighted && "font-medium text-foreground")}>
                {candidate.name}
              </span>
              <span className={cn(!candidate.highlighted && "text-muted-foreground")}>
                {" "}
                · {candidate.title}
              </span>
            </span>
            {candidate.highlighted && (
              <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold tracking-wide text-brand-foreground uppercase">
                Champion
              </span>
            )}
          </div>
        ))}
      </div>
    </ToolCard>
  );
}
