import { describe, expect, it } from "vitest";

import { readsAsRequest } from "./request";

describe("a request, not an answer to a waiting question", () => {
  it.each([
    "remind me to call the plumber in 10 minutes",
    "Remind me to call the plumber in 10 minutes",
    "add milk to the list",
    "buy eggs",
    "we're out of eggs",
    "plan dinner on friday",
    "take me to bills",
    "order groceries",
    "pay the electricity bill",
    "set a reminder for 5pm",
    "call the plumber tomorrow",
    "show my calendar",
    "book a table for four",
    "I need to buy milk",
    "please add bread",
  ])("%s goes to the ordinary turn", (said) => {
    expect(readsAsRequest(said)).toBe(true);
  });

  it.each([
    "my son",
    "he is my son",
    "Manan is my husband",
    "daughter",
    "15 march 2015",
    "he's allergic to peanuts",
    "no allergies",
    "she likes pasta",
    "doesn't like onions",
    "we are vegetarian",
    "Delhi Public School",
    "6 pm",
    "Sunita cooks",
    "she goes to swimming on saturdays",
    "we live in Pune",
    "no",
    "skip",
    "stop",
    "undo",
    "",
  ])("%s stays an answer", (said) => {
    expect(readsAsRequest(said)).toBe(false);
  });
});
