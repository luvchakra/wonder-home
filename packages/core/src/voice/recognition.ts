/**
 * The browser's own speech recogniser, such as it is.
 *
 * `SpeechRecognition` is not a standard — it is a Chrome-era API the other
 * browsers picked up unevenly, with no TypeScript definitions in the DOM
 * lib — so the shape it is used through is written out here by hand rather
 * than pretended into existence with `any`. Only the members WonderHome
 * actually touches are declared; the rest of the API exists but nothing
 * here should grow to depend on it.
 *
 * This is the free fallback. A household with a speech provider configured
 * goes through `voice/capture.ts` and the server instead, which works the
 * same way in every browser.
 */

export type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export type RecognitionConstructor = new () => RecognitionLike;

/** Null where the browser has no recogniser at all, which the caller must handle. */
export function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}
