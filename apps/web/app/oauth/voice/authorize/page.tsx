import { redirect } from "next/navigation";

import { createClient, getVerifiedUser } from "@wonderhome/core/db/server";
import { listMemberships } from "@wonderhome/core/identity/households";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { readAuthorizeRequest, redirectWith } from "@wonderhome/core/voicelink/oauth";
import { DEFAULT_VOICE_SCOPES, SCOPE_LABELS, SENSITIVE_VOICE_SCOPES } from "@wonderhome/core/voicelink/scopes";

import { approveVoiceLinkAction, denyVoiceLinkAction } from "../../../(auth)/voice-link-actions";
import { AuthLayout } from "../../../_components/auth-layout";

export const metadata = { title: "Link a voice assistant" };
export const dynamic = "force-dynamic";

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
 */
export default async function VoiceAuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) if (typeof value === "string") params.set(key, value);

  const reading = readAuthorizeRequest(params);
  if (!reading.ok) {
    if ("redirectUri" in reading) redirect(redirectWith(reading.redirectUri, { error: reading.error, state: reading.state }));
    return (
      <AuthLayout title="Nothing was linked" lede={reading.message} accent="Your home stays yours.">
        <Alert tone="attention">If you were linking a voice assistant, start again from its app. If this keeps happening, the assistant isn&apos;t set up for WonderHome yet.</Alert>
      </AuthLayout>
    );
  }

  const user = await getVerifiedUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/oauth/voice/authorize?${params.toString()}`)}`);
  const membership = (await listMemberships(await createClient()))[0];
  if (!membership) redirect("/welcome");

  const provider = PROVIDER_NAMES[reading.request.client.provider];
  if (membership.memberType !== "adult") {
    return (
      <AuthLayout title={`Linking ${provider}`} lede="Only an adult in the household can link a voice assistant." accent="Home runs smoother. Together.">
        <Alert tone="attention">Ask an adult in {membership.household.name} to link it from their own account.</Alert>
      </AuthLayout>
    );
  }

  const offered = reading.request.scopes;
  const hidden = ["client_id", "redirect_uri", "response_type", "state", "scope", "code_challenge", "code_challenge_method"]
    .map((name) => [name, params.get(name)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== null);

  return (
    <AuthLayout
      title={`Link ${provider} to WonderHome`}
      lede={`${provider} will speak for you, ${membership.displayName}, in ${membership.household.name} — and only for what you tick below.`}
      accent="Less mental load. More family time."
    >
      <form className="space-y-5">
        {hidden.map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-[var(--wh-foreground)]">What {provider} may do</legend>
          {offered.map((scope) => {
            const sensitive = SENSITIVE_VOICE_SCOPES.includes(scope);
            return (
              <label key={scope} className="flex items-start gap-3 rounded-2xl bg-[var(--wh-surface)] p-3 text-sm">
                <input type="checkbox" name="scope_choice" value={scope} defaultChecked={DEFAULT_VOICE_SCOPES.includes(scope)} className="mt-1 size-5 shrink-0 accent-[var(--wh-primary)]" />
                <span>
                  <span className="block font-medium text-[var(--wh-foreground)]">{SCOPE_LABELS[scope]}</span>
                  {sensitive ? <span className="block text-[var(--wh-foreground-muted)]">Off unless you turn it on — anyone near the speaker will hear it.</span> : null}
                </span>
              </label>
            );
          })}
        </fieldset>
        <p className="text-sm text-[var(--wh-foreground-muted)]">
          Paying, ordering and changing who does what always stay in the WonderHome app. You can unlink {provider} at any time in Settings — nothing in your home is deleted when you do.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="submit" formAction={approveVoiceLinkAction} className="w-full sm:w-auto">
            Link {provider}
          </Button>
          <Button type="submit" variant="secondary" formAction={denyVoiceLinkAction} className="w-full sm:w-auto">
            Not now
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}
