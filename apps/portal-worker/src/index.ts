import { createAdminClient } from "@wonderhome/core/db/admin";

import { createPlaywrightBrowser } from "./playwright-browser";
import { claimJob, completeJob } from "./queue";
import { runFetchJob } from "./run-job";
import { startHealthServer } from "./server";

/**
 * The portal fetch worker (story 08-033). Runs on Fly, not Vercel. It polls the
 * Supabase job queue; for each job it signs into the connection's portal with the
 * real browser, reads the pages the household asked for, and files what it finds
 * through HomeSend (extraction + filing are the next slice). It holds only the
 * service-role key (a Fly secret) and decrypts each sign-in at job time.
 */

const POLL_MS = Number(process.env.PORTAL_POLL_MS ?? 5_000);
const PORT = Number(process.env.PORT ?? 8080);

const log = (message: string) => console.log(new Date().toISOString(), message);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  // Start the health endpoint first, before anything that can throw, so the
  // platform sees a live machine and the logs are readable even when the config
  // is incomplete.
  const server = startHealthServer(PORT, log);

  let browser: ReturnType<typeof createPlaywrightBrowser> | null = null;
  let running = true;
  const shutdown = async (signal: string) => {
    if (!running) return;
    running = false;
    log(`[worker] ${signal} — shutting down`);
    server.close();
    await browser?.shutdown().catch(() => {});
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // Missing secrets must not crash-loop the machine: log plainly and keep the
  // health endpoint up so the operator can set them and redeploy.
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
    browser = createPlaywrightBrowser({ proxyServer: process.env.PORTAL_PROXY_SERVER });
  } catch (thrown) {
    log(`[worker] startup config error: ${thrown instanceof Error ? thrown.message : "error"}`);
    log("[worker] set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (fly secrets set) and redeploy. Health is up; not processing jobs.");
    return; // the http server keeps the process alive
  }

  const activeBrowser = browser!; // assigned above; the catch returned otherwise
  log("[worker] started");
  while (running) {
    try {
      const job = await claimJob(admin);
      if (!job) {
        await sleep(POLL_MS);
        continue;
      }
      log(`[worker] claimed job ${job.id} (connection ${job.integrationId}, attempt ${job.attempts})`);
      try {
        const outcome = await runFetchJob({
          adminClient: admin,
          browser: activeBrowser,
          integrationId: job.integrationId,
          householdId: job.householdId,
          log,
        });
        await completeJob(admin, job.id, {
          status: outcome.state === "connected" ? "done" : "failed",
          reason: outcome.reason ?? null,
        });
      } catch (thrown) {
        const reason = (thrown instanceof Error ? thrown.message : "error").slice(0, 400);
        log(`[worker] job ${job.id} failed: ${reason}`);
        await completeJob(admin, job.id, { status: "failed", reason }).catch(() => {});
      }
    } catch (thrown) {
      log(`[worker] loop error: ${thrown instanceof Error ? thrown.message : "error"}`);
      await sleep(POLL_MS);
    }
  }
}

main().catch((thrown) => {
  console.error(thrown);
  process.exit(1);
});
