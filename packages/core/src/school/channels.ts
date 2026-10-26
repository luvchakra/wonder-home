import { getSchoolProvider, SCHOOL_PROVIDERS, type SchoolProviderDescriptor } from "./providers";

/**
 * School message channels (story 08-030).
 *
 * A "channel" is a continuous feed of messages inside a school portal — a class
 * group, a notice board — that a parent reaches at a stable URL, for example
 * `https://www.looplearning.com/channel/2044541`. The ask is: after the account
 * is connected, let a household paste that link, and have each message that
 * arrives tracked and entered into WonderHome.
 *
 * This module is the honest, network-free core of that: recognising a pasted
 * link as a provider's channel, and codifying how one of its messages becomes a
 * WonderHome entry. Two rules it keeps, from `CLAUDE.md`'s agent platform:
 *  - Every message is untrusted content. It is filed through HomeSend for
 *    review, injection-scanned, and nothing reaches a domain table until a
 *    person confirms — a school channel is never an authorisation channel.
 *  - Nothing polls a real portal yet. A channel can be recognised and described
 *    before any adapter is live; the continuous tracking turns on only once the
 *    provider's adapter ships (`adapterReady`), its credentials and a guardian's
 *    consent are in place, and the channel is stored against the connection.
 */

/** A channel a household wants tracked: which provider, the provider's id for it, and the link. */
export type SchoolChannelRef = {
  provider: string;
  channelId: string;
  /** The normalised link, without a trailing slash or query. */
  url: string;
};

export type ParseSchoolChannelResult =
  | { ok: true; channel: SchoolChannelRef }
  | { ok: false; reason: "invalid_url" | "unknown_provider" | "unsupported_path" };

function providerForHost(host: string): SchoolProviderDescriptor | null {
  const lower = host.toLowerCase();
  return SCHOOL_PROVIDERS.find((descriptor) => descriptor.channel?.hosts.includes(lower)) ?? null;
}

/**
 * Recognise a pasted channel link.
 *
 * The link decides the provider — a household does not pick one and then paste a
 * mismatched address. A link whose host no provider claims, or whose path is not
 * a channel, is refused with a reason rather than guessed at, because a
 * misrecognised channel would file a stranger's messages against a child.
 *
 * Recognition does not require the provider to be live: a channel can be named
 * and stored before its adapter ships. Whether it is actually polled is a
 * separate question the connection's state answers.
 */
export function parseSchoolChannel(rawUrl: string): ParseSchoolChannelResult {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: "invalid_url" };

  const descriptor = providerForHost(url.host);
  if (!descriptor?.channel) return { ok: false, reason: "unknown_provider" };

  const match = descriptor.channel.pathPattern.exec(url.pathname);
  const channelId = match?.[1];
  if (!channelId) return { ok: false, reason: "unsupported_path" };

  const host = url.host.toLowerCase();
  const path = url.pathname.replace(/\/+$/, "");
  return { ok: true, channel: { provider: descriptor.id, channelId, url: `${url.protocol}//${host}${path}` } };
}

/** One message as a portal channel delivered it, before it becomes anything. All fields are untrusted. */
export type SchoolChannelMessage = {
  /** The portal's own id for this message, so a continuous feed never files one twice. */
  externalId: string;
  /** The message body, exactly as the portal sent it. */
  text: string;
  /** When the portal says it was posted, if it says. */
  postedAt?: string | null;
  /** The sender's name as the portal showed it, if any. */
  from?: string | null;
};

/**
 * The HomeSend intake a channel message becomes.
 *
 * This is the shape a channel message is handed to HomeSend as — untrusted text
 * with an idempotency key and a context line — not a canonical entry. HomeSend
 * understands it, scans it for instructions, and files it for a person to
 * confirm. The DB-backed ingest that performs the write, the dedicated
 * `school_channel` source and the stored channels and polling are story 08-031.
 */
export type SchoolChannelIntake = {
  /** Scoped by provider and channel so two portals' message ids never collide. */
  externalId: string;
  /** The text HomeSend reads: the sender, when known, then the message. */
  text: string;
  /** What HomeSend is told this is, for the reviewer and the model. */
  context: { channel: string; url: string };
};

export function toChannelIntake(channel: SchoolChannelRef, message: SchoolChannelMessage): SchoolChannelIntake {
  const label = getSchoolProvider(channel.provider)?.label ?? channel.provider;
  const from = message.from?.trim();
  return {
    externalId: `school_channel:${channel.provider}:${channel.channelId}:${message.externalId}`,
    text: from ? `${from}: ${message.text}` : message.text,
    context: { channel: `a message in a ${label} class channel`, url: channel.url },
  };
}
