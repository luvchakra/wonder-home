/* eslint-disable @next/next/no-img-element -- these are drawn into a PNG by the image renderer, not shown on a page */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { createAdminClient } from "@wonderhome/core/db/admin";
import { readInviteLink } from "@wonderhome/core/family/event-detail";
import { inviteDesign, svgDataUri } from "@wonderhome/core/family/invite-templates";
import { translatorFor } from "@wonderhome/core/i18n/translate";

import { invitationWords } from "../../_lib/invitation-words";

/**
 * The invitation drawn as a picture (story 26-009), in two shapes from one
 * design: `landscape` (1200×630) is the link preview a chat app shows large,
 * and `portrait` (1080×1350) is the invitation itself, shaped for a phone —
 * what "Share invitation" sends as an image, the way a printed card is
 * passed round. Behind the same credential as the page: the token. A link
 * that is off draws a plain WonderHome card that says nothing about it.
 */
export type InvitationShape = "landscape" | "portrait";

export const INVITATION_SIZES: Record<InvitationShape, { width: number; height: number }> = {
  landscape: { width: 1200, height: 630 },
  portrait: { width: 1080, height: 1350 },
};

type Font = { name: string; data: Buffer | ArrayBuffer; weight: 400 | 700; style: "normal" };

/** The vendored fonts, wherever the server was started from (the app folder, or the repository root). */
async function bundled(file: string): Promise<Buffer> {
  for (const root of [process.cwd(), join(process.cwd(), "apps/web")]) {
    try {
      return await readFile(join(root, "assets/invite", file));
    } catch {
      // try the next root
    }
  }
  throw new Error(`invite font missing: ${file}`);
}

const FONTS = Promise.all([bundled("Sora-Regular.ttf"), bundled("Sora-Bold.ttf"), bundled("Caveat-Bold.woff")]);

/**
 * Sora and Caveat only draw Latin letters. A title in Devanagari, Arabic or
 * Chinese gets the Noto face for its script, fetched from Google Fonts for
 * just the characters on the card; if that fails the card still renders.
 */
const SCRIPT_FONTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[ऀ-ॿ]/, "Noto Sans Devanagari"],
  [/[ঀ-৿]/, "Noto Sans Bengali"],
  [/[਀-੿]/, "Noto Sans Gurmukhi"],
  [/[઀-૿]/, "Noto Sans Gujarati"],
  [/[஀-௿]/, "Noto Sans Tamil"],
  [/[ఀ-౿]/, "Noto Sans Telugu"],
  [/[ಀ-೿]/, "Noto Sans Kannada"],
  [/[ഀ-ൿ]/, "Noto Sans Malayalam"],
  [/[؀-ۿ]/, "Noto Sans Arabic"],
  [/[぀-ヿ㐀-鿿]/, "Noto Sans SC"],
];

async function scriptFonts(text: string): Promise<Font[]> {
  const families = SCRIPT_FONTS.filter(([pattern]) => pattern.test(text)).map(([, family]) => family);
  const fonts = await Promise.all(
    families.flatMap((family) =>
      ([400, 700] as const).map(async (weight): Promise<Font | null> => {
        try {
          const query = `family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`;
          const css = await (await fetch(`https://fonts.googleapis.com/css2?${query}`, { signal: AbortSignal.timeout(2500) })).text();
          const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
          if (!url) return null;
          const data = await (await fetch(url, { signal: AbortSignal.timeout(2500) })).arrayBuffer();
          return { name: family, data, weight, style: "normal" };
        } catch {
          return null;
        }
      }),
    ),
  );
  return fonts.filter((font): font is Font => font !== null);
}

function titleSize(title: string): number {
  if (title.length > 70) return 44;
  if (title.length > 44) return 54;
  if (title.length > 26) return 64;
  return 76;
}


