import { redirect } from "next/navigation";

import { createClient, getVerifiedUser } from "@wonderhome/core/db/server";
import { listMemberships } from "@wonderhome/core/identity/households";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { readAuthorizeRequest, redirectWith } from "@wonderhome/core/voicelink/oauth";
import { DEFAULT_VOICE_SCOPES, SENSITIVE_VOICE_SCOPES } from "@wonderhome/core/voicelink/scopes";

import { approveVoiceLinkAction, denyVoiceLinkAction } from "../../../(auth)/voice-link-actions";
import { AuthLayout } from "../../../_components/auth-layout";
import { memberLocale, visitorLocale } from "../../../_lib/entry-locale";

export const metadata = { title: "Link a voice assistant" };
export const dynamic = "force-dynamic";

/** Product names, never translated. */
const PROVIDER_NAMES = { amazon_alexa: "Alexa", gemini: "Gemini Voice" } as const;

/**
 * Linking a voice assistant to one member (voice phase 2): the page a
 * provider's account-linking flow opens.
 *
 * The request is checked before anything is shown — an unknown client or a
 * redirect that is not exactly one the provider registered is refused here,
 * never bounced back to wherever it asked. Then the signed-in member sees
 * exactly what they are handing over: whose voice, in which home, and what
 * it may do — the everyday things on, a child's school, money, health and
 * changing the home off until they say so. Declining sends the provider away
 * with nothing.
 *
 * The member reads it in their own language (story 22-004); a refused
 * request, shown before anybody is known, in the browser's.
 */
export default async function VoiceAuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) if (typeof value === "string") params.set(key, value);

  const reading = readAuthorizeRequest(params);
  if (!reading.ok) {
    if ("redirectUri" in reading) redirect(redirectWith(reading.redirectUri, { error: reading.error, state: reading.state }));
    const locale = await visitorLocale();
    const { t } = locale;
    return (
      <AuthLayout locale={locale} title={t("entry.voice.nothing.title")} lede={reading.message} accent={t("entry.voice.nothing.accent")}>
        <Alert tone="attention">{t("entry.voice.nothing.body")}</Alert>
      </AuthLayout>
    );
  }

  const user = await getVerifiedUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/oauth/voice/authorize?${params.toString()}`)}`);
  const membership = (await listMemberships(await createClient()))[0];
  if (!membership) redirect("/welcome");

  const locale = await memberLocale(membership);
  const { t } = locale;
  const provider = PROVIDER_NAMES[reading.request.client.provider];
  if (membership.memberType !== "adult") {
    return (
      <AuthLayout
        locale={locale}
        title={t("entry.voice.adultOnly.title", { provider })}
        lede={t("entry.voice.adultOnly.lede")}
        accent={t("entry.script.together")}
      >
        <Alert tone="attention">{t("entry.voice.adultOnly.body", { household: membership.household.name })}</Alert>
      </AuthLayout>
    );
  }

  const offered = reading.request.scopes;
  const hidden = ["client_id", "redirect_uri", "response_type", "state", "scope", "code_challenge", "code_challenge_method"]
    .map((name) => [name, params.get(name)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== null);

  return (
    <AuthLayout
      locale={locale}
      title={t("entry.voice.title", { provider })}
      lede={t("entry.voice.lede", { provider, name: membership.displayName, household: membership.household.name })}
      accent={t("entry.script.lessLoad")}
    >
      <form className="space-y-5">
        {hidden.map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-[var(--wh-foreground)]">{t("entry.voice.legend", { provider })}</legend>
          {offered.map((scope) => {
            const sensitive = SENSITIVE_VOICE_SCOPES.includes(scope);
            return (
              <label key={scope} className="flex items-start gap-3 rounded-2xl bg-[var(--wh-surface)] p-3 text-sm">
                <input type="checkbox" name="scope_choice" value={scope} defaultChecked={DEFAULT_VOICE_SCOPES.includes(scope)} className="mt-1 size-5 shrink-0 accent-[var(--wh-primary)]" />
                <span>
                  {/* The same words Settings shows for each permission. */}
                  <span className="block font-medium text-[var(--wh-foreground)]">{t(`settingsPage.voiceAssistants.scope.${scope}`)}</span>
                  {sensitive ? <span className="block text-[var(--wh-foreground-muted)]">{t("entry.voice.sensitive")}</span> : null}
                </span>
              </label>
            );
          })}
        </fieldset>
        <p className="text-sm text-[var(--wh-foreground-muted)]">{t("entry.voice.note", { provider })}</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="submit" formAction={approveVoiceLinkAction} className="w-full sm:w-auto">
            {t("entry.voice.approve", { provider })}
          </Button>
          <Button type="submit" variant="secondary" formAction={denyVoiceLinkAction} className="w-full sm:w-auto">
            {t("entry.voice.deny")}
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}
