import type { AreaCatalog } from "../types";
import type { todayEn } from "./en";

export const todayZh: AreaCatalog<typeof todayEn> = {
  "today.now": "现在 {temp}",
  "today.highLow": "最高 {high} · 最低 {low}",
  "today.rainAt": "约 {time} 可能下雨（{chance}%）",
  "today.dry": "今天余下时间无雨",
  "today.inCinemas": "院线新片",
  "today.toStream": "适合全家的流媒体推荐",
  "today.show": "剧集",
  "today.film": "电影",
  "today.credit": "影视信息来自 TMDB。本产品使用 TMDB API，但未获 TMDB 认可或认证。",
  "today.plan": "今天的安排",
  "today.weatherIn": "{place}天气",
};
