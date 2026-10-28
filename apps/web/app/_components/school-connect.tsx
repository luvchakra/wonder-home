import { GraduationCap, Plug, Send } from "lucide-react";

import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";

import type { SchoolConnectLabels } from "../_lib/school-connect-labels";

/**
 * Connect school (redesigned around the Connections framework, 2026-10-28).
 *
 * Two honest paths, nothing more: forward a circular or photo into HomeSend
 * (works for any school, no setup), or connect the school's website as a
 * browser-automation *connection* — created, tested and managed on the
 * Connections page, and reused anywhere. No demo portal, no inline sign-in.
 */

export type SchoolConnectionView = { id: string; name: string; url: string | null };

export function SchoolConnect({
  connections,
  connectionsHref,
  forwardHref,
  labels,
}: {
  connections: SchoolConnectionView[];
  connectionsHref: string;
  forwardHref: string;
  labels: SchoolConnectLabels;
}) {
  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <IconTile icon={Send} tone="handled" size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{labels.forwardTitle}</p>
              <Badge tone="handled">{labels.availableNow}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">{labels.forwardBody}</p>
            <div className="mt-3">
              <PillLink href={forwardHref} tone="primary">{labels.forwardCta}</PillLink>
            </div>
          </div>
        </div>
      </Card>

      <section>
        <p className="text-sm font-semibold">{labels.portalTitle}</p>
        <p className="mb-2 text-xs text-[var(--wh-foreground-muted)]">{labels.portalLede}</p>
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <IconTile icon={GraduationCap} tone="school" size="lg" />
            <div className="min-w-0 flex-1">
              {connections.length > 0 ? (
                <ul className="space-y-2">
                  {connections.map((connection) => (
                    <li key={connection.id} className="flex items-center gap-2">
                      <Plug aria-hidden className="size-4 text-[var(--wh-foreground-subtle)]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{connection.name}</p>
                        {connection.url ? (
                          <p className="truncate text-xs text-[var(--wh-foreground-muted)]">{connection.url.replace(/^https?:\/\//, "")}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.portalNone}</p>
              )}
              <div className="mt-3">
                <PillLink href={connectionsHref} tone="primary">{labels.portalManage}</PillLink>
              </div>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
