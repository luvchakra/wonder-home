import type { AreaCatalog } from "../types";
import type { todayEn } from "./en";

export const todayHi: AreaCatalog<typeof todayEn> = {
  "today.now": "अभी {temp}",
  "today.highLow": "अधिकतम {high} · न्यूनतम {low}",
  "today.rainAt": "लगभग {time} बारिश की संभावना ({chance}%)",
  "today.dry": "आज बाकी दिन सूखा रहेगा",
  "today.inCinemas": "सिनेमाघरों में नई",
  "today.toStream": "परिवार के साथ स्ट्रीम करने लायक",
  "today.show": "शो",
  "today.film": "फ़िल्म",
  "today.credit": "फ़िल्में और शो TMDB से। यह उत्पाद TMDB API का उपयोग करता है, पर TMDB ने इसका समर्थन या प्रमाणन नहीं किया है।",
  "today.plan": "आज की योजना",
  "today.weatherIn": "{place} का मौसम",
};
