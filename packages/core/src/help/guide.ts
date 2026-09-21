/**
 * The user guide, as data.
 *
 * Written here rather than as markup in a page for two reasons. The guide
 * needs to be searchable by the assistant on the help screen, and an answer
 * has to be able to point at the exact section it came from — both of which
 * need structure, not prose in JSX. And keeping it in one place means the
 * guide and the FAQ cannot drift apart, because the FAQ answers *are* links
 * into these sections.
 *
 * Everything here describes what WonderHome actually does today. Where a
 * capability is not built, the guide says so plainly and says what happens
 * instead — the same rule the product's screens follow. A guide that
 * describes the roadmap is a guide that makes people feel the software is
 * broken.
 */

export type GuideSection = {
  /** Anchors the URL, so an answer can link to `/help#outcomes`. */
  id: string;
  title: string;
  /** One line under the heading. */
  summary: string;
  /** Paragraphs. Plain text — the page renders them, the search reads them. */
  body: string[];
  /** Extra words people might search with that the body does not contain. */
  keywords: string[];
  group: GuideGroup;
};

export const GUIDE_GROUPS = [
  "Getting started",
  "Everyday use",
  "Your household",
  "Privacy and trust",
] as const;
export type GuideGroup = (typeof GUIDE_GROUPS)[number];

