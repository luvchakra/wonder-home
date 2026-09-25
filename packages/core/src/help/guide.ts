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
    keywords: ["about", "purpose", "overview", "what is", "intro", "mental load", "hometalk", "homebrain", "homesend"],
    body: [
      "WonderHome watches the parts of running a home that usually live in somebody's head: when the bills fall due, whether a child's project is going to fit before Thursday, whether the milk runs out before Sunday, who is actually free on Saturday.",
      "It manages outcomes rather than task lists. Nobody is asked to tick off normal household work, and a routine that is running fine is silent by design. If a screen is quiet, that is the product working — not the product missing something.",
      "Three names come up everywhere. HomeTalk is where you talk or type to WonderHome. HomeSend is how you hand it things — a photo, a PDF, a forwarded message. HomeBrain is the reasoning behind both: what WonderHome understood, and why.",
      "What you will be asked about is the small number of things that genuinely need a person: a decision, an approval, a fact only you know.",
    ],
  },
  {
    id: "first-week",
    title: "Setting up your household",
    summary: "A guided setup for the Admin, and a progress card on Home until it is done.",
    group: "Getting started",
    keywords: ["setup", "onboarding", "get started", "progress", "checklist", "100%", "wizard", "guided setup"],
    body: [
      "Whoever creates the household is walked through a guided setup: the household's basics, the adults, the children, pets and household help, a set of suggested responsibilities to review, and a few guided questions. Steps that do not apply — no children, no pets — are skipped.",
      "You can stop at any point. Home shows a Household setup card with a progress ring and the next step, and Continue picks up exactly where you left off.",
      "The percentage is arithmetic over facts that exist — a bill added, a responsibility assigned, a child's date of birth recorded — not a count of ticked boxes. Steps that do not apply to your household are left out of the total, so every household can reach 100%. The full checklist always lives on Manage household.",
      "Each person also gets a short, optional setup of their own for language and region, which they can finish later from Settings.",
    ],
  },
  {
    id: "accounts",
    title: "Signing in and passwords",
    summary: "Email and password, a reset link, and Google where it is switched on.",
    group: "Getting started",
    keywords: ["sign in", "login", "password", "forgot", "reset", "google", "account", "locked out", "log out", "sign out"],
    body: [
      "Forgot your password? Use the link on the sign-in screen. WonderHome emails a link that works once and expires in an hour, and the reply is the same whether or not the address has an account — so the screen cannot be used to find out who has one.",
      "Both password fields have a reveal button if you want to check what you typed.",
      "Google sign-in appears where it is switched on. Where it is not, the button is absent rather than present and broken.",
      "To sign out, open your account menu from your picture at the top of the screen, or use Sign out at the bottom of More.",
    ],
  },
  {
    id: "language",
    title: "Language, region and formats",
    summary: "Each person picks their language; the household sets its region, currency and time zone.",
    group: "Getting started",
    keywords: ["language", "hindi", "marathi", "arabic", "chinese", "mandarin", "中文", "singapore", "spanish", "french", "german", "translate", "region", "currency", "time zone", "date format", "units"],
    body: [
      "WonderHome speaks English, Hindi, Marathi, Spanish, French, German, Arabic and Chinese (Simplified, Mandarin). Each person chooses their own language in Settings → Language & Region, so one household can use several at once. Arabic reads right to left.",
      "The household's region, currency and time zone are set by an Admin, and each person can choose their own date format, 12- or 24-hour clock, and metric or imperial units.",
      "HomeTalk understands you in your language and replies in it. Names, items, dates and amounts are never translated or changed on the way. When a reply cannot be translated safely, you see it in English with a line saying why.",
      "Reminders arrive in each person's own language. Screens are moving to every language one at a time; where a screen is still in English, the Language & Region page says so.",
      "Changing your language never changes what is stored. An amount stays in the currency it was recorded in, and nothing is ever converted.",
    ],
  },
  {
    id: "talk-to-wonderhome",
    title: "HomeTalk",
    summary: "Talk or type — one conversation, and it never claims to have acted when it has not.",
    group: "Everyday use",
    keywords: ["ai", "assistant", "chat", "voice", "speak", "microphone", "ask", "command", "hometalk", "remind me", "reminder", "correct", "edit", "search messages"],
    body: [
      "HomeTalk is the assistant, raised in the middle of the tab bar. Typing and speaking are the same conversation — the microphone is just another way in.",
      "Anything consequential comes back as a plan before it happens: what WonderHome understood, what it intends to do, what that would affect, and Confirm, Change or Cancel. A yes approves that exact proposal and only for a short while; a stale or changed one gets a question instead of an action. Payments and changes to who can do what always ask.",
      "You can correct it the way you would a person: \"no, I meant Manan\", \"not milk, almond milk\", \"actually, make that Friday\". If the change had not happened yet, the proposal is replaced; if it had, WonderHome undoes it and makes the corrected one, and both steps stay on record.",
      "Several requests in one sentence are handled one by one. A later part that leans on an earlier one (\"…and remind me to buy them\") only goes ahead if the earlier part actually happened.",
      "\"Remind me to call the plumber tomorrow at 5\" sets a reminder for you alone, delivered when it is due. When someone is mentioned and two people could fit, HomeTalk asks which one rather than guessing.",
      "Edit your last message to rephrase it, and search your past conversations from the search box at the top. It never says it did something unless it actually did; where it only prepared something, it says prepared, and where nothing needed changing, it says so.",
    ],
  },
  {
    id: "voice",
    title: "Voice and hands-free conversation",
    summary: "Tap to speak and review, or talk back and forth hands-free.",
    group: "Everyday use",
    keywords: ["voice", "speech", "microphone", "hands-free", "live", "listen", "gemini live", "alexa", "speak out loud", "pause"],
    body: [
      "Tap the microphone and your words appear in the box for you to check before sending. Nothing is sent until you do.",
      "Live conversation is hands-free: WonderHome listens, answers out loud and keeps going until you end it, and you can pause and resume. It runs on WonderHome's own voice or, where your household has chosen it and it is available, on Gemini Live. The composer shows which one is answering and lets you switch.",
      "Settings → Voice chooses the speech service (your browser's own, or a more accurate one), the voice, and how it listens. Where a choice is not available to your household, it is shown with the reason rather than offered and broken.",
      "Voice assistants such as Alexa or Gemini Voice can be linked to one person from Settings → Voice assistants once they are available for your WonderHome. A linked assistant speaks as that person and sees only what they may see, and it can never pay or place an order.",
    ],
  },
  {
    id: "home-send",
    title: "HomeSend: sending WonderHome things",
    summary: "A photo, a PDF, a voice note, a link or a forward — read, then confirmed by you.",
    group: "Everyday use",
    keywords: ["homesend", "upload", "photo", "pdf", "screenshot", "forward", "email", "share", "paperclip", "school notice", "receipt", "whatsapp", "voice note", "link", "undo"],
    body: [
      "HomeSend takes photos, PDFs, text and CSV files, voice notes, links and pasted messages. Use the paperclip beside the microphone in HomeTalk, or the HomeSend screen, which also keeps an inbox of what is waiting for you.",
      "Install WonderHome on your phone (from your account menu or the HomeSend screen) and your phone's own Share button sends straight into HomeSend. A share started before you have signed in on that phone is picked up once you do.",
      "WonderHome reads the whole document — every date of a series, every fee, every thing to buy — and shows what it found against what is already on record: something new to add, an existing entry to update, one to cancel, or nothing to change. Nothing is written until you confirm, and you can edit each item or leave it out.",
      "Bills, health documents and receipts always wait for a person, however clear they look. Clear, new groceries and school items may apply on their own only where your household has allowed that, and they come with an Undo.",
      "Anything WonderHome cannot read is kept under \"Failed safely\", where you can fill it in by hand or dismiss it — it is never quietly dropped. Instructions hidden inside something you send are ignored, and the screen tells you so.",
      "Every change HomeSend makes can be undone from \"Recently handled\", one item at a time or a whole document at once. Where your household has them set up, a forwarding email address and WhatsApp feed the same inbox.",
    ],
  },
  {
    id: "today-and-home",
    title: "Home and Today",
    summary: "What needs you now, and the shape of the day.",
    group: "Everyday use",
    keywords: ["dashboard", "home screen", "today", "agenda", "timeline", "needs you", "handled", "plan something", "swipe"],
    body: [
      "Home leads with what needs a person, then what WonderHome handled quietly. The handled count is things it checked and found fine — the number is real, not decorative. Each card opens to the entries behind its count.",
      "Today is the day as a timeline, in three views: your day, the family's, and the household's. Items are commitments and deadlines — a meal that has to be ready, a bill due, a class — never chores to tick off. The household view also looks ahead two weeks at what is likely to run out or fall due.",
      "Plan something, on Home and Today, adds a family event without leaving the screen.",
      "On a phone, swipe left or right to move between Home, Today, HomeTalk, Family and More.",
    ],
  },
  {
    id: "notifications",
    title: "Reminders and notifications",
    summary: "About real things, to one person, when it suits them — and quiet once handled.",
    group: "Everyday use",
    keywords: ["notification", "alert", "reminder", "quiet hours", "push", "notify", "snooze", "remind me later", "summary", "timing"],
    body: [
      "Every reminder is about something real — an unpaid bill, school work due, a meal to start, the grocery list, pet care, a family plan — and goes to one person: whoever owns it, then the responsibility's owner, a child's guardian, the backup, then the Admin. It resolves itself as soon as the thing itself is handled.",
      "A child's school things due on the same day arrive as one reminder. If a reminder that matters goes unanswered, its backup hears about it once, and nothing repeats beyond a sensible limit.",
      "\"Remind me later\" snoozes for 15 minutes, an hour, later today, tomorrow morning, or a day and time you pick. You can mark a reminder done or dismiss it; you cannot change what it says.",
      "Settings → Notifications sets when each kind arrives — for bills, for example, three days before and on the due day, or a week before — along with quiet hours and the day's summary. \"Learn when I usually act\" is off unless you turn it on; it moves a first reminder only after five similar actions, and never overrides the timing or quiet hours you chose.",
      "Reminders appear in the app. Other channels show whether they are connected for your WonderHome; where one is not yet, your choice is saved for when it is.",
    ],
  },
  {
    id: "bills",
    title: "Bills and money",
    summary: "What is due, whose it is, and whether it looks unusual.",
    group: "Everyday use",
    keywords: ["bill", "payment", "money", "finance", "due", "overdue", "budget", "anomaly", "pay", "transaction", "currency"],
    body: [
      "A bill often exists before its amount does — the electricity is due monthly whether or not this month's figure has arrived — so WonderHome tracks it either way. Amounts are entered and shown as you would write them, 42.50 rather than 4250.",
      "Each bill and transaction keeps its own currency; it starts as your household's currency and is never converted. The Transactions tab records what was paid, period by period, and each entry can be edited or removed.",
      "An unusual amount is raised as something to look at, with the comparison attached, so you can check the claim rather than take it on trust. It is never an automatic block: a bill that genuinely is three times the usual is exactly the one you most need paid on time.",
      "Paying from inside WonderHome is not available yet. Pay prepares a payment for your approval in HomeTalk and stops there — it does not move money.",
      "Money is visible to adults and administrators. Children and helpers never see it.",
    ],
  },
  {
    id: "school",
    title: "School and children's work",
    summary: "Homework, exams and notices, and deadlines that will not fit.",
    group: "Everyday use",
    keywords: ["school", "homework", "exam", "child", "study", "deadline", "portal", "teacher", "screenshot", "notice"],
    body: [
      "Kids & School shows each child's homework, exams, events and teacher updates, grouped by when they are due. Add homework by hand, or upload a screenshot and WonderHome fills in the form for you to check before adding.",
      "Send a school notice through HomeSend and every date, fee and thing to bring becomes its own item to review. If the notice names a child who is not in your household yet, an Admin can add them right there in the review; WonderHome never assumes a notice is about the only child it knows.",
      "Only a person can mark work done. A portal going quiet is not a child saying they finished.",
      "A child's school work is visible to that child, their guardians and administrators — living in the same house is not by itself enough.",
    ],
  },
  {
    id: "meals-and-shopping",
    title: "Meals, groceries and running out of things",
    summary: "A consumption rate with evidence, not a pantry count you maintain.",
    group: "Everyday use",
    keywords: ["meal", "recipe", "grocery", "shopping", "cart", "pantry", "food", "allergy", "run out", "nutrients", "receipt", "suggest", "preferences"],
    body: [
      "WonderHome does not keep an inventory, because an inventory needs somebody to keep it accurate. It keeps a rate — how quickly something is used — and the evidence behind it, and predicts when it will run out.",
      "Send a receipt through HomeSend and each line you keep becomes purchase history for that item, which sharpens the prediction. Lines it cannot match to something you track are yours to match, start tracking or skip; it never guesses.",
      "Every shopping suggestion can answer \"why do you think we need this?\". Ordering from a shop is not available yet, so nothing is ever bought on your behalf.",
      "Meals has a plan, your recipes, and preferences. A recipe can carry rough nutrients per serving. Suggest proposes a meal from what you have and what people like, and missing ingredients go on the shopping list.",
      "Preferences record whose they are — a dislike, an allergy, a medical or ethical choice — so one person's dislike never quietly becomes a house rule. An allergy always wins.",
    ],
  },
  {
    id: "health",
    title: "Health and fitness",
    summary: "Records, vitals and routines, private to each person unless they share them.",
    group: "Everyday use",
    keywords: ["health", "fitness", "vitals", "weight", "blood pressure", "checkup", "appointment", "prescription", "medical record", "routine", "private"],
    body: [
      "Health & Fitness keeps each adult's issues, checkups, appointments, vitals (weight, blood pressure, steps and more, or your own measurement), health records such as lab results and prescriptions, fitness goals and routines. It shows what needs attention and what is coming up — never a health score.",
      "Health information is private to its person by default. They can share it with people they choose, or share only the practical part with the whole household (\"unavailable 5–6pm\"), and take it back at any time. Being in the same household never by itself gives anyone access. A guardian can always see their child's.",
      "Whether HomeBrain may consider a person's health information at all is a separate switch on the Privacy tab, and even then nothing is shown to anyone the sharing setting excludes. Health documents sent through HomeSend always wait for a person to confirm.",
    ],
  },
  {
    id: "home-upkeep",
    title: "Home and upkeep",
    summary: "Maintenance, services, laundry and pets — only what needs a person.",
    group: "Everyday use",
    keywords: ["maintenance", "appliance", "repair", "service", "laundry", "pets", "weather", "upkeep", "device"],
    body: [
      "Home & Upkeep brings together maintenance, service requests, laundry and pet care, and shows only what needs somebody. When nothing does, it says so.",
      "An Admin records the home's appliances; any adult can raise a service request.",
      "Weather speaks only when it changes a decision — washing that will not dry outside today, for example — and never as a forecast readout. It uses the area an Admin chose, kept only to about a kilometre.",
    ],
  },
  {
    id: "household-and-roles",
    title: "Members, roles and what each person sees",
    summary: "One household, several identities, and a different view for each.",
    group: "Your household",
    keywords: ["invite", "member", "role", "permission", "head of family", "administrator", "admin", "child", "helper", "guardian", "remove member"],
    body: [
      "The person who creates the household is its owner and Admin. They can make other people Admins, who can do nearly everything they can.",
      "Adults, children and househelpers each get their own view. This is not a filter applied on the screen: a section somebody may not see is never sent to their device at all, and WonderHome checks again behind the scenes every time.",
      "Children get age-appropriate access. Househelpers are never asked to update chores, and WonderHome holds no productivity data about them.",
      "Admins invite, change and remove members from Manage household. Removing someone never deletes the history they were part of.",
    ],
  },
  {
    id: "family",
    title: "Family, pets and family time",
    summary: "Everyone in one place, pets included, and time kept free for each other.",
    group: "Your household",
    keywords: ["family", "pets", "profile", "photo", "family calls me", "event", "birthday", "protected time", "gift", "calendar"],
    body: [
      "Family lists everyone, with each person's details a tap away. You edit your own profile and photo in Settings; an Admin can edit anyone's. \"Family calls me\" records what the family calls a person — Dad, Nani — so WonderHome can talk about people the way you do.",
      "Pets are part of the family here, with their own care tracked alongside everyone else's.",
      "Family events — birthdays, outings, visits, appointments — can be marked as protected time, and WonderHome never schedules over them. Things that need a reply, such as a clash or a gift still to sort, are listed until they are settled.",
    ],
  },
  {
    id: "househelp",
    title: "Household help",
    summary: "Who helps at home, when they are expected, and cover when they are away.",
    group: "Your household",
    keywords: ["househelper", "helper", "maid", "cook", "driver", "schedule", "leave", "absence", "away", "cover", "backup"],
    body: [
      "Househelper records who helps at home — regularly, occasionally, or as a visiting service — and their usual days and hours.",
      "Record a day away or an extra day, and WonderHome checks what they normally handle that day and shows what needs cover, with a way to arrange it.",
      "Househelpers are never asked to tick off chores, and there are no productivity scores.",
    ],
  },
  {
    id: "outcomes",
    title: "Outcomes, responsibilities and the playbook",
    summary: "Describe the home you want, not the steps to get there.",
    group: "Your household",
    keywords: ["outcome", "responsibility", "playbook", "routine", "policy", "owner", "who does what", "backup", "workload"],
    body: [
      "The playbook is the home you want in your own words — \"laundry ready by Sunday evening\" — rather than the steps. WonderHome plans around it.",
      "Responsibilities say who looks after what, and who covers when they cannot. An outcome with an owner has somebody to ask; one without is a gap, and WonderHome shows you the gaps and where the load sits unevenly.",
      "Policies cover spending limits, who approves what, quiet hours and privacy. Until you set them, WonderHome asks before anything consequential — safe, but slower.",
    ],
  },
  {
    id: "plan",
    title: "Your plan",
    summary: "Free, Pro and Max — and free to switch during early access.",
    group: "Your household",
    keywords: ["plan", "subscription", "pro", "max", "free", "price", "upgrade", "downgrade", "billing", "invoice", "trial"],
    body: [
      "Settings → Your plan shows the plans, what each includes, and your household's usage this period. Free covers the household basics; Pro adds school, shopping, meals, bills and family time; Max adds more autonomous action and deeper connections.",
      "During early access, switching plans is free and nothing is charged. Prices are shown monthly or yearly so you know what to expect later.",
      "Something that is not part of your plan says so where it would appear, rather than offering a button that does nothing. If a feature is part of a trial, Settings tells you.",
    ],
  },
  {
    id: "ai-autonomy",
    title: "How much WonderHome may do on its own",
    summary: "Four levels, set per responsibility, and you choose them.",
    group: "Privacy and trust",
    keywords: ["autonomy", "permission", "approve", "execute", "automation", "control", "ai settings"],
    body: [
      "Each responsibility carries an autonomy level: observe, prepare, ask approval, or execute. It is set by you, per responsibility, and WonderHome enforces it behind the scenes — not just on the screen.",
      "Sensitive actions need approval regardless, and paying money needs you to confirm it is you at the moment you approve.",
    ],
  },
  {
    id: "certification",
    title: "HomeBrain Review and asking \"why?\"",
    summary: "Everything WonderHome believes, where each belief came from, and how to fix it.",
    group: "Privacy and trust",
    keywords: ["belief review", "certification", "understanding", "belief", "correct", "source", "confidence", "wrong", "why", "homebrain", "explain"],
    body: [
      "HomeBrain Review shows what WonderHome believes about your household and where each belief came from — you told it, it observed it, or something you sent said so. Anything it has wrong, you can correct, add or remove.",
      "Ask HomeTalk \"why?\" — why it needs approval, why it did not do something, where a fact came from — and the answer comes from what is actually on record, not from a guess.",
      "Answers are checked before you see them. A name, date, amount or event that is not on record is never stated as fact; if nothing is on record, WonderHome says so.",
    ],
  },
  {
    id: "privacy",
    title: "Privacy and your data",
    summary: "What is held, who can see it, and how to take it with you or have it deleted.",
    group: "Privacy and trust",
    keywords: ["privacy", "data", "security", "training", "delete", "export", "download", "gdpr", "consent"],
    body: [
      "Your household's data is not used to train models by default.",
      "Who can see what is decided behind the scenes, before anything reaches a device. A screen hiding something is presentation; it is never the thing keeping it private.",
      "Settings → Privacy & security lets you download a copy of your data after confirming your password. You can also ask for your data to be deleted: there is a 30-day countdown you can call off, and things the household shares, such as the playbook and what was paid, stay with the household. The household's owner hands that role to someone else first.",
      "An Admin decides in Settings → AI Assistant what kinds of information the assistant may share with the AI service — children's details, health, amounts and bills, where people are, private messages. What is not allowed is left out of anything the assistant sends.",
    ],
  },
  {
    id: "ai-key",
    title: "Which model powers the assistant",
    summary: "Ours by default; yours if you would rather.",
    group: "Privacy and trust",
    keywords: ["api key", "byok", "anthropic", "openai", "gemini", "model", "billing", "own key"],
    body: [
      "WonderHome runs the assistant on its own account, so you do not need one with an AI company.",
      "If you would rather the requests were billed to you and covered by your own agreement with the AI company, an Admin can add your household's own key in Settings → AI Assistant. Yours then takes precedence.",
      "A key you add can never be read back out — not by us, not by you. You can replace it or remove it, but the value only ever travels one way.",
    ],
  },
  {
    id: "connections",
    title: "Connected accounts, WhatsApp and voice assistants",
    summary: "What your household can connect, and what never travels through a connection.",
    group: "Privacy and trust",
    keywords: ["integration", "connect", "calendar", "email", "provider", "sync", "google", "portal", "whatsapp", "alexa", "smart home", "devices", "weather"],
    body: [
      "Settings → Connected accounts lists what your household can connect — school, calendar, email, shopping, weather and home devices — and says plainly when one is not available yet for your WonderHome, rather than offering a button that does nothing. Connecting is up to an Admin.",
      "WonderHome never keeps your password for another service. Imported calendar entries are never marked as protected family time or as confirmed — those are yours to decide — and a private entry arrives as busy time only, with no title or place.",
      "Where WhatsApp is available, each adult can connect their own number from Settings → WhatsApp by sending a one-time code. Things you send it land in HomeSend like anything else. Nothing is paid, ordered, booked or approved from WhatsApp, and other members only ever see \"WhatsApp connected\" beside your name, never the number.",
      "A voice assistant is linked to one person and speaks only as them. Payments and orders are never done by voice.",
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
      "No. Paying from inside WonderHome is not available yet, so nothing can move money at all today. Even once it is, paying needs your approval and a confirmation that it is you at that moment.",
    section: "bills",
  },
  {
    question: "Can my children see the household's bills?",
    answer:
      "No. Money is visible to adults and administrators only, and that is enforced behind the scenes rather than by hiding it on screen.",
    section: "household-and-roles",
  },
  {
    question: "Is my family's data used to train AI models?",
    answer: "No, not by default.",
    section: "privacy",
  },
  {
    question: "How do I download or delete my data?",
    answer:
      "Settings → Privacy & security. Download a copy after confirming your password, or ask for deletion — it starts a 30-day countdown you can call off.",
    section: "privacy",
  },
  {
    question: "I forgot my password. What now?",
    answer:
      "Use \"Forgot password?\" on the sign-in screen. The link that arrives works once and expires in an hour.",
    section: "accounts",
  },
  {
    question: "How do I send WonderHome a school notice or a bill?",
    answer:
      "Use the paperclip beside the microphone in HomeTalk, the HomeSend screen, or your phone's Share button once WonderHome is installed. It reads the whole thing and shows you what it found; nothing is added until you confirm.",
    section: "home-send",
  },
  {
    question: "Can I use WonderHome in Hindi or another language?",
    answer:
      "Yes. Choose your language in Settings → Language & Region. HomeTalk understands and replies in it, and your reminders arrive in it too.",
    section: "language",
  },
  {
    question: "How do I change when reminders arrive?",
    answer:
      "Settings → Notifications. Pick when each kind of reminder lands, set quiet hours, or snooze any single reminder with \"Remind me later\".",
    section: "notifications",
  },
  {
    question: "Who can see my health information?",
    answer:
      "Only you, unless you share it. You can share with people you choose or share just the practical part with the household, and take it back at any time. A guardian can always see their child's.",
    section: "health",
  },
  {
    question: "Why can't I connect my Google Calendar yet?",
    answer:
      "Settings → Connected accounts shows which connections are available for your WonderHome. Where one is not available yet, it says so rather than offering a button that goes nowhere.",
    section: "connections",
  },
  {
    question: "Can I use my own AI provider account?",
    answer:
      "Yes. An Admin can add your household's own key in Settings → AI Assistant, and it takes precedence over WonderHome's.",
    section: "ai-key",
  },
  {
    question: "Why did WonderHome say \"prepared\" instead of \"done\"?",
    answer:
      "Because it prepared the action rather than performing it. It never claims to have done something unless it actually did.",
    section: "talk-to-wonderhome",
  },
  {
    question: "I said the wrong name. How do I fix it?",
    answer:
      "Just say so — \"no, I meant Manan\". HomeTalk replaces the proposal, or undoes what it did and makes the corrected change, keeping both on record.",
    section: "talk-to-wonderhome",
  },
  {
    question: "Do I have to pay for Pro or Max?",
    answer:
      "Not during early access. Switching plans is free and nothing is charged; Settings → Your plan shows what each plan will cost later.",
    section: "plan",
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
