import type { AreaCatalog } from "../types";
import type { memberInviteEn } from "./en";

export const memberInviteFr: AreaCatalog<typeof memberInviteEn> = {
  "memberInvite.button": "Inviter",
  "memberInvite.buttonLabel": "Inviter {name} à se connecter",
  "memberInvite.title": "Inviter {name}",
  "memberInvite.lede": "{name} se connecte avec son propre compte et voit le foyer selon son rôle.",
  "memberInvite.emailHint": "Quand {name} se connecte avec {email}, par mot de passe ou avec Google, il entre directement. Un lien fonctionne aussi.",
  "memberInvite.noEmail": "Ajoutez l’e-mail de {name} dans ses informations : en se connectant avec, il entrera directement. Ou envoyez-lui un lien.",
  "memberInvite.create": "Créer un lien d’invitation",
  "memberInvite.creating": "Création…",
  "memberInvite.ready": "Le lien est prêt. Il fonctionne une fois et expire après 7 jours.",
  "memberInvite.newLinkNote": "Créer un nouveau lien désactive le précédent.",
  "memberInvite.sendEmail": "Envoyer un e-mail",
  "memberInvite.share": "Partager",
  "memberInvite.copy": "Copier le lien",
  "memberInvite.copied": "Copié",
  "memberInvite.failed": "Impossible de créer le lien. Veuillez réessayer.",
  "memberInvite.subject": "Rejoignez {household} sur WonderHome",
  "memberInvite.message": "{inviter} vous invite à rejoindre {household} sur WonderHome. Ouvrez ce lien pour entrer :",
  "memberInvite.factEmail": "E-mail de connexion",
  "memberInvite.signsIn": "Se connecte",
} as const;
