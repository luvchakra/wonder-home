import type { AreaCatalog } from "../types";
import type { memberInviteEn } from "./en";

export const memberInviteDe: AreaCatalog<typeof memberInviteEn> = {
  "memberInvite.button": "Einladen",
  "memberInvite.buttonLabel": "{name} zur Anmeldung einladen",
  "memberInvite.title": "{name} einladen",
  "memberInvite.lede": "{name} meldet sich selbst an und sieht den Haushalt so, wie die eigene Rolle es erlaubt.",
  "memberInvite.emailHint": "Wenn sich {name} mit {email} anmeldet, per Passwort oder mit Google, geht es direkt hinein. Ein Link funktioniert auch.",
  "memberInvite.noEmail": "Trag die E-Mail von {name} in die Angaben ein, dann geht es mit der Anmeldung direkt hinein. Oder schick einen Link.",
  "memberInvite.create": "Einladungslink erstellen",
  "memberInvite.creating": "Wird erstellt…",
  "memberInvite.ready": "Der Link ist fertig. Er funktioniert einmal und läuft nach 7 Tagen ab.",
  "memberInvite.newLinkNote": "Ein neuer Link macht den vorherigen ungültig.",
  "memberInvite.sendEmail": "E-Mail senden",
  "memberInvite.share": "Teilen",
  "memberInvite.copy": "Link kopieren",
  "memberInvite.copied": "Kopiert",
  "memberInvite.failed": "Der Link konnte nicht erstellt werden. Bitte versuch es noch einmal.",
  "memberInvite.subject": "Tritt {household} bei WonderHome bei",
  "memberInvite.message": "{inviter} hat dich eingeladen, {household} bei WonderHome beizutreten. Öffne diesen Link, um hineinzukommen:",
  "memberInvite.factEmail": "Anmelde-E-Mail",
  "memberInvite.signsIn": "Meldet sich an",
} as const;
