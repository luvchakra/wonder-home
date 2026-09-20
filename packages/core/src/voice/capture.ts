import type { AudioClip } from "./provider";

/**
 * Hearing one thing somebody says, in the browser (story 04-009).
 *
 * The browser's own `SpeechRecognition` does this for free and decides for
 * itself when a sentence ended. Google's recogniser is better but takes
 * audio, so when a household uses it this module has to do the two jobs
 * that came free before: record, and work out when the person stopped
 * talking.
 *
 * Stopping is energy-based and deliberately forgiving — a run of quiet
 * after something was actually said, not the first gap. A household
 * thinking mid-sentence ("add… milk") should not have the turn taken away
 * from them, which is what a tighter threshold does and why it feels rude.
 *
 * Everything is re-encoded to 16 kHz mono WAV before it leaves. That is one
 * format on every browser rather than negotiating with each one: Safari
 * records AAC in an MP4 container, which Google's speech API cannot read at
 * all, and a household should not discover that by being misheard.
 */

const SILENCE_MS = 1200;
const MAX_MS = 30_000;
/** Below this, treated as room noise rather than speech. */
const SPEECH_RMS = 0.015;
const TARGET_RATE = 16000;

export type CaptureResult = {
  clip: AudioClip;
  /** How long the person actually spoke, for the caller to reject a stray click. */
  spokeForMs: number;
};

export function microphoneAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined" &&
    typeof AudioContext !== "undefined"
  );
}

/**
 * Records until the speaker stops, and hands back what they said.
 *
 * Resolves with null when nothing was said at all, so a caller can listen
 * again rather than sending silence to a provider and paying for it.
 */
export async function captureUtterance(input: {
  onSpeechStart?: () => void;
  signal?: AbortSignal;
  silenceMs?: number;
  maxMs?: number;
} = {}): Promise<CaptureResult | null> {
  if (!microphoneAvailable()) throw new Error("This browser cannot record audio.");

  const silenceMs = input.silenceMs ?? SILENCE_MS;
  const maxMs = input.maxMs ?? MAX_MS;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  context.createMediaStreamSource(stream).connect(analyser);

  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const samples = new Float32Array(analyser.fftSize);
  const startedAt = performance.now();
  let speechAt: number | null = null;
  let lastLoudAt = startedAt;
  let timer: ReturnType<typeof setInterval> | undefined;

  const finished = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  const stop = () => {
    if (recorder.state !== "inactive") recorder.stop();
  };

  input.signal?.addEventListener("abort", stop, { once: true });
  recorder.start();

  // A 50ms poll is well under the shortest pause a person leaves, and
  // cheaper than an animation frame loop that a backgrounded tab throttles
  // to nothing — which would leave the microphone open indefinitely.
  timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    const rms = Math.sqrt(sum / samples.length);
    const now = performance.now();

    if (rms > SPEECH_RMS) {
      lastLoudAt = now;
      if (speechAt === null) {
        speechAt = now;
        input.onSpeechStart?.();
      }
    }

    const quietLongEnough = speechAt !== null && now - lastLoudAt > silenceMs;
    if (quietLongEnough || now - startedAt > maxMs) stop();
  }, 50);

  try {
    await finished;
  } finally {
    if (timer) clearInterval(timer);
    input.signal?.removeEventListener("abort", stop);
    for (const track of stream.getTracks()) track.stop();
  }

  const spokeForMs = speechAt === null ? 0 : lastLoudAt - speechAt;
  if (speechAt === null || chunks.length === 0) {
    await context.close().catch(() => undefined);
    return null;
  }

  try {
    const decoded = await context.decodeAudioData(await new Blob(chunks).arrayBuffer());
    return { clip: toWav(decoded), spokeForMs };
  } finally {
    await context.close().catch(() => undefined);
  }
}

/**
 * Plays a reply, and resolves when it has finished — which is what makes a
 * hands-free exchange take turns rather than talk over itself.
 */
export function playClip(clip: AudioClip, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(`data:${clip.mimeType};base64,${clip.base64}`);
    const done = () => resolve();

    audio.onended = done;
    // A reply that will not play is not worth stalling a conversation over.
    audio.onerror = done;
    signal?.addEventListener(
      "abort",
      () => {
        audio.pause();
        done();
      },
      { once: true },
    );

    audio.play().catch(done);
  });
}

/**
 * Mono 16 kHz PCM in a WAV container, base64-encoded.
 *
 * Downsampling is a box filter — the mean of the samples each output frame
 * covers — which is crude as resampling goes and entirely adequate here:
 * speech recognition wants 16 kHz, and the averaging is itself the
 * anti-aliasing that a naive "take every Nth sample" would skip.
 */
function toWav(buffer: AudioBuffer): AudioClip {
  const source = buffer.getChannelData(0);
  const ratio = buffer.sampleRate / TARGET_RATE;
  const length = Math.floor(source.length / ratio);
  const pcm = new Int16Array(length);

  for (let index = 0; index < length; index += 1) {
    const from = Math.floor(index * ratio);
    const to = Math.min(Math.floor((index + 1) * ratio), source.length);
    let sum = 0;
    for (let cursor = from; cursor < to; cursor += 1) sum += source[cursor]!;
    const mean = to > from ? sum / (to - from) : 0;
    pcm[index] = Math.max(-1, Math.min(1, mean)) * 0x7fff;
  }

  const bytes = new Uint8Array(44 + pcm.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_RATE, true);
  view.setUint32(28, TARGET_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  new Int16Array(bytes.buffer, 44).set(pcm);

  return { base64: base64Of(bytes), mimeType: "audio/wav" };
}

/** Chunked so a long clip cannot blow the argument limit on `String.fromCharCode`. */
function base64Of(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}
