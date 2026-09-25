"use server";

import { answerQuestionIn, type Answer } from "@wonderhome/core/help/search";
import { DEFAULT_LANGUAGE, isLanguage } from "@wonderhome/core/i18n/locales";
import { translatorFor } from "@wonderhome/core/i18n/translate";

/**
 * Answering a question from the guide, on the server.
 *
 * Server-side so the whole guide does not have to be shipped to the browser
 * to answer one question, and so the ranking can be improved — or one day
 * backed by a model — without changing anything the page does.
 *
 * The page binds the reader's language (story 22-004), so a question is
 * searched in the guide they are reading and answered in its words. The
 * guide is public and nothing here is about a household, so the language is
 * only checked to be one WonderHome speaks; anything else reads English.
 */
export async function askTheGuide(language: string, question: string): Promise<Answer> {
  const code = isLanguage(language) ? language : DEFAULT_LANGUAGE;
  return answerQuestionIn(question, await translatorFor(code), code);
}
