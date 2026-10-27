import type { PortalFiler } from "@wonderhome/core/portals/fetch-connection";

/**
 * Filing goes through HomeSend `ingestText` in the next slice — as the connection's
 * member (the Admin who set the portal up), so each item becomes a HomeSend entry
 * that waits for confirmation. For now the filer only reports what it would file,
 * because the extractor yields nothing yet; wiring both together is one step.
 */
export function loggingFiler(log: (message: string) => void): PortalFiler {
  return {
    async file({ connectionId, items }) {
      log(`[filer] connection ${connectionId}: ${items.length} item(s) ready to file (HomeSend wiring is the next slice)`);
    },
  };
}
