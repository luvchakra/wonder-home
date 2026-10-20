import { ImageResponse } from "next/og";

import { catalogImageUrl } from "@wonderhome/core/commerce/catalog";
import { publicEnv } from "@wonderhome/core/config/env";
import { createClient } from "@wonderhome/core/db/server";
import { translatorFor } from "@wonderhome/core/i18n/translate";

import { FONTS, scriptFonts, type Font } from "../../../e/[token]/render-invitation";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

/**
 * A household recipe as a picture (1080×1350) for "Share on WhatsApp": its
 * photo, its name, what it takes and what you need — the message beside it
 * carries the steps. Read under the person's own session, so only a recipe of
 * a household they belong to can be drawn; anything else is a plain card.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const language = new URL(request.url).searchParams.get("lang") ?? "en";
  const supabase = await createClient();
  const [[regular, bold, script], recipeRead, t] = await Promise.all([
    FONTS,
    supabase
      .from("recipes")
      .select("name, total_minutes, serves, calories_per_serving, protein_grams, catalog_recipe_id, recipe_ingredients(name, essential)")
      .eq("id", id)
      .maybeSingle(),
    translatorFor(language),
  ]);
  const size = { width: 1080, height: 1350 };
  const baseFonts: Font[] = [
    { name: "Sora", data: regular, weight: 400, style: "normal" },
    { name: "Sora", data: bold, weight: 700, style: "normal" },
    { name: "Caveat", data: script, weight: 700, style: "normal" },
  ];
  const recipe = recipeRead.data as Row | null;
  if (!recipe) {
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#FBF7F0", color: "#1F2937", fontFamily: "Sora", fontSize: 64, fontWeight: 700 }}>WonderHome</div>,
      { ...size, fonts: baseFonts },
    );
  }

  let picture: string | null = null;
  if (recipe.catalog_recipe_id) {
    const { data } = await supabase.from("recipe_catalog").select("image_path").eq("id", recipe.catalog_recipe_id as string).maybeSingle();
    picture = catalogImageUrl(publicEnv().NEXT_PUBLIC_SUPABASE_URL, ((data as Row | null)?.image_path as string | null) ?? null);
  }
  const name = recipe.name as string;
  const ingredients = ((recipe.recipe_ingredients as Row[] | null) ?? []).filter((line) => line.essential !== false).map((line) => line.name as string);
  const shown = ingredients.slice(0, 8);
  const meta = t("meals.recipe.timeServes", { minutes: Number(recipe.total_minutes ?? 0), serves: Number(recipe.serves ?? 1) });
  const kcal = recipe.calories_per_serving !== null && recipe.calories_per_serving !== undefined ? t("recipes.share.kcal", { kcal: Math.round(Number(recipe.calories_per_serving)) }) : null;
  const needs = t("recipes.share.needs");
  const more = ingredients.length > shown.length ? t("recipes.share.more.count", { count: ingredients.length - shown.length }) : null;
  const tagline = t("recipes.share.cardLine");
  const extra = await scriptFonts([name, meta, kcal ?? "", needs, ...shown, more ?? "", tagline].join(" "));
  const family = ["Sora", ...extra.map((font) => font.name)].join(", ");

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#FBF7F0", color: "#1F2937", fontFamily: family, padding: 56 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, background: "#FFFFFF", borderRadius: 48, overflow: "hidden", boxShadow: "0 12px 40px rgba(31,41,55,0.10)" }}>
          {picture ? (
            // eslint-disable-next-line @next/next/no-img-element -- drawn into the picture by the image renderer
            <img src={picture} alt="" width={968} height={520} style={{ width: 968, height: 520, objectFit: "cover" }} />
          ) : (
            <div style={{ display: "flex", width: 968, height: 360, alignItems: "center", justifyContent: "center", background: "#FDEBD8", fontSize: 160 }}>🍽️</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", padding: "44px 56px", flex: 1 }}>
            <div style={{ display: "flex", fontSize: name.length > 28 ? 60 : 76, fontWeight: 700, lineHeight: 1.1 }}>{name}</div>
            <div style={{ display: "flex", marginTop: 16, fontSize: 34, color: "#6B7280" }}>{kcal ? `${meta} · ${kcal}` : meta}</div>
            {shown.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", marginTop: 36 }}>
                <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: "#4F46E5", textTransform: "uppercase", letterSpacing: 2 }}>{needs}</div>
                <div style={{ display: "flex", flexWrap: "wrap", marginTop: 16 }}>
                  {shown.map((item) => (
                    <div key={item} style={{ display: "flex", fontSize: 30, background: "#F3EFE8", borderRadius: 999, padding: "10px 24px", marginRight: 12, marginBottom: 12 }}>
                      {item}
                    </div>
                  ))}
                  {more ? <div style={{ display: "flex", fontSize: 30, color: "#6B7280", padding: "10px 12px" }}>{more}</div> : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, padding: "0 12px" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#1F2937" }}>WonderHome</div>
          <div style={{ display: "flex", fontFamily: "Caveat", fontSize: 44, color: "#4F46E5" }}>{tagline}</div>
        </div>
      </div>
    ),
    { ...size, fonts: [...baseFonts, ...extra], headers: { "Cache-Control": "private, max-age=300" } },
  );
}
