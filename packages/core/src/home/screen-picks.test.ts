import { describe, expect, it } from "vitest";

import { pickFew, screenLists, screenPicksProviderFromEnv, tmdbProvider } from "./screen-picks";

describe("screen picks", () => {
  it("are off until a deployment sets a key — no titles are ever made up", async () => {
    expect(screenPicksProviderFromEnv({})).toBeNull();
    expect(await screenLists("IN", null)).toBeNull();
  });

  it("read TMDB's now-playing and family streaming lists, without adult titles, with a link and a poster", async () => {
    const calls: string[] = [];
    const fetcher = (async (url: URL) => {
      calls.push(url.pathname);
      const results =
        url.pathname.endsWith("now_playing")
          ? [{ id: 1, title: "Big Cinema Film", release_date: "2026-10-17", poster_path: "/p.jpg" }, { id: 2, title: "Not for here", adult: true }]
          : url.pathname.endsWith("/movie")
            ? [{ id: 3, title: "Family Film", release_date: "2025-05-01", poster_path: null }]
            : [{ id: 4, name: "Family Show", first_air_date: "2024-02-02" }];
      return new Response(JSON.stringify({ results }), { status: 200 });
    }) as unknown as typeof fetch;
    const lists = await tmdbProvider("v3key", fetcher).lists("IN");
    expect(calls).toEqual(["/3/movie/now_playing", "/3/discover/movie", "/3/discover/tv"]);
    expect(lists.inCinemas).toEqual([{ id: "movie-1", kind: "movie", title: "Big Cinema Film", year: 2026, posterUrl: "https://image.tmdb.org/t/p/w154/p.jpg", url: "https://www.themoviedb.org/movie/1" }]);
    expect(lists.familyStreaming.map((pick) => [pick.title, pick.kind, pick.url])).toEqual([
      ["Family Film", "movie", "https://www.themoviedb.org/movie/3"],
      ["Family Show", "show", "https://www.themoviedb.org/tv/4"],
    ]);
  });

  it("keep the last good lists when the provider fails", async () => {
    let fail = false;
    const provider = { name: "fake-keep", lists: async () => { if (fail) throw new Error("down"); return { inCinemas: [], familyStreaming: [] }; } };
    expect(await screenLists("IN", provider, 0)).toEqual({ inCinemas: [], familyStreaming: [] });
    fail = true;
    expect(await screenLists("IN", provider, 10 * 60 * 60 * 1000)).toEqual({ inCinemas: [], familyStreaming: [] });
  });

  it("pick a different few each load, wrapping round the list", () => {
    expect(pickFew([1, 2, 3, 4], 2, () => 0.9)).toEqual([4, 1]);
    expect(pickFew([1], 2)).toEqual([1]);
  });
});
