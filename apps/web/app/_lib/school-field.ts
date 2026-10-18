import type { Enrolment } from "@wonderhome/core/school/enrolments";
import { requestT } from "@wonderhome/core/i18n/request";

import type { SchoolFieldProps } from "../_components/member-profile-form";
import { placeSearchLabels } from "./place-labels";
import { placeSearchAvailable } from "./places";

/**
 * A child's school in their details in Family (story 24-010), in the reader's
 * language: the same Google Maps picker and record as Kids & School's Schools,
 * typed when this deployment has no place search.
 */
export function schoolField(enrolment: Pick<Enrolment, "schoolName" | "placeId" | "schoolAddress"> | null): SchoolFieldProps {
  const t = requestT();
  return {
    label: t("places.school.label"),
    labels: placeSearchLabels(t, "school"),
    available: placeSearchAvailable(),
    initial: enrolment ? { text: enrolment.schoolName, placeId: enrolment.placeId ?? null, detail: enrolment.schoolAddress ?? null } : null,
  };
}
