import type { AreaCatalog } from "../types";
import type { memberInviteEn } from "./en";

export const memberInviteEs: AreaCatalog<typeof memberInviteEn> = {
  "memberInvite.button": "Invitar",
  "memberInvite.buttonLabel": "Invitar a {name} a iniciar sesión",
  "memberInvite.title": "Invitar a {name}",
  "memberInvite.lede": "{name} inicia sesión con su propia cuenta y ve el hogar según su rol.",
  "memberInvite.emailHint": "Cuando {name} inicie sesión con {email}, con contraseña o con Google, entrará directamente. Un enlace también sirve.",
  "memberInvite.noEmail": "Añade el correo de {name} en sus datos y, al iniciar sesión con él, entrará directamente. O envíale un enlace.",
  "memberInvite.create": "Crear enlace de invitación",
  "memberInvite.creating": "Creando…",
  "memberInvite.ready": "El enlace está listo. Funciona una vez y deja de funcionar a los 7 días.",
  "memberInvite.newLinkNote": "Crear un enlace nuevo anula el anterior.",
  "memberInvite.sendEmail": "Enviar correo",
  "memberInvite.share": "Compartir",
  "memberInvite.copy": "Copiar enlace",
  "memberInvite.copied": "Copiado",
  "memberInvite.failed": "No pudimos crear el enlace. Inténtalo de nuevo.",
  "memberInvite.subject": "Únete a {household} en WonderHome",
  "memberInvite.message": "{inviter} te ha invitado a unirte a {household} en WonderHome. Abre este enlace para entrar:",
  "memberInvite.factEmail": "Correo de acceso",
  "memberInvite.signsIn": "Inicia sesión",
} as const;
