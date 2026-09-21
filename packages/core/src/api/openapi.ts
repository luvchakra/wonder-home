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
            "Maintenance, laundry, pet care and service requests that currently need a person. Empty is the expected answer for a household where things are working.",
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
            "200": { description: "The new plan and what the change did" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
            "409": { description: "Already on that plan, or the consequences moved since they were shown" },
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
