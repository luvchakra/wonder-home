/**
 * What one Gemini Live server message means for the page (voice phase 3),
 * read without the SDK's types so it can be tested and so a field Google
 * adds later is ignored rather than trusted.
 *
 * The page acts on exactly these: audio to play, words heard and spoken (for
 * the on-screen record), a turn ending, the person talking over the reply,
 * tool calls to relay to WonderHome, a cancelled tool call, and the server
 * saying the session is about to end.
 */

export type LiveToolCall = { id: string; name: string; args: Record<string, unknown> };

export type LiveMessageReading = {
  /** Base64 16-bit PCM at 24 kHz, in order. */
  audio: string[];
  /** A fragment of what the person said, as Gemini transcribed it. */
  heard: string | null;
  /** A fragment of what Gemini said out loud. */
  said: string | null;
  turnComplete: boolean;
  /** The person started talking over the reply: stop playing it. */
  interrupted: boolean;
  toolCalls: LiveToolCall[];
  /** Calls Gemini no longer wants answered. A change WonderHome already made stays made. */
  cancelledToolCalls: string[];
  /** The server will close the session soon. */
  goingAway: boolean;
};

type Loose = Record<string, unknown>;

const record = (value: unknown): Loose | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : null);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const words = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

export function readLiveMessage(message: unknown): LiveMessageReading {
  const root = record(message) ?? {};
  const content = record(root.serverContent) ?? {};
  const turn = record(content.modelTurn) ?? {};

  const audio = list(turn.parts)
    .map((part) => record(record(part)?.inlineData))
    .filter((data): data is Loose => Boolean(data && typeof data.data === "string" && String(data.mimeType ?? "audio/pcm").startsWith("audio/")))
    .map((data) => data.data as string);

  const toolCalls = list(record(root.toolCall)?.functionCalls)
    .map(record)
    .filter((call): call is Loose => Boolean(call && typeof call.name === "string"))
    .map((call, index) => ({
      id: typeof call.id === "string" && call.id ? call.id : `call-${index}`,
      name: call.name as string,
      args: record(call.args) ?? {},
    }));

  return {
    audio,
    heard: words(record(content.inputTranscription)?.text),
    said: words(record(content.outputTranscription)?.text),
    turnComplete: content.turnComplete === true,
    interrupted: content.interrupted === true,
    toolCalls,
    cancelledToolCalls: list(record(root.toolCallCancellation)?.ids).filter((id): id is string => typeof id === "string"),
    goingAway: record(root.goAway) !== null,
  };
}

/**
 * Builds the on-screen record from transcription fragments: what the person
 * said is one message once Gemini starts answering, and what Gemini said is
 * one message once its turn ends or is talked over. Fragments arrive with
 * their own spacing, so they are joined as they come.
 */
export class LiveTranscript {
  private heard = "";
  private said = "";

  constructor(private readonly emit: (entry: { role: "member" | "assistant"; text: string }) => void) {}

  read(reading: LiveMessageReading): void {
    if (reading.heard) this.heard += reading.heard;
    const answering = reading.said !== null || reading.audio.length > 0 || reading.toolCalls.length > 0;
    if (answering) this.flushHeard();
    if (reading.said) this.said += reading.said;
    if (reading.turnComplete || reading.interrupted) {
      this.flushHeard();
      this.flushSaid();
    }
  }

  /** Whatever is still unsaid, when the session ends. */
  finish(): void {
    this.flushHeard();
    this.flushSaid();
  }

  private flushHeard(): void {
    const text = this.heard.replace(/\s+/g, " ").trim();
    this.heard = "";
    if (text) this.emit({ role: "member", text });
  }

  private flushSaid(): void {
    const text = this.said.replace(/\s+/g, " ").trim();
    this.said = "";
    if (text) this.emit({ role: "assistant", text });
  }
}
