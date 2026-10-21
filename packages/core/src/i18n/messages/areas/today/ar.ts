import type { AreaCatalog } from "../types";
import type { todayEn } from "./en";

export const todayAr: AreaCatalog<typeof todayEn> = {
  "today.now": "{temp} الآن",
  "today.highLow": "العظمى {high} · الصغرى {low}",
  "today.rainAt": "مطر محتمل نحو {time} ({chance}٪)",
  "today.dry": "جافّ بقية اليوم",
  "today.inCinemas": "جديد في السينما",
  "today.toStream": "اختيار عائلي للبث",
  "today.show": "مسلسل",
  "today.film": "فيلم",
  "today.credit": "الأفلام والمسلسلات من TMDB. يستخدم هذا المنتج واجهة TMDB البرمجية لكنه ليس معتمدًا أو موثّقًا من TMDB.",
  "today.plan": "خطة اليوم",
  "today.weatherIn": "الطقس في {place}",
};
