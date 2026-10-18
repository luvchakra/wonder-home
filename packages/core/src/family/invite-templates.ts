import type { EventKind } from "./schedule";

/**
 * The designs an event's invitation can wear (story 26-009): the page a guest
 * opens from the link and the postcard WhatsApp shows when the link is sent.
 *
 * One source for both. The page draws these motifs as images and the share
 * card (`apps/web/app/e/[token]/opengraph-image.tsx`) draws the same SVG, so
 * what the household picks is what their guests see in the chat and on the
 * page. The palettes are the invitation's own: festive colours a birthday or
 * a wedding card calls for, used only on invitation surfaces and never for
 * a control (DESIGN-NOTES, "Invitations").
 *
 * Which design an event gets is the household's choice; until they choose,
 * rules read the event's kind and title (`suggestTemplate`). No model is
 * involved.
 */

export const INVITE_TEMPLATES = ["birthday", "anniversary", "wedding", "festival", "puja", "housewarming", "baby", "dinner", "classic"] as const;
export type InviteTemplate = (typeof INVITE_TEMPLATES)[number];

export function isInviteTemplate(value: unknown): value is InviteTemplate {
  return typeof value === "string" && (INVITE_TEMPLATES as readonly string[]).includes(value);
}

/** Words in a title that settle the design, checked in this order (a "wedding anniversary" is an anniversary). */
const TITLE_RULES: ReadonlyArray<readonly [InviteTemplate, RegExp]> = [
  ["anniversary", /\banniversary\b|सालगिरह|वर्षगांठ|वाढदिवस लग्नाचा/i],
  ["baby", /baby\s*shower|godh\s*bharai|गोद भराई|naming|naam?karan|नामकरण|annaprashan|अन्नप्राशन|mundan|cradle|barsa|बारसं/i],
  ["housewarming", /house\s*warming|griha\s*pravesh|grih\s*pravesh|गृह\s*प्रवेश|new home/i],
  ["wedding", /wedding|shaadi|shadi|शादी|vivah|विवाह|लग्न|marriage|engagement|sagai|सगाई|sangeet|mehe?n?di|haldi|reception|roka/i],
  ["puja", /\bpo?oja\b|\bpuja\b|पूजा|पूजन|havan|हवन|satya\s*narayan|कीर्तन|kirtan|\bpath\b|jagran|जागरण|bhajan|भजन|aarti|आरती/i],
  ["festival", /diwali|deepavali|दिवाली|दीपावली|holi|होली|eid|ईद|christmas|navratri|नवरात्रि|durga|ganesh|गणेश|pongal|onam|lohri|लोहड़ी|rakhi|raksha\s*bandhan|राखी|dussehra|दशहरा|bhai\s*dooj|karwa|chhath|bihu|baisakhi|new year|nav\s*varsh|gudi\s*padwa|गुढीपाडवा|festival|त्योहार|सण/i],
  ["birthday", /birthday|bday|b'day|जन्मदिन|वाढदिवस|cumpleaños|anniversaire|geburtstag|عيد ميلاد|生日/i],
  ["dinner", /dinner|lunch|brunch|breakfast|party|get[\s-]*together|potluck|bbq|barbecue|picnic|reunion|kitty|game night|movie night|भोज|दावत|पार्टी/i],
];

/** The design an event gets when the household has not chosen one: its title first, then its kind. */
export function suggestTemplate(event: { kind: EventKind; title: string }): InviteTemplate {
  for (const [template, pattern] of TITLE_RULES) if (pattern.test(event.title)) return template;
  if (event.kind === "birthday") return "birthday";
  if (event.kind === "gathering" || event.kind === "outing" || event.kind === "family_time") return "dinner";
  return "classic";
}

/** The design in force: the household's pick, else the suggestion. */
export function templateFor(event: { inviteTemplate: string | null; kind: EventKind; title: string }): InviteTemplate {
  return isInviteTemplate(event.inviteTemplate) ? event.inviteTemplate : suggestTemplate(event);
}

export type InvitePalette = {
  /** The card's paper. */
  paper: string;
  /** Headline and body text; contrast checked against paper. */
  ink: string;
  /** Lighter text, still readable on paper. */
  muted: string;
  /** The main festive colour (frame, ornaments). */
  accent: string;
  /** The second ornament colour. */
  accent2: string;
  /** A soft tint for washes behind the details. */
  soft: string;
  /** Foliage. */
  leaf: string;
};

export type InviteDesign = {
  palette: InvitePalette;
  /** A garland across the top of the card, 1200×120. */
  band: string;
  /** A corner ornament, 200×200, drawn for the top-left and mirrored for the others. */
  corner: string;
};

// ---------------------------------------------------------------------------
// Drawing helpers: plain SVG strings, so the page and the share card share them.
// ---------------------------------------------------------------------------

const n = (value: number) => Math.round(value * 10) / 10;

function heart(cx: number, cy: number, size: number, fill: string): string {
  const s = size / 12;
  return `<path transform="translate(${n(cx)} ${n(cy)}) scale(${n(s)})" d="M0,-3 C-2,-7 -8,-7 -8,-2 C-8,2 -3,5 0,8 C3,5 8,2 8,-2 C8,-7 2,-7 0,-3Z" fill="${fill}"/>`;
}

function star(cx: number, cy: number, radius: number, fill: string): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? radius : radius * 0.45;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(`${n(cx + r * Math.cos(angle))},${n(cy + r * Math.sin(angle))}`);
  }
  return `<polygon points="${points.join(" ")}" fill="${fill}"/>`;
}

