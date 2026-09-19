import { describe, expect, it } from "vitest";
import { z } from "zod";

import { API_ERROR_CODES } from "./errors";
import { buildOpenApiDocument, toJsonSchema } from "./openapi";

describe("Zod to JSON Schema", () => {
  it("marks a required field required and an optional one not", () => {
    const schema = toJsonSchema(z.object({ name: z.string(), nickname: z.string().optional() }));
    expect(schema.required).toEqual(["name"]);
    expect((schema.properties as Record<string, unknown>).nickname).toEqual({ type: "string" });
  });

  it("treats a defaulted field as optional, because the caller may omit it", () => {
    const schema = toJsonSchema(z.object({ timezone: z.string().default("Asia/Kolkata") }));
    expect(schema.required).toBeUndefined();
  });

  it("describes enums by their values", () => {
    const schema = toJsonSchema(z.object({ role: z.enum(["adult", "child"]) }));
    expect((schema.properties as Record<string, { enum?: string[] }>).role?.enum).toEqual([
      "adult",
      "child",
    ]);
  });

  it("describes arrays by their element type", () => {
    const schema = toJsonSchema(z.object({ ids: z.array(z.string()) }));
    expect((schema.properties as Record<string, unknown>).ids).toEqual({
      type: "array",
      items: { type: "string" },
    });
  });
});

/** Reads the error-code enum out of a named error response. */
function errorCodesIn(document: Record<string, unknown>, response: string): string[] {
  const components = document.components as {
    responses: Record<string, { content: Record<string, { schema: Record<string, any> }> }>;
  };
  const schema = components.responses[response]?.content["application/json"]?.schema;
  return schema?.properties?.error?.properties?.code?.enum ?? [];
}

describe("the OpenAPI document", () => {
  const document = buildOpenApiDocument();
  const paths = document.paths as Record<string, Record<string, unknown>>;

  it("describes every endpoint the app serves", () => {
    // A fixed list can only go stale, so e2e/domains.spec.ts derives the same
    // check from the route files on disk and fails on anything missing here.
    // This list stays as the readable statement of what the API is.
    for (const path of [
      "/health",
      "/health/ready",
      "/openapi",
      "/me",
      "/me/view",
      "/households",
      "/households/{householdId}/bills",
      "/households/{householdId}/entitlements",
      "/households/{householdId}/family",
      "/households/{householdId}/home",
      "/households/{householdId}/home/assets",
      "/households/{householdId}/home/service-requests",
      "/households/{householdId}/integrations",
      "/households/{householdId}/integrations/calendar/sync",
      "/households/{householdId}/integrations/email/sync",
      "/households/{householdId}/integrations/school/sync",
      "/households/{householdId}/meals",
      "/households/{householdId}/school",
      "/households/{householdId}/shopping",
      "/households/{householdId}/invitations",
      "/households/{householdId}/children",
      "/households/{householdId}/conversation",
      "/households/{householdId}/members/{memberId}/roles",
      "/invitations/accept",
      "/invitations/{invitationId}",
      "/platform-admin/operations",
      "/platform-admin/support-access",
      "/platform-admin/subscriptions/{householdId}",
      "/platform-admin/ai-operations",
      "/platform-admin/ai-operations/runs/{runId}",
    ]) {
      expect(paths, `${path} is missing from the OpenAPI document`).toHaveProperty([path]);
    }
  });

  it("lists every error code the API can return", () => {
    const codes = errorCodesIn(document, "Unauthenticated");
    expect(codes).toEqual(Object.keys(API_ERROR_CODES));
  });

  it("requires a session by default and exempts only the health probe", () => {
    expect(document.security).toEqual([{ sessionCookie: [] }]);
    expect((paths["/health"]?.get as { security: unknown[] }).security).toEqual([]);
  });

  it("documents the idempotency header on the endpoint that honours it", () => {
    const invite = paths["/households/{householdId}/invitations"]?.post as {
      parameters: { $ref: string }[];
    };
    expect(invite.parameters).toContainEqual({ $ref: "#/components/parameters/idempotencyKey" });
  });

  it("derives request shapes from the schemas the endpoints validate with", () => {
    const create = paths["/households"]?.post as {
      requestBody: { content: Record<string, { schema: { required?: string[] } }> };
    };
    // Same schema the route parses, so the document cannot drift from behaviour.
    expect(create.requestBody.content["application/json"]?.schema.required).toEqual([
      "householdName",
      "displayName",
    ]);
  });
});
