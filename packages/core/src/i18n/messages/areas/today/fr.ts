import type { AreaCatalog } from "../types";
import type { todayEn } from "./en";

export const todayFr: AreaCatalog<typeof todayEn> = {
  "today.now": "{temp} maintenant",
  "today.highLow": "Max. {high} · Min. {low}",
  "today.rainAt": "Pluie probable vers {time} ({chance} %)",
  "today.dry": "Sec le reste de la journée",
  "today.inCinemas": "Nouveau au cinéma",
  "today.toStream": "À regarder en famille en streaming",
  "today.show": "Série",
  "today.film": "Film",
  "today.credit": "Films et séries de TMDB. Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB.",
  "today.plan": "Le programme du jour",
  "today.weatherIn": "Météo à {place}",
};
