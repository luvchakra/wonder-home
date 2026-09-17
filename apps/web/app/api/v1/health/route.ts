import { defineRoute } from "@wonderhome/core/api/route";

/**
 * Liveness probe. Deliberately unauthenticated and deliberately boring: it
 * reports that the app is serving requests, and nothing about the household,
 * the database contents or the deployment's configuration.
 */
export const GET = defineRoute({}, () => ({
  status: "ok",
  service: "wonderhome-api",
  version: "v1",
}));

export const dynamic = "force-dynamic";
