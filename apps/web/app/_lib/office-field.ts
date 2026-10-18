import type { WorkPlace } from "@wonderhome/core/household/work-place";
import { requestT } from "@wonderhome/core/i18n/request";

import type { OfficeFieldProps } from "../_components/member-profile-form";
import { placeSearchLabels } from "./place-labels";
import { placeSearchAvailable } from "./places";

/**
 * The member details form's office picker (story 24-005), in the reader's
 * language. Absent without a place search on this deployment: an office is
 * only worth keeping as a point HomeTalk can search near, so there is no
 * typed fallback (rule 10: no field that does nothing).
 */
export function officeField(workPlace: WorkPlace | null): OfficeFieldProps | undefined {
  if (!placeSearchAvailable()) return undefined;
  const t = requestT();
  return {
    label: t("places.office.label"),
    labels: placeSearchLabels(t, "office"),
    initial: workPlace ? { text: workPlace.name, placeId: workPlace.placeId, detail: workPlace.address } : null,
  };
}
