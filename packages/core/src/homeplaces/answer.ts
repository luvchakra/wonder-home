import { distanceLabel } from "../places/provider";
import type { PlaceRequest } from "./request";
import type { PlacesOutcome } from "./service";

/**
 * What HomeTalk says for a place question, written from the outcome alone,
 * never by a model: every name, distance and rating in it came back from the
 * place search, so there is nothing to invent and nothing for the answer
 * validator to catch. Places themselves are shown as cards under the reply,
 * each with its map link; the words only introduce them.
 */
export function placesReply(request: PlaceRequest, outcome: PlacesOutcome): string {
  switch (outcome.kind) {
    case "found": {
      const lines = outcome.places.map((place) => {
        const facts = [place.kind, distanceLabel(place.distanceMeters), place.rating !== null ? `★${place.rating.toFixed(1)}` : null].filter(Boolean).join(" · ");
        return `- **${place.name}**${facts ? ` — ${facts}` : ""}${place.saved ? " (saved)" : ""}`;
      });
      const count = outcome.places.length;
      const intro = `Here ${count === 1 ? "is a place" : `are ${count} places`} for ${request.label} near ${outcome.near}, open ${outcome.window}:`;
      const unknownHours = outcome.places.some((place) => place.openForWindow === null);
      return [
        intro,
        lines.join("\n"),
        [outcome.assumption, unknownHours ? "For any without hours listed, check before you go." : null, "Save the ones you like and I'll suggest them first next time."].filter(Boolean).join(" "),
      ].join("\n\n");
    }
    case "none":
      return `I couldn't find anywhere for ${request.label} near ${outcome.near} that's open ${outcome.window}. Try another time, or ask about somewhere a bit further away.`;
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
