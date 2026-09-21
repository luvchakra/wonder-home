#!/usr/bin/env node
/**
 * A confirmed test account for live browser verification, without touching
 * the public sign-up form.
 *
 * The public sign-up flow rejects some sandboxed/test email domains outright
 * (Supabase Auth's own validation, not this app's) — `.test` and
 * `example.com` both fail with "We could not create that account," which
 * looks like an app bug from the browser but is not one. Chasing that down
 * once cost a whole session of trial and error. The fix isn't to find an
 * email domain Supabase Auth tolerates — it's to skip the public form
 * entirely: `auth.admin.createUser` (the service-role key already checked
 * into `apps/web/.env.local` for exactly this kind of tool) creates an
 * already-confirmed user directly, no email step, no domain validation.
 *
 * Only ever creates a real row in whatever Supabase project `.env.local`
 * points at (this repo's shared/production project, as of this writing) —
 * always `delete` what `create` made once you're done with it.
 *
 *   node scripts/qa-test-user.mjs create ["A Display Name"]
 *     -> prints EMAIL=…, PASSWORD=…, USER_ID=…
 *
 *   node scripts/qa-test-user.mjs delete <user-id>
 *     -> deletes the auth user (and, via cascade, their own profile row;
 *        any household they created is left behind as ordinary orphaned
 *        test data, same as it would be after any real account deletion —
 *        this script does not chase down and remove that too)
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const QA_EMAIL_DOMAIN = "wonderhome-qa-verify.internal";

function loadEnv() {
  const fromProcess = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  if (fromProcess.url && fromProcess.serviceRole) return fromProcess;

  const file = readFileSync(`${ROOT}/apps/web/.env.local`, "utf8");
  const parsed = Object.fromEntries(
    file
      .split("\n")
      .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
      .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
  );
  return {
    url: fromProcess.url ?? parsed.NEXT_PUBLIC_SUPABASE_URL,
    serviceRole: fromProcess.serviceRole ?? parsed.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function create(displayName) {
  const env = loadEnv();
  const admin = createClient(env.url, env.serviceRole);

  const email = `qa-verify-${Date.now()}@${QA_EMAIL_DOMAIN}`;
  const password = `Test${Math.random().toString(36).slice(2, 10)}!Verify`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName ?? "QA Verify" },
  });

  if (error) {
    console.error(`Could not create the test user: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`EMAIL=${email}`);
  console.log(`PASSWORD=${password}`);
  console.log(`USER_ID=${data.user.id}`);
  console.log(`\nRemember to delete it when you're done: node scripts/qa-test-user.mjs delete ${data.user.id}`);
}

async function del(userId) {
  if (!userId) {
    console.error("Usage: node scripts/qa-test-user.mjs delete <user-id>");
    process.exitCode = 1;
    return;
  }

  const env = loadEnv();
  const admin = createClient(env.url, env.serviceRole);

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error(`Could not delete ${userId}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Deleted ${userId}`);
}

const [, , command, arg] = process.argv;

if (command === "create") {
  await create(arg);
} else if (command === "delete") {
  await del(arg);
} else {
  console.error("Usage: node scripts/qa-test-user.mjs create [\"Display Name\"]");
  console.error("       node scripts/qa-test-user.mjs delete <user-id>");
  process.exitCode = 1;
}
