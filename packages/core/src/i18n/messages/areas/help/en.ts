/**
 * help — English, the source for this area (story 22-004).
 *
 * The user guide's own words live here, not in `help/guide.ts`: that module
 * holds the guide's shape (ids, groups, search keywords) and reads its prose
 * from this catalog, so English has one source and every other language
 * carries the same keys. A section's paragraphs are `body.1`, `body.2`, … in
 * order, and the guide counts them from this file.
 */
export const helpEn = {
  // The page (/help).
  "help.page.title": "Get help",
  "help.page.lede":
    "How WonderHome works, what it will never do without asking, and the answers to the questions families ask first.",
  "help.page.homeLink": "WonderHome home",
  "help.page.contents": "Guide contents",
  "help.page.inThisGuide": "In this guide",
  "help.page.commonQuestions": "Common questions",
  "help.page.readMore": "Read more in the guide",
  "help.page.stuck.title": "Still stuck?",
  "help.page.stuck.body": "Ask WonderHome directly — it can act on your household, which this guide cannot.",
  "help.page.stuck.open": "Open HomeTalk",
  "help.page.signedOut.title": "Want this for your home?",
  "help.page.signedOut.body": "The guide describes what WonderHome does. Signing in is where it starts doing it.",
  "help.page.signedOut.getStarted": "Get started",
  "help.page.signedOut.signIn": "Sign in",
  "help.page.correct": "Something here wrong or missing? {link} about your household and correct it.",
  "help.page.correct.link": "Check what WonderHome believes",
  "help.page.quote": "Every home is different. Yours should feel like it.",

  // Ask the guide (the search box).
  "help.ask.title": "Ask the guide",
  "help.ask.lede":
    "Searches this guide and answers with a link to the section it came from. Not a language model — so it will say when it does not know rather than invent an answer.",
  "help.ask.label": "Ask a question about WonderHome",
  "help.ask.placeholder": "Ask anything about WonderHome…",
  "help.ask.submit": "Ask",
  "help.ask.searching": "Searching the guide",
  "help.ask.ready": "Answer ready",
  "help.ask.read": "Read:",
  "help.ask.also": "Also:",
  "help.ask.notFound":
    "I could not find that in the guide. Try naming the part of the home you mean — bills, school, meals, notifications, privacy — or browse the sections below.",

  // Questions offered as starting points.
  "help.suggested.spendMoney": "Can WonderHome spend money without asking?",
  "help.suggested.quietHome": "Why is my home screen so quiet?",
  "help.suggested.schoolWork": "Who can see my children's school work?",
  "help.suggested.sendNotice": "How do I send WonderHome a school notice?",
  "help.suggested.hindi": "Can I use WonderHome in Hindi?",
  "help.suggested.data": "How do I download or delete my data?",

  // The guide's groups.
  "help.group.gettingStarted": "Getting started",
  "help.group.everydayUse": "Everyday use",
  "help.group.yourHousehold": "Your household",
  "help.group.privacyAndTrust": "Privacy and trust",

  // What WonderHome is
  "help.guide.what-wonderhome-is.title": "What WonderHome is",
  "help.guide.what-wonderhome-is.summary": "The family runs the home. WonderHome manages the managing.",
  "help.guide.what-wonderhome-is.body.1":
    "WonderHome watches the parts of running a home that usually live in somebody's head: when the bills fall due, whether a child's project is going to fit before Thursday, whether the milk runs out before Sunday, who is actually free on Saturday.",
  "help.guide.what-wonderhome-is.body.2":
    "It manages outcomes rather than task lists. Nobody is asked to tick off normal household work, and a routine that is running fine is silent by design. If a screen is quiet, that is the product working — not the product missing something.",
  "help.guide.what-wonderhome-is.body.3":
    "Three names come up everywhere. HomeTalk is where you talk or type to WonderHome. HomeSend is how you hand it things — a photo, a PDF, a forwarded message. HomeBrain is the reasoning behind both: what WonderHome understood, and why.",
  "help.guide.what-wonderhome-is.body.4":
    "What you will be asked about is the small number of things that genuinely need a person: a decision, an approval, a fact only you know.",

  // Setting up your household
  "help.guide.first-week.title": "Setting up your household",
  "help.guide.first-week.summary": "A guided setup for the Admin, and a progress card on Home until it is done.",
  "help.guide.first-week.body.1":
    "Whoever creates the household is walked through a guided setup: the household's basics, the adults, the children, pets and household help, a set of suggested responsibilities to review, and a few guided questions. Steps that do not apply — no children, no pets — are skipped.",
  "help.guide.first-week.body.2":
    "You can stop at any point. Home shows a Household setup card with a progress ring and the next step, and Continue picks up exactly where you left off.",
  "help.guide.first-week.body.3":
    "The percentage is arithmetic over facts that exist — a bill added, a responsibility assigned, a child's date of birth recorded — not a count of ticked boxes. Steps that do not apply to your household are left out of the total, so every household can reach 100%. The full checklist always lives on Manage household.",
  "help.guide.first-week.body.4":
    "Each person also gets a short, optional setup of their own for language and region, which they can finish later from Settings.",

  // Signing in and passwords
  "help.guide.accounts.title": "Signing in and passwords",
  "help.guide.accounts.summary": "Email and password, a reset link, and Google where it is switched on.",
  "help.guide.accounts.body.1":
    "Forgot your password? Use the link on the sign-in screen. WonderHome emails a link that works once and expires in an hour, and the reply is the same whether or not the address has an account — so the screen cannot be used to find out who has one.",
  "help.guide.accounts.body.2":
    "Both password fields have a reveal button if you want to check what you typed.",
  "help.guide.accounts.body.3":
    "Google sign-in appears where it is switched on. Where it is not, the button is absent rather than present and broken.",
  "help.guide.accounts.body.4":
    "To sign out, open your account menu from your picture at the top of the screen, or use Sign out at the bottom of More.",

  // Language, region and formats
  "help.guide.language.title": "Language, region and formats",
  "help.guide.language.summary": "Each person picks their language; the household sets its region, currency and time zone.",
  "help.guide.language.body.1":
    "WonderHome speaks English, Hindi, Marathi, Spanish, French, German, Arabic and Chinese (Simplified, Mandarin). Each person chooses their own language in Settings → Language & Region, so one household can use several at once. Arabic reads right to left.",
  "help.guide.language.body.2":
    "The household's region, currency and time zone are set by an Admin, and each person can choose their own date format, 12- or 24-hour clock, and metric or imperial units.",
  "help.guide.language.body.3":
    "HomeTalk understands you in your language and replies in it. Names, items, dates and amounts are never translated or changed on the way. When a reply cannot be translated safely, you see it in English with a line saying why.",
  "help.guide.language.body.4":
    "Reminders arrive in each person's own language, and every screen is shown in it. Names and what your family types stay as written; a few of WonderHome's short messages are still in English, and the Language & Region page says so.",
  "help.guide.language.body.5":
    "Changing your language never changes what is stored. An amount stays in the currency it was recorded in, and nothing is ever converted.",

  // HomeTalk
  "help.guide.talk-to-wonderhome.title": "HomeTalk",
  "help.guide.talk-to-wonderhome.summary": "Talk or type — one conversation, and it never claims to have acted when it has not.",
  "help.guide.talk-to-wonderhome.body.1":
    "HomeTalk is the assistant, raised in the middle of the tab bar. Typing and speaking are the same conversation — the microphone is just another way in.",
  "help.guide.talk-to-wonderhome.body.2":
    "Anything consequential comes back as a plan before it happens: what WonderHome understood, what it intends to do, what that would affect, and Confirm, Change or Cancel. A yes approves that exact proposal and only for a short while; a stale or changed one gets a question instead of an action. Payments and changes to who can do what always ask.",
  "help.guide.talk-to-wonderhome.body.3":
    "You can correct it the way you would a person: \"no, I meant Manan\", \"not milk, almond milk\", \"actually, make that Friday\". If the change had not happened yet, the proposal is replaced; if it had, WonderHome undoes it and makes the corrected one, and both steps stay on record.",
  "help.guide.talk-to-wonderhome.body.4":
    "Several requests in one sentence are handled one by one. A later part that leans on an earlier one (\"…and remind me to buy them\") only goes ahead if the earlier part actually happened.",
  "help.guide.talk-to-wonderhome.body.5":
    "\"Remind me to call the plumber tomorrow at 5\" sets a reminder for you alone, delivered when it is due. When someone is mentioned and two people could fit, HomeTalk asks which one rather than guessing.",
  "help.guide.talk-to-wonderhome.body.6":
    "Edit your last message to rephrase it, and search your past conversations from the search box at the top. It never says it did something unless it actually did; where it only prepared something, it says prepared, and where nothing needed changing, it says so.",

  // Voice and hands-free conversation
  "help.guide.voice.title": "Voice and hands-free conversation",
  "help.guide.voice.summary": "Tap to speak and review, or talk back and forth hands-free.",
  "help.guide.voice.body.1":
    "Tap the microphone and your words appear in the box for you to check before sending. Nothing is sent until you do.",
  "help.guide.voice.body.2":
    "Live conversation is hands-free: WonderHome listens, answers out loud and keeps going until you end it, and you can pause and resume. It runs on WonderHome's own voice or, where your household has chosen it and it is available, on Gemini Live. The composer shows which one is answering and lets you switch.",
  "help.guide.voice.body.3":
    "Settings → Voice chooses the speech service (your browser's own, or a more accurate one), the voice, and how it listens. Where a choice is not available to your household, it is shown with the reason rather than offered and broken.",
  "help.guide.voice.body.4":
    "Voice assistants such as Alexa or Gemini Voice can be linked to one person from Settings → Voice assistants once they are available for your WonderHome. A linked assistant speaks as that person and sees only what they may see, and it can never pay or place an order.",

  // HomeSend: sending WonderHome things
  "help.guide.home-send.title": "HomeSend: sending WonderHome things",
  "help.guide.home-send.summary": "A photo, a PDF, a voice note, a link or a forward — read, then confirmed by you.",
  "help.guide.home-send.body.1":
    "HomeSend takes photos, PDFs, text and CSV files, voice notes, links and pasted messages. Use the paperclip beside the microphone in HomeTalk, or the HomeSend screen, which also keeps an inbox of what is waiting for you.",
  "help.guide.home-send.body.2":
    "Install WonderHome on your phone (from your account menu or the HomeSend screen) and your phone's own Share button sends straight into HomeSend. A share started before you have signed in on that phone is picked up once you do.",
  "help.guide.home-send.body.3":
    "WonderHome reads the whole document — every date of a series, every fee, every thing to buy — and shows what it found against what is already on record: something new to add, an existing entry to update, one to cancel, or nothing to change. Nothing is written until you confirm, and you can edit each item or leave it out.",
  "help.guide.home-send.body.4":
    "Bills, health documents and receipts always wait for a person, however clear they look. Clear, new groceries and school items may apply on their own only where your household has allowed that, and they come with an Undo.",
  "help.guide.home-send.body.5":
    "Anything WonderHome cannot read is kept under \"Failed safely\", where you can fill it in by hand or dismiss it — it is never quietly dropped. Instructions hidden inside something you send are ignored, and the screen tells you so.",
  "help.guide.home-send.body.6":
    "Every change HomeSend makes can be undone from \"Recently handled\", one item at a time or a whole document at once. Where your household has them set up, a forwarding email address and WhatsApp feed the same inbox.",

  // Home and Today
  "help.guide.today-and-home.title": "Home and Today",
  "help.guide.today-and-home.summary": "What needs you now, and the shape of the day.",
  "help.guide.today-and-home.body.1":
    "Home leads with what needs a person, then what WonderHome handled quietly. The handled count is things it checked and found fine — the number is real, not decorative. Each card opens to the entries behind its count.",
  "help.guide.today-and-home.body.2":
    "Today is the day as a timeline, in three views: your day, the family's, and the household's. Items are commitments and deadlines — a meal that has to be ready, a bill due, a class — never chores to tick off. The household view also looks ahead two weeks at what is likely to run out or fall due.",
  "help.guide.today-and-home.body.3":
    "Plan something, on Home and Today, adds a family event without leaving the screen.",
  "help.guide.today-and-home.body.4":
    "On a phone, swipe left or right to move between Home, Today, HomeTalk, Family and More.",

  // Reminders and notifications
  "help.guide.notifications.title": "Reminders and notifications",
  "help.guide.notifications.summary": "About real things, to one person, when it suits them — and quiet once handled.",
  "help.guide.notifications.body.1":
    "Every reminder is about something real — an unpaid bill, school work due, a meal to start, the grocery list, pet care, a family plan — and goes to one person: whoever owns it, then the responsibility's owner, a child's guardian, the backup, then the Admin. It resolves itself as soon as the thing itself is handled.",
  "help.guide.notifications.body.2":
    "A child's school things due on the same day arrive as one reminder. If a reminder that matters goes unanswered, its backup hears about it once, and nothing repeats beyond a sensible limit.",
  "help.guide.notifications.body.3":
    "\"Remind me later\" snoozes for 15 minutes, an hour, later today, tomorrow morning, or a day and time you pick. You can mark a reminder done or dismiss it; you cannot change what it says.",
  "help.guide.notifications.body.4":
    "Settings → Notifications sets when each kind arrives — for bills, for example, three days before and on the due day, or a week before — along with quiet hours and the day's summary. \"Learn when I usually act\" is off unless you turn it on; it moves a first reminder only after five similar actions, and never overrides the timing or quiet hours you chose.",
  "help.guide.notifications.body.5":
    "Reminders appear in the app. Other channels show whether they are connected for your WonderHome; where one is not yet, your choice is saved for when it is.",

  // Bills and money
  "help.guide.bills.title": "Bills and money",
  "help.guide.bills.summary": "What is due, whose it is, and whether it looks unusual.",
  "help.guide.bills.body.1":
    "A bill often exists before its amount does — the electricity is due monthly whether or not this month's figure has arrived — so WonderHome tracks it either way. Amounts are entered and shown as you would write them, 42.50 rather than 4250.",
  "help.guide.bills.body.2":
    "Each bill and transaction keeps its own currency; it starts as your household's currency and is never converted. The Transactions tab records what was paid, period by period, and each entry can be edited or removed.",
  "help.guide.bills.body.3":
    "An unusual amount is raised as something to look at, with the comparison attached, so you can check the claim rather than take it on trust. It is never an automatic block: a bill that genuinely is three times the usual is exactly the one you most need paid on time.",
  "help.guide.bills.body.4":
    "Paying from inside WonderHome is not available yet. Pay prepares a payment for your approval in HomeTalk and stops there — it does not move money.",
  "help.guide.bills.body.5":
    "Money is visible to adults and administrators. Children and helpers never see it.",

  // School and children's work
  "help.guide.school.title": "School and children's work",
  "help.guide.school.summary": "Homework, exams and notices, and deadlines that will not fit.",
  "help.guide.school.body.1":
    "Kids & School shows each child's homework, exams, events and teacher updates, grouped by when they are due. Add homework by hand, or upload a screenshot and WonderHome fills in the form for you to check before adding.",
  "help.guide.school.body.2":
    "Send a school notice through HomeSend and every date, fee and thing to bring becomes its own item to review. If the notice names a child who is not in your household yet, an Admin can add them right there in the review; WonderHome never assumes a notice is about the only child it knows.",
  "help.guide.school.body.3":
    "Only a person can mark work done. A portal going quiet is not a child saying they finished.",
  "help.guide.school.body.4":
    "A child's school work is visible to that child, their guardians and administrators — living in the same house is not by itself enough.",

  // Meals, groceries and running out of things
  "help.guide.meals-and-shopping.title": "Meals, groceries and running out of things",
  "help.guide.meals-and-shopping.summary": "A consumption rate with evidence, not a pantry count you maintain.",
  "help.guide.meals-and-shopping.body.1":
    "WonderHome does not keep an inventory, because an inventory needs somebody to keep it accurate. It keeps a rate — how quickly something is used — and the evidence behind it, and predicts when it will run out.",
  "help.guide.meals-and-shopping.body.2":
    "Send a receipt through HomeSend and each line you keep becomes purchase history for that item, which sharpens the prediction. Lines it cannot match to something you track are yours to match, start tracking or skip; it never guesses.",
  "help.guide.meals-and-shopping.body.3":
    "Every shopping suggestion can answer \"why do you think we need this?\". Ordering from a shop is not available yet, so nothing is ever bought on your behalf.",
  "help.guide.meals-and-shopping.body.4":
    "Meals has a plan, your recipes, and preferences. A recipe can carry rough nutrients per serving. Suggest proposes a meal from what you have and what people like, and missing ingredients go on the shopping list.",
  "help.guide.meals-and-shopping.body.5":
    "Preferences record whose they are — a dislike, an allergy, a medical or ethical choice — so one person's dislike never quietly becomes a house rule. An allergy always wins.",

  // Health and fitness
  "help.guide.health.title": "Health and fitness",
  "help.guide.health.summary": "Records, vitals and routines, private to each person unless they share them.",
  "help.guide.health.body.1":
    "Health & Fitness keeps each adult's issues, checkups, appointments, vitals (weight, blood pressure, steps and more, or your own measurement), health records such as lab results and prescriptions, fitness goals and routines. It shows what needs attention and what is coming up — never a health score.",
  "help.guide.health.body.2":
    "Health information is private to its person by default. They can share it with people they choose, or share only the practical part with the whole household (\"unavailable 5–6pm\"), and take it back at any time. Being in the same household never by itself gives anyone access. A guardian can always see their child's.",
  "help.guide.health.body.3":
    "Whether HomeBrain may consider a person's health information at all is a separate switch on the Privacy tab, and even then nothing is shown to anyone the sharing setting excludes. Health documents sent through HomeSend always wait for a person to confirm.",

  // Home and upkeep
  "help.guide.home-upkeep.title": "Home and upkeep",
  "help.guide.home-upkeep.summary": "Maintenance, services, laundry and pets — only what needs a person.",
  "help.guide.home-upkeep.body.1":
    "Home & Upkeep brings together maintenance, service requests, laundry and pet care, and shows only what needs somebody. When nothing does, it says so.",
  "help.guide.home-upkeep.body.2":
    "An Admin records the home's appliances; any adult can raise a service request.",
  "help.guide.home-upkeep.body.3":
    "Weather speaks only when it changes a decision — washing that will not dry outside today, for example — and never as a forecast readout. It uses the area an Admin chose, kept only to about a kilometre.",

  // Members, roles and what each person sees
  "help.guide.household-and-roles.title": "Members, roles and what each person sees",
  "help.guide.household-and-roles.summary": "One household, several identities, and a different view for each.",
  "help.guide.household-and-roles.body.1":
    "The person who creates the household is its owner and Admin. They can make other people Admins, who can do nearly everything they can.",
  "help.guide.household-and-roles.body.2":
    "Adults, children and househelpers each get their own view. This is not a filter applied on the screen: a section somebody may not see is never sent to their device at all, and WonderHome checks again behind the scenes every time.",
  "help.guide.household-and-roles.body.3":
    "Children get age-appropriate access. Househelpers are never asked to update chores, and WonderHome holds no productivity data about them.",
  "help.guide.household-and-roles.body.4":
    "Admins invite, change and remove members from Manage household. Removing someone never deletes the history they were part of.",

  // Family, pets and family time
  "help.guide.family.title": "Family, pets and family time",
  "help.guide.family.summary": "Everyone in one place, pets included, and time kept free for each other.",
  "help.guide.family.body.1":
    "Family lists everyone, with each person's details a tap away. You edit your own profile and photo in Settings; an Admin can edit anyone's. \"Family calls me\" records what the family calls a person — Dad, Nani — so WonderHome can talk about people the way you do.",
  "help.guide.family.body.2":
    "Pets are part of the family here, with their own care tracked alongside everyone else's.",
  "help.guide.family.body.3":
    "Family events — birthdays, outings, visits, appointments — can be marked as protected time, and WonderHome never schedules over them. Things that need a reply, such as a clash or a gift still to sort, are listed until they are settled.",

  // Household help
  "help.guide.househelp.title": "Household help",
  "help.guide.househelp.summary": "Who helps at home, when they are expected, and cover when they are away.",
  "help.guide.househelp.body.1":
    "Househelper records who helps at home — regularly, occasionally, or as a visiting service — and their usual days and hours.",
  "help.guide.househelp.body.2":
    "Record a day away or an extra day, and WonderHome checks what they normally handle that day and shows what needs cover, with a way to arrange it.",
  "help.guide.househelp.body.3":
    "Househelpers are never asked to tick off chores, and there are no productivity scores.",

  // Outcomes, responsibilities and the playbook
  "help.guide.outcomes.title": "Outcomes, responsibilities and the playbook",
  "help.guide.outcomes.summary": "Describe the home you want, not the steps to get there.",
  "help.guide.outcomes.body.1":
    "The playbook is the home you want in your own words — \"laundry ready by Sunday evening\" — rather than the steps. WonderHome plans around it.",
  "help.guide.outcomes.body.2":
    "Responsibilities say who looks after what, and who covers when they cannot. An outcome with an owner has somebody to ask; one without is a gap, and WonderHome shows you the gaps and where the load sits unevenly.",
  "help.guide.outcomes.body.3":
    "Policies cover spending limits, who approves what, quiet hours and privacy. Until you set them, WonderHome asks before anything consequential — safe, but slower.",

  // Your plan
  "help.guide.plan.title": "Your plan",
  "help.guide.plan.summary": "Free, Pro and Max — and free to switch during early access.",
  "help.guide.plan.body.1":
    "Settings → Your plan shows the plans, what each includes, and your household's usage this period. Free covers the household basics; Pro adds school, shopping, meals, bills and family time; Max adds more autonomous action and deeper connections.",
  "help.guide.plan.body.2":
    "During early access, switching plans is free and nothing is charged. Prices are shown monthly or yearly so you know what to expect later.",
  "help.guide.plan.body.3":
    "Something that is not part of your plan says so where it would appear, rather than offering a button that does nothing. If a feature is part of a trial, Settings tells you.",

  // How much WonderHome may do on its own
  "help.guide.ai-autonomy.title": "How much WonderHome may do on its own",
  "help.guide.ai-autonomy.summary": "Four levels, set per responsibility, and you choose them.",
  "help.guide.ai-autonomy.body.1":
    "Each responsibility carries an autonomy level: observe, prepare, ask approval, or execute. It is set by you, per responsibility, and WonderHome enforces it behind the scenes — not just on the screen.",
  "help.guide.ai-autonomy.body.2":
    "Sensitive actions need approval regardless, and paying money needs you to confirm it is you at the moment you approve.",

  // HomeBrain Review and asking "why?"
  "help.guide.certification.title": "HomeBrain Review and asking \"why?\"",
  "help.guide.certification.summary": "Everything WonderHome believes, where each belief came from, and how to fix it.",
  "help.guide.certification.body.1":
    "HomeBrain Review shows what WonderHome believes about your household and where each belief came from — you told it, it observed it, or something you sent said so. Anything it has wrong, you can correct, add or remove.",
  "help.guide.certification.body.2":
    "Ask HomeTalk \"why?\" — why it needs approval, why it did not do something, where a fact came from — and the answer comes from what is actually on record, not from a guess.",
  "help.guide.certification.body.3":
    "Answers are checked before you see them. A name, date, amount or event that is not on record is never stated as fact; if nothing is on record, WonderHome says so.",

  // Privacy and your data
  "help.guide.privacy.title": "Privacy and your data",
  "help.guide.privacy.summary": "What is held, who can see it, and how to take it with you or have it deleted.",
  "help.guide.privacy.body.1":
    "Your household's data is not used to train models by default.",
  "help.guide.privacy.body.2":
    "Who can see what is decided behind the scenes, before anything reaches a device. A screen hiding something is presentation; it is never the thing keeping it private.",
  "help.guide.privacy.body.3":
    "Settings → Privacy & security lets you download a copy of your data after confirming your password. You can also ask for your data to be deleted: there is a 30-day countdown you can call off, and things the household shares, such as the playbook and what was paid, stay with the household. The household's owner hands that role to someone else first.",
  "help.guide.privacy.body.4":
    "An Admin decides in Settings → AI Assistant what kinds of information the assistant may share with the AI service — children's details, health, amounts and bills, where people are, private messages. What is not allowed is left out of anything the assistant sends.",

  // Which model powers the assistant
  "help.guide.ai-key.title": "Which model powers the assistant",
  "help.guide.ai-key.summary": "Ours by default; yours if you would rather.",
  "help.guide.ai-key.body.1":
    "WonderHome runs the assistant on its own account, so you do not need one with an AI company.",
  "help.guide.ai-key.body.2":
    "If you would rather the requests were billed to you and covered by your own agreement with the AI company, an Admin can add your household's own key in Settings → AI Assistant. Yours then takes precedence.",
  "help.guide.ai-key.body.3":
    "A key you add can never be read back out — not by us, not by you. You can replace it or remove it, but the value only ever travels one way.",

  // Connected accounts, WhatsApp and voice assistants
  "help.guide.connections.title": "Connected accounts, WhatsApp and voice assistants",
  "help.guide.connections.summary": "What your household can connect, and what never travels through a connection.",
  "help.guide.connections.body.1":
    "Settings → Connected accounts lists what your household can connect — school, calendar, email, shopping, weather and home devices — and says plainly when one is not available yet for your WonderHome, rather than offering a button that does nothing. Connecting is up to an Admin.",
  "help.guide.connections.body.2":
    "WonderHome never keeps your password for another service. Imported calendar entries are never marked as protected family time or as confirmed — those are yours to decide — and a private entry arrives as busy time only, with no title or place.",
  "help.guide.connections.body.3":
    "Where WhatsApp is available, each adult can connect their own number from Settings → WhatsApp by sending a one-time code. Things you send it land in HomeSend like anything else. Nothing is paid, ordered, booked or approved from WhatsApp, and other members only ever see \"WhatsApp connected\" beside your name, never the number.",
  "help.guide.connections.body.4":
    "A voice assistant is linked to one person and speaks only as them. Payments and orders are never done by voice.",

  // Common questions.
  "help.faq.quiet-home.q": "Why is my Home screen so quiet?",
  "help.faq.quiet-home.a":
    "Because nothing needs you. Routines that are running fine are silent on purpose — WonderHome speaks up when something genuinely needs a person, not to prove it is working.",
  "help.faq.tick-off.q": "Do I have to tick things off?",
  "help.faq.tick-off.a":
    "No. There is no chore checklist anywhere in WonderHome, and a househelper is never asked to update one. It tracks outcomes — whether the home is in the state you wanted — not steps.",
  "help.faq.spend-money.q": "Can WonderHome spend money without asking?",
  "help.faq.spend-money.a":
    "No. Paying from inside WonderHome is not available yet, so nothing can move money at all today. Even once it is, paying needs your approval and a confirmation that it is you at that moment.",
  "help.faq.children-bills.q": "Can my children see the household's bills?",
  "help.faq.children-bills.a":
    "No. Money is visible to adults and administrators only, and that is enforced behind the scenes rather than by hiding it on screen.",
  "help.faq.training.q": "Is my family's data used to train AI models?",
  "help.faq.training.a":
    "No, not by default.",
  "help.faq.download-delete.q": "How do I download or delete my data?",
  "help.faq.download-delete.a":
    "Settings → Privacy & security. Download a copy after confirming your password, or ask for deletion — it starts a 30-day countdown you can call off.",
  "help.faq.forgot-password.q": "I forgot my password. What now?",
  "help.faq.forgot-password.a":
    "Use \"Forgot password?\" on the sign-in screen. The link that arrives works once and expires in an hour.",
  "help.faq.send-notice.q": "How do I send WonderHome a school notice or a bill?",
  "help.faq.send-notice.a":
    "Use the paperclip beside the microphone in HomeTalk, the HomeSend screen, or your phone's Share button once WonderHome is installed. It reads the whole thing and shows you what it found; nothing is added until you confirm.",
  "help.faq.other-language.q": "Can I use WonderHome in Hindi or another language?",
  "help.faq.other-language.a":
    "Yes. Choose your language in Settings → Language & Region. HomeTalk understands and replies in it, and your reminders arrive in it too.",
  "help.faq.reminder-timing.q": "How do I change when reminders arrive?",
  "help.faq.reminder-timing.a":
    "Settings → Notifications. Pick when each kind of reminder lands, set quiet hours, or snooze any single reminder with \"Remind me later\".",
  "help.faq.health-visibility.q": "Who can see my health information?",
  "help.faq.health-visibility.a":
    "Only you, unless you share it. You can share with people you choose or share just the practical part with the household, and take it back at any time. A guardian can always see their child's.",
  "help.faq.google-calendar.q": "Why can't I connect my Google Calendar yet?",
  "help.faq.google-calendar.a":
    "Settings → Connected accounts shows which connections are available for your WonderHome. Where one is not available yet, it says so rather than offering a button that goes nowhere.",
  "help.faq.own-ai-account.q": "Can I use my own AI provider account?",
  "help.faq.own-ai-account.a":
    "Yes. An Admin can add your household's own key in Settings → AI Assistant, and it takes precedence over WonderHome's.",
  "help.faq.prepared-not-done.q": "Why did WonderHome say \"prepared\" instead of \"done\"?",
  "help.faq.prepared-not-done.a":
    "Because it prepared the action rather than performing it. It never claims to have done something unless it actually did.",
  "help.faq.wrong-name.q": "I said the wrong name. How do I fix it?",
  "help.faq.wrong-name.a":
    "Just say so — \"no, I meant Manan\". HomeTalk replaces the proposal, or undoes what it did and makes the corrected change, keeping both on record.",
  "help.faq.pay-for-plan.q": "Do I have to pay for Pro or Max?",
  "help.faq.pay-for-plan.a":
    "Not during early access. Switching plans is free and nothing is charged; Settings → Your plan shows what each plan will cost later.",
  "help.faq.full-setup.q": "How do I get to 100% setup?",
  "help.faq.full-setup.a":
    "Manage household lists every step. Steps that do not apply to your home — no children, no helper — are left out of the total, so 100% is reachable for every household.",
} as const;
