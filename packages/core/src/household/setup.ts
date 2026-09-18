/**
 * Household setup: how much WonderHome has been told, and what to tell it next.
 *
 * Shown to the Head of Family and administrators, prominently for their first
 * week and quietly afterwards until it reads 100%. The number is arithmetic
 * over facts the household can see — a step is done when the data exists,
 * never when a box was ticked — so reaching 100% is an achievement that means
 * something: WonderHome now knows enough to keep watch over every domain.
 *
 * Steps that do not apply (no children, no helper) are left out of the total
 * rather than counted against it. A household without children is not
 * incomplete; it is complete differently.
 */

export type SetupFacts = {
  householdName: string;
  timezone: string;
  /** Active members, the head included. */
  members: number;
  children: number;
  childrenWithBirthdays: number;
  childrenWithGuardians: number;
  helpers: number;
  helperAvailabilityWindows: number;
  responsibilities: number;
  playbookItems: number;
  policies: number;
  homeAssets: number;
  pets: number;
  obligations: number;
  foodPreferences: number;
  recipes: number;
  schoolEnrolments: number;
  familyEvents: number;
};

export type SetupStepKey =
  | "basics"
  | "people"
  | "children"
  | "guardians"
  | "helper_hours"
  | "responsibilities"
  | "playbook"
  | "policies"
  | "home"
  | "bills"
  | "meals"
  | "school"
  | "family_time";

export type SetupStep = {
  key: SetupStepKey;
  title: string;
  /** What WonderHome can do once this is known — the reason to bother. */
  why: string;
  href: string;
  /** Which domain colour and icon the row carries. */
  tone: "primary" | "people" | "school" | "home" | "money" | "meals" | "care" | "ai";
  weight: number;
  done: boolean;
};

type Definition = Omit<SetupStep, "done"> & {
  applies: (facts: SetupFacts) => boolean;
  isDone: (facts: SetupFacts) => boolean;
};

const always = () => true;

const DEFINITIONS: readonly Definition[] = [
  {
    key: "basics",
    title: "Name your household and set its time zone",
    why: "Routines, reminders and quiet hours follow the household's own clock.",
    href: "/settings",
    tone: "primary",
    weight: 1,
    applies: always,
    isDone: (facts) => facts.householdName.trim().length > 0 && facts.timezone.trim().length > 0,
  },
  {
    key: "people",
    title: "Invite the family",
    why: "Everyone gets their own view, and nothing is asked of the wrong person.",
    href: "/household/members",
    tone: "people",
    weight: 2,
    applies: always,
    isDone: (facts) => facts.members >= 2,
  },
  {
    key: "children",
    title: "Add each child's date of birth",
    why: "Age-appropriate access and privacy depend on it, and it is never stored as an age.",
    href: "/household/members",
    tone: "people",
    weight: 1,
    applies: (facts) => facts.children > 0,
    isDone: (facts) => facts.childrenWithBirthdays >= facts.children,
  },
  {
    key: "guardians",
    title: "Say who is a guardian for each child",
    why: "School work and a child's calendar are visible to their guardians and nobody else.",
    href: "/household/members",
    tone: "school",
    weight: 1,
    applies: (facts) => facts.children > 0,
    isDone: (facts) => facts.childrenWithGuardians >= facts.children,
  },
  {
    key: "helper_hours",
    title: "Set your househelper's usual hours",
    why: "WonderHome notices an absence only because it knows the pattern.",
    href: "/househelper",
    tone: "care",
    weight: 1,
    applies: (facts) => facts.helpers > 0,
    isDone: (facts) => facts.helperAvailabilityWindows > 0,
  },
  {
    key: "responsibilities",
    title: "Say who looks after what",
    why: "An outcome with an owner has somebody to ask; one without is a gap WonderHome can show you.",
    href: "/household/responsibilities",
    tone: "primary",
    weight: 2,
    applies: always,
    isDone: (facts) => facts.responsibilities > 0,
  },
  {
    key: "playbook",
    title: "Describe how the home should run",
    why: "“Laundry ready by Sunday evening” is an outcome WonderHome can keep watch over.",
    href: "/household#playbook",
    tone: "home",
    weight: 2,
    applies: always,
    isDone: (facts) => facts.playbookItems > 0,
  },
  {
    key: "policies",
    title: "Set a spending or approval policy",
    why: "Until then WonderHome asks before anything consequential — safe, but slower.",
    href: "/household#policies",
    tone: "money",
    weight: 1,
    applies: always,
    isDone: (facts) => facts.policies > 0,
  },
  {
    key: "home",
    title: "Add an appliance or a pet",
    why: "Service dates, warranties and pet care become due dates instead of surprises.",
    href: "/household/home",
    tone: "home",
    weight: 1,
    applies: always,
    isDone: (facts) => facts.homeAssets > 0 || facts.pets > 0,
  },
  {
    key: "bills",
    title: "Add a recurring bill",
    why: "A paid bill produces the next one, and an unusual amount gets a second look.",
    href: "/bills",
    tone: "money",
    weight: 1,
    applies: always,
    isDone: (facts) => facts.obligations > 0,
  },
  {
    key: "meals",
    title: "Tell WonderHome what the family eats",
    why: "A preference or a recipe is enough for meal plans that nobody has to correct.",
    href: "/meals",
    tone: "meals",
    weight: 1,
    applies: always,
    isDone: (facts) => facts.foodPreferences > 0 || facts.recipes > 0,
  },
  {
    key: "school",
    title: "Add each child's school",
    why: "Homework, exams and notices land against the right child.",
    href: "/school",
    tone: "school",
    weight: 1,
    applies: (facts) => facts.children > 0,
    isDone: (facts) => facts.schoolEnrolments >= facts.children,
  },
  {
    key: "family_time",
    title: "Put one family moment on the calendar",
    why: "Protected time is a promise WonderHome will never schedule over.",
    href: "/family",
    tone: "people",
    weight: 1,
    applies: always,
    isDone: (facts) => facts.familyEvents > 0,
  },
];

