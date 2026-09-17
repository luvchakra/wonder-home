import type { HomeAssessment } from "./assessment";
import { coverageOn, type HomeAsset } from "./assets";

/**
 * Home exceptions (story 13-004).
 *
 * The same discipline module 07 applies to a househelper's problems, applied to
 * the house itself: the test is whether a person is needed, not whether
 * something went wrong. A water filter cartridge WonderHome can reorder is not
 * an interruption. A geyser that stopped working in February is.
 *
 * Coverage is consulted here rather than left to the family to remember,
 * because "this is still under warranty, do not call a local technician" is the
 * single most useful thing the system can say at the moment something breaks —
 * and the moment it breaks is exactly when nobody goes looking for the paperwork.
 */

export const HOME_EXCEPTION_KINDS = [
  "appliance_failed",
  "supply_out",
  "utility_outage",
  "damage",
  "pest",
] as const;
export type HomeExceptionKind = (typeof HOME_EXCEPTION_KINDS)[number];

export type HomeException = {
  kind: HomeExceptionKind;
  /** The asset this concerns, when it concerns one. */
  asset: HomeAsset | null;
  detail: string;
  detectedAt: Date;
  /** Whether the household can live normally until it is fixed. */
  blocksDailyLife: boolean;
};

export type HomeExceptionHandling =
  | { kind: "handle_silently"; because: string; action: { action: string; target?: string } }
  | { kind: "tell_household"; assessment: HomeAssessment };

export type HandlingContext = {
  now: Date;
  /** Whether the missing supply is something WonderHome can order itself. */
  canReorder: boolean;
  /** Whether a request is already open for this asset. */
  requestOpen: boolean;
};

export function handleHomeException(
  exception: HomeException,
  context: HandlingContext,
): HomeExceptionHandling {
  const subjectKey = exception.asset ? `asset.${exception.asset.id}` : `home.${exception.kind}`;

  if (exception.kind === "supply_out" && context.canReorder) {
    return {
      kind: "handle_silently",
      because: "WonderHome can reorder this without anyone.",
      action: { action: "reorder", target: subjectKey },
    };
  }

  if (context.requestOpen) {
    return {
      kind: "handle_silently",
      because: "A service request is already open for this.",
      action: { action: "await_provider", target: subjectKey },
    };
  }

  // A brief power cut is weather, not an incident. It becomes one when it goes
  // on long enough to actually cost the household something.
  if (exception.kind === "utility_outage" && !exception.blocksDailyLife) {
    return {
      kind: "handle_silently",
      because: "Short outages resolve themselves.",
      action: { action: "watch", target: subjectKey },
    };
  }

  const cover = exception.asset ? coverageOn(exception.asset, context.now) : null;
  const coverNote =
    cover && cover.kind !== "none"
      ? ` It is under ${cover.kind === "warranty" ? "warranty" : "an AMC"} until ${cover.expiresOn}, so the repair should cost nothing.`
      : "";

  return {
    kind: "tell_household",
    assessment: {
      subjectKey,
      title: exception.asset?.name ?? describeSubject(exception.kind),
      status: "blocked",
      riskLevel: exception.blocksDailyLife ? "high" : "medium",
      notable: true,
      reason: `${describe(exception)}${coverNote}`,
      action:
        cover && cover.kind !== "none"
          ? { action: "claim_cover", target: subjectKey }
          : { action: "book_service", target: subjectKey },
      dueOn: null,
    },
  };
}

/** A two-word name for something that is not an asset. */
function describeSubject(kind: HomeExceptionKind): string {
  switch (kind) {
    case "utility_outage":
      return "Utility outage";
    case "damage":
      return "Damage";
    case "pest":
      return "Pests";
    case "supply_out":
      return "Supplies";
    case "appliance_failed":
      return "The house";
  }
}

function describe(exception: HomeException): string {
  const subject = exception.asset?.name ?? "The house";

  switch (exception.kind) {
    case "appliance_failed":
      return `${subject} has stopped working: ${exception.detail}`;
    case "supply_out":
      return `${subject} is out of something it needs: ${exception.detail}`;
    case "utility_outage":
      return `An outage is affecting the household: ${exception.detail}`;
    case "damage":
      return `Something is damaged: ${exception.detail}`;
    case "pest":
      return `A pest problem needs dealing with: ${exception.detail}`;
  }
}
