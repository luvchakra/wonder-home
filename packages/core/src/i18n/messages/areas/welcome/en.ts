/**
 * welcome — English, the source for this area: the conversation HomeTalk
 * opens with once family setup is done. It welcomes the person, says who is
 * in the household as WonderHome has it, explains the three ways to talk,
 * then asks one question at a time and remembers the answers. Names come
 * from the household and are never passed through here.
 */
export const welcomeEn = {
  "welcome.intro": "Welcome to the WonderHome family, {name}! I'm here to carry the household's mental load with you.",
  "welcome.household": "Here's your household as I know it: {people}.",
  "welcome.pets": "And {pets}, of course.",
  "welcome.helpers#one": "{helpers} helps around the home.",
  "welcome.helpers#other": "{helpers} help around the home.",
  "welcome.what": "I'll keep track of school, meals, groceries, bills and family plans, and only tell you what needs you.",
  "welcome.howTo": "You can talk to me three ways: type a message here, tap the mic to say one thing, or start a live conversation and simply talk back and forth.",
  "welcome.getToKnow": "Let's get to know each other, one question at a time. Say “skip” whenever you like.",
  "welcome.q.food": "What does your family love to eat? Favourite dishes, cuisines, anything.",
  "welcome.q.dislikes": "Is there anything someone doesn't eat or doesn't like? An allergy, or a food someone avoids?",
  "welcome.q.together": "What do you enjoy doing together? Films, games, outings, anything at all.",
  "welcome.q.petOne": "Tell me about {pet}. Anything I should know, like food or walks?",
  "welcome.q.petMany": "Tell me about {pets}. Anything I should know, like food or walks?",
  "welcome.q.noPets": "Any pets at home, or one on the way?",
  "welcome.ack": "Got it, I'll remember that.",
  "welcome.ackNone": "Okay, nothing to note there.",
  "welcome.done": "Thank you! I've kept all of that under HomeBrain, where you can change it any time. What would you like to do first?",
  "welcome.skipped": "No problem, we can do this another time. What would you like to do first?",
  "welcome.listen": "Hear the welcome",
} as const;
