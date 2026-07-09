import { Mail, Phone, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Champion } from "@/lib/types";

type ChampionCardProps = {
  champion: Champion;
  onConfirm: () => void;
  onPickDifferent: () => void;
  disabled?: boolean;
};

export function ChampionCard({
  champion,
  onConfirm,
  onPickDifferent,
  disabled,
}: ChampionCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 text-[11px] font-medium tracking-[0.08em] text-brand uppercase">
        Champion identified
      </div>

      <div className="mb-4 flex items-center gap-3.5">
        <div className="grid size-12 shrink-0 place-items-center rounded-full bg-brand text-[15px] font-semibold text-brand-foreground shadow-sm">
          {champion.initials}
        </div>
        <div>
          <div className="text-base font-semibold text-foreground">{champion.name}</div>
          <div className="text-[13px] text-muted-foreground">
            {champion.title} · {champion.company}
          </div>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-2 text-[13px]">
        <div className="flex items-center gap-2.5 text-foreground/80">
          <Mail className="size-4 text-muted-foreground/70" />
          {champion.email}
        </div>
        <div className="flex items-center gap-2.5 text-foreground/80">
          <Phone className="size-4 text-muted-foreground/70" />
          {champion.phone}
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Button size="lg" onClick={onConfirm} disabled={disabled}>
          <PhoneCall className="size-4" />
          Confirm &amp; call
        </Button>
        <Button size="lg" variant="secondary" onClick={onPickDifferent} disabled={disabled}>
          Pick different persona
        </Button>
      </div>
    </div>
  );
}
