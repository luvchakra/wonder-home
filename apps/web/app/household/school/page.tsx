import { redirect } from "next/navigation";

/** School moved to /school when the domains left the More menu. */
export default function LegacySchoolPage() {
  redirect("/school");
}