export async function renderInvitation(token: string, shape: InvitationShape): Promise<ImageResponse> {
  const size = INVITATION_SIZES[shape];
  const [[regular, bold, script], invited] = await Promise.all([FONTS, readInviteLink(createAdminClient(), token).catch(() => null)]);
  const baseFonts: Font[] = [
    { name: "Sora", data: regular, weight: 400, style: "normal" },
    { name: "Sora", data: bold, weight: 700, style: "normal" },
    { name: "Caveat", data: script, weight: 700, style: "normal" },
  ];

  if (!invited) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#FBF7F0", color: "#1F2937", fontFamily: "Sora", fontSize: 64, fontWeight: 700 }}>
          WonderHome
        </div>
      ),
      { ...size, fonts: baseFonts },
    );
  }

  const t = await translatorFor(invited.language);
  const words = invitationWords(t, invited.language, invited);
  const { palette, band, corner } = inviteDesign(invited.template);
  const cornerSrc = svgDataUri(corner);
  const extra = await scriptFonts([words.invited, words.kindLine, words.title, words.day, words.time ?? "", words.place ?? "", words.message ?? "", words.hosted].join(" "));
  const family = ["Sora", ...extra.map((font) => font.name)].join(", ");
  const headers = { "Cache-Control": "public, max-age=300, s-maxage=300" };
  const fonts = [...baseFonts, ...extra];
  const frame = (inset: number, width: number, color: string, radius: number, opacity = 1) => (
    <div style={{ position: "absolute", top: inset, left: inset, right: inset, bottom: inset, border: `${width}px solid ${color}`, borderRadius: radius, opacity, display: "flex" }} />
  );
  const divider = (width: number, marginTop: number) => (
    <div style={{ display: "flex", flexShrink: 0, alignItems: "center", marginTop, width }}>
      <div style={{ flex: 1, height: 2, background: palette.accent, display: "flex" }} />
      <div style={{ width: 14, height: 14, background: palette.accent2, transform: "rotate(45deg)", margin: "0 12px", display: "flex" }} />
      <div style={{ flex: 1, height: 2, background: palette.accent, display: "flex" }} />
    </div>
  );

  if (shape === "portrait") {
    // Tall like a printed card: every line has room, the whole line for guests included.
    const title = words.title.length > 60 ? 60 : words.title.length > 32 ? 72 : 88;
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", position: "relative", background: palette.paper, color: palette.ink, fontFamily: family }}>
          <img src={svgDataUri(band)} width={1080} height={108} alt="" style={{ position: "absolute", top: 0, left: 0 }} />
          {frame(22, 5, palette.accent, 36)}
          {frame(38, 2, palette.accent2, 26, 0.6)}
          <img src={cornerSrc} width={250} height={250} alt="" style={{ position: "absolute", left: 44, bottom: 44 }} />
          <img src={cornerSrc} width={250} height={250} alt="" style={{ position: "absolute", right: 44, bottom: 44, transform: "scaleX(-1)" }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", flex: 1, padding: "150px 96px 290px" }}>
            <div style={{ display: "flex", flexShrink: 0, fontFamily: `Caveat, ${family}`, fontSize: 96, fontWeight: 700, color: palette.accent, lineHeight: 1.1 }}>{words.invited}</div>
            <div style={{ display: "flex", flexShrink: 0, marginTop: 22, fontSize: 28, letterSpacing: 5, textTransform: "uppercase", color: palette.muted, fontWeight: 700 }}>{words.kindLine}</div>
            <div style={{ display: "flex", flexShrink: 0, marginTop: 26, fontSize: title, fontWeight: 700, lineHeight: 1.15, textAlign: "center", justifyContent: "center", maxWidth: 860 }}>{words.title}</div>
            {divider(260, 34)}
            <div style={{ display: "flex", flexShrink: 0, marginTop: 34, fontSize: 40, fontWeight: 700, justifyContent: "center" }}>{words.day}</div>
            {words.time ? <div style={{ display: "flex", flexShrink: 0, marginTop: 10, fontSize: 36, justifyContent: "center" }}>{words.time}</div> : null}
            {words.place ? <div style={{ display: "flex", flexShrink: 0, marginTop: 18, fontSize: 32, color: palette.muted, justifyContent: "center", maxWidth: 860 }}>{words.place}</div> : null}
            {words.message ? (
              <div style={{ display: "flex", flexShrink: 0, marginTop: 32, padding: "20px 32px", borderRadius: 24, background: palette.soft, fontSize: words.message.length > 160 ? 26 : 30, lineHeight: 1.35, justifyContent: "center", maxWidth: 860 }}>{words.message}</div>
            ) : null}
            <div style={{ display: "flex", flexShrink: 0, marginTop: 32, fontSize: 28, color: palette.muted }}>{words.hosted}</div>
          </div>
        </div>
      ),
      { ...size, fonts, headers },
    );
  }

  const when = [words.day, words.time].filter(Boolean).join("  ·  ");
  // A long line for guests is on the page in full; the postcard carries it only when it fits whole.
  const message = words.message && words.message.length <= 160 ? words.message : null;
  // A full card (a long title, a place and a line for guests) is set a size smaller so it all fits whole.
  const lines = (words.title.length > 26 ? 2 : 1) + (words.place ? 1 : 0) + (message ? 2 : 0);
  const dense = lines >= 4;
  const gap = dense ? 8 : 14;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", position: "relative", background: palette.paper, color: palette.ink, fontFamily: family }}>
        <img src={svgDataUri(band)} width={1200} height={120} alt="" style={{ position: "absolute", top: 0, left: 0 }} />
        {frame(18, 4, palette.accent, 28)}
        {frame(30, 2, palette.accent2, 20, 0.6)}
        <img src={cornerSrc} width={190} height={190} alt="" style={{ position: "absolute", left: 34, bottom: 34 }} />
        <img src={cornerSrc} width={190} height={190} alt="" style={{ position: "absolute", right: 34, bottom: 34, transform: "scaleX(-1)" }} />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", flex: 1, padding: dense ? "96px 200px 44px" : "110px 200px 56px" }}>
          <div style={{ display: "flex", fontFamily: `Caveat, ${family}`, fontSize: dense ? 50 : 64, fontWeight: 700, color: palette.accent, lineHeight: 1.15, flexShrink: 0 }}>{words.invited}</div>
          <div style={{ display: "flex", flexShrink: 0, marginTop: gap, fontSize: dense ? 19 : 22, letterSpacing: 4, textTransform: "uppercase", color: palette.muted, fontWeight: 700 }}>{words.kindLine}</div>
          <div style={{ display: "flex", flexShrink: 0, marginTop: gap, fontSize: dense ? Math.min(54, titleSize(words.title)) : titleSize(words.title), fontWeight: 700, lineHeight: 1.2, textAlign: "center", justifyContent: "center", maxWidth: 740 }}>{words.title}</div>
          {divider(220, gap + 4)}
          <div style={{ display: "flex", flexShrink: 0, marginTop: gap + 4, fontSize: dense ? 28 : 32, fontWeight: 700 }}>{when}</div>
          {words.place ? <div style={{ display: "flex", flexShrink: 0, marginTop: dense ? 6 : 10, fontSize: dense ? 23 : 26, color: palette.muted, justifyContent: "center" }}>{words.place}</div> : null}
          {message ? (
            <div style={{ display: "flex", flexShrink: 0, marginTop: gap + 2, padding: dense ? "8px 22px" : "12px 24px", borderRadius: 18, background: palette.soft, fontSize: dense ? 21 : 24, justifyContent: "center" }}>{message}</div>
          ) : null}
          <div style={{ display: "flex", flexShrink: 0, marginTop: gap + 2, fontSize: dense ? 19 : 22, color: palette.muted }}>{words.hosted}</div>
        </div>
      </div>
    ),
    { ...size, fonts, headers },
  );
}
