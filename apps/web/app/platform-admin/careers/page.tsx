import { notFound } from "next/navigation";

import { careersKeyStatus, recentCareersKeyEvents } from "@wonderhome/core/careers/key-store";
import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { Card } from "@wonderhome/core/ui/card";

import { careersStaff } from "../../_lib/careers";
import { CareersKeyForm } from "./key-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Careers connection", robots: { index: false, follow: false } };

const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso)) : null);

/**
 * Where a platform admin sets the WonderJobs career-site key (the owner,
 * 2026-10-21). Anyone else sees a 404, as with every platform boundary.
 */
export default async function CareersConnectionPage() {
  const staff = await careersStaff();
  if (!staff) notFound();
  const admin = adminClientFor(adminGrant.platformAdmin(staff, "show the careers key status"));
  const [status, events] = await Promise.all([careersKeyStatus(admin), recentCareersKeyEvents(admin, 10)]);

  return (
    <main className="min-h-dvh px-4 py-10 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-[length:var(--wh-text-title)] font-bold tracking-tight">Careers connection</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            The public careers pages at /careers show the jobs and take the applications that WonderJobs holds. Paste the
            career site key here; it works at once, with no redeploy.
          </p>
        </header>

        <Card className="space-y-4 p-5">
          <div className="space-y-1 text-sm">
            <p className="font-semibold">Key</p>
            {status.configured ? (
              <p>
                <span className="font-mono break-all">{status.masked}</span>
                <span className="text-[var(--wh-foreground-muted)]">
                  {" "}· {status.source === "database" ? `saved here${status.updatedAt ? ` on ${when(status.updatedAt)}` : ""}` : "from the WONDERJOBS_CAREERS_KEY environment variable (saving one here replaces it)"}
                </span>
              </p>
            ) : (
              <p className="text-[var(--wh-foreground-muted)]">No key yet. Visitors see &ldquo;Careers isn&rsquo;t set up yet&rdquo;.</p>
            )}
          </div>
          <CareersKeyForm configured={status.configured} />
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="text-base font-semibold tracking-tight">Changes</h2>
          {events.length === 0 ? (
            <p className="text-sm text-[var(--wh-foreground-muted)]">No key has been saved or cleared here yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {events.map((event) => (
                <li key={`${event.at}-${event.action}`} className="break-words">
                  {event.action === "set" ? "Saved" : "Cleared"}
                  {event.masked ? <span className="font-mono"> {event.masked}</span> : null}
                  <span className="text-[var(--wh-foreground-muted)]"> · {when(event.at)}{event.actorProfileId ? ` · by ${event.actorProfileId === staff.profileId ? "you" : `admin ${event.actorProfileId.slice(0, 8)}`}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
