import { z } from "zod";

import { createAssetSchema, createServiceRequestSchema } from "../home/schemas";
import { createHouseholdSchema } from "../identity/schemas";
import { API_ERROR_CODES } from "./errors";

/**
 * OpenAPI description of /api/v1 (story 18-005).
 *
 * Generated from the same Zod schemas the endpoints validate with, so the
 * document cannot drift from the behaviour: a schema change moves both at once.
 * A hand-written spec is a second source of truth that is wrong within a month.
 */

export const OPENAPI_VERSION = "3.1.0";
export const API_VERSION = "v1";

type Json = Record<string, unknown>;

/** Minimal Zod → JSON Schema conversion covering the shapes the API uses. */
export function toJsonSchema(schema: z.ZodTypeAny): Json {
  const def = schema.def as { type?: string } & Record<string, unknown>;

  switch (def.type) {
    case "object": {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Json = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        const field = value as z.ZodTypeAny;
        properties[key] = toJsonSchema(field);
        if (!field.safeParse(undefined).success) required.push(key);
      }

      return required.length > 0
        ? { type: "object", properties, required }
        : { type: "object", properties };
    }
    case "array":
      return { type: "array", items: toJsonSchema((def as { element: z.ZodTypeAny }).element) };
    case "string":
      return { type: "string" };
    case "number":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "enum":
      return { type: "string", enum: Object.values((def as { entries: Record<string, string> }).entries) };
    case "default":
      return toJsonSchema((def as { innerType: z.ZodTypeAny }).innerType);
    case "optional":
    case "nullable":
      return toJsonSchema((def as { innerType: z.ZodTypeAny }).innerType);
    default:
      return {};
  }
}

const errorResponse = {
  description: "Standard error envelope",
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message", "requestId"],
            properties: {
              code: { type: "string", enum: Object.keys(API_ERROR_CODES) },
              message: { type: "string" },
              details: {},
              requestId: { type: "string" },
            },
          },
        },
      },
    },
  },
} as const;

