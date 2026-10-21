/**
 * Films and shows for the Home date card (the owner, 2026-10-21: "any new
 * movies released, any good family stuff to watch on ott … show something
 * new on every load").
 *
 * Provider-neutral, and off until a deployment sets a key: titles come from
 * a real catalogue or not at all — WonderHome never invents a release. The
 * one adapter today is TMDB (`TMDB_API_KEY`: a v4 read-access token or a v3
 * key), which also asks for its attribution wherever its data is shown.
 *
 * The lists are the same for every household, so they are kept per server
 * for a few hours (platform data, never household data), and each load
 * picks a different few from them.
 */

export type ScreenPick = {
  id: string;
  kind: "movie" | "show";
  title: string;
  year: number | null;
  /** A small poster from the provider's image host, or null. */
  posterUrl: string | null;
  /** The title's page at the provider, where where-to-watch is listed. */
  url: string;
};

export type ScreenLists = { inCinemas: ScreenPick[]; familyStreaming: ScreenPick[] };

export interface ScreenPicksProvider {
  readonly name: string;
  lists(region: string, signal?: AbortSignal): Promise<ScreenLists>;
}

export const TMDB_IMAGE_ORIGIN = "https://image.tmdb.org";
const TMDB_API = "https://api.themoviedb.org/3";
const TIMEOUT_MS = 4_000;

type TmdbRow = { id: number; title?: string; name?: string; release_date?: string; first_air_date?: string; poster_path?: string | null; adult?: boolean };

function toPick(row: TmdbRow, kind: ScreenPick["kind"]): ScreenPick | null {
  const title = (row.title ?? row.name ?? "").trim();
  if (!title || row.adult) return null;
  const date = row.release_date ?? row.first_air_date ?? "";
  const year = /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null;
  return {
    id: `${kind}-${row.id}`,
    kind,
    title,
    year,
    posterUrl: row.poster_path ? `${TMDB_IMAGE_ORIGIN}/t/p/w154${row.poster_path}` : null,
    url: `https://www.themoviedb.org/${kind === "movie" ? "movie" : "tv"}/${row.id}`,
  };
}

/** TMDB: now playing in the region's cinemas; family films and shows on subscription streaming there. */
export function tmdbProvider(key: string, fetcher: typeof fetch = fetch): ScreenPicksProvider {
  const bearer = key.startsWith("eyJ");
  const get = async (path: string, params: Record<string, string>, signal?: AbortSignal): Promise<TmdbRow[]> => {
    const url = new URL(`${TMDB_API}${path}`);
    for (const [name, value] of Object.entries({ ...params, ...(bearer ? {} : { api_key: key }) })) url.searchParams.set(name, value);
    const response = await fetcher(url, {
      headers: { accept: "application/json", ...(bearer ? { authorization: `Bearer ${key}` } : {}) },
      signal: signal ?? AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`tmdb ${path} ${response.status}`);
    const body = (await response.json()) as { results?: TmdbRow[] };
    return Array.isArray(body.results) ? body.results : [];
  };
  return {
    name: "tmdb",
    async lists(region, signal) {
      const family = { with_genres: "10751", watch_region: region, with_watch_monetization_types: "flatrate", sort_by: "popularity.desc", include_adult: "false" };
      const [cinema, films, shows] = await Promise.all([
        get("/movie/now_playing", { region, include_adult: "false" }, signal),
        get("/discover/movie", { ...family, certification_country: region }, signal),
        get("/discover/tv", family, signal),
      ]);
      const picks = (rows: TmdbRow[], kind: ScreenPick["kind"]) => rows.map((row) => toPick(row, kind)).filter((pick): pick is ScreenPick => pick !== null);
      return { inCinemas: picks(cinema, "movie").slice(0, 20), familyStreaming: [...picks(films, "movie").slice(0, 12), ...picks(shows, "show").slice(0, 12)] };
    },
  };
}

export function screenPicksProviderFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): ScreenPicksProvider | null {
  const key = env.TMDB_API_KEY?.trim();
  return key ? tmdbProvider(key) : null;
}

const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; lists: ScreenLists }>();

/** The region's lists, from this server's cache when fresh; null when off or the provider fails. */
export async function screenLists(region: string, provider: ScreenPicksProvider | null = screenPicksProviderFromEnv(), now = Date.now()): Promise<ScreenLists | null> {
  if (!provider) return null;
  const key = `${provider.name}:${region}`;
  const kept = cache.get(key);
  if (kept && now - kept.at < CACHE_MS) return kept.lists;
  try {
    const lists = await provider.lists(region);
    cache.set(key, { at: now, lists });
    return lists;
  } catch {
    return kept?.lists ?? null;
  }
}

/** A different few each load: `count` titles from the list, starting from a random place. */
export function pickFew<T>(list: readonly T[], count: number, random: () => number = Math.random): T[] {
  if (list.length <= count) return [...list];
  const start = Math.floor(random() * list.length);
  return Array.from({ length: count }, (_, step) => list[(start + step) % list.length]!);
}
