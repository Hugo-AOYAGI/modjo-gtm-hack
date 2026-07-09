/**
 * Loads gradbot's own bundled audio client (Opus encode/decode + playback)
 * straight from the services FastAPI backend, so we don't reimplement the
 * mic-capture/codec pipeline — we just skin it with our own React UI.
 */

export const GRADBOT_HTTP = process.env.NEXT_PUBLIC_GRADBOT_HTTP ?? "http://localhost:8000";
export const GRADBOT_WS = GRADBOT_HTTP.replace(/^http/, "ws");

const SCRIPTS = ["opus-encoder.js", "audio-processor.js", "synced-audio-player.js"];

let loadPromise: Promise<void> | null = null;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

export function loadGradbotClient(): Promise<void> {
  if (!loadPromise) {
    loadPromise = SCRIPTS.reduce(
      (chain, file) => chain.then(() => loadScript(`${GRADBOT_HTTP}/static/js/${file}`)),
      Promise.resolve(),
    );
  }
  return loadPromise;
}

export type SyncedAudioPlayerOptions = {
  basePath: string;
  sampleRate: number;
  pcmOutput: boolean;
  echoCancellation: boolean;
  onEncodedAudio: (data: ArrayBuffer) => void;
  onText: (payload: { text: string; turnIdx: number; isUser: boolean }) => void;
  onEvent: (eventType: string, msg: unknown) => void;
  onError: (error: Error) => void;
};

export type SyncedAudioPlayerInstance = {
  start: () => Promise<void>;
  stop: () => void;
  handleMessage: (data: unknown) => void;
};

declare global {
  interface Window {
    SyncedAudioPlayer: new (options: SyncedAudioPlayerOptions) => SyncedAudioPlayerInstance;
  }
}

export async function fetchAudioConfig(): Promise<{ pcm: boolean }> {
  const res = await fetch(`${GRADBOT_HTTP}/api/audio-config`);
  return res.json();
}