export type SetupAssessment = {
  /** 0–100, weighted, over the steps that apply to this household. */
  percent: number;
  done: number;
  total: number;
  complete: boolean;
  steps: SetupStep[];
  /** The best things to do next, undone and in order. */
  next: SetupStep[];
  /** A word for where the household stands. Changes as the number does. */
  milestone: string;
};

export function assessSetup(facts: SetupFacts): SetupAssessment {
  const steps = DEFINITIONS.filter((definition) => definition.applies(facts)).map(
    ({ applies: _applies, isDone, ...step }) => ({ ...step, done: isDone(facts) }),
  );

  const totalWeight = steps.reduce((sum, step) => sum + step.weight, 0);
  const doneWeight = steps.filter((step) => step.done).reduce((sum, step) => sum + step.weight, 0);
  const percent = totalWeight === 0 ? 100 : Math.round((doneWeight / totalWeight) * 100);
  const done = steps.filter((step) => step.done).length;

  return {
    percent,
    done,
    total: steps.length,
    complete: done === steps.length,
    steps,
    next: steps.filter((step) => !step.done).slice(0, 3),
    milestone: milestoneFor(percent),
  };
}

export function milestoneFor(percent: number): string {
  if (percent >= 100) return "Fully set up";
  if (percent >= 75) return "Nearly there";
  if (percent >= 50) return "Halfway there";
  if (percent >= 25) return "Good start";
  return "Just getting started";
}

export const SETUP_WEEK_DAYS = 7;

export type SetupWindow = {
  /** Whether the setup section should take the top of the home screen. */
  prominent: boolean;
  /** Whole days left in the prominent week, 0 once it has passed. */
  daysLeft: number;
};

/**
 * Whose week it is (the "prominently for a week after first login" rule).
 *
 * The week runs from the later of this person's first sign-in and the moment
 * they became head or administrator, so an adult promoted a month in still
 * gets their week of guidance. A person who has never signed in before is,
 * by definition, in it.
 */
export function setupWindow(input: {
  firstSeenAt: string | Date | null | undefined;
  adminSince: string | Date | null | undefined;
  now?: Date;
  days?: number;
}): SetupWindow {
  const now = input.now ?? new Date();
  const days = input.days ?? SETUP_WEEK_DAYS;

  if (!input.firstSeenAt) return { prominent: true, daysLeft: days };

  const starts = [input.firstSeenAt, input.adminSince]
    .filter((value): value is string | Date => value !== null && value !== undefined)
    .map((value) => new Date(value).getTime())
    .filter((time) => !Number.isNaN(time));
  const from = Math.max(...starts);
  const until = from + days * 86_400_000;
  const remaining = until - now.getTime();

  return {
    prominent: remaining > 0,
    daysLeft: remaining > 0 ? Math.ceil(remaining / 86_400_000) : 0,
  };
}
