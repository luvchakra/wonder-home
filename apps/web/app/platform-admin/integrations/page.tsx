import { headers } from "next/headers";
import Link from "next/link";

import { configurationGaps, deliveryClockLine, schedulerKeyLine, razorpayCard, settingGroupsFor } from "../../_lib/platform-settings-view";
import { staffStepUp } from "../../_lib/platform-step-up";
import { platformStaff } from "../../_lib/platform-staff";
import { PageBody, PageTitle } from "../_ui/page-title";
import { RazorpayCard } from "../_ui/razorpay-card";
import { ConfigurationHealth } from "../_ui/configuration-health";
import { SettingGroups } from "../_ui/setting-groups";
import { WebhookAddress } from "../_ui/webhook-address";
import { WhatsAppTest } from "../_ui/whatsapp-test";

/** The Razorpay key id and secret have one editor: the Razorpay card (rule 23). */
const ON_THE_CARD = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"] as const;

async function siteOrigin(): Promise<string> {
  const host = (await headers()).get("host") ?? "home.wonderapps.biz";
  return `${/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https"}://${host}`;
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrations · Platform admin", robots: { index: false, follow: false } };

/** Every outside service WonderHome talks to, with its settings and keys side by side. */
export default async function PlatformIntegrationsPage() {
  const staff = await platformStaff("operations.read");
  if (!staff) return null; // the layout has already answered 404
  const [{ groups, storeReady }, [origin, card], stepUp, gaps, clock, scheduler] = await Promise.all([
    settingGroupsFor(staff, "integrations"),
    siteOrigin().then(async (origin) => [origin, await razorpayCard(staff, origin)] as const),
    staffStepUp(),
    configurationGaps(staff),
    deliveryClockLine(staff),
    schedulerKeyLine(staff),
  ]);

  return (
    <PageBody>
      <PageTitle
        title="Integrations"
        subtitle={
          <>
            WhatsApp, email, maps, weather, payments and the rest, each off until its settings are in. The WonderJobs key is on{" "}
            <Link href="/platform-admin/careers" className="font-medium text-[var(--wh-primary)] hover:underline">
              Careers connection
            </Link>
            .
          </>
        }
        actions={
          <Link href="/platform-admin/configuration#move-all" className="text-sm font-medium text-[var(--wh-primary)] hover:underline">
            Move all from Vercel
          </Link>
        }
      />
      <ConfigurationHealth gaps={gaps} clock={clock} scheduler={scheduler} />
      <SettingGroups
        groups={groups}
        storeReady={storeReady}
        stepUp={stepUp}
        next="/platform-admin/integrations"
        hide={ON_THE_CARD}
        before={{
          billing: <RazorpayCard view={card} stepUp={stepUp} />,
          whatsapp: (
            <div className="space-y-4">
              <WebhookAddress url={`${origin}/api/v1/whatsapp/webhook`} hint="Paste it into Meta → WhatsApp → Configuration → Webhook with the verify token below, and subscribe to messages." />
              <WhatsAppTest />
            </div>
          ),
        }}
      />
    </PageBody>
  );
}
