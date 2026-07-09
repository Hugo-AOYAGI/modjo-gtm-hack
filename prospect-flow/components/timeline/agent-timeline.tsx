"use client";

import { useEffect, useRef } from "react";
import { AudioLines, ChevronDown, Mic, Plus } from "lucide-react";
import { LandingInput } from "@/components/timeline/landing-input";
import { Sunburst } from "@/components/timeline/sunburst";
import {
  TimelineEventView,
  type TimelineContext,
} from "@/components/timeline/timeline-event-view";
import { GRADBOT_HTTP } from "@/lib/gradbot-client";
import { useAgentTimeline } from "@/lib/use-agent-timeline";

const DOUBLE_TAP_MS = 450;

export function AgentTimeline() {
  const {
    events,
    stage,
    runningId,
    selectedCompany,
    callStarted,
    start,
    advance,
    selectCompany,
    confirmChampion,
    startCall,
    pickDifferentPersona,
    endCall,
    addArtifact,
  } = useAgentTimeline();

  const advanceRef = useRef(advance);
  const stageRef = useRef(stage);
  useEffect(() => {
    advanceRef.current = advance;
    stageRef.current = stage;
  });

  const lastSpaceRef = useRef(0);
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      const st = stageRef.current;
      if (st === "idle") return; // nothing to drive before we start
      e.preventDefault();

      // During the live call, a DOUBLE space force-hangs it and moves on.
      if (st === "calling") {
        const now = performance.now();
        if (now - lastSpaceRef.current < DOUBLE_TAP_MS) {
          lastSpaceRef.current = 0;
          fetch(`${GRADBOT_HTTP}/api/hangup`, { method: "POST" }).catch(() => {});
        } else {
          lastSpaceRef.current = now;
        }
        return;
      }
      advanceRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const feedRef = useRef<HTMLDivElement>(null);
  const hasStarted = events.length > 0;
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const scrollDown = () =>
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    const observer = new ResizeObserver(scrollDown);
    observer.observe(el);
    scrollDown();
    return () => observer.disconnect();
  }, [hasStarted]);

  const lastIndex = events.length - 1;

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-10 pb-44">
        {events.length === 0 ? (
          <LandingInput onSubmit={start} disabled={stage !== "idle"} />
        ) : (
          <div ref={feedRef} className="flex flex-col gap-5">
            {events.map((event, index) => {
              const ctx: TimelineContext = {
                runningId,
                companySelectionActive: stage === "awaiting-company",
                selectedCompany,
                onSelectCompany: selectCompany,
                onConfirmChampion: confirmChampion,
                onPickDifferentPersona: pickDifferentPersona,
                onCallEnded: endCall,
                onArtifact: addArtifact,
                championActionsDisabled:
                  stage !== "awaiting-champion" || index !== lastIndex,
                callArmed: callStarted,
                onDial: startCall,
              };
              return (
                <div key={event.id} className="animate-rise-in">
                  <TimelineEventView event={event} ctx={ctx} />
                </div>
              );
            })}
            {runningId && (
              <div className="animate-rise-in">
                <Sunburst spinning className="size-6" />
              </div>
            )}
          </div>
        )}
      </main>

      {events.length > 0 && <BottomComposer />}
    </div>
  );
}

/** Decorative Claude-style composer — the flow is spacebar-driven, so this is
 *  purely for the familiar look. */
function BottomComposer() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background via-background to-transparent pt-8">
      <div className="mx-auto max-w-3xl px-5 pb-3">
        <div className="rounded-3xl border border-border bg-card px-2.5 pt-3 pb-2.5 shadow-sm">
          <div className="px-2.5 pb-2 text-[15px] text-muted-foreground/70">
            Write a message…
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="flex size-8 items-center justify-center rounded-full">
              <Plus className="size-[18px]" />
            </span>
            <span className="ml-auto flex items-center gap-1 px-1.5 text-[13px] text-foreground">
              Opus 4.8
              <span className="text-muted-foreground">High</span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </span>
            <Mic className="size-[18px]" />
            <AudioLines className="mr-1 size-[18px]" />
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground/70">
          Prospect Flow can take real actions — calendar &amp; email.
        </p>
      </div>
    </div>
  );
}
