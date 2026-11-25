#!/usr/bin/env node
/**
 * Synthetic households for the test environment (docs/test-environment.md).
 *
 *   node scripts/test-env/seed.mjs [count]     default 2; prints each EMAIL, PASSWORD
 *
 * Never copies production data: every person and household here is made up,
 * with an email on `wonderhome-test.internal`, a domain that receives no mail.
 * Idempotent: an account that already exists is reused, its password reset,
 * and a household is created only when it has none.
 *
 * Needs TEST_SUPABASE_URL, TEST_SUPABASE_PUBLISHABLE_KEY and
 * TEST_SUPABASE_SERVICE_ROLE_KEY. Refuses the production project.
 */
import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { requireTestRef } from "./lib.mjs";

export const SEED_DOMAIN = "wonderhome-test.internal";
const FAMILIES = ["Sharma", "Iyer", "Fernandes", "Khan", "Bose", "Reddy"];

function need(name) {
  const value = (process.env[name] ?? "").trim();
  if (!value) throw new Error(`Set ${name} (the wonderhome-test project's value).`);
  return value;
}

async function main() {
  requireTestRef();
  const url = need("TEST_SUPABASE_URL");
  const admin = createClient(url, need("TEST_SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const publishable = need("TEST_SUPABASE_PUBLISHABLE_KEY");
  const count = Math.max(1, Math.min(FAMILIES.length, Number(process.argv[2] ?? 2) || 2));

  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw new Error(`listUsers: ${listError.message}`);

  for (const family of FAMILIES.slice(0, count)) {
    const email = `seed-${family.toLowerCase()}@${SEED_DOMAIN}`;
    const password = `Test-${randomBytes(9).toString("base64url")}`;
    const existing = list.users.find((u) => u.email === email);
    const { data: made, error } = existing
      ? await admin.auth.admin.updateUserById(existing.id, { password })
      : await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Asha ${family}` } });
    if (error) throw new Error(`${email}: ${error.message}`);

    const member = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: signInError } = await member.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(`${email} sign-in: ${signInError.message}`);
    const { data: memberships } = await admin.from("household_members").select("household_id").eq("profile_id", made.user.id).limit(1);
    if (!memberships?.length) {
      const { error: rpcError } = await member.rpc("create_household", { p_household_name: `The ${family} Home`, p_display_name: `Asha ${family}`, p_timezone: "Asia/Kolkata" });
      if (rpcError) throw new Error(`${email} create_household: ${rpcError.code ?? rpcError.message}`);
    }
    console.log(`EMAIL=${email} PASSWORD=${password} USER_ID=${made.user.id}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
