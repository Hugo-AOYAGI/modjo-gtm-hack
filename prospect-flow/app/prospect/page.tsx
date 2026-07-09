"use client";

import { Phone, PhoneOff, Radar } from "lucide-react";
import { usePhoneCall, type CallerInfo } from "@/lib/use-phone-call";

export default function ProspectPhonePage() {
  const { state, caller, turns, seconds, answer, hangUp, decline } = usePhoneCall();

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 p-6">
      {/* phone frame */}
      <div className="relative flex h-[720px] w-[360px] flex-col overflow-hidden rounded-[2.75rem] border-[10px] border-zinc-900 bg-gradient-to-b from-zinc-900 via-zinc-900 to-black text-white shadow-2xl">
        {/* notch */}
        <div className="absolute left-1/2 top-0 z-10 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-zinc-900" />

        {state === "idle" && <IdleScreen />}
        {state === "incoming" && (
          <IncomingScreen caller={caller} onAnswer={answer} onDecline={decline} />
        )}
        {(state === "connecting" || state === "in-call") && (
          <InCallScreen
            connecting={state === "connecting"}
            timer={`${mm}:${ss}`}
            turns={turns}
            onHangUp={hangUp}
          />
        )}
        {state === "ended" && <EndedScreen />}
      </div>
    </div>
  );
}

function CallerAvatar({ pulse }: { pulse?: boolean }) {
  return (
    <div className="relative">
      {pulse && (
        <span className="absolute inset-0 animate-ping rounded-full bg-white/10" />
      )}
      <div className="relative grid size-28 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg">
        <Radar className="size-12 text-white" />
      </div>
    </div>
  );
}

function IdleScreen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 pt-8 text-center">
      <div className="grid size-16 place-items-center rounded-full bg-white/5">
        <Phone className="size-7 text-white/40" />
      </div>
      <p className="text-sm text-white/50">Waiting for a call…</p>
    </div>
  );
}

function IncomingScreen({
  caller,
  onAnswer,
  onDecline,
}: {
  caller: CallerInfo;
  onAnswer: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center px-8 pb-12 pt-24">
      <p className="mb-8 text-sm tracking-wide text-white/50">Incoming call</p>
      <CallerAvatar pulse />
      <div className="mt-6 text-center">
        <div className="text-2xl font-semibold">Modjo</div>
        <div className="mt-1 text-sm text-white/60">
          {caller ? `re: ${caller.company}` : "Sales"}
        </div>
      </div>

      <div className="mt-auto flex w-full items-center justify-between px-6">
        <CallButton variant="decline" onClick={onDecline} label="Decline" />
        <CallButton variant="answer" onClick={onAnswer} label="Accept" />
      </div>
    </div>
  );
}

function InCallScreen({
  connecting,
  timer,
  turns,
  onHangUp,
}: {
  connecting: boolean;
  timer: string;
  turns: { id: string; isCaller: boolean; text: string }[];
  onHangUp: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center px-6 pb-10 pt-16">
      <CallerAvatar />
      <div className="mt-5 text-center">
        <div className="text-xl font-semibold">Modjo</div>
        <div className="mt-1 text-sm text-white/60">
          {connecting ? "Connecting…" : timer}
        </div>
      </div>

      {/* live captions */}
      <div className="mt-6 w-full flex-1 space-y-2 overflow-y-auto px-1">
        {turns.slice(-6).map((turn) => (
          <div
            key={turn.id}
            className={`rounded-2xl px-3 py-2 text-[13px] leading-snug ${
              turn.isCaller
                ? "bg-white/10 text-white/90"
                : "ml-auto max-w-[85%] bg-indigo-500/80 text-white"
            }`}
          >
            {turn.text}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onHangUp}
        className="mt-4 grid size-16 place-items-center rounded-full bg-red-500 shadow-lg transition-transform active:scale-95"
        aria-label="End call"
      >
        <PhoneOff className="size-7 text-white" />
      </button>
    </div>
  );
}

function EndedScreen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="grid size-16 place-items-center rounded-full bg-white/5">
        <PhoneOff className="size-7 text-white/40" />
      </div>
      <p className="text-sm text-white/50">Call ended</p>
    </div>
  );
}

function CallButton({
  variant,
  onClick,
  label,
}: {
  variant: "answer" | "decline";
  onClick: () => void;
  label: string;
}) {
  const answer = variant === "answer";
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        className={`grid size-16 place-items-center rounded-full shadow-lg transition-transform active:scale-95 ${
          answer ? "bg-green-500" : "bg-red-500"
        }`}
        aria-label={label}
      >
        {answer ? (
          <Phone className="size-7 text-white" />
        ) : (
          <PhoneOff className="size-7 text-white" />
        )}
      </button>
      <span className="text-xs text-white/50">{label}</span>
    </div>
  );
}
