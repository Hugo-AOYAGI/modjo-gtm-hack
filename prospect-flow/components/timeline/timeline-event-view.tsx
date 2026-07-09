import { ChampionCard } from "@/components/timeline/champion-card";
import { DeckCard } from "@/components/timeline/deck-card";
import { EmailCard } from "@/components/timeline/email-card";
import { FullEnrichCard } from "@/components/timeline/fullenrich-card";
import { LiveCallCard } from "@/components/timeline/live-call-card";
import { ReasoningLine } from "@/components/timeline/reasoning-line";
import { SillageCard } from "@/components/timeline/sillage-card";
import { UserPromptBubble } from "@/components/timeline/user-prompt-bubble";
import { WebSearchCard } from "@/components/timeline/web-search-card";
import type { Company, TimelineEvent } from "@/lib/types";

export type TimelineContext = {
  runningId: string | null;
  companySelectionActive: boolean;
  selectedCompany: string | null;
  onSelectCompany: (company: Company) => void;
  onConfirmChampion: () => void;
  onPickDifferentPersona: () => void;
  onCallEnded: () => void;
  onArtifact: (msg: Record<string, unknown>) => void;
  championActionsDisabled: boolean;
  callArmed: boolean;
  onDial: () => void;
};

/** Add a new TimelineEvent variant + a case here to introduce a new stage. */
export function TimelineEventView({
  event,
  ctx,
}: {
  event: TimelineEvent;
  ctx: TimelineContext;
}) {
  const running = ctx.runningId === event.id;

  switch (event.type) {
    case "user-prompt":
      return <UserPromptBubble text={event.text} />;
    case "reasoning":
      return <ReasoningLine text={event.text} />;
    case "tool-call":
      if (event.tool === "web-search")
        return (
          <WebSearchCard
            data={event.data}
            running={running}
            selectionActive={ctx.companySelectionActive}
            selectedCompany={ctx.selectedCompany}
            onSelect={ctx.onSelectCompany}
          />
        );
      if (event.tool === "sillage") return <SillageCard data={event.data} running={running} />;
      if (event.tool === "fullenrich")
        return <FullEnrichCard data={event.data} running={running} />;
      return <DeckCard data={event.data} running={running} />;
    case "champion-confirm":
      return (
        <ChampionCard
          champion={event.champion}
          onConfirm={ctx.onConfirmChampion}
          onPickDifferent={ctx.onPickDifferentPersona}
          disabled={ctx.championActionsDisabled}
        />
      );
    case "live-call":
      return (
        <LiveCallCard
          champion={event.champion}
          armed={ctx.callArmed}
          onDial={ctx.onDial}
          onEnded={ctx.onCallEnded}
          onArtifact={ctx.onArtifact}
        />
      );
    case "email":
      return <EmailCard data={event.data} />;
    default:
      return null;
  }
}
