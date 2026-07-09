"use client";

import { useCallback, useRef, useState } from "react";
import {
  afterCompanySteps,
  nextAlternateChampion,
  pickDifferentSteps,
  primaryChampionFor,
  startSteps,
  topCompany,
  type Step,
} from "@/lib/fixtures";
import type { Champion, Company, TimelineEvent } from "@/lib/types";

export type TimelineStage =
  | "idle"
  | "stepping"
  | "awaiting-company"
  | "awaiting-champion"
  | "call-ready"
  | "calling"
  | "post-call"
  | "done";

// Pre-made deck link shown on the deck card (kept in sync with the backend
// DECK_URL). The real deck/emails/calendar are still sent for real by the backend.
const DECK_URL =
  "https://gamma.app/docs/Thank-you-for-your-interest-Alexandre-vnz9e3aqdut9j87";
const BDR_DISPLAY_EMAIL = "alex@modjo.ai";

/** The three post-call cards, built locally from the champion for instant, space-paced reveal. */
function localPostCallArtifacts(champion: Champion): Record<string, unknown>[] {
  const first = champion.name.split(" ")[0];
  return [
    {
      artifact: "deck",
      title: `Modjo × ${champion.company}`,
      slides: 8,
      subtitle: `tailored to ${first}'s priorities`,
      url: DECK_URL,
    },
    {
      artifact: "email",
      recipientKind: "bdr",
      to: BDR_DISPLAY_EMAIL,
      subject: `Qualification call booked: ${champion.name} (${champion.company})`,
      preview: "Call summary, company context, and calendar link — ready for follow-up.",
    },
    {
      artifact: "email",
      recipientKind: "prospect",
      to: champion.email,
      subject: `Following up for ${champion.company}`,
      preview: "Great speaking — here's a tailored deck on how Modjo can help.",
    },
  ];
}

/** Map a backend post-call artifact message to a timeline event. */
function artifactEventFor(msg: Record<string, unknown>): TimelineEvent {
  if (msg.artifact === "deck") {
    return {
      id: "artifact-deck",
      type: "tool-call",
      tool: "gamma",
      data: {
        title: msg.title as string,
        slideCount: msg.slides as number,
        subtitle: msg.subtitle as string,
        url: msg.url as string | undefined,
      },
    };
  }
  return {
    id: `artifact-email-${msg.recipientKind}`,
    type: "email",
    data: {
      recipientKind: msg.recipientKind as "prospect" | "bdr",
      to: msg.to as string,
      subject: msg.subject as string,
      preview: msg.preview as string,
    },
  };
}

/**
 * A fully-manual (presenter) sequencer. `advance()` — bound to the spacebar —
 * performs the next beat. Tool cards take two beats: one to appear running,
 * one to complete. Checkpoints ("awaiting-*") resolve on advance (default
 * choice) or via a direct click.
 */
export function useAgentTimeline() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [stage, setStage] = useState<TimelineStage>("idle");
  const [runningId, setRunningId] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  // Latches true once the call is dialed, so the monitor card never reverts to
  // its pre-dial "Dial now" state (or tears down its socket) when the call ends.
  const [callStarted, setCallStarted] = useState(false);

  const queue = useRef<Step[]>([]);
  const champion = useRef<Champion | null>(null);
  // Post-call artifacts arrive from the backend all at once; buffer them and
  // reveal one per spacebar beat so the tail keeps the presenter's pacing.
  const pendingArtifacts = useRef<Record<string, unknown>[]>([]);
  const seenArtifacts = useRef<Set<string>>(new Set());

  const append = useCallback((event: TimelineEvent) => {
    setEvents((prev) => [...prev, event]);
  }, []);

  const load = useCallback((steps: Step[]) => {
    queue.current = [...steps];
    setStage("stepping");
  }, []);

  const start = useCallback(
    (query: string) => {
      setEvents([{ id: "prompt", type: "user-prompt", text: query }]);
      setRunningId(null);
      setSelectedCompany(null);
      setCallStarted(false);
      champion.current = null;
      pendingArtifacts.current = [];
      seenArtifacts.current.clear();
      load(startSteps(query));
    },
    [load],
  );

  const selectCompany = useCallback(
    (company: Company) => {
      if (stage !== "awaiting-company") return;
      setSelectedCompany(company.name);
      champion.current = primaryChampionFor(company.name);
      load(afterCompanySteps(company));
    },
    [load, stage],
  );

  const confirmChampion = useCallback(() => {
    if (stage !== "awaiting-champion" || !champion.current) return;
    // Reveal the call card in a "ready to dial" state — dialing is its own beat.
    setStage("call-ready");
    append({
      id: `live-call-${champion.current.name}`,
      type: "live-call",
      champion: champion.current,
    });
  }, [append, stage]);

  const startCall = useCallback(() => {
    setStage((s) => (s === "call-ready" ? "calling" : s));
    setCallStarted(true);
  }, []);

  const pickDifferentPersona = useCallback(() => {
    if (stage !== "awaiting-champion" || !champion.current) return;
    champion.current = nextAlternateChampion(champion.current);
    load(pickDifferentSteps(champion.current));
  }, [load, stage]);

  const endCall = useCallback(() => {
    // Enter the space-paced post-call phase. Queue the cards locally now so they
    // reveal instantly per beat, independent of the real email/calendar latency;
    // the backend still fires the real actions (its duplicates are deduped).
    setStage("post-call");
    if (champion.current && !seenArtifacts.current.has("artifact-deck")) {
      for (const artifact of localPostCallArtifacts(champion.current)) {
        const id =
          artifact.artifact === "deck"
            ? "artifact-deck"
            : `artifact-email-${artifact.recipientKind}`;
        seenArtifacts.current.add(id);
        pendingArtifacts.current.push(artifact);
      }
    }
    setEvents((prev) =>
      prev.some((e) => e.id === "reason-wrap")
        ? prev
        : [
            ...prev,
            {
              id: "reason-wrap",
              type: "reasoning",
              text: "Call wrapped up. Building the tailored deck and sending the follow-up emails.",
            },
          ],
    );
  }, []);

  /** Buffer a post-call artifact; it's revealed on the next spacebar beat. */
  const addArtifact = useCallback((msg: Record<string, unknown>) => {
    const id =
      msg.artifact === "deck" ? "artifact-deck" : `artifact-email-${msg.recipientKind}`;
    if (seenArtifacts.current.has(id)) return;
    seenArtifacts.current.add(id);
    pendingArtifacts.current.push(msg);
  }, []);

  /** One presenter beat. */
  const advance = useCallback(() => {
    if (stage === "awaiting-company") {
      // default choice: the recommended top match
      selectCompany(topCompany());
      return;
    }
    if (stage === "awaiting-champion") {
      confirmChampion();
      return;
    }
    if (stage === "call-ready") {
      startCall();
      return;
    }
    if (stage === "post-call") {
      // Reveal the next buffered artifact (deck, then the two emails).
      const next = pendingArtifacts.current.shift();
      if (next) append(artifactEventFor(next));
      return;
    }
    if (stage !== "stepping") return;

    // finish a running tool first
    if (runningId) {
      setRunningId(null);
      return;
    }

    const next = queue.current.shift();
    if (!next) {
      setStage("done");
      return;
    }

    switch (next.t) {
      case "event":
        append(next.event);
        break;
      case "tool":
        append(next.event);
        setRunningId(next.event.id);
        break;
      case "pause":
        setStage(next.stage);
        break;
      case "end":
        setStage("done");
        break;
    }
  }, [append, confirmChampion, runningId, selectCompany, startCall, stage]);

  return {
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
  };
}
