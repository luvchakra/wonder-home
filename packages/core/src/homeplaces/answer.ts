import { distanceLabel, mapsLink } from "../places/provider";
import type { PlaceRequest } from "./request";
import type { PlacesOutcome } from "./service";

/**
 * What HomeTalk says for a place question, written from the outcome alone,
 * never by a model: every name, distance and rating in it came back from the
 * place search, so there is nothing to invent and nothing for the answer
 * validator to catch. Places themselves are shown as cards under the reply,
 * each with its map link; the words only introduce them.
 */
/**
 * Said back when no kind of place was named: what was looked for, and how
 * to narrow it. HomeTalk keeps it as the open question, so a short "dinner"
 * or "a park" next is read as narrowing this request (the owner, 2026-10-21).
 */
export const NARROW_LINE = "You didn't say what kind of place, so I looked for places to go out. Say dinner, a park or a mall to narrow it.";

/** The question a place reply leaves open for the next turn, if any: the narrowing line, or "whose school?". */
export function placesOpenQuestion(request: PlaceRequest, outcome: PlacesOutcome, reply: string): string | null {
  if (outcome.kind === "which_child") return reply;
  if (request.assumed === "kind" && (outcome.kind === "found" || outcome.kind === "none")) return NARROW_LINE;
  return null;
}

export function placesReply(request: PlaceRequest, outcome: PlacesOutcome): string {
  const narrow = request.assumed === "kind" ? NARROW_LINE : null;
  switch (outcome.kind) {
    case "found": {
      const lines = outcome.places.map((place) => {
        const facts = [place.kind, distanceLabel(place.distanceMeters), place.rating !== null ? `★${place.rating.toFixed(1)}` : null].filter(Boolean).join(" · ");
        // Asked for ("add maps link"), each place carries its Google Maps link in the words too, which is
        // all WhatsApp shows (the owner, 2026-10-27); otherwise the cards under the reply carry it.
        const link = request.mapLinks ? ` · [Map](${place.mapsUri ?? mapsLink({ name: place.name, formattedAddress: place.address, placeId: place.placeId })})` : "";
        return `- **${place.name}**${facts ? ` — ${facts}` : ""}${place.saved ? " (saved)" : ""}${link}`;
      });
      const count = outcome.places.length;
      const intro =
        request.purpose === "getaway"
          ? `For ${request.label}, here ${count === 1 ? "is a place" : `are ${count} places`} worth the trip from ${outcome.near}, the best rated first:`
          : `Here ${count === 1 ? "is a place" : `are ${count} places`} for ${request.label} near ${outcome.near}, open ${outcome.window}:`;
      const unknownHours = request.purpose !== "getaway" && outcome.places.some((place) => place.openForWindow === null);
      return [
        intro,
        lines.join("\n"),
        [
          narrow,
          outcome.assumption,
          unknownHours ? "For any without hours listed, check before you go." : null,
          request.purpose === "getaway" ? "Check the drive, the weather and where to stay before you book." : null,
          "Save the ones you like and I'll suggest them first next time.",
        ].filter(Boolean).join(" "),
      ].join("\n\n");
    }
    case "none":
      return request.purpose === "getaway"
        ? `I couldn't find a getaway within a few hours of ${outcome.near}. Try naming the kind of place, like hills, a beach or a lake.`
        : narrow
          ? `I couldn't find anywhere to go out near ${outcome.near} that's open ${outcome.window}. Say dinner, a park or a mall, or another time, and I'll look again.`
          : `I couldn't find anywhere for ${request.label} near ${outcome.near} that's open ${outcome.window}. Try another time, or ask about somewhere a bit further away.`;
    case "needs_home":
      return "I don't know where home is yet. An Admin can add the home address in Manage Household, under Home address, and then I can look nearby.";
    case "needs_school":
      return outcome.childName
        ? `I don't know where ${outcome.childName}'s school is yet. Pick the school from the search in household setup, and I can look near it.`
        : "I don't know where the school is yet. Pick each child's school from the search in household setup, and I can look near it.";
    case "needs_work":
      return outcome.personName
        ? `I don't know where ${outcome.personName}'s office is yet. ${outcome.personName} can pick it under their details in Settings, or an Admin can in Family, and then I can look near it.`
        : "I don't know where your office is yet. Pick it under your details in Settings, and I can look near it.";
    case "which_child":
      return `Near whose school: ${outcome.names.join(" or ")}?`;
    case "off":
      return "Place search isn't switched on for this WonderHome yet, so I can't look places up.";
    case "unavailable":
      return "The place search isn't answering just now. Try again in a minute.";
  }
}
