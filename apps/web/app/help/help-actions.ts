"use server";

import { getVerifiedUser } from "@wonderhome/core/db/server";
import { answerQuestionIn, type Answer } from "@wonderhome/core/help/search";
import { helpWords } from "@wonderhome/core/help/words";
import { DEFAULT_LANGUAGE, isLanguage } from "@wonderhome/core/i18n/locales";
import { z } from "zod";

/**
 * Answering a question from the guide, on the server.
 *
 * Server-side so the whole guide does not have to be shipped to the browser
 * to answer one question, and so the ranking can be improved — or one day
 * backed by a model — without changing anything the page does.
 *
 * Members only, like the page. A server action is a POST anybody can send,
 * so it checks for a signed-in user itself rather than trusting that only
 * the page can call it; a caller with no session gets no guide text. The
 * route gate refuses such a POST to /help before it gets here too.
 *
 * The page binds the reader's language (story 22-004), so a question is
 * searched in the guide they are reading and answered in its words.
 */
const askSchema = z.object({ language: z.string().max(16), question: z.string().trim().max(1000) });

export async function askTheGuide(language: string, question: string): Promise<Answer> {
  const user = await getVerifiedUser();
  if (!user) throw new Error("Sign in to search the guide.");

  const asked = askSchema.safeParse({ language, question });
  if (!asked.success) throw new Error("That question could not be read.");
  question = asked.data.question;

  const code = isLanguage(language) ? language : DEFAULT_LANGUAGE;
  const words = helpWords(code);
  return answerQuestionIn(question, words, code);
}
