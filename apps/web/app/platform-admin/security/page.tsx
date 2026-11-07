import { notFound } from "next/navigation";

import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { recentSettingChanges } from "@wonderhome/core/platform/settings/store";
import { cspModeFromEnv } from "@wonderhome/core/security/headers";
import { Badge } from "@wonderhome/core/ui/pill";

import { platformStaff } from "../../_lib/platform-staff";
import { PageBody, PageTitle, Panel } from "../_ui/page-title";

export const dynamic = "force-dynamic";
export const metadata = { title: "Security · Platform admin", robots: { index: false, follow: false } };

const ROLE_WORDS: Record<string, string> = {
  owner: "Everything, including secrets, staff and resets",
  operator: "Settings, plans, payments, privacy requests and support access",
  support: "Totals, and a household only with a time-boxed grant",
};

const when = (at: string) => new Date(at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

/** Who is staff, what each role may do, and every recent staff change. */
export default async function PlatformSecurityPage() {
  const staff = await platformStaff("audit.read_platform");
  if (!staff) notFound();
  const admin = adminClientFor(adminGrant.platformAdmin(staff, "show the staff list and staff audit"));

  const [members, changes, perf] = await Promise.all([
    admin.from("platform_admins").select("profile_id, role, status, created_at").order("created_at").limit(100),
    recentSettingChanges(admin, 25),
    admin
      .from("audit_events")
      .select("created_at, actor_profile_id, metadata")
      .is("household_id", null)
      .eq("event_type", "platform.perf_action")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const staffRows = (members.data ?? []) as { profile_id: string; role: string; status: string; created_at: string }[];
  const actorIds = [...new Set([...staffRows.map((row) => row.profile_id), ...changes.map((c) => c.actorProfileId), ...((perf.data ?? []) as { actor_profile_id: string | null }[]).map((p) => p.actor_profile_id)].filter((id): id is string => !!id))];
  const { data: profiles } = actorIds.length
    ? await admin.from("profiles").select("id, display_name").in("id", actorIds)
    : { data: [] as { id: string; display_name: string }[] };
  const nameOf = new Map(((profiles ?? []) as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]));
  const who = (id: string | null) => (id ? (nameOf.get(id) ?? "A former staff member") : "Someone since removed");
  const csp = cspModeFromEnv();

  return (
    <PageBody>
      <PageTitle title="Security" subtitle="Who runs WonderHome, what each role can do, and every change staff made. Nothing here shows a household's own data." />

      <Panel title="Staff" description="Being an Admin of a household grants nothing here, and being staff grants no way into a household by itself.">
        <ul className="space-y-2">
          {staffRows.map((row) => (
            <li key={row.profile_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0 break-words font-semibold">{who(row.profile_id)}</span>
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={row.role === "owner" ? "handled" : "neutral"}>{row.role}</Badge>
                {row.status !== "active" ? <Badge tone="risk">{row.status}</Badge> : null}
              </span>
              <span className="w-full text-xs text-[var(--wh-foreground-muted)]">{ROLE_WORDS[row.role] ?? ""}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Browser protection" description="The Content Security Policy every page is sent with. It stays in Vercel (CSP_MODE): it is read on every request, before the database is.">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={csp === "enforce" ? "handled" : "attention"}>{csp === "enforce" ? "Enforced" : "Report only"}</Badge>
          <span className="text-[var(--wh-foreground-muted)]">{csp === "enforce" ? "Scripts from anywhere else are blocked." : "Breaches are reported, not blocked."}</span>
        </p>
      </Panel>

      <Panel title="Setting changes" description="Every save and clear, newest first. For a secret, only that it changed.">
        {changes.length === 0 ? (
          <p className="text-sm text-[var(--wh-foreground-muted)]">No setting has been changed here yet.</p>
        ) : (
          <ul className="space-y-2">
            {changes.map((change, index) => (
              <li key={`${change.at}-${index}`} className="text-sm">
                <p className="break-words">
                  <span className="font-semibold">{who(change.actorProfileId)}</span> {change.action === "clear" ? "cleared" : change.secret ? "replaced" : "changed"}{" "}
                  <span className="font-semibold">{change.label}</span>
                  {!change.secret && change.action === "set" ? (
                    <span className="text-[var(--wh-foreground-muted)]">
                      {" "}
                      from <span className="font-mono break-all">{change.from ?? "nothing"}</span> to <span className="font-mono break-all">{change.to ?? "nothing"}</span>
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-[var(--wh-foreground-muted)]">{when(change.at)}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Performance actions" description="The last ten maintenance runs from Performance.">
        {(perf.data ?? []).length === 0 ? (
          <p className="text-sm text-[var(--wh-foreground-muted)]">None run yet.</p>
        ) : (
          <ul className="space-y-2">
            {((perf.data ?? []) as { created_at: string; actor_profile_id: string | null; metadata: { action?: string; outcome?: string; target?: string | null } }[]).map((row, index) => (
              <li key={`${row.created_at}-${index}`} className="text-sm">
                <p className="break-words">
                  <span className="font-semibold">{who(row.actor_profile_id)}</span> ran {String(row.metadata.action ?? "an action").replaceAll("_", " ")}
                  {row.metadata.target ? ` on ${row.metadata.target}` : ""}: {row.metadata.outcome === "ok" ? "done" : "failed"}
                </p>
                <p className="text-xs text-[var(--wh-foreground-muted)]">{when(row.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PageBody>
  );
}