function leaf(cx: number, cy: number, length: number, angle: number, fill: string): string {
  return `<ellipse cx="0" cy="0" rx="${n(length / 2)}" ry="${n(length / 5)}" fill="${fill}" transform="translate(${n(cx)} ${n(cy)}) rotate(${n(angle)}) translate(${n(length / 2)} 0)"/>`;
}

function marigold(cx: number, cy: number, radius: number, outer: string, inner: string): string {
  const petals: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    const angle = (Math.PI / 4) * i;
    petals.push(`<circle cx="${n(cx + radius * 0.55 * Math.cos(angle))}" cy="${n(cy + radius * 0.55 * Math.sin(angle))}" r="${n(radius * 0.5)}" fill="${outer}"/>`);
  }
  return `${petals.join("")}<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(radius * 0.45)}" fill="${inner}"/>`;
}

function diya(cx: number, cy: number, width: number, bowl: string, flame: string, glow: string): string {
  const w = width / 2;
  return [
    `<ellipse cx="${n(cx)}" cy="${n(cy - w * 0.9)}" rx="${n(w * 0.55)}" ry="${n(w * 0.75)}" fill="${glow}" opacity="0.45"/>`,
    `<path d="M${n(cx)},${n(cy - w * 1.35)} C${n(cx + w * 0.3)},${n(cy - w * 0.9)} ${n(cx + w * 0.22)},${n(cy - w * 0.45)} ${n(cx)},${n(cy - w * 0.4)} C${n(cx - w * 0.22)},${n(cy - w * 0.45)} ${n(cx - w * 0.3)},${n(cy - w * 0.9)} ${n(cx)},${n(cy - w * 1.35)}Z" fill="${flame}"/>`,
    `<path d="M${n(cx - w)},${n(cy - w * 0.3)} Q${n(cx)},${n(cy + w * 0.75)} ${n(cx + w)},${n(cy - w * 0.3)} Z" fill="${bowl}"/>`,
  ].join("");
}

function svg(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>`;
}

/** An SVG string as an image source, for `<img>` on the page and in the share card alike. */
export function svgDataUri(markup: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(markup, "utf8").toString("base64")}`;
}

// --- Garlands across the top --------------------------------------------------

function bunting(p: InvitePalette): string {
  const colours = [p.accent, p.accent2, p.leaf];
  const flags: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    const x = 50 + i * 100;
    const t = x / 1200;
    const y = 14 + 110 * t * (1 - t);
    flags.push(`<polygon points="${n(x - 34)},${n(y)} ${n(x + 34)},${n(y)} ${n(x)},${n(y + 58)}" fill="${colours[i % 3]}"/>`);
  }
  return svg(1200, 120, `<path d="M0,14 Q600,124 1200,14" fill="none" stroke="${p.muted}" stroke-width="3"/>${flags.join("")}`);
}

