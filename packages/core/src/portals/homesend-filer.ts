import type { SupabaseClient } from "@supabase/supabase-js";

import { ingestText, type IngestActor } from "../homesend/ingest";
import type { PortalFiler, RawPortalItem } from "./fetch-connection";

/**
 * Filing portal items into HomeSend (story 08-033).
 *
 * Everything a portal yields is untrusted content, so it goes through HomeSend
 * exactly like a pasted or forwarded message: `ingestText` creates an item that
 * waits for a person to confirm (and, when the household has an AI key,
 * understands it into the right entry; with none it still files for review). The
 * item is filed as the connection's member — the Admin who set the portal up —
 * and the worker reads/writes with the service role, so this takes the admin
 * client. It never writes a domain row itself.
 */

const MAX_TEXT = 16_000;

type IngestTextFn = typeof ingestText;

/** The text one portal item is filed as: a labelled title/subject/date plus the body. */
export function portalItemText(item: RawPortalItem): string {
  const parts = [
    item.title,
    item.subject ? `Subject: ${item.subject}` : "",
    item.dueOn ? `Date: ${item.dueOn}` : "",
    item.detail ?? "",
  ].filter(Boolean);
  return parts.join("\n\n").slice(0, MAX_TEXT);
}

/** A `PortalFiler` that files each item through HomeSend as `actor`. `ingest` is injectable for tests. */
export function homeSendPortalFiler(adminClient: SupabaseClient, actor: IngestActor, ingest: IngestTextFn = ingestText): PortalFiler {
  return {
    async file({ items }) {
      for (const item of items) {
        const text = portalItemText(item);
        if (text.length === 0) continue;
        await ingest(adminClient, actor, { text });
      }
    },
  };
}
