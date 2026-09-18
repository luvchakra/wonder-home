"use server";

import { answerQuestion, type Answer } from "@wonderhome/core/help/search";

/**
 * Answering a question from the guide, on the server.
 *
 * Server-side so the whole guide does not have to be shipped to the browser
 * to answer one question, and so the ranking can be improved — or one day
 * backed by a model — without changing anything the page does.
 */
export async function askTheGuide(question: string): Promise<Answer> {
  return answerQuestion(question);
}