function toran(p: InvitePalette): string {
  const parts: string[] = [`<line x1="0" y1="14" x2="1200" y2="14" stroke="${p.leaf}" stroke-width="4"/>`];
  for (let x = 20; x <= 1200; x += 40) parts.push(marigold(x, 16, 15, p.accent2, p.accent));
  for (let x = 60; x < 1200; x += 120) {
    for (let k = 1; k <= 3; k += 1) parts.push(marigold(x, 16 + k * 22, 9, k % 2 ? p.accent : p.accent2, p.accent2));
    parts.push(leaf(x, 100, 22, 90, p.leaf));
  }
  return svg(1200, 120, parts.join(""));
}

function lights(p: InvitePalette): string {
  const colours = [p.accent, p.accent2, p.leaf, p.soft];
  const parts: string[] = [`<path d="M0,20 Q150,70 300,20 T600,20 T900,20 T1200,20" fill="none" stroke="${p.muted}" stroke-width="2.5"/>`];
  for (let i = 0; i < 24; i += 1) {
    const x = 25 + i * 50;
    const phase = (x % 300) / 300;
    const y = 20 + 50 * Math.sin(Math.PI * phase) * 0.5 + 6;
    parts.push(`<rect x="${n(x - 4)}" y="${n(y - 4)}" width="8" height="8" rx="2" fill="${p.muted}"/>`);
    parts.push(`<ellipse cx="${n(x)}" cy="${n(y + 14)}" rx="8" ry="12" fill="${colours[i % 4]}"/>`);
  }
  return svg(1200, 120, parts.join(""));
}

function lanterns(p: InvitePalette): string {
  const parts: string[] = [`<line x1="0" y1="10" x2="1200" y2="10" stroke="${p.accent}" stroke-width="3"/>`];
  for (let i = 0; i < 8; i += 1) {
    const x = 75 + i * 150;
    const drop = i % 2 === 0 ? 34 : 18;
    parts.push(`<line x1="${x}" y1="10" x2="${x}" y2="${10 + drop}" stroke="${p.accent}" stroke-width="2"/>`);
    parts.push(`<rect x="${x - 16}" y="${10 + drop}" width="32" height="6" rx="2" fill="${p.accent}"/>`);
    parts.push(`<ellipse cx="${x}" cy="${10 + drop + 30}" rx="22" ry="26" fill="${i % 2 ? p.accent2 : p.accent}"/>`);
    parts.push(`<ellipse cx="${x}" cy="${10 + drop + 30}" rx="9" ry="22" fill="${p.soft}" opacity="0.55"/>`);
    parts.push(`<line x1="${x}" y1="${10 + drop + 56}" x2="${x}" y2="${10 + drop + 70}" stroke="${p.accent2}" stroke-width="3"/>`);
  }
  for (let i = 0; i < 7; i += 1) parts.push(diya(150 + i * 150, 30, 26, p.accent, p.accent2, p.soft));
  return svg(1200, 120, parts.join(""));
}

function starfield(p: InvitePalette): string {
  const parts: string[] = [];
  for (let i = 0; i < 26; i += 1) {
    const x = 24 + i * 46;
    const y = 20 + ((i * 37) % 70);
    parts.push(i % 3 === 0 ? star(x, y, 11, p.accent2) : i % 3 === 1 ? `<circle cx="${x}" cy="${y}" r="4" fill="${p.accent}"/>` : star(x, y, 7, p.accent));
  }
  return svg(1200, 120, parts.join(""));
}

function heartline(p: InvitePalette): string {
  const parts: string[] = [`<path d="M0,30 Q300,70 600,30 T1200,30" fill="none" stroke="${p.accent2}" stroke-width="2"/>`];
  for (let i = 0; i < 20; i += 1) {
    const x = 30 + i * 60;
    const phase = (x % 600) / 600;
    const y = 30 + 20 * Math.sin(Math.PI * phase) + 10;
    parts.push(heart(x, y, i % 2 ? 20 : 28, i % 2 ? p.accent2 : p.accent));
  }
  return svg(1200, 120, parts.join(""));
}

function vine(p: InvitePalette): string {
  const parts: string[] = [`<path d="M0,30 Q100,60 200,30 T400,30 T600,30 T800,30 T1000,30 T1200,30" fill="none" stroke="${p.leaf}" stroke-width="3"/>`];
  for (let i = 0; i < 24; i += 1) {
    const x = 25 + i * 50;
    parts.push(leaf(x, 34, 26, i % 2 ? 40 : 140, p.leaf));
    if (i % 4 === 0) parts.push(`<circle cx="${x}" cy="${i % 8 === 0 ? 52 : 18}" r="6" fill="${p.accent2}"/>`);
  }
  return svg(1200, 120, parts.join(""));
}

