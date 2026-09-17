import { z } from "zod";

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