export function buildOpenApiDocument(): Json {
  return {
    openapi: OPENAPI_VERSION,
    info: {
      title: "WonderHome API",
      version: API_VERSION,
      description:
        "Household operating system API. The web client and governed AI tools are both consumers of these endpoints; business logic lives behind them, never in a client.",
    },
    servers: [{ url: "/api/v1" }],
    components: {
      securitySchemes: {
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "sb-access-token",
          description: "Supabase session cookie, set by sign-in and refreshed by middleware.",
        },
      },
      parameters: {
        idempotencyKey: {
          name: "Idempotency-Key",
          in: "header",
          required: false,
          schema: { type: "string", minLength: 8, maxLength: 255 },
          description:
            "Makes a side-effecting request replay-safe. Reusing a key with a different body is refused with 409.",
        },
      },
      responses: {
        Unauthenticated: errorResponse,
        Forbidden: errorResponse,
        NotFound: errorResponse,
        BadRequest: errorResponse,
        Conflict: errorResponse,
      },
    },
    security: [{ sessionCookie: [] }],
    paths: {
      "/health": {
        get: {
          summary: "Liveness probe",
          security: [],
          responses: { "200": { description: "The service is serving requests" } },
        },
      },
      "/health/ready": {
        get: {
          summary: "Readiness probe",
          description:
            "Reports whether this instance can serve: each dependency with a status and a timing, and nothing about the deployment. Degraded still returns 200; only down returns 503.",
          security: [],
          responses: {
            "200": { description: "Serving, possibly degraded" },
            "503": { description: "A dependency is down" },
          },
        },
      },
      "/me": {
        get: {
          summary: "The authenticated identity",
          responses: {
            "200": { description: "The caller's identity" },
            "401": { $ref: "#/components/responses/Unauthenticated" },
          },
        },
      },
      "/me/view": {
        get: {
          summary: "The caller's personalized view of their household",
          description:
            "Sections the caller may not see are absent from the response rather than hidden by the client.",
          responses: {
            "200": { description: "The personalized view" },
            "401": { $ref: "#/components/responses/Unauthenticated" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/households": {
        get: {
          summary: "Households the caller belongs to",
          responses: {
            "200": { description: "Memberships" },
            "401": { $ref: "#/components/responses/Unauthenticated" },
          },
        },
        post: {
          summary: "Create a household and become its owner and Admin",
          requestBody: {
            required: true,
            content: { "application/json": { schema: toJsonSchema(createHouseholdSchema) } },
          },
          responses: {
            "201": { description: "The new household and the caller's member record" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthenticated" },
          },
        },
      },
      "/households/{householdId}/invitations": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "Pending invitations",
          responses: {
            "200": { description: "Invitations awaiting acceptance" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
        post: {
          summary: "Invite someone to the household",
          description:
            "Returns the invitation token exactly once. Only a digest is stored, so it cannot be retrieved again.",
          parameters: [{ $ref: "#/components/parameters/idempotencyKey" }],
          responses: {
            "201": { description: "The invitation and its one-time token" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "409": { $ref: "#/components/responses/Conflict" },
          },
        },
      },
      "/households/{householdId}/children": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "Children in the household",
          description: "Age band is derived from the date of birth on read; it is never stored.",
          responses: { "200": { description: "Child profiles" } },
        },
        post: {
          summary: "Add a guardian-controlled child",
          responses: {
            "201": { description: "The new child member" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/entitlements": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "What this household's plan allows, and what it has used",
          description:
            "The same counters the entitlement service enforces against, so a client can show usage without a second copy of the number. Rendering is not authorization: every guarded path re-asks the entitlement service regardless of this response.",
          responses: {
            "200": { description: "Plan key and enabled features with their limits and usage this period" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/integrations": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "Provider connections and their health",
          description:
            "Never includes a credential or where one is stored, and never a provider payload.",
          responses: {
            "200": { description: "Connections with status and whether anyone needs to act" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/integrations/calendar/sync": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        post: {
          summary: "Sync the household's connected calendar now",
          description:
            "Runs the calendar connector for an administrator and reconciles what it returns onto the family calendar by provider identity. Imported events are never protected and never confirmed; a private entry arrives as time only. Responds with counts and the connection's health, never a provider payload. 409 while no provider is live.",
          parameters: [
            {
              name: "provider",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Which provider, when more than one calendar is connected.",
            },
          ],
          responses: {
            "200": { description: "Counts of what changed and the connection's state" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { description: "No calendar is connected" },
            "409": { description: "The provider is not configured, or more than one is connected and none was named" },
          },
        },
      },
      "/households/{householdId}/integrations/email/sync": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        post: {
          summary: "Sync the household's connected mailbox now",
          description:
            "Runs the mail connector for an administrator and reconciles recognised bills onto the household's obligations by provider identity and content hash. An email can never mark a bill paid, and a bill already marked paid is never touched by a re-sync. Mail the adapter does not recognise as a bill is filed, not surfaced. Responds with counts and the connection's health, never message content. 409 while no provider is live.",
          parameters: [
            {
              name: "provider",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Which provider, when more than one mailbox is connected.",
            },
          ],
          responses: {
            "200": { description: "Counts of what changed and the connection's state" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { description: "No mailbox is connected" },
            "409": { description: "The provider is not configured, or more than one is connected and none was named" },
          },
        },
      },
      "/households/{householdId}/integrations/commerce/sync": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        post: {
          summary: "Ask the merchant where the household's orders are",
          description:
            "Runs the commerce connector for an administrator and reconciles what it returns onto orders by provider identity and content hash. Unlike the other connectors, a merchant is reporting on something this household created with money already committed: so the household's lifecycle governs, and a record moving an order backwards or out of a terminal state is refused rather than applied. A total that no longer matches what was agreed is reported as a reprice and never written over the approved figure. An order the household does not have is reported unmatched, never inserted — it has no approval behind it. Responds with counts, the refusals, the reprices and the connection's health, never a merchant payload. 409 while no merchant is live.",
          parameters: [
            {
              name: "provider",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Which merchant, when more than one is connected.",
            },
          ],
          responses: {
            "200": { description: "Counts of what changed, what was refused, what was repriced, and the connection's state" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
            "409": { description: "No merchant is live yet" },
          },
        },
      },
      "/households/{householdId}/integrations/school/sync": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        post: {
          summary: "Sync the household's connected school portal now",
          description:
            "Runs the school connector for an administrator and reconciles what it returns onto school_items by provider identity and content hash. A portal can never report work done, and a provider's own cancellation signal is applied only when nobody has already submitted or finished the item. A record naming a child the household has not mapped waits, unmatched. Responds with counts and the connection's health, never a child's work. 409 while no provider is live.",
          parameters: [
            {
              name: "provider",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Which provider, when more than one school portal is connected.",
            },
          ],
          responses: {
            "200": { description: "Counts of what changed and the connection's state" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { description: "No school portal is connected" },
            "409": { description: "The provider is not configured, or more than one is connected and none was named" },
          },
        },
      },
      "/households/{householdId}/home": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "What the home domain needs from this household",
          description:
            "Maintenance, laundry, pet care and service requests that currently need a person. Empty is the expected answer for a household where things are working. `weather` says what the plan was made under (story 17-007): `ready` with the household's area and what it means for drying, or `off`/`unavailable`, when ordinary conditions were assumed. Weather is decided on the server — the `home.weather` entitlement, a configured provider and an Admin-chosen area — so this route never plans with weather the app would refuse.",
          responses: {
            "200": { description: "The home agenda" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/home/assets": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "Assets the household has to keep working",
          responses: { "200": { description: "Assets" }, "403": { $ref: "#/components/responses/Forbidden" } },
        },
        post: {
          summary: "Register an asset",
          requestBody: {
            required: true,
            content: { "application/json": { schema: toJsonSchema(createAssetSchema) } },
          },
          responses: {
            "201": { description: "The new asset" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/home/service-requests": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "Service requests, open and settled",
          responses: { "200": { description: "Requests" }, "403": { $ref: "#/components/responses/Forbidden" } },
        },
        post: {
          summary: "Raise a service request",
          description:
            "nextActionBy records whose move it is, which is what keeps an unresolved request actionable rather than informational.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: toJsonSchema(createServiceRequestSchema) } },
          },
          responses: {
            "201": { description: "The new request" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/members/{memberId}/roles": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "memberId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        patch: {
          summary: "Grant or revoke a role",
          description: "Head is not assignable; transferring ownership is a separate operation.",
          responses: {
            "200": { description: "The applied change" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/invitations/accept": {
        post: {
          summary: "Accept an invitation",
          description:
            "Unknown, revoked, expired and already-used tokens all return the same refusal, so this cannot be used to discover invitations.",
          responses: {
            "200": { description: "The household joined" },
            "401": { $ref: "#/components/responses/Unauthenticated" },
            "422": { $ref: "#/components/responses/BadRequest" },
          },
        },
      },
      "/platform-admin/operations": {
        get: {
          summary: "Platform operations overview",
          description:
            "Aggregate counts only, behind the platform boundary. A caller who is not staff receives 404 rather than 403.",
          responses: {
            "200": { description: "Platform-wide counts" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/platform-admin/support-access": {
        post: {
          summary: "Grant time-boxed access to one household",
          description:
            "Reason-coded and bounded to at most 24 hours. The grant is readable by the household's administrators and audited, so a family can see who looked at their home and why.",
          responses: {
            "201": { description: "The grant and when it expires" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/platform-admin/subscriptions/{householdId}": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "A household's plan, from the platform side",
          description:
            "Staff's own view of the same facts the household's own plan endpoint reads from — the current plan, the catalogue, and (with `to`) a preview. Requires `subscription.manage`; a caller who is not staff receives 404 rather than 403.",
          parameters: [
            {
              name: "to",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Preview moving this household to this plan.",
            },
          ],
          responses: {
            "200": { description: "The current plan, the plans available, and a preview when one was asked for" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        post: {
          summary: "Change a household's plan on staff's behalf",
          description:
            "The household's own change path (`changePlan`), unmodified — the same re-derived assessment, the same single row that changes, no shortcut for staff around what a household would also have to face. Requires a reason code rather than free text, because a note is redacted out of the audit trail before it is written. Requires `subscription.manage`, which `support` does not hold.",
          responses: {
            "200": { description: "The new plan and what the change did — or, for a plan marked requires_payment when a billing provider sells it (story 20-006), `checkout.url` to send the person to; the plan then changes only when the provider's verified webhook confirms the payment" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
            "409": { description: "Already on that plan, the consequences moved since they were shown, or a paid plan that cannot be bought here yet" },
          },
        },
      },
      "/platform-admin/plans/{planKey}/policies": {
        parameters: [{ name: "planKey", in: "path", required: true, schema: { type: "string" } }],
        get: {
          summary: "A plan's fair-use and burst policies",
          description:
            "Every feature of the plan with its allowance, burst policy (at most N uses per fixed W-second window) and fair-use level (past N uses in the period the household is served more simply, never refused), plus the recorded changes to them (story 20-007). Requires `subscription.manage`; a caller who is not staff receives 404 rather than 403.",
          responses: {
            "200": { description: "The plan's features with their policies, and the policy change history" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        patch: {
          summary: "Set one feature's fair-use and burst policy",
          description:
            "Sets `burstLimit` with `burstWindowSeconds` (both or neither; the window is 10 seconds to a day) and `fairUseLimit` (never above the feature's own allowance) for one feature of the plan. Null clears a policy. Requires a reason code; the change is kept in the append-only `plan_policy_events` with who made it and the before and after. Touches no household's records and no usage counter. Setting what is already set records nothing. Requires `subscription.manage`.",
          responses: {
            "200": { description: "The policy before and after, and whether anything changed" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
            "422": { description: "The policy is not coherent for this feature, said in words" },
          },
        },
      },
      "/platform-admin/ai-operations": {
        get: {
          summary: "AI operations overview",
          description:
            "Platform-wide run counts and the recent failures behind them — the tool names and outcomes `agent_tool_calls` was built to hold, never a raw prompt. Requires `ai_operations.read` (`operator`/`owner`; `support` does not hold it, since this is fleet-wide rather than one reason-coded household).",
          responses: {
            "200": { description: "Run counts and recent failed runs, each with its tool calls" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/platform-admin/homesend-metrics": {
        get: {
          summary: "HomeSend outcome metrics",
          description:
            "Platform-wide HomeSend metrics (Wave 3 §19): intake by source, parsing success, entity resolution and ambiguity, duplicate detection, proposal acceptance, correction, downstream write success, safe rejection, queue depth and time to outcome — each a count and the count it is out of. Read only from closed-word columns, never household content. Requires `ai_operations.read`. `days` sets the window (1–365, default 30). `email` is forwarding observed end to end over the last 24 hours (Wave 5 §14):\n\n- delivery events by kind (delivered, signature failures, unrouted, duplicates, fetch, attachment and classification failures, rate-limited, retries queued, processed);\n- processing latency;\n- the forwarded review queue;\n- routed and rejected rates;\n- the alert conditions firing now (repeated provider failure, large backlog, duplicate spike, attachment failures).",
          parameters: [{ name: "days", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 365 } }],
          responses: {
            "200": { description: "The metrics for the window, and email forwarding monitoring" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/platform-admin/voice-metrics": {
        get: {
          summary: "HomeTalk by channel: web, mobile, Gemini Voice, Alexa",
          description:
            "Platform-wide HomeTalk metrics per channel (voice integration phase 6). Each channel reports requests; success, failure, clarification, approval and not-authorized rates; action success and failure; duplicate (replayed) deliveries; p50/p95 latency; provider errors; Gemini Live sessions opened; unlinked speakers; and rate limits. Every rate is a count and the count it is out of. Read only from `hometalk_channel_events` (closed words and numbers, never an utterance, transcript or audio). Requires `ai_operations.read`. `hours` sets the window (1–2160, default 24).",
          parameters: [{ name: "hours", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 2160 } }],
          responses: {
            "200": { description: "The window and each channel's metrics" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/platform-admin/ai-quality": {
        get: {
          summary: "HomeTalk and HomeBrain quality in production",
          description:
            "Platform-wide AI quality (Wave 5 §23). It reports:\n\n- household outcomes handled (HomeTalk writes executed and HomeSend items routed);\n- model understanding share and provider failures by code;\n- clarification rate;\n- HomeTalk update success;\n- HomeBrain grounded answers and validation refusals;\n- corrections by surface and error type;\n- approvals refused as expired, changed or stale;\n- unsafe actions (consequential actions carried out with no approval step), which must be zero.\n\nEach figure is a count and the count it is out of. It is read only from closed words (reply metadata codes, action type and status, correction type), never household content. Requires `ai_operations.read`. `days` sets the window (1–365, default 30).",
          parameters: [{ name: "days", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 365 } }],
          responses: {
            "200": { description: "The metrics for the window" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/platform-admin/ai-operations/runs/{runId}": {
        parameters: [{ name: "runId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        get: {
          summary: "One agent run, in full",
          description: "The drill-down from the overview: one run and every tool call it made, in order.",
          responses: {
            "200": { description: "The run and its tool calls" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/platform-admin/privacy-requests": {
        get: {
          summary: "Export/deletion requests, platform-wide",
          description:
            "Every privacy request across every household, newest first — filterable by `status`, `kind` and `householdId`. `privacy_requests` has never had a platform-admin policy of its own; this reads it through the service-role client the way every other platform-admin capability does. Requires `privacy_requests.manage` (`operator`/`owner`; `support` does not hold it).",
          parameters: [
            {
              name: "status",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["pending", "ready", "completed", "cancelled", "refused"] },
            },
            { name: "kind", in: "query", required: false, schema: { type: "string", enum: ["export", "deletion"] } },
            { name: "householdId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Matching requests" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/platform-admin/privacy-requests/{requestId}": {
        parameters: [{ name: "requestId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        patch: {
          summary: "Refuse a pending or ready request",
          description:
            "The schema has supported `status: 'refused'`/`refusal_reason` since story 15-007; nothing ever wrote either until this route. Refusing a deletion stops its grace window from maturing — the household still owns asking again. Requires `privacy_requests.manage` and a reason someone reviewing this later could understand.",
          responses: {
            "200": { description: "Refused" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { description: "Staff boundary not met, or no pending/ready request with that id" },
          },
        },
      },
      "/openapi": {
        get: {
          summary: "This document",
          security: [],
          responses: { "200": { description: "The OpenAPI description of /api/v1" } },
        },
      },
      "/households/{householdId}/school": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "School work that needs the household",
          description:
            "Which children the caller may see is decided underneath by guardianship, so a guardian and a non-guardian adult get different agendas from the same request.",
          responses: {
            "200": { description: "The school agenda" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
        post: {
          summary: "Record an item of school work",
          responses: {
            "201": { description: "The new item" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/shopping": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "What the household is running out of",
          responses: {
            "200": { description: "The shopping agenda" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
        post: {
          summary: "Price a basket and apply the household's purchase policy",
          description:
            "Buys nothing. It returns the cost, the quantities and the policy decision, so a person sees what an order would do before it does it.",
          responses: {
            "200": { description: "The priced basket and the policy decision" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/meals": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "What is planned to eat, and what is about to go wrong with it",
          responses: {
            "200": { description: "The meal agenda" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
        post: {
          summary: "Plan a meal",
          description:
            "A recipe's ingredients are copied onto the meal, so editing the recipe later cannot rewrite a dinner the household already committed to.",
          responses: {
            "201": { description: "The planned meal" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/bills": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "What the household owes and what needs paying",
          description: "A child reading this receives an empty agenda rather than a filtered one.",
          responses: {
            "200": { description: "The finance agenda" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
        post: {
          summary: "Prepare a payment for a bill",
          description:
            "Creates an intent awaiting approval. It reaches no payment provider: approving the intent, and the step-up that requires, are separate deliberate acts.",
          responses: {
            "201": { description: "The payment intent, unapproved" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/webhooks": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "The household's outbound webhook subscriptions",
          description:
            "Every subscription's URL, event types and status — never the signing secret. `household_webhooks` has no SELECT policy at all, the same exception `household_ai_credentials` already makes; this reads `list_webhook_subscriptions()` instead, which is built not to return it. Open to any member.",
          responses: {
            "200": { description: "The household's webhook subscriptions" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
        post: {
          summary: "Subscribe a URL to a set of outbound events",
          description:
            "Admin-only. The URL must be https and not resolve to a private address (`webhooks/url-policy.ts`, re-checked again at delivery time). The response is the one and only time the signing secret is ever returned — copy it now.",
          responses: {
            "201": { description: "The new subscription, including its signing secret" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/webhooks/{webhookId}": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "webhookId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        patch: {
          summary: "Rotate a webhook's secret, or turn it on/off",
          description:
            "Admin-only. `action: \"rotate\"` returns a new secret the same way creation does — the old one stops working immediately. `action: \"disable\"` is this entity's CLAUDE.md rule-12 \"remove\": never a hard delete, since a queued delivery still references the row.",
          responses: {
            "200": { description: "The subscription's new state; `secret` only present on rotate" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/households/{householdId}/health/profile": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "A member's health-domain settings",
          description:
            "`memberId` query parameter names whose settings to read — the caller's own by default. RLS (`wh.may_see_health`), not this route, decides whether the caller may see it: the subject, everyone once the row is `household_operational`, a guardian for their child, or a member explicitly granted `selected_family` access.",
          parameters: [
            { name: "memberId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "The named member's health settings, or null if never set" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
        patch: {
          summary: "Create or update a member's health-domain settings",
          description:
            "Only the subject themselves, or a guardian for the child they guard, may write this row — never a household-admin bypass, per the product's own privacy model. Sets the default privacy scope new health entries get, and whether AI may help manage them.",
          responses: {
            "200": { description: "The saved health settings" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/health/privacy": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "Who a subject member has shared their health data with",
          parameters: [
            { name: "subjectMemberId", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "The subject's granted health-sharing consents" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
        post: {
          summary: "Grant another member SELECTED_FAMILY visibility into a subject's health data",
          description:
            "Only the subject themselves, or a guardian granting on behalf of the child they guard, may do this. Household membership never by itself grants access to another adult's private health information.",
          responses: {
            "201": { description: "The new consent grant" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/health/privacy/{consentId}": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "consentId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        delete: {
          summary: "Revoke a health-sharing grant",
          description: "This entity's CLAUDE.md rule-12 \"remove\" — sharing granted can always be taken back.",
          responses: {
            "200": { description: "Revoked" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/health/appointments": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "A household's health appointments",
          description:
            "Optionally filtered by `memberId` and `status` (repeatable). RLS (`wh.may_see_health`) decides which appointments the caller sees, exactly as it does for a health profile.",
          parameters: [
            { name: "memberId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
            { name: "status", in: "query", required: false, schema: { type: "array", items: { type: "string" } } },
          ],
          responses: {
            "200": { description: "The visible appointments" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
        post: {
          summary: "Book an appointment",
          description:
            "Progressive entry (who → what → when → where → notes → reminder). Only for the caller themselves, or a child they guard — never another adult, even one who has shared selected_family visibility. Returns any detected schedule conflict and a likely-duplicate warning alongside the new appointment, neither of which blocks the booking.",
          responses: {
            "201": { description: "The new appointment, plus any conflicts and a likely-duplicate warning" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/health/appointments/{appointmentId}": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "appointmentId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "One appointment",
          responses: {
            "200": { description: "The appointment" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        patch: {
          summary: "Update, confirm/complete/cancel, or reschedule an appointment",
          description:
            "The body's `action` field discriminates which of the three this is: `update` changes the appointment's own details (never its time or status), `set_status` moves it through proposed → confirmed/cancelled or confirmed → completed/cancelled, and `reschedule` creates a new appointment at a new time and marks this one `rescheduled` rather than mutating its time in place.",
          responses: {
            "200": { description: "The updated appointment (or, for a reschedule, the new one plus any new conflicts)" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/households/{householdId}/health/issues": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "A household's health issues",
          description: "Optionally filtered by `memberId` and `status` (repeatable). RLS (`wh.may_see_health`) decides which issues the caller sees.",
          parameters: [
            { name: "memberId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
            { name: "status", in: "query", required: false, schema: { type: "array", items: { type: "string" } } },
          ],
          responses: {
            "200": { description: "The visible issues" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
        post: {
          summary: "Record a health observation",
          description:
            "Only for the caller themselves, or a child they guard. Never a diagnosis: the response's `medicalAttention` field is a fixed, deterministic keyword check that can only ever recommend seeking medical attention, never name a condition.",
          responses: {
            "201": { description: "The new issue, plus a medical-attention recommendation if the text matched a concerning pattern" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/health/issues/{issueId}": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "issueId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "One health issue",
          responses: {
            "200": { description: "The issue" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        patch: {
          summary: "Update an issue's content, or move it through its lifecycle",
          description:
            "The body's `action` field discriminates: `update` changes label/description/notes, `set_status` moves the issue through mentioned/active/monitoring/resolved/closed — every status can reach every other one, so resolving is never one-way.",
          responses: {
            "200": { description: "The updated issue" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/households/{householdId}/health/checkups": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "A household's checkups & preventive care",
          description: "Optionally filtered by `memberId` and `status` (repeatable). RLS (`wh.may_see_health`) decides which checkups the caller sees.",
          parameters: [
            { name: "memberId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
            { name: "status", in: "query", required: false, schema: { type: "array", items: { type: "string" } } },
          ],
          responses: {
            "200": { description: "The visible checkups" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
        post: {
          summary: "Add a checkup",
          description:
            "Only for the caller themselves, or a child they guard. A household-defined recurring commitment — `source` records where it came from, and WonderHome never invents a schedule the household did not configure or import.",
          responses: {
            "201": { description: "The new checkup" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/health/checkups/{checkupId}": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "checkupId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "One checkup",
          responses: {
            "200": { description: "The checkup" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        patch: {
          summary: "Update, reschedule, complete, remove or bring back a checkup",
          description:
            "The body's `action` field discriminates: `update` changes label/type/cadence/notes, `reschedule` moves the next due date, `complete` marks it done as of a date (defaulting to today) and, when a cadence is configured, computes the next due date, `dismiss` removes it and `reactivate` brings it back — never a hard delete.",
          responses: {
            "200": { description: "The updated checkup" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/households/{householdId}/health/vitals": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "A household's vitals",
          description: "Optionally filtered by `memberId`, `vitalType` (repeatable), `status` (repeatable) and `limit`. RLS (`wh.may_see_health`) decides which readings the caller sees.",
          parameters: [
            { name: "memberId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
            { name: "vitalType", in: "query", required: false, schema: { type: "array", items: { type: "string" } } },
            { name: "status", in: "query", required: false, schema: { type: "array", items: { type: "string" } } },
            { name: "limit", in: "query", required: false, schema: { type: "integer" } },
          ],
          responses: {
            "200": { description: "The visible readings" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
        post: {
          summary: "Record a structured reading",
          description: "Only for the caller themselves, or a child they guard. Always what the household actually recorded — value, unit and, for blood pressure, a secondary (diastolic) value.",
          responses: {
            "201": { description: "The new reading" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/health/vitals/{vitalId}": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "vitalId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "One vital reading",
          responses: {
            "200": { description: "The reading" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        patch: {
          summary: "Correct, archive or bring back a reading",
          description: "The body's `action` field discriminates: `update` corrects value/unit/notes, `archive` removes it and `reactivate` brings it back — never a hard delete.",
          responses: {
            "200": { description: "The updated reading" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/households/{householdId}/health/measurement-routines": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "A household's measurement routines",
          description: "Optionally filtered by `memberId` and `status` (repeatable). RLS (`wh.may_see_health`) decides which routines the caller sees.",
          parameters: [
            { name: "memberId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
            { name: "status", in: "query", required: false, schema: { type: "array", items: { type: "string" } } },
          ],
          responses: {
            "200": { description: "The visible routines" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
        post: {
          summary: "Configure a recurring measurement",
          description: "Only for the caller themselves, or a child they guard. A household-defined recurring commitment — WonderHome never invents a cadence the household did not configure.",
          responses: {
            "201": { description: "The new routine" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/health/measurement-routines/{routineId}": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "routineId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "One measurement routine",
          responses: {
            "200": { description: "The routine" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        patch: {
          summary: "Update, complete, remove or bring back a routine",
          description:
            "The body's `action` field discriminates: `update` changes cadence/reminder policy/notes/next due date, `complete` records the real reading it represents and advances the schedule by the routine's own cadence, `dismiss` removes it and `reactivate` brings it back — never a hard delete.",
          responses: {
            "200": { description: "The updated routine, or (for `complete`) the routine and the new reading" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/households/{householdId}/health/records": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "A household's health records",
          description: "Optionally filtered by `memberId` and `status` (repeatable). RLS (`wh.may_see_health`) decides which records the caller sees.",
          parameters: [
            { name: "memberId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
            { name: "status", in: "query", required: false, schema: { type: "array", items: { type: "string" } } },
          ],
          responses: {
            "200": { description: "The visible records" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
        post: {
          summary: "File a health record",
          description:
            "Only for the caller themselves, or a child they guard. Never written directly from HomeSend's extraction — a person's confirmation is what actually writes it.",
          responses: {
            "201": { description: "The new record" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/health/records/{recordId}": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "recordId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "One health record",
          responses: {
            "200": { description: "The record" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        patch: {
          summary: "Update, remove or bring back a health record",
          description:
            "The body's `action` field discriminates: `update` changes label/type/document date/notes/privacy scope, `archive` removes it and `reactivate` brings it back — never a hard delete.",
          responses: {
            "200": { description: "The updated record" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/households/{householdId}/health/fitness/goals": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "A household's fitness goals",
          description: "Optionally filtered by `memberId` and `status` (repeatable). RLS (`wh.may_see_health`) decides which goals the caller sees.",
          parameters: [
            { name: "memberId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
            { name: "status", in: "query", required: false, schema: { type: "array", items: { type: "string" } } },
          ],
          responses: {
            "200": { description: "The visible goals" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
        post: {
          summary: "Set a consistency-oriented fitness goal",
          description:
            "Only for the caller themselves, or a child they guard. An activity, how many times, and how often — never scored, never a leaderboard entry. `providerId` defaults to `manual`; a provider with no live connection (Apple HealthKit, Android Health Connect, a wearable) is refused.",
          responses: {
            "201": { description: "The new goal" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/health/fitness/goals/{goalId}": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "goalId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "One fitness goal",
          responses: {
            "200": { description: "The goal" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        patch: {
          summary: "Update, dismiss or bring back a fitness goal",
          description: "The body's `action` field discriminates: `update` changes target/frequency/preferred time/notes, `dismiss` removes it and `reactivate` brings it back — never a hard delete.",
          responses: {
            "200": { description: "The updated goal" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/households/{householdId}/health/fitness/sessions": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "A household's logged fitness sessions",
          description: "Optionally filtered by `memberId`, `goalId`, `status` (repeatable) and `limit`. RLS (`wh.may_see_health`) decides which sessions the caller sees.",
          parameters: [
            { name: "memberId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
            { name: "goalId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
            { name: "status", in: "query", required: false, schema: { type: "array", items: { type: "string" } } },
            { name: "limit", in: "query", required: false, schema: { type: "integer" } },
          ],
          responses: {
            "200": { description: "The visible sessions" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
        post: {
          summary: "Log a single activity",
          description:
            "Only for the caller themselves, or a child they guard. Always what actually happened — activity, duration and, optionally, distance — and may optionally name the goal it counts toward. `providerId` defaults to `manual`; a provider with no live connection is refused.",
          responses: {
            "201": { description: "The new session" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/health/fitness/sessions/{sessionId}": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "sessionId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "One fitness session",
          responses: {
            "200": { description: "The session" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        patch: {
          summary: "Correct, archive or bring back a session",
          description: "The body's `action` field discriminates: `update` corrects duration/distance/notes, `archive` removes it and `reactivate` brings it back — never a hard delete.",
          responses: {
            "200": { description: "The updated session" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/households/{householdId}/family": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "What is coming, what needs answering and what clashes",
          responses: {
            "200": { description: "The family agenda, with any conflicts and their proposals" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
        post: {
          summary: "Put something in the family's calendar",
          description:
            "Protected time can be created here and is never moved here. A clash with a confirmed commitment produces a proposal for a person to decide.",
          responses: {
            "201": { description: "The new event" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/conversation": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "The caller's open conversation with WonderHome",
          responses: {
            "200": { description: "Recent messages, with any action each one proposed" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
        post: {
          summary: "Say something, or decide on a proposal",
          description:
            "Text and voice share this one engine; the channel is metadata. A reply may carry an action preview. Consent is a separate call naming the action, or a yes that resolves against the last proposal inside its time limit. Nothing here executes a domain effect. `editMessageId` reworks the household's own last message in place of sending a new one, replacing it and its reply — refused once that reply has already led to an approved or executed action.",
          responses: {
            "200": { description: "What WonderHome says back, with an action preview when it is prepared to act" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/households/{householdId}/agents/run": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        post: {
          summary: "Run the household's specialists for real",
          description:
            "The literal trigger behind HomeTalk's \"check on things\": gathers the household's current assessed state across every domain, plans against it (14-007), and carries out whatever each proposed step is actually authorized to do — the same tool gate every other write goes through, re-checked per step. Anything left needing a person is recorded as a real notification rather than claimed as done.",
          responses: {
            "200": { description: "What ran: how many steps were handled, how many are waiting for approval, how many could not proceed" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/households/{householdId}/voice": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "How this household speaks and listens",
          description:
            "The household's voice settings, whether a speech key is configured (never the key), and whether the server should be doing the speaking at all. A client reads this to know which path to take; it is not authorization, which is re-checked on every call.",
          responses: {
            "200": { description: "Voice settings, credential status and what is available" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
        post: {
          summary: "Say a reply aloud, or hear what was said",
          description:
            "With `speak`, returns audio for that text in the household's chosen voice. With `audio` and `mimeType`, returns what was heard. The provider key is read server-side and never leaves it. Entitlement is checked here; usage is metered once by the conversation turn these legs belong to, not again per leg.",
          responses: {
            "200": { description: "Audio to play, or the transcript of what was said" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/voice/gemini/session": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "Whether Gemini voice may run for this household (voice phase 3)",
          description:
            "Reads the rollout flag, the conversation.voice entitlement, whose AI key would answer (it must be Google's) and the household's data-use agreement (it must let content go to Google). Returns { available: true } or { available: false, code, reason } in the household's own words. Not authorization: re-checked on every session and tool call.",
          responses: {
            "200": { description: "Availability, and the reason when it is not" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
        post: {
          summary: "Open a Gemini Live session: a short-lived, single-use token (voice phase 3)",
          description:
            "Mints a Gemini Live API ephemeral token for the signed-in member: one use, a new session within 60 seconds, 15 minutes long, and locked to WonderHome's instructions and allowlisted HomeTalk tools, so the page holding it can add nothing. The long-lived key never leaves the server. Returns token, model, expiry and a sessionId the page sends with each tool call. Refused when Gemini voice is not available; rate-limited per member (voice.session).",
          responses: {
            "200": { description: "token, model, expiresAt, newSessionBy, sessionId" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "422": { description: "Google did not issue a token just now" },
            "429": { description: "Too many sessions opened in a short time" },
          },
        },
      },
      "/households/{householdId}/voice/gemini/tool": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        post: {
          summary: "Answer one Gemini voice tool call through HomeTalk (voice phase 3)",
          description:
            "Body { sessionId, callId, name, args }. An allowlisted tool becomes the words a member could have said, and runs as a HomeTalk gateway turn on channel gemini_voice under the member's own session: the same understanding, permission, entitlement and autonomy gates and executors as every channel, narrowed to the voice scopes and content classes the household agreed may reach Google. An unknown tool, a missing argument or a household that has since turned Gemini voice off is refused. Returns { success, status: answered|completed|needs_approval|needs_clarification|denied|failed, userMessage, actionId? } — success is the executor's, never the model's. A redelivered call (same sessionId and callId) replays its first answer.",
          responses: {
            "200": { description: "HomeTalk's decision, and the words for Gemini to say" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/households/{householdId}/plan": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          summary: "The household's plan, and what changing it would do",
          description:
            "Any member may read the plan and what is available. With `to`, returns exactly what moving to that plan would do — computed here from plan data and real usage, so the sentences somebody reads are the same facts the change is made against.",
          parameters: [
            {
              name: "to",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Preview moving to this plan.",
            },
          ],
          responses: {
            "200": { description: "The current plan, the plans available, and a preview when one was asked for" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        post: {
          summary: "Change the household's plan",
          description:
            "An administrator's action. Only ever writes the row saying which plan the household is on: a plan change never touches a household's own records, not to tidy them and not to bring them under a new limit. A change that takes a capability away must carry back what the person was shown, which is re-derived and compared — a browser that skipped the preview cannot skip the consequence, and a change that moved while somebody read it is refused. Audited as subscription.changed.",
          responses: {
            "200": { description: "The new plan and what the change did" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
            "409": { description: "Already on that plan, or the consequences moved since they were shown" },
          },
        },
      },
      "/households/{householdId}/privacy/export": {
        parameters: [
          { name: "householdId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        post: {
          summary: "A copy of the caller's own data",
          description:
            "Returns the file itself rather than a link to one: a link is a second way to reach the data, outliving the session that proved itself for it. Requires a step-up verification, which is spent before a single row is read. Contains only what this member could already see on screen, narrowed by RLS and again by permission.",
          responses: {
            "200": { description: "The export, as a JSON attachment" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/platform/retention": {
        get: {
          summary: "The same run, as Vercel Cron calls it",
          description: "Vercel Cron calls a path with GET. This is the POST handler behind the same shared secret, so the scheduled run actually runs.",
          responses: {
            "200": { description: "The run completed" },
            "207": { description: "The run completed with at least one part that could not" },
            "401": { $ref: "#/components/responses/Unauthenticated" },
          },
        },
        post: {
          summary: "Apply the retention schedule",
          description:
            "Deletes everything past its keeping, across every household, on the schedule the Privacy Centre publishes — a published policy nothing applies is a promise rather than a policy. Authorised by a shared secret rather than a session, because there is no person here; it is deliberately unreachable from a household's own session. Reports counts per table, never what was removed.",
          responses: {
            "200": { description: "Every table swept" },
            "207": { description: "Swept, with at least one table that could not be" },
            "401": { $ref: "#/components/responses/Unauthenticated" },
          },
        },
      },
      "/platform/webhook-delivery": {
        get: {
          summary: "The same run, as Vercel Cron calls it",
          description: "Vercel Cron calls a path with GET. This is the POST handler behind the same shared secret, so the scheduled run actually runs.",
          responses: {
            "200": { description: "The run completed" },
            "207": { description: "The run completed with at least one part that could not" },
            "401": { $ref: "#/components/responses/Unauthenticated" },
          },
        },
        post: {
          summary: "Drain the outbound webhook delivery queue",
          description:
            "Signs and POSTs every due row in `webhook_deliveries` to its subscription's URL, retrying on failure with a fixed backoff before marking a delivery exhausted. Same authorization shape as /platform/retention — a shared secret, not a session, deliberately unreachable from any household's own session, since it crosses every household's subscriptions at once.",
          responses: {
            "200": { description: "Counts by outcome: delivered, retrying, exhausted, skipped" },
            "401": { $ref: "#/components/responses/Unauthenticated" },
          },
        },
      },
      "/whatsapp/webhook": {
        get: {
          summary: "WhatsApp webhook verification (story 17-006)",
          description:
            "Meta's one-time handshake: echoes hub.challenge only when hub.verify_token matches the deployment's WHATSAPP_VERIFY_TOKEN. Anything else — including a deployment with no WhatsApp configured — is the standard 401.",
          responses: {
            "200": { description: "The challenge, as plain text" },
            "401": { $ref: "#/components/responses/Unauthenticated" },
          },
        },
        post: {
          summary: "WhatsApp delivery reports and replies (story 17-006)",
          description:
            "Believed only after X-Hub-Signature-256 verifies over the raw body with WHATSAPP_APP_SECRET. A delivery report moves a notification's WhatsApp copy to delivered, seen or delivery_failed, found by the provider's message id; a reply of STOP switches WhatsApp off for that number and says so. Nothing else a person writes is acted on, and no household record is touched from here. 401 for both a bad signature and an unconfigured deployment.",
          responses: {
            "200": { description: "Acknowledged, with how many reports were recorded and opt-outs honoured" },
            "400": { description: "A verified body that could not be read" },
            "401": { $ref: "#/components/responses/Unauthenticated" },
          },
        },
      },
      "/billing/webhook": {
        post: {
          summary: "Billing provider webhook (story 20-006)",
          description:
            "The configured billing provider's webhook, not a household session: believed only after its signature verifies over the raw body (Stripe: HMAC-SHA256, five-minute tolerance). Each provider event is recorded once by its own id, and only `applyBillingEvent` moves a subscription — never a household's records. 404 when no billing provider is configured. Live only once WONDERHOME_BILLING_PROVIDER, the provider's secret and webhook secret, and a price per sold plan are set.",
          responses: {
            "200": { description: "Acknowledged — applied, a duplicate delivery, or an event this endpoint does not act on" },
            "400": { description: "A verified body that could not be read; nothing changed" },
            "401": { $ref: "#/components/responses/Unauthenticated" },
          },
        },
      },
      "/homesend/email/webhook": {
        post: {
          summary: "Inbound email intake (HomeSend Phase 2)",
          description:
            "Resend's inbound webhook, not a household session: authorised by a Svix-format signature over the raw body, keyed on a deployment-wide secret, the same 'authenticated by a secret, not a session' shape as /platform/retention. Resolves the household from the recipient address server-side — never from the payload — and never processes anything until the signature checks out. 401 for both a missing signature and a deployment with no Resend credentials configured, so neither is distinguishable from outside. Live only once RESEND_API_KEY and RESEND_WEBHOOK_SECRET are set.",
          responses: {
            "200": { description: "Acknowledged — processed, a duplicate delivery, an unrecognised recipient, or an event type this endpoint ignores" },
            "401": { $ref: "#/components/responses/Unauthenticated" },
            "502": { description: "Could not retrieve the email from the provider; retry" },
          },
        },
      },
      "/intake/share": {
        post: {
          summary: "PWA Web Share Target landing point (HomeSend Phase 4)",
          description:
            "Where the OS share sheet lands once WonderHome is installed (manifest.webmanifest's share_target). A real full-page form POST, not a fetch call, so it always ends in a redirect rather than the standard JSON envelope, and it is public on purpose — reachable whether or not the person has ever signed in on this device. Signed in with a household: classifies and saves the shared text/photo immediately, same as a manual upload/paste, then redirects to /home-send. Otherwise: stages the content (homesend_share_handoffs, no household known yet) behind an unguessable token and redirects to /sign-in?next=..., which /home-send resumes once sign-in resolves a household.",
          security: [],
          responses: {
            "303": { description: "Redirects to /home-send (saved), /sign-in (staged for after sign-in), or /home-send with a shareError query param" },
          },
        },
      },
      "/oauth/voice/token": {
        post: {
          summary: "OAuth 2.0 token endpoint for linked voice assistants (voice phase 2)",
          description:
            "Where a voice provider (Alexa account linking) exchanges an authorization code for tokens, and refreshes them. Authenticated by the provider's client secret (HTTP Basic, or client_id/client_secret in the form body), never a household session. Form-encoded, per RFC 6749: grant_type authorization_code (code, redirect_uri, code_verifier when the code carried a PKCE challenge) or refresh_token. A code works once; a code or refresh token presented twice revokes every token of that link. Only SHA-256 hashes of codes and tokens are stored. Errors use RFC 6749's closed words. Inert until ALEXA_OAUTH_CLIENT_ID, ALEXA_OAUTH_CLIENT_SECRET and ALEXA_OAUTH_REDIRECT_URIS are set.",
          security: [],
          responses: {
            "200": { description: "access_token (1 hour), refresh_token, token_type Bearer, and the scopes the member granted" },
            "400": { description: "invalid_request, invalid_grant or unsupported_grant_type" },
            "401": { description: "invalid_client" },
            "429": { description: "temporarily_unavailable — too many token requests for this client" },
          },
        },
      },
      "/voice/alexa": {
        post: {
          summary: "Alexa skill endpoint — HomeTalk over Alexa (voice phase 4)",
          description:
            "Amazon's request to the WonderHome custom skill. Proved to be Alexa's before it is read: SignatureCertChainUrl (https, s3.amazonaws.com, /echo.api/, port 443), a certificate in date that names echo-api.amazon.com and chains to a trusted root, an RSA-SHA256 Signature-256 over the raw body, a timestamp within 150 seconds, and this skill's own application id. The speaker is whoever the WonderHome access token issued through account linking belongs to; the turn runs as that member under their own RLS and scopes, through the same HomeTalk gateway as every channel. Answers in Alexa's response format. Inert until ALEXA_SKILL_ID is set.",
          security: [],
          responses: {
            "200": { description: "An Alexa response: speech, a reprompt when a question or approval is waiting, or the account-linking card" },
            "400": { description: "Not provably from Alexa (certificate, signature, timestamp or skill id)" },
            "401": { description: "Alexa is not configured on this deployment" },
            "413": { description: "Body larger than an Alexa request ever is" },
          },
        },
      },
      "/invitations/{invitationId}": {
        parameters: [
          { name: "invitationId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        delete: {
          summary: "Revoke an invitation",
          responses: { "200": { description: "Revoked" } },
        },
      },
    },
  };
}