// --- Corner ornaments ------------------------------------------------------------

function balloons(p: InvitePalette): string {
  const balloon = (cx: number, cy: number, fill: string) =>
    `<path d="M${cx},${cy + 40} Q${cx - 10},${cy + 80} ${cx + 8},${cy + 120}" fill="none" stroke="${p.muted}" stroke-width="2"/><ellipse cx="${cx}" cy="${cy}" rx="28" ry="36" fill="${fill}"/><ellipse cx="${cx - 9}" cy="${cy - 12}" rx="6" ry="10" fill="#FFFFFF" opacity="0.45"/><polygon points="${cx - 5},${cy + 36} ${cx + 5},${cy + 36} ${cx},${cy + 44}" fill="${fill}"/>`;
  return svg(200, 200, `${balloon(60, 60, p.accent)}${balloon(120, 46, p.accent2)}${balloon(96, 104, p.leaf)}${star(170, 130, 8, p.accent2)}${star(30, 150, 6, p.accent)}`);
}

function rings(p: InvitePalette): string {
  return svg(
    200,
    200,
    `${marigold(40, 40, 22, p.accent2, p.accent)}${leaf(56, 56, 40, 45, p.leaf)}${leaf(40, 60, 34, 100, p.leaf)}<circle cx="92" cy="110" r="30" fill="none" stroke="${p.accent}" stroke-width="7"/><circle cx="128" cy="110" r="30" fill="none" stroke="${p.accent}" stroke-width="7"/><polygon points="128,70 138,80 128,92 118,80" fill="${p.accent2}"/>`,
  );
}

function diyaCorner(p: InvitePalette): string {
  return svg(200, 200, `${diya(70, 120, 90, p.accent, p.accent2, p.soft)}${diya(150, 160, 50, p.accent2, p.accent, p.soft)}${star(160, 50, 10, p.accent2)}${star(40, 40, 7, p.accent)}`);
}

function lotus(p: InvitePalette): string {
  const petal = (angle: number, fill: string) => `<ellipse cx="0" cy="-34" rx="16" ry="38" fill="${fill}" transform="translate(100 130) rotate(${angle})"/>`;
  return svg(200, 200, `${petal(-60, p.soft)}${petal(60, p.soft)}${petal(-30, p.accent2)}${petal(30, p.accent2)}${petal(0, p.accent)}${leaf(100, 140, 70, 10, p.leaf)}${leaf(100, 140, 70, 170, p.leaf)}${diya(100, 64, 30, p.accent, p.accent2, p.soft)}`);
}

function house(p: InvitePalette): string {
  return svg(
    200,
    200,
    `<polygon points="100,40 170,100 30,100" fill="${p.accent}"/><rect x="48" y="98" width="104" height="72" rx="6" fill="${p.soft}"/><rect x="88" y="124" width="26" height="46" rx="4" fill="${p.accent2}"/>${heart(100, 74, 26, "#FFFFFF")}${leaf(160, 170, 40, -60, p.leaf)}${leaf(40, 170, 40, -120, p.leaf)}`,
  );
}

function moon(p: InvitePalette): string {
  return svg(200, 200, `<circle cx="90" cy="90" r="50" fill="${p.accent2}"/><circle cx="114" cy="74" r="44" fill="${p.paper}"/>${star(150, 130, 12, p.accent)}${star(60, 160, 8, p.accent)}${star(160, 50, 7, p.accent2)}<ellipse cx="120" cy="170" rx="40" ry="14" fill="${p.soft}"/><ellipse cx="96" cy="164" rx="22" ry="14" fill="${p.soft}"/>`);
}

function hearts(p: InvitePalette): string {
  return svg(200, 200, `${heart(80, 80, 90, p.accent)}${heart(130, 120, 60, p.accent2)}${leaf(40, 150, 46, -40, p.leaf)}${star(160, 50, 8, p.accent2)}`);
}

