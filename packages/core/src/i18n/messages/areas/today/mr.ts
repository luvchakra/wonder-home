import type { AreaCatalog } from "../types";
import type { todayEn } from "./en";

export const todayMr: AreaCatalog<typeof todayEn> = {
  "today.now": "आता {temp}",
  "today.highLow": "कमाल {high} · किमान {low}",
  "today.rainAt": "साधारण {time} ला पावसाची शक्यता ({chance}%)",
  "today.dry": "आज उरलेला दिवस कोरडा",
  "today.inCinemas": "चित्रपटगृहात नवीन",
  "today.toStream": "कुटुंबासोबत स्ट्रीम करण्यासाठी",
  "today.show": "शो",
  "today.film": "चित्रपट",
  "today.credit": "चित्रपट आणि शो TMDB कडून. हे उत्पादन TMDB API वापरते, पण TMDB ने त्याला मान्यता किंवा प्रमाणपत्र दिलेले नाही.",
  "today.plan": "आजची योजना",
  "today.weatherIn": "{place} चे हवामान",
};
