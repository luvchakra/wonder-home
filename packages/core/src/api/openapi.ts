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
          summary: "Create a household and become its Head of Family",
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
          summary: "What this household's plan allows",
          description:
            "The same data the server enforces with. Rendering is not authorization: every guarded path re-asks the entitlement service regardless of this response.",
          responses: {
            "200": { description: "Plan key and enabled features with their limits" },
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
            "Text and voice share this one engine; the channel is metadata. A reply may carry an action preview. Consent is a separate call naming the action, or a yes that resolves against the last proposal inside its time limit. Nothing here executes a domain effect.",
          responses: {
            "200": { description: "What WonderHome says back, with an action preview when it is prepared to act" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
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
