"use server";

import { headers } from "next/headers";

import { checkApplication, type ApplicationField } from "@wonderhome/core/careers/application";
import { CAREERS_MESSAGES, type ApplicationStatus } from "@wonderhome/core/careers/wonderjobs";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { clientIpFromHeaders, hashClientIp } from "@wonderhome/core/homesend/rate-limit";
import { hitRateLimit, type RateLimitBucket } from "@wonderhome/core/security/rate-limit";

import { careersConnection } from "../_lib/careers";

/**
 * The careers pages' two actions (the owner, 2026-10-21). Signed-out
 * visitors call them from this app's own pages (Next's server actions refuse
 * a cross-site POST), and only this server calls WonderJobs. Nothing an
 * applicant sends is kept or logged here: the client logs the job id, the
 * status code and the time taken, and nothing else.
 */

export type ApplyState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "closed" }
  | { status: "error"; message: string; field?: ApplicationField };

const RETRY = "Your application couldn't be sent just now. Please try again in a few minutes.";

/** Per hashed client address; an address that can't be told apart is let through (a throttle, not a gate). */
async function allowed(bucket: RateLimitBucket): Promise<boolean> {
  const ip = clientIpFromHeaders(await headers());
  if (!ip) return true;
  return hitRateLimit(createAdminClient(), bucket, hashClientIp(ip));
}

export async function applyAction(_previous: ApplyState, formData: FormData): Promise<ApplyState> {
  // A field people never see: anything in it is a bot, told it worked and sent nowhere.
  if (String(formData.get("website") ?? "").trim()) return { status: "sent" };
  const jobId = String(formData.get("jobId") ?? "");
  const checked = checkApplication({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    location: formData.get("location"),
    linkedinUrl: formData.get("linkedinUrl"),
    resumeUrl: formData.get("resumeUrl"),
    coverNote: formData.get("coverNote"),
    consent: formData.get("consent") === "on",
  });
  if (!checked.ok) return { status: "error", message: checked.message, field: checked.field };
  if (!(await allowed("careers.apply"))) return { status: "error", message: "Too many applications from this network. Please try again in an hour." };

  const connection = await careersConnection();
  if (connection.state !== "ready") return { status: "error", message: RETRY };
  const result = await connection.client.apply(jobId, checked.input);
  switch (result.state) {
    case "ok":
      return { status: "sent" };
    case "not_found":
      return { status: "closed" };
    case "rejected":
      return { status: "error", message: result.message };
    case "busy":
      return { status: "error", message: CAREERS_MESSAGES.busy };
    default:
      return { status: "error", message: RETRY };
  }
}

export type WithdrawState = { status: "idle" } | { status: "done"; application: ApplicationStatus } | { status: "error"; message: string };

export async function withdrawAction(_previous: WithdrawState, formData: FormData): Promise<WithdrawState> {
  if (!(await allowed("careers.status"))) return { status: "error", message: "Too many requests from this network. Please try again later." };
  const connection = await careersConnection();
  if (connection.state !== "ready") return { status: "error", message: "Your application couldn't be withdrawn just now. Please try again later." };
  // The token arrives in the form body and leaves in WonderJobs' request body, never in a URL.
  const result = await connection.client.status(String(formData.get("token") ?? ""), "withdraw");
  if (result.state === "ok") return { status: "done", application: result.data };
  if (result.state === "rejected") return { status: "error", message: result.message };
  if (result.state === "not_found") return { status: "error", message: "We couldn't find that application. Use the link in your email." };
  if (result.state === "busy") return { status: "error", message: CAREERS_MESSAGES.busy };
  return { status: "error", message: "Your application couldn't be withdrawn just now. Please try again later." };
}
