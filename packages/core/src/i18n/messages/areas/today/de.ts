import type { AreaCatalog } from "../types";
import type { todayEn } from "./en";

export const todayDe: AreaCatalog<typeof todayEn> = {
  "today.now": "jetzt {temp}",
  "today.highLow": "Höchst {high} · Tiefst {low}",
  "today.rainAt": "Regen wahrscheinlich gegen {time} ({chance} %)",
  "today.dry": "Den Rest des Tages trocken",
  "today.inCinemas": "Neu im Kino",
  "today.toStream": "Für die Familie zum Streamen",
  "today.show": "Serie",
  "today.film": "Film",
  "today.credit": "Filme und Serien von TMDB. Dieses Produkt nutzt die TMDB-API, ist aber nicht von TMDB unterstützt oder zertifiziert.",
  "today.plan": "Der Plan für heute",
  "today.weatherIn": "Wetter in {place}",
};
