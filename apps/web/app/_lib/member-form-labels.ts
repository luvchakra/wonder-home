import type { Translate } from "@wonderhome/core/i18n/translate";

import type { GenderFieldLabels } from "../_components/gender-field";
import type { PendingInvitationLabels } from "../_components/pending-invitations";

/**
 * Members & roles' forms in the viewer's language (story 22-004), built on
 * the server and handed to the client forms as plain strings. `{name}`
 * stays a placeholder, filled in with the member's own name.
 */
export type MemberFormLabels = {
  remove: string;
  removeTitle: string;
  removeLede: string;
  removeConfirm: string;
  inviteTitle: string;
  inviteReady: string;
  inviteLink: string;
  theirName: string;
  theirEmail: string;
  role: string;
  roleAdult: string;
  roleHelper: string;
  roleAdmin: string;
  ownerOnly: string;
  creatingInvite: string;
  createInvite: string;
  addChild: string;
  addChildLede: string;
  dateOfBirth: string;
  dateOfBirthHint: string;
  addChildSubmit: string;
  adding: string;
  addHelper: string;
  addHelperLede: string;
  addHelperSubmit: string;
  addPet: string;
  addPetLede: string;
  petName: string;
  species: string;
  speciesPlaceholder: string;
  petDateOfBirth: string;
  vetName: string;
  vetContact: string;
  notes: string;
  notesPlaceholder: string;
  addPetSubmit: string;
  gender: GenderFieldLabels;
};

export function genderFieldLabels(t: Translate): GenderFieldLabels {
  return {
    label: t("manage.members.gender"),
    empty: t("manage.members.genderEmpty"),
    addNew: t("manage.members.genderOther"),
    newPlaceholder: t("manage.members.genderOtherPlaceholder"),
    chooseExisting: t("common.chooseExisting"),
  };
}

export function memberFormLabels(t: Translate): MemberFormLabels {
  const name = { name: "{name}" };
  return {
    remove: t("manage.members.remove", name),
    removeTitle: t("manage.members.removeTitle", name),
    removeLede: t("manage.members.removeLede", name),
    removeConfirm: t("manage.members.removeConfirm"),
    inviteTitle: t("family.inviteSomeone"),
    inviteReady: t("manage.members.inviteReady"),
    inviteLink: t("manage.members.inviteLink"),
    theirName: t("manage.members.theirName"),
    theirEmail: t("manage.members.theirEmail"),
    role: t("manage.members.role"),
    roleAdult: t("role.adult"),
    roleHelper: t("role.househelper"),
    roleAdmin: t("role.admin"),
    ownerOnly: t("manage.members.ownerOnly"),
    creatingInvite: t("manage.members.creatingInvite"),
    createInvite: t("manage.members.createInvite"),
    addChild: t("manage.members.addChild"),
    addChildLede: t("manage.members.addChildLede"),
    dateOfBirth: t("manage.members.dateOfBirth"),
    dateOfBirthHint: t("manage.members.dateOfBirthHint"),
    addChildSubmit: t("manage.members.addChildSubmit"),
    adding: t("common.adding"),
    addHelper: t("manage.members.addHelper"),
    addHelperLede: t("manage.members.addHelperLede"),
    addHelperSubmit: t("manage.members.addHelperSubmit"),
    addPet: t("family.addAPet"),
    addPetLede: t("manage.members.addPetLede"),
    petName: t("manage.members.petName"),
    species: t("family.fact.species"),
    speciesPlaceholder: t("manage.members.speciesPlaceholder"),
    petDateOfBirth: t("manage.members.petDateOfBirth"),
    vetName: t("manage.members.vetName"),
    vetContact: t("manage.members.vetContact"),
    notes: t("manage.members.notes"),
    notesPlaceholder: t("manage.members.notesPlaceholder"),
    addPetSubmit: t("family.addPet"),
    gender: genderFieldLabels(t),
  };
}

export function pendingInvitationLabels(t: Translate): PendingInvitationLabels {
  return {
    title: t("manage.members.pending"),
    empty: t("manage.members.pendingEmpty"),
    expired: t("manage.members.expired"),
    expires: t("manage.members.expires", { date: "{date}" }),
    revoke: t("manage.members.revoke"),
    revoking: t("manage.members.revoking"),
  };
}
