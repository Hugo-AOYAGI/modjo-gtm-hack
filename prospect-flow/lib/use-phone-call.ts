"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GRADBOT_HTTP,
  GRADBOT_WS,
  fetchAudioConfig,
  loadGradbotClient,
  type SyncedAudioPlayerInstance,
} from "@/lib/gradbot-client";

export type PhoneState = "idle" | "incoming" | "connecting" | "in-call" | "ended";
export type CallerInfo = { name: string; title: string; company: string } | null;
export type PhoneTurn = { id: string; isCaller: boolean; text: string };

/**
 * Drives the prospect "phone": waits for an incoming-call ring on /ws/phone,
 * then (on answer) holds the mic and runs the real gradbot voice session.
 */
export function usePhoneCall() {
  const [state, setState] = useState<PhoneState>("idle");
  const [caller, setCaller] = useState<CallerInfo>(null);
  const [turns, setTurns] = useState<PhoneTurn[]>([]);
  const [seconds, setSeconds] = useState(0);

  const controlWs = useRef<WebSocket | null>(null);
  const callWs = useRef<WebSocket | null>(null);
  const playerRef = useRef<SyncedAudioPlayerInstance | null>(null);
  const turnKeyRef = useRef<Record<number, string>>({});

  // Ring listener (control channel).
  useEffect(() => {
    const ws = new WebSocket(`${GRADBOT_WS}/ws/phone`);
    controlWs.current = ws;
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "incoming") {
          setCaller(msg.prospect ?? null);
          setState((s) => (s === "in-call" || s === "connecting" ? s : "incoming"));
        }
      } catch {
        // ignore
      }
    };
    return () => ws.close();
  }, []);

  // Call timer.
  useEffect(() => {
    if (state !== "in-call") return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [state]);

  const answer = useCallback(async () => {
    setState("connecting");
    setTurns([]);
    setSeconds(0);
    turnKeyRef.current = {};

    try {
      await loadGradbotClient();
      const audioConfig = await fetchAudioConfig();

      const ws = new WebSocket(`${GRADBOT_WS}/ws/prospect-call`);
      callWs.current = ws;

      const player = new window.SyncedAudioPlayer({
        basePath: `${GRADBOT_HTTP}/static/js`,
        sampleRate: 24000,
        pcmOutput: audioConfig.pcm,
        echoCancellation: true,
        onEncodedAudio: (data) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(data);
        },
        onText: ({ text, turnIdx, isUser }) => {
          setTurns((prev) => {
            let key = turnKeyRef.current[turnIdx];
            if (!key || isUser) {
              key = `${turnIdx}-${isUser ? "user" : "agent"}-${prev.length}`;
              turnKeyRef.current[turnIdx] = key;
            }
            const existing = prev.find((t) => t.id === key);
            if (existing) {
              return prev.map((t) => (t.id === key ? { ...t, text: t.text + text + " " } : t));
            }
            // "caller" = the Modjo agent (not the person holding the phone)
            return [...prev, { id: key, isCaller: !isUser, text: text + " " }];
          });
        },
        onEvent: () => {},
        onError: () => setState("ended"),
      });
      playerRef.current = player;

      ws.onmessage = (event) => player.handleMessage(event.data);
      ws.onopen = async () => {
        await player.start();
        ws.send(JSON.stringify({ type: "start" }));
        setState("in-call");
      };
      ws.onerror = () => setState("ended");
      ws.onclose = () => setState((s) => (s === "in-call" || s === "connecting" ? "ended" : s));
    } catch {
      setState("ended");
    }
  }, []);

  const hangUp = useCallback(() => {
    playerRef.current?.stop();
    if (callWs.current?.readyState === WebSocket.OPEN) {
      callWs.current.send(JSON.stringify({ type: "stop" }));
      callWs.current.close();
    }
    setState("ended");
  }, []);

  const decline = useCallback(() => setState("ended"), []);

  return { state, caller, turns, seconds, answer, hangUp, decline };
}
