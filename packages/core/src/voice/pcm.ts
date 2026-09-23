/**
 * Raw audio for Gemini Live (voice phase 3). The Live API takes 16-bit
 * little-endian mono PCM at 16 kHz in, and sends 16-bit PCM at 24 kHz back,
 * both base64 over its websocket. A browser records at whatever rate its
 * audio hardware runs — 44.1 or 48 kHz, rarely 16 — and some engines refuse
 * to connect a microphone to a context running at any other rate, so the
 * conversion happens here, in plain functions, rather than by asking the
 * browser for a rate it may not honour.
 */

export const LIVE_INPUT_RATE = 16_000;
export const LIVE_OUTPUT_RATE = 24_000;

/**
 * Averages each output sample's window of input samples — a box filter,
 * which is enough to keep speech intelligible without aliasing hiss at these
 * ratios. Rates at or below the target pass through unchanged.
 */
export function downsample(input: Float32Array, fromRate: number, toRate = LIVE_INPUT_RATE): Float32Array {
  if (fromRate <= toRate) return input;
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let index = 0; index < length; index++) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let at = start; at < end; at++) sum += input[at]!;
    output[index] = end > start ? sum / (end - start) : 0;
  }
  return output;
}

/** Float samples in [-1, 1] as 16-bit little-endian PCM bytes; anything louder is clipped, never wrapped. */
export function floatToPcm16(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index++) {
    const clamped = Math.max(-1, Math.min(1, samples[index]!));
    view.setInt16(index * 2, clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff), true);
  }
  return bytes;
}

/** 16-bit little-endian PCM bytes back to float samples. A trailing odd byte is not a sample. */
export function pcm16ToFloat(bytes: Uint8Array): Float32Array<ArrayBuffer> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = new Float32Array(Math.floor(bytes.byteLength / 2));
  for (let index = 0; index < samples.length; index++) samples[index] = view.getInt16(index * 2, true) / 0x8000;
  return samples;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let at = 0; at < bytes.length; at += chunk) binary += String.fromCharCode(...bytes.subarray(at, at + chunk));
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
