import type { AreaCatalog } from "../types";
import type { memberInviteEn } from "./en";

export const memberInviteAr: AreaCatalog<typeof memberInviteEn> = {
  "memberInvite.button": "دعوة",
  "memberInvite.buttonLabel": "دعوة {name} لتسجيل الدخول",
  "memberInvite.title": "دعوة {name}",
  "memberInvite.lede": "يسجّل {name} الدخول بحسابه ويرى المنزل بحسب دوره.",
  "memberInvite.emailHint": "عندما يسجّل {name} الدخول باستخدام {email}، بكلمة المرور أو عبر Google، يدخل مباشرة. ويعمل الرابط أيضًا.",
  "memberInvite.noEmail": "أضف بريد {name} في بياناته، وعند تسجيل الدخول به يدخل مباشرة. أو أرسل إليه رابطًا.",
  "memberInvite.create": "إنشاء رابط دعوة",
  "memberInvite.creating": "جارٍ الإنشاء…",
  "memberInvite.ready": "الرابط جاهز. يعمل مرة واحدة ويتوقف بعد 7 أيام.",
  "memberInvite.newLinkNote": "إنشاء رابط جديد يوقف أي رابط سابق.",
  "memberInvite.sendEmail": "إرسال بريد",
  "memberInvite.share": "مشاركة",
  "memberInvite.copy": "نسخ الرابط",
  "memberInvite.copied": "تم النسخ",
  "memberInvite.failed": "تعذّر إنشاء الرابط. حاول مرة أخرى.",
  "memberInvite.subject": "انضم إلى {household} على WonderHome",
  "memberInvite.message": "دعاك {inviter} للانضمام إلى {household} على WonderHome. افتح هذا الرابط للدخول:",
  "memberInvite.factEmail": "بريد تسجيل الدخول",
  "memberInvite.signsIn": "يسجّل الدخول",
} as const;
