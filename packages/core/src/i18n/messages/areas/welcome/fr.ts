import type { AreaCatalog } from "../types";
import type { welcomeEn } from "./en";

export const welcomeFr: AreaCatalog<typeof welcomeEn> = {
  "welcome.intro": "Bienvenue dans la famille WonderHome, {name} ! Je suis là pour porter avec vous la charge mentale de la maison.",
  "welcome.household": "Voici votre foyer tel que je le connais : {people}.",
  "welcome.pets": "Et {pets}, bien sûr.",
  "welcome.helpers#one": "{helpers} aide à la maison.",
  "welcome.helpers#other": "{helpers} aident à la maison.",
  "welcome.what": "Je garde un œil sur l'école, les repas, les courses, les factures et les projets de famille, et je ne vous dis que ce qui a besoin de vous.",
  "welcome.howTo": "Vous pouvez me parler de trois façons : écrivez un message ici, touchez le micro pour dire une chose, ou lancez une conversation en direct et parlons tout simplement.",
  "welcome.getToKnow": "Faisons connaissance, une question à la fois. Dites « passer » quand vous voulez.",
  "welcome.q.food": "Qu'est-ce que votre famille adore manger ? Plats préférés, cuisines, tout ce qui vous vient.",
  "welcome.q.dislikes": "Y a-t-il quelque chose que quelqu'un ne mange pas ou n'aime pas ? Une allergie, ou un aliment que quelqu'un évite ?",
  "welcome.q.together": "Qu'aimez-vous faire ensemble ? Films, jeux, sorties, tout ce que vous voulez.",
  "welcome.q.petOne": "Parlez-moi de {pet}. Y a-t-il quelque chose que je devrais savoir, comme la nourriture ou les promenades ?",
  "welcome.q.petMany": "Parlez-moi de {pets}. Y a-t-il quelque chose que je devrais savoir, comme la nourriture ou les promenades ?",
  "welcome.q.noPets": "Des animaux à la maison, ou un en route ?",
  "welcome.ack": "C'est noté, je m'en souviendrai.",
  "welcome.ackNone": "D'accord, rien à noter de ce côté.",
  "welcome.done": "Merci ! J'ai gardé tout cela dans « Revue HomeBrain », où vous pouvez le modifier à tout moment. Par quoi voulez-vous commencer ?",
  "welcome.skipped": "Pas de souci, on fera ça une autre fois. Par quoi voulez-vous commencer ?",
  "welcome.listen": "Écouter l'accueil",
};
