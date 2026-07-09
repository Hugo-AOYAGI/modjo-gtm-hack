import { Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolCard } from "@/components/timeline/tool-card";
import type { DeckData } from "@/lib/types";

export function DeckCard({ data, running }: { data: DeckData; running: boolean }) {
  return (
    <ToolCard
      icon={Presentation}
      name="Gamma"
      runningLabel="building the presentation…"
      doneLabel="presentation ready"
      running={running}
    >
      <div className="flex items-center gap-3.5">
        <div className="grid h-14 w-20 shrink-0 place-items-center rounded-lg border border-border bg-gradient-to-br from-secondary to-background text-muted-foreground/60">
          <Presentation className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-foreground">
            {data.title}
          </div>
          <div className="text-[13px] text-muted-foreground">
            {data.slideCount} slides · {data.subtitle}
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          disabled={!data.url}
          onClick={() => data.url && window.open(data.url, "_blank", "noopener")}
        >
          View deck
        </Button>
      </div>
    </ToolCard>
  );
}
