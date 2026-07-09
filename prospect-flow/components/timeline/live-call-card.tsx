"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { CalendarCheck, MailCheck, PhoneCall, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GRADBOT_HTTP, GRADBOT_WS } from "@/lib/gradbot-client";
import type { Champion } from "@/lib/types";

type ToolEventKind = "meeting" | "email" | "deck";
type TranscriptTurn = { id: string; isUser: boolean; text: string };
type ToolEvent = { id: string; kind: ToolEventKind; label: string; detail: string };
type MonitorStatus = "ready" | "ringing" | "live" | "ended";

const TOOL_ICONS: Record<ToolEventKind, ComponentType<{ className?: string }>> = {
  meeting: CalendarCheck,
  email: MailCheck,
  deck: Presentation,
};

/**
 * Read-only sales monitor of the live call. Holds no mic — it dials (rings the
 * prospect phone via /api/dial) then mirrors the real conversation + booking /
 * email events broadcast on /ws/sales.
 */
export function LiveCallCard({
  champion,
  armed,
  onDial,
  onEnded,
  onArtifact,
}: {
  champion: Champion;
  armed: boolean;
  onDial: () => void;
  onEnded: () => void;
  onArtifact: (msg: Record<string, unknown>) => void;
}) {
  const [status, setStatus] = useState<MonitorStatus>("ready");
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [seconds, setSeconds] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const dialedRef = useRef(false);
  const endedRef = useRef(false);
  // Transcript bubble tracking (STT turn_idx isn't stable for user utterances).
  const agentTurnsRef = useRef<Set<number>>(new Set());
  const userBubbleRef = useRef<string | null>(null);
  const hadAgentSinceUserRef = useRef(false);
  const seenToolRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!armed) return;
    let disposed = false;

    // Monitor the broadcast (auto-reconnecting, resilient to backend blips).
    const handleMessage = (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      const type = msg.type as string;

      if (type === "call_started") {
        setStatus("live");
      } else if (type === "call_ended") {
        if (!endedRef.current) {
          endedRef.current = true;
          setStatus("ended");
          onEnded();
        }
      } else if (type === "tool_event") {
        // In-call banner (only the "Meeting booked" event lives here now).
        const key = `${msg.kind}|${msg.label}|${msg.detail}`;
        if (seenToolRef.current.has(key)) return; // ignore replayed duplicates
        seenToolRef.current.add(key);
        setToolEvents((prev) => [
          ...prev,
          {
            id: `${prev.length}`,
            kind: msg.kind as ToolEventKind,
            label: msg.label as string,
            detail: msg.detail as string,
          },
        ]);
      } else if (type === "artifact") {
        // Deck + emails become their own post-call timeline cards.
        onArtifact(msg);
      } else if (type === "user_text" || type === "agent_text") {
        const isUser = type === "user_text";
        const text = (msg.text as string) ?? "";
        const turnIdx = (msg.turn_idx as number) ?? 0;
        setStatus("live");
        setTurns((prev) => {
          // Agent bubbles key by turn_idx; user bubbles flip-flop (keep one
          // until an agent bubble appears) since STT turn_idx isn't stable.
          let key: string;
          if (!isUser) {
            key = `agent-${turnIdx}`;
            if (!agentTurnsRef.current.has(turnIdx)) {
              agentTurnsRef.current.add(turnIdx);
              hadAgentSinceUserRef.current = true;
            }
          } else if (userBubbleRef.current && !hadAgentSinceUserRef.current) {
            key = userBubbleRef.current;
          } else {
            key = `user-${prev.length}`;
            userBubbleRef.current = key;
            hadAgentSinceUserRef.current = false;
          }
          const existing = prev.find((t) => t.id === key);
          if (existing) {
            return prev.map((t) => (t.id === key ? { ...t, text: t.text + text + " " } : t));
          }
          return [...prev, { id: key, isUser, text: text + " " }];
        });
      }
    };

    function connect() {
      if (disposed) return;
      const ws = new WebSocket(`${GRADBOT_WS}/ws/sales`);
      wsRef.current = ws;
      ws.onmessage = handleMessage;
      ws.onclose = () => {
        if (!disposed) setTimeout(connect, 1500);
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      };
    }

    // Dial FIRST (which clears the backend's milestone log + rings the phone),
    // and only connect the monitor AFTER — otherwise the socket replays the
    // previous call's events (a stale "Meeting booked"/"call ended") on connect.
    async function begin() {
      if (!dialedRef.current) {
        dialedRef.current = true;
        setStatus("ringing");
        try {
          await fetch(`${GRADBOT_HTTP}/api/dial`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: champion.name,
              title: champion.title,
              company: champion.company,
              phone: champion.phone,
            }),
          });
        } catch {
          setStatus("ended");
        }
      }
      if (!disposed) connect();
    }
    begin();

    return () => {
      disposed = true;
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);

  useEffect(() => {
    if (status !== "live") return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  if (!armed) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <CardHeader champion={champion} right={<StatusPill status="ready" mm={mm} ss={ss} />} />
        <div className="flex flex-col items-center gap-3 p-6">
          <p className="text-[13px] text-muted-foreground">
            Ready to call {champion.name} via Gradium.
          </p>
          <Button size="lg" onClick={onDial}>
            <PhoneCall className="size-4" />
            Dial now
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <CardHeader champion={champion} right={<StatusPill status={status} mm={mm} ss={ss} />} />
      <div className="flex flex-col gap-3 p-4">
        {turns.length === 0 && status === "ringing" && (
          <div className="py-6 text-center text-[13px] text-muted-foreground">
            Ringing {champion.name}… waiting for pickup.
          </div>
        )}

        {turns.map((turn) => (
          <div key={turn.id} className={`flex items-end gap-2 ${turn.isUser ? "flex-row-reverse" : ""}`}>
            <TurnAvatar label={turn.isUser ? champion.initials : "AI"} isUser={turn.isUser} />
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                turn.isUser
                  ? "rounded-br-sm bg-secondary text-foreground"
                  : "rounded-bl-sm bg-brand-soft text-foreground"
              }`}
            >
              {turn.text}
            </div>
          </div>
        ))}

        {toolEvents.map((event) => {
          const Icon = TOOL_ICONS[event.kind];
          return (
            <div
              key={event.id}
              className="flex items-center gap-2.5 rounded-xl border border-success/20 bg-success-soft/50 px-3 py-2"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-success-soft text-success">
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0 text-[13px] text-foreground">
                <span className="font-semibold">{event.label}</span>
                <span className="text-muted-foreground"> — {event.detail}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardHeader({ champion, right }: { champion: Champion; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-3.5">
      <div className="flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-full bg-brand text-[13px] font-semibold text-brand-foreground">
          {champion.initials}
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">{champion.name}</div>
          <div className="text-xs text-muted-foreground">
            {champion.title} · {champion.company}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">{right}</div>
    </div>
  );
}

function StatusPill({ status, mm, ss }: { status: MonitorStatus; mm: string; ss: string }) {
  if (status === "live") {
    return (
      <>
        <div className="flex items-center gap-2 rounded-full bg-success-soft px-2.5 py-1">
          <Waveform />
          <span className="text-[11px] font-medium text-success">Live</span>
        </div>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {mm}:{ss}
        </span>
      </>
    );
  }
  const label =
    status === "ringing" ? "Ringing" : status === "ended" ? "Ended" : "Ready";
  return (
    <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      {label}
    </span>
  );
}

function TurnAvatar({ label, isUser }: { label: string; isUser: boolean }) {
  return (
    <div
      className={`grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
        isUser ? "bg-secondary text-muted-foreground" : "bg-brand text-brand-foreground"
      }`}
    >
      {label}
    </div>
  );
}

function Waveform() {
  const heights = [7, 12, 9, 14, 8];
  return (
    <div className="flex h-3.5 items-center gap-[2px]">
      {heights.map((height, index) => (
        <span
          key={index}
          className="w-[2.5px] rounded-full bg-success"
          style={{ height, animation: "wave-bar 1s ease-in-out infinite", animationDelay: `${index * 0.12}s` }}
        />
      ))}
    </div>
  );
}