function glasses(p: InvitePalette): string {
  const glass = (x: number, tilt: number, fill: string) =>
    `<g transform="translate(${x} 120) rotate(${tilt})"><path d="M-22,-70 L22,-70 L14,-20 Q0,-6 -14,-20 Z" fill="${fill}"/><rect x="-2" y="-14" width="4" height="44" fill="${p.muted}"/><rect x="-16" y="28" width="32" height="5" rx="2" fill="${p.muted}"/></g>`;
  return svg(200, 200, `${glass(78, -14, p.accent)}${glass(122, 14, p.accent2)}${star(100, 30, 10, p.accent2)}${star(60, 40, 6, p.accent)}${star(146, 46, 6, p.accent)}`);
}

function sprig(p: InvitePalette): string {
  const parts = [`<path d="M20,180 Q80,120 170,30" fill="none" stroke="${p.leaf}" stroke-width="4"/>`];
  for (let i = 0; i < 6; i += 1) {
    const t = i / 6;
    const x = 20 + 150 * t;
    const y = 180 - 150 * t;
    parts.push(leaf(x, y, 40, -80 - 20 * (i % 2), p.leaf), leaf(x, y, 34, 10 + 20 * (i % 2), p.leaf));
  }
  return svg(200, 200, `${parts.join("")}<circle cx="170" cy="30" r="10" fill="${p.accent2}"/>`);
}

const PALETTES: Record<InviteTemplate, InvitePalette> = {
  birthday: { paper: "#FFF4F8", ink: "#4A1D3F", muted: "#7A4A6B", accent: "#EC4899", accent2: "#F59E0B", soft: "#FCE7F3", leaf: "#6366F1" },
  anniversary: { paper: "#FDF6EE", ink: "#4A2C2A", muted: "#7A5A50", accent: "#BE123C", accent2: "#D4A017", soft: "#FBE4E4", leaf: "#7C9A6B" },
  wedding: { paper: "#FFF8EC", ink: "#6B1A1A", muted: "#8A4B3A", accent: "#B91C1C", accent2: "#E6A100", soft: "#FCEBD3", leaf: "#3F7D4E" },
  festival: { paper: "#FFF6E5", ink: "#5B2A06", muted: "#85532A", accent: "#D9480F", accent2: "#F5B700", soft: "#FFE8B8", leaf: "#2F855A" },
  puja: { paper: "#FFF4E6", ink: "#6A2A0E", muted: "#8C5534", accent: "#EA580C", accent2: "#E8B004", soft: "#FDE2C8", leaf: "#3F7D4E" },
  housewarming: { paper: "#F2F8F1", ink: "#1F3D2B", muted: "#4A6655", accent: "#0F9D6E", accent2: "#F59E0B", soft: "#D9EFE2", leaf: "#2F7A4F" },
  baby: { paper: "#F2F7FD", ink: "#1E3A5F", muted: "#4A6386", accent: "#5B9BE8", accent2: "#F3A6C8", soft: "#DCEBFA", leaf: "#7FB8A4" },
  dinner: { paper: "#F8F4EE", ink: "#2A2433", muted: "#5C556A", accent: "#6366F1", accent2: "#F59E0B", soft: "#E8E6FB", leaf: "#10B981" },
  classic: { paper: "#FFFCF6", ink: "#1F2937", muted: "#4B5563", accent: "#6366F1", accent2: "#F472B6", soft: "#EEF0FB", leaf: "#10B981" },
};

const DRAWINGS: Record<InviteTemplate, { band: (p: InvitePalette) => string; corner: (p: InvitePalette) => string }> = {
  birthday: { band: bunting, corner: balloons },
  anniversary: { band: heartline, corner: hearts },
  wedding: { band: toran, corner: rings },
  festival: { band: lanterns, corner: diyaCorner },
  puja: { band: toran, corner: lotus },
  housewarming: { band: toran, corner: house },
  baby: { band: starfield, corner: moon },
  dinner: { band: lights, corner: glasses },
  classic: { band: vine, corner: sprig },
};

const designs = new Map<InviteTemplate, InviteDesign>();

/** The palette and drawings of one design, built once. */
export function inviteDesign(template: InviteTemplate): InviteDesign {
  const cached = designs.get(template);
  if (cached) return cached;
  const palette = PALETTES[template];
  const design = { palette, band: DRAWINGS[template].band(palette), corner: DRAWINGS[template].corner(palette) };
  designs.set(template, design);
  return design;
}

/** A guest's line on the invitation: one paragraph, trimmed, at most 300 characters (the column's own limit). */
export function cleanInviteMessage(value: string | null | undefined): string | null {
  const text = (value ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return text ? text.slice(0, 300) : null;
}