export const GUIDE: GuideSection[] = [
  {
    id: "what-wonderhome-is",
    title: "What WonderHome is",
    summary: "The family runs the home. WonderHome manages the managing.",
    group: "Getting started",
    keywords: ["about", "purpose", "overview", "what is", "intro", "mental load"],
    body: [
      "WonderHome watches the parts of running a home that usually live in somebody's head: when the bills fall due, whether a child's project is going to fit before Thursday, whether the milk runs out before Sunday, who is actually free on Saturday.",
      "It manages outcomes rather than task lists. Nobody is asked to tick off normal household work, and a routine that is running fine is silent by design. If a screen is quiet, that is the product working — not the product missing something.",
      "What you will be asked about is the small number of things that genuinely need a person: a decision, an approval, a fact only you know.",
    ],
  },
  {
    id: "first-week",
    title: "Setting up in your first week",
    summary: "A progress ring on Home, and the next three things worth telling it.",
    group: "Getting started",
    keywords: ["setup", "onboarding", "get started", "progress", "checklist", "100%"],
    body: [
      "If you are an Admin, Home shows a setup card for your first week. It has a progress ring, where your household stands in a word, and the next three steps — each with the reason it is worth doing.",
      "The percentage is arithmetic over facts that exist: a bill added, a responsibility assigned, a child's date of birth recorded. It is not a count of ticked boxes, and steps that do not apply to your household are left out of the total. A home with no children or helper can still reach 100%.",
      "After the first week the card shrinks to a single quiet row, and it disappears entirely once you reach 100%. The full checklist always lives on Manage household.",
    ],
  },
  {
    id: "household-and-roles",
    title: "Members, roles and what each person sees",
    summary: "One household, several identities, and a different view for each.",
    group: "Your household",
    keywords: ["invite", "member", "role", "permission", "head of family", "administrator", "child", "helper", "guardian"],
    body: [
      "The person who creates the household is its owner and Admin. They can designate other Admins, who can do nearly everything they can.",
      "Adults, children and househelpers each get their own view. This is not a filter applied in the browser: a section somebody may not see is never sent to their device, and the server and the database both check again independently.",
      "Children get age-appropriate access. A child's school work is visible to that child, to their guardians and to administrators — living in the same house is not by itself enough.",
      "Househelpers are never asked to update chores. Their profile records the hours they normally work, so WonderHome can notice an absence, and holds no productivity data at all.",
    ],
  },
  {
    id: "talk-to-wonderhome",
    title: "Talking to WonderHome",
    summary: "Voice and text are the same conversation, and it never claims to have acted.",
    group: "Everyday use",
    keywords: ["ai", "assistant", "chat", "voice", "speak", "microphone", "ask", "command"],
    body: [
      "The assistant takes voice or text, and they are the same conversation — the microphone is just another way in. Speech uses your browser's own recognition, and where that is missing or refused, it says so instead of pretending to listen.",
      "Anything consequential comes back as a plan before it happens: what WonderHome understood, what it intends to do, what that would affect, and Confirm, Change or Cancel. Saying yes approves that specific proposal, and only for ten minutes — a stale yes gets a question rather than an action.",
      "If a request was heard poorly and it matters, the assistant reads it back rather than acting on a guess. And it never says it did something unless a governed tool actually did it; where it only prepared something, it says prepared.",
    ],
  },
  {
    id: "today-and-home",
    title: "Home and Today",
    summary: "What needs you now, and the shape of the day.",
    group: "Everyday use",
    keywords: ["dashboard", "home screen", "today", "agenda", "timeline", "needs you", "handled"],
    body: [
      "Home leads with what needs a person, then what WonderHome handled quietly. The handled count is things it checked and found fine — the number is real, not decorative.",
      "Today is the day as a timeline, in three views: your day, the family's, and the household's. Items are commitments and deadlines — a meal that has to be ready, a bill due, a class — never chores to tick off.",
    ],
  },
  {
    id: "outcomes",
    title: "Outcomes, responsibilities and the playbook",
    summary: "Describe the home you want, not the steps to get there.",
    group: "Your household",
    keywords: ["outcome", "responsibility", "playbook", "routine", "policy", "owner", "who does what"],
    body: [
      "The playbook is the home you want in your own words — \"laundry ready by Sunday evening\" — rather than the steps. WonderHome plans around it.",
      "Responsibilities say who looks after what. An outcome with an owner has somebody to ask; one without is a gap, and showing you that gap is one of the more useful things the matrix does.",
      "Policies cover spending limits, who approves what, quiet hours and privacy. Until you set them, WonderHome asks before anything consequential — safe, but slower.",
    ],
  },
  {
    id: "ai-autonomy",
    title: "How much WonderHome may do on its own",
    summary: "Four levels, set per responsibility, and you choose them.",
    group: "Privacy and trust",
    keywords: ["autonomy", "permission", "approve", "execute", "automation", "control", "ai settings"],
    body: [
      "Each responsibility carries an autonomy level: observe, prepare, ask approval, or execute. It is set by you, per responsibility, and it is the server that enforces it — not the screen.",
      "Sensitive actions need approval regardless, and paying money needs you to re-authenticate at the moment you approve. Being signed in says who is asking; step-up says that this person, right now, agreed to this specific thing.",
    ],
  },
  {
    id: "bills",
    title: "Bills and money",
    summary: "What is due, whose it is, and whether it looks unusual.",
    group: "Everyday use",
    keywords: ["bill", "payment", "money", "finance", "due", "overdue", "budget", "anomaly", "pay"],
    body: [
      "A bill often exists before its amount does — the electricity is due monthly whether or not this month's figure has arrived — so WonderHome tracks it either way.",
      "An unusual amount is raised as something to look at, with the comparison attached, so you can check the claim rather than take it on trust. It is never an automatic block: a bill that genuinely is three times the usual is exactly the one you most need paid on time.",
      "No payment provider is connected yet. Pay prepares a payment for approval and stops there — it does not move money.",
      "Money is visible to adults and administrators. Children and helpers never see it.",
    ],
  },
  {
    id: "school",
    title: "School and children's work",
    summary: "Deadlines that will not fit, and notices that ask something.",
    group: "Everyday use",
    keywords: ["school", "homework", "exam", "child", "study", "deadline", "portal", "teacher"],
    body: [
      "School work is modelled in WonderHome's own shape rather than any portal's, so changing schools changes an adapter and nothing else.",
      "A connector can never mark work done. A portal going quiet is not a child saying they finished, and only a person's own confirmation records a completion.",
      "Where a school portal is connected and stops working, the screen says so. An empty homework list and a broken connection must never look alike.",
    ],
  },
  {
    id: "meals-and-shopping",
    title: "Meals, groceries and running out of things",
    summary: "A consumption rate with evidence, not a pantry count you maintain.",
    group: "Everyday use",
    keywords: ["meal", "recipe", "grocery", "shopping", "cart", "pantry", "food", "allergy", "run out"],
    body: [
      "WonderHome does not keep an inventory, because an inventory needs somebody to keep it accurate and that is the work this product exists not to create. It keeps a rate — how quickly something is used — and the evidence behind it.",
      "Every shopping suggestion can answer \"why do you think we need this?\". A suggestion that cannot is one you would rightly stop trusting.",
      "A meal is a readiness outcome: the family eats at the time they need to. There is no preparation step anybody ticks off. Food preferences record whose they are, so one person's dislike never quietly becomes a house rule.",
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    summary: "Precise, to one person, with something they can actually do.",
    group: "Everyday use",
    keywords: ["notification", "alert", "reminder", "quiet hours", "push", "notify"],
    body: [
      "A notification names one recipient, gives a reason, and offers something to do about it. Related ones are grouped and threaded, and they resolve themselves when the underlying thing is handled.",
      "An event on its own never interrupts anybody — something has to actually need a person. Quiet hours are set per channel in Settings.",
    ],
  },
  {
    id: "certification",
    title: "Belief Review: what WonderHome believes",
    summary: "Everything it thinks it knows, with where each belief came from.",
    group: "Privacy and trust",
    keywords: ["belief review", "certification", "understanding", "belief", "correct", "source", "confidence", "wrong"],
    body: [
      "Belief Review shows what WonderHome believes about your household and where each belief came from — you told it, it observed it, or a provider said so.",
      "Anything it has wrong, you can correct. The percentage is confirmed beliefs over live ones: arithmetic you can check, not a model's opinion of itself.",
    ],
  },
  {
    id: "connections",
    title: "Connected accounts",
    summary: "Calendars, school, mail and shopping — none of them live yet.",
    group: "Privacy and trust",
    keywords: ["integration", "connect", "calendar", "email", "provider", "sync", "google", "portal"],
    body: [
      "The connector framework is built and so are the calendar, mail and school connectors, but no provider is live. A provider counts as live only once its credentials, consent flow and integration tests exist, and until then WonderHome says so rather than offering a button that does nothing.",
      "A connection never holds your credential. What is stored is a pointer to where the credential lives, never the credential itself.",
      "Imported events are never marked as protected family time and never marked confirmed — those are yours to decide. A private calendar entry arrives as time only, with no title and no location.",
    ],
  },
  {
    id: "privacy",
    title: "Privacy and your data",
    summary: "What is held, who can see it, and what is never done with it.",
    group: "Privacy and trust",
    keywords: ["privacy", "data", "security", "training", "delete", "export", "gdpr", "rls"],
    body: [
      "Your household's data is not used to train models by default.",
      "Who can see what is decided on the server and again by the database. A screen hiding something is presentation; it is never the thing keeping it private.",
      "Data export and account deletion are not built yet. They are listed in Settings as coming rather than as buttons that do nothing.",
    ],
  },
  {
    id: "ai-key",
    title: "Which model powers the assistant",
    summary: "Ours by default; yours if you would rather.",
    group: "Privacy and trust",
    keywords: ["api key", "byok", "anthropic", "openai", "gemini", "model", "billing", "own key"],
    body: [
      "WonderHome runs the assistant on its own key, so you do not need an account with a model provider.",
      "If you would rather the requests were billed to you and covered by your own agreement with the provider, an administrator can set your household's own key in Settings. Yours then takes precedence.",
      "A key you set can never be read back out — not by us, not by you. You can replace it or remove it, but the value only ever travels one way.",
    ],
  },
  {
    id: "accounts",
    title: "Signing in and passwords",
    summary: "Email and password, a reset link, and Google where it is switched on.",
    group: "Getting started",
    keywords: ["sign in", "login", "password", "forgot", "reset", "google", "account", "locked out"],
    body: [
      "Forgot your password? Use the link on the sign-in screen. WonderHome emails a link that works once and expires in an hour, and the reply is the same whether or not the address has an account — so the screen cannot be used to find out who has one.",
      "Both password fields have a reveal button if you want to check what you typed.",
      "Google sign-in appears where the deployment has it configured. Where it does not, the button is absent rather than present and broken.",
    ],
  },
];

export type FaqEntry = {
  question: string;
  answer: string;
  /** The guide section that covers it in full. */
  section: string;
};

export const FAQ: FaqEntry[] = [
  {
    question: "Why is my Home screen so quiet?",
    answer:
      "Because nothing needs you. Routines that are running fine are silent on purpose — WonderHome speaks up when something genuinely needs a person, not to prove it is working.",
    section: "what-wonderhome-is",
  },
  {
    question: "Do I have to tick things off?",
    answer:
      "No. There is no chore checklist anywhere in WonderHome, and a househelper is never asked to update one. It tracks outcomes — whether the home is in the state you wanted — not steps.",
    section: "outcomes",
  },
  {
    question: "Can WonderHome spend money without asking?",
    answer:
      "No. No payment provider is connected, so nothing can move money at all today. Even once one is, paying needs your approval and a re-authentication at the moment you approve.",
    section: "bills",
  },
  {
    question: "Can my children see the household's bills?",
    answer:
      "No. Money is visible to adults and administrators only, and that is enforced by the server and the database rather than by hiding it on screen.",
    section: "household-and-roles",
  },
  {
    question: "Is my family's data used to train AI models?",
    answer: "No, not by default.",
    section: "privacy",
  },
  {
    question: "I forgot my password. What now?",
    answer:
      "Use \"Forgot password?\" on the sign-in screen. The link that arrives works once and expires in an hour.",
    section: "accounts",
  },
  {
    question: "Why can't I connect my Google Calendar yet?",
    answer:
      "The calendar connector is built, but no provider is live. A provider counts as live only once its credentials, consent flow and integration tests exist — until then WonderHome tells you so rather than offering a button that goes nowhere.",
    section: "connections",
  },
  {
    question: "Can I use my own AI provider account?",
    answer:
      "Yes. An administrator can set your household's own key in Settings, and it takes precedence over WonderHome's.",
    section: "ai-key",
  },
  {
    question: "Why did WonderHome say \"prepared\" instead of \"done\"?",
    answer:
      "Because it prepared the action rather than performing it. It never claims to have done something unless a governed tool actually did it.",
    section: "talk-to-wonderhome",
  },
  {
    question: "How do I get to 100% setup?",
    answer:
      "Manage household lists every step. Steps that do not apply to your home — no children, no helper — are left out of the total, so 100% is reachable for every household.",
    section: "first-week",
  },
];

/** Every section grouped for rendering, in the order the groups are declared. */
export function guideByGroup(): { group: GuideGroup; sections: GuideSection[] }[] {
  return GUIDE_GROUPS.map((group) => ({
    group,
    sections: GUIDE.filter((section) => section.group === group),
  })).filter((entry) => entry.sections.length > 0);
}
