/**
 * The connector-type catalog for the Connections framework.
 *
 * A connection (a household's named instance) is of a connector_type defined
 * here. This registry is the product's — the one place a new connector is added
 * as WonderHome grows; a household never sees it directly, it only picks a type
 * when creating a connection and fills in that type's parameters.
 *
 * Each type declares how it is created (a parameters form, or a link flow such
 * as WhatsApp's "message our number"), which of its parameters are secret (and
 * so stored in connection_secrets, never read back to a browser), and what it
 * can do — its capabilities — so a feature page can offer exactly the connections
 * that fit it (a "Pages to read" feature wants `portal-fetch`, say).
 */

/** What a feature can do with a connection — features filter the picker by these. */
export type ConnectorCapability = "portal-fetch" | "homesend-intake" | "rest-call";

export type ConnectorParamKind = "text" | "url" | "secret";

export type ConnectorParam = {
  key: string;
  label: string;
  kind: ConnectorParamKind;
  required?: boolean;
  placeholder?: string;
  /** Help text shown under the field. */
  hint?: string;
};

/** How a connection of this type comes into being. */
export type ConnectorCreation =
  | { mode: "params"; params: ConnectorParam[] }
  // A link flow owns its own connect UI (e.g. WhatsApp's "message this number").
  | { mode: "link" };

export type ConnectorType = {
  id: string;
  label: string;
  /** One line a household reads when choosing a type. */
  description: string;
  creation: ConnectorCreation;
  capabilities: ConnectorCapability[];
};

/** Sign into a website with a URL + username + password; a feature then reads pages from it. */
const browserAutomation: ConnectorType = {
  id: "browser-automation",
  label: "Browser automation",
  description: "Sign into a website with a web address, username and password so WonderHome can read pages from it.",
  creation: {
    mode: "params",
    params: [
      { key: "url", label: "Web address", kind: "url", required: true, placeholder: "https://…", hint: "The sign-in page of the site." },
      { key: "username", label: "Username", kind: "text", required: true },
      { key: "password", label: "Password", kind: "secret", required: true, hint: "Stored for the server only; never shown again or sent anywhere else." },
    ],
  },
  capabilities: ["portal-fetch"],
};

/** WhatsApp as a way into HomeSend — connected by messaging the business number, not a form. */
const whatsapp: ConnectorType = {
  id: "whatsapp",
  label: "WhatsApp",
  description: "Link your WhatsApp number so messages you send arrive in HomeSend to confirm.",
  creation: { mode: "link" },
  capabilities: ["homesend-intake"],
};

/**
 * A REST/HTTP API: a base address and an optional auth header. A feature (or the
 * built-in request tester) can then call it — the request is made server-side,
 * same-site as the base address, with the stored auth header attached.
 */
const rest: ConnectorType = {
  id: "rest",
  label: "REST API",
  description: "Call a web API at a base address, with an optional auth header WonderHome adds for you.",
  creation: {
    mode: "params",
    params: [
      { key: "baseUrl", label: "Base address", kind: "url", required: true, placeholder: "https://api.example.com", hint: "Requests are sent to this address and paths under it." },
      { key: "authHeader", label: "Auth header name", kind: "text", required: false, placeholder: "Authorization", hint: "The header the API wants its key in, if any." },
      { key: "authValue", label: "Auth header value", kind: "secret", required: false, hint: "e.g. “Bearer …” — stored for the server only; never shown again or sent anywhere else." },
    ],
  },
  capabilities: ["rest-call"],
};

export const CONNECTOR_TYPES: readonly ConnectorType[] = [browserAutomation, rest, whatsapp];

export function connectorCatalog(): readonly ConnectorType[] {
  return CONNECTOR_TYPES;
}

export function getConnectorType(id: string): ConnectorType | null {
  return CONNECTOR_TYPES.find((c) => c.id === id) ?? null;
}

/** The connector types a feature can use, given the capability it needs. */
export function connectorsWithCapability(capability: ConnectorCapability): ConnectorType[] {
  return CONNECTOR_TYPES.filter((c) => c.capabilities.includes(capability));
}

/** The secret parameter keys of a type (those stored in connection_secrets). */
export function secretParamKeys(type: ConnectorType): string[] {
  return type.creation.mode === "params" ? type.creation.params.filter((p) => p.kind === "secret").map((p) => p.key) : [];
}

/** The non-secret parameter keys of a type (those stored on the connection row). */
export function publicParamKeys(type: ConnectorType): string[] {
  return type.creation.mode === "params" ? type.creation.params.filter((p) => p.kind !== "secret").map((p) => p.key) : [];
}
