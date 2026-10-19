import { LONG_WEEKENDS_LEAD, tripQuestion } from "../homebrain/insights";
import { readPlaceRequest, type PlaceRequest } from "./request";

/**
 * Where to go, beside when (14-035). "What's the best time for a getaway?" is
 * answered from the calendar (14-033, 14-034); the places worth the drive come
 * with it, searched as a getaway of the length the answer is about: the days
 * the person said, otherwise three for a long weekend a holiday makes, two
 * for an ordinary weekend.
 *
 * Read from the person's own words and the answer's own lead, never by a
 * model; the search itself is HomePlaces' (`service.ts`).
 */
export function tripDestinationRequest(question: string, answer: string): PlaceRequest | null {
  const trip = tripQuestion(question);
  if (!trip) return null;
  const days = trip.daysSaid ? trip.days : answer.includes(LONG_WEEKENDS_LEAD) ? 3 : trip.days;
  return readPlaceRequest(`suggest a ${days} day getaway`);
}

/** The when-answer and the where-answer as one reply. */
export function withDestinations(answer: string, destinations: string): string {
  return `${answer}\n\n${destinations}`;
}
