import type { AreaCatalog } from "../types";
import type { todayEn } from "./en";

export const todayEs: AreaCatalog<typeof todayEn> = {
  "today.now": "{temp} ahora",
  "today.highLow": "Máx. {high} · Mín. {low}",
  "today.rainAt": "Probable lluvia hacia las {time} ({chance}%)",
  "today.dry": "Seco el resto del día",
  "today.inCinemas": "Nuevo en cines",
  "today.toStream": "Para ver en familia en streaming",
  "today.show": "Serie",
  "today.film": "Película",
  "today.credit": "Películas y series de TMDB. Este producto usa la API de TMDB, pero TMDB no lo respalda ni lo certifica.",
  "today.plan": "El plan de hoy",
  "today.weatherIn": "El tiempo en {place}",
};
