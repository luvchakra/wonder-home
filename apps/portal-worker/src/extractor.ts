import type { PortalExtractor } from "@wonderhome/core/portals/fetch-connection";

/**
 * Turning a rendered page into structured items is HomeBrain's job (validated,
 * schema-bound) and is wired in the next slice. Until then the worker reads and
 * reports pages but extracts nothing, on purpose: a crude line-splitter would
 * flood HomeSend with half-understood fragments, and "AI-extracted web items
 * always wait for confirmation" only starts once the extraction it waits on is
 * real. This placeholder keeps the pipeline honest and lets the worker prove
 * live login, session reuse and page rendering first.
 */
export const placeholderExtractor: PortalExtractor = {
  async extract() {
    return [];
  },
};
