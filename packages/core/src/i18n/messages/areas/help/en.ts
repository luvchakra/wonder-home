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
  "help.page.contents": "Guide contents",
  "help.page.inThisGuide": "In this guide",
  "help.page.commonQuestions": "Common questions",
  "help.page.readMore": "Read more in the guide",
  "help.page.updated": "Last updated {date}",
  "help.page.stuck.title": "Still stuck?",
  "help.page.stuck.body": "Ask WonderHome directly — it can act on your household, which this guide cannot.",
  "help.page.stuck.open": "Open HomeTalk",
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
    "Three names come up everywhere. HomeTalk is where you talk or type to WonderHome. HomeSend is how you hand it things — a photo, a PDF, a forwarded message. HomeBrain is the reasoning behind both: what WonderHome understood, and why. HomeBrain uses an AI model to understand what you say and send; WonderHome's own rules decide what happens next, and anything consequential waits for you.",
  "help.guide.what-wonderhome-is.body.4":
    "What you will be asked about is the small number of things that genuinely need a person: a decision, an approval, a fact only you know.",

  // Setting up your household
  "help.guide.first-week.title": "Setting up your household",
  "help.guide.first-week.summary": "A guided setup for the Admin, and a progress card on Home until it is done.",
  "help.guide.first-week.body.1":
    "Whoever creates the household is walked through a guided setup. It starts with language, region, currency and time zone, so everything after is in your own words. Then come the household's basics and its home address, the adults, the children, pets and household help, a set of suggested responsibilities to review, and a few guided questions. Steps that do not apply, such as no children or no pets, are skipped.",
  "help.guide.first-week.body.2":
    "You can stop at any point. Home shows a Household setup card with a progress ring and the next step, and Continue picks up exactly where you left off.",
  "help.guide.first-week.body.3":
    "The percentage is arithmetic over facts that exist — a bill added, a responsibility assigned, a child's date of birth recorded — not a count of ticked boxes. Steps that do not apply to your household are left out of the total, so every household can reach 100%. The full checklist always lives on Manage Household.",
  "help.guide.first-week.body.4":
    "Along the way you can add each person's photo, nickname and date of birth. Tick Preferred name and WonderHome greets them by the nickname. A date of birth puts their birthday on the family calendar, and changing it later moves the birthday. The home address is searched on Google Maps where your WonderHome has it switched on, or typed. Only the household's adults can see it. Each responsibility gets a Primary and a Backup for when they are away. Everyone else gets the short language setup of their own, which they can finish later from Settings.",

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
    "To sign out, open your account menu from your picture at the top of the screen and choose Log out, or use Sign out at the bottom of More.",

  // Language, region and formats
  "help.guide.language.title": "Language, region and formats",
  "help.guide.language.summary": "Each person picks their language; the household sets its region, currency and time zone.",
  "help.guide.language.body.1":
    "WonderHome speaks English, Hindi, Marathi, Spanish, French, German, Arabic and Chinese (Simplified, Mandarin). Each person chooses their own language in Settings → Language & Region, so one household can use several at once. Arabic is shown right to left; a few screens are still being adjusted for it. Under Member languages you can also add every language each person speaks, with a four-step meter from \"A few words\" to \"First language\". It does not change the app's language; HomeTalk uses it to know who understands what.",
  "help.guide.language.body.2":
    "The household's region, currency and time zone are set by an Admin, and each person can choose their own date format, 12- or 24-hour clock, and metric or imperial units.",
  "help.guide.language.body.3":
    "HomeTalk understands you in your language and replies in it. Names, items, dates and amounts are never translated or changed on the way. When a reply cannot be translated safely, you see it in English with a line saying why.",
  "help.guide.language.body.4":
    "Reminders arrive in each person's own language, and every screen is shown in it. Names and what your family types stay as written; a few of WonderHome's short messages are still in English, and the Language & Region page says so.",
  "help.guide.language.body.5":
    "Changing your language never changes what is stored. An amount stays in the currency it was recorded in, and nothing is ever converted.",
  "help.guide.language.body.6":
    "Before you sign in, the sign-in and sign-up pages follow your browser's language; once you are in, your own choice takes over. Help's search understands questions in your language too.",

  // HomeTalk
  "help.guide.talk-to-wonderhome.title": "HomeTalk",
  "help.guide.talk-to-wonderhome.summary": "Talk or type — one conversation, and it never claims to have acted when it has not.",
  "help.guide.talk-to-wonderhome.body.1":
    "HomeTalk is the assistant, raised in the middle of the tab bar. Typing and speaking are the same conversation — the microphone is just another way in. An AI model helps it understand you and word its answers; an answer is checked against what is on record before you see it, and nothing consequential happens without you.",
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
  "help.guide.talk-to-wonderhome.body.7":
    "Ask for places nearby — \"suggest somewhere for dinner tonight\", \"where can we hang out near Anya's school after school?\" — and HomeTalk looks near your home address or the child's school and shows only places open for that time, each with a link to Google Maps. The places come from Google's place search, not from an AI model, and WonderHome says when it assumed a time, such as when school ends. Save the ones you like and they come first next time; mark one \"not for us\" and it is not suggested again. An adult or Admin can save places.",
  "help.guide.talk-to-wonderhome.body.8":
    "When you finish setting up your household, HomeTalk opens with a welcome: who is in your household, what WonderHome looks after, and the three ways to talk to it (type, tap the mic, or a live conversation). It then asks a few questions one at a time — what the family loves to eat, what someone doesn't eat, what you enjoy together, your pets. Your answers are kept in your own words under HomeBrain, where you can change them. Say \"skip\" to stop at any point; it happens once.",
  "help.guide.talk-to-wonderhome.body.9":
    "\"After school\" starts when that child's school day ends, and \"after work\" when your own working day ends. Set school hours on the child's details in Family (an Admin), and your working hours on your own details in Settings; setup asks for both too. When no times are recorded, HomeTalk takes school as finishing at 3:30 pm and work at 6 pm, and says so. HomePlaces, under More, lists every place your family saved and every one marked \"not for us\". An adult can keep a note on a saved place, remove it, or let a turned-down place be suggested again.",
  "help.guide.talk-to-wonderhome.body.10": "Ask for somewhere near the office — \"somewhere for lunch near my office\", \"a café near Rohan's work\" — and HomeTalk searches near the office picked on that person's details. An adult picks their own office in Settings, and an Admin can pick one for any adult in Family. With no office picked, HomeTalk says where to add it rather than guessing.",
  "help.guide.talk-to-wonderhome.body.11": "On HomePlaces, under More, an adult can also add a place without asking HomeTalk: start typing its name, pick it from the list (places near home come first), add a note if you like, and save it. HomeTalk then suggests it first, like any place you saved. At the top, Our places lists the household's own places: your home address, each child's school and each adult's office, wherever they were added. Each opens in Google Maps, and the pencil takes you to where it is changed: the home address in Manage Household (an Admin), a child's school under Schools on Kids & School, an office in that person's details in Family. A child's school can be picked from Google Maps there at any time, not only during setup. The child's details in Family offer the same school picker; both change the one school on record.",
  "help.guide.talk-to-wonderhome.body.12": "Ask for a getaway — \"can you suggest a two-day vacation plan?\", \"a weekend getaway for the family\" — and HomeTalk looks a few hours' drive from home for well-rated places worth the trip, such as hill stations, lakes and forts, leaving out what is only a day out. The places come from Google's place search and show as cards you can open on a map, save or mark \"not for us\". Check the drive, the weather and where to stay before you book. Gemini Live answers these too, where your household's privacy setting lets location reach Google; it is HomeTalk's own voice, so anything that needs your OK on screen is said that way.",
  "help.guide.talk-to-wonderhome.body.13": "HomeTalk answers from everything your household has recorded, not only the next few days: an event months ahead with who replied to its invite and how many are coming, everything you told it someone likes, the Meals screen's preferences, your saved places and your home address. It reads what you may see and nothing more, and a change you make shows up in its next answer.",

  // Voice and hands-free conversation
  "help.guide.voice.title": "Voice and hands-free conversation",
  "help.guide.voice.summary": "Tap to speak and review, or talk back and forth hands-free.",
  "help.guide.voice.body.1":
    "Tap the microphone and your words appear in the box for you to check before sending. Nothing is sent until you do.",
  "help.guide.voice.body.2":
    "Live conversation is hands-free: WonderHome listens, answers out loud and keeps going until you end it, and you can pause and resume. It runs on WonderHome's own voice or, where your household has chosen it and it is available, on Gemini Live. The composer shows which one is answering and lets you switch. By voice you can ask about the household, add to the grocery list, set a reminder for yourself, and tell WonderHome what someone in the family likes or doesn't — kept as learned, and yours to correct in HomeBrain. Changing who does what, plans and payments stay in the app. When you start a live conversation, wait until it says it is listening: while it shows \"Getting ready… don't speak yet\" it cannot hear you, and Gemini Live can take a few seconds. \"Ready — speak now\" means go ahead. With Gemini Live, the chat shows what you said in your own words: after each turn, WonderHome writes that turn down again from its audio, using your listening language and your family's names, and replaces the first line if Gemini misheard it. Nothing is kept beyond the line on screen.",
  "help.guide.voice.body.3":
    "Settings → Voice chooses the speech service (your browser's own, or a more accurate one), the voice, and how it listens. Where a choice is not available to your household, it is shown with the reason rather than offered and broken. If an Admin can change that reason, for example Gemini Live needing a Google AI key, a link goes straight to the setting and brings you back once it is saved.",
  "help.guide.voice.body.4":
    "Voice assistants such as Alexa or Gemini Voice can be linked to one person from Settings → Voice assistants once they are available for your WonderHome. A linked assistant speaks as that person and sees only what they may see, and it can never pay or place an order.",
  "help.guide.voice.body.5":
    "While WonderHome is listening or a live conversation is going, the HomeTalk button in the middle of the tab bar pulses with a ring around it, so you can see from any screen that a conversation is in progress.",
  "help.guide.voice.body.6":
    "Gemini voice always runs on Google. If your assistant's key under Settings → AI Assistant is a Google (Gemini) key, voice uses that same key. If your assistant uses Anthropic or OpenAI, an Admin can add a separate Gemini voice key on the same page: it is used only for Gemini voice, and everything else keeps using the assistant's key.",
  "help.guide.voice.body.7":
    "In a live conversation you can ask HomeTalk to open a screen — \"take me to the grocery list\", \"open the calendar\", \"go back to HomeTalk\" — and it goes there and keeps listening. Add or remove things on that screen by voice, move on to another, and come back to the conversation whenever you like. While it runs, a glowing bar at the bottom of every screen shows whether it is listening, thinking or speaking, with pause, end, and a tap back to the conversation. Typed, the same words open the screen too. HomeTalk only opens screens you can use, and opening one changes nothing.",
  "help.guide.voice.body.8":
    "You can also take HomeTalk with you into other apps. If you switch to another app in the middle of a live conversation, HomeTalk floats on its own where your phone allows it, so you never have to remember the button. During a live conversation, tap Float — the small-window icon beside End — and HomeTalk shrinks to a small window that stays over whatever you open next: a message, a browser, another app. It keeps listening and answering out loud, shows what it heard and what it said, and its pause button pauses the conversation. Tap the window to come back to WonderHome, or close it and carry on in the app; the conversation ends only when you end it. The button appears only on phones and browsers that can float a window (Chrome on Android does; on an iPhone it depends on Safari), and nothing extra is recorded: the window is only a picture of the conversation you can already see.",

  // HomeSend: sending WonderHome things
  "help.guide.home-send.title": "HomeSend: sending WonderHome things",
  "help.guide.home-send.summary": "A photo, a PDF, a voice note, a link or a forward — read, then confirmed by you.",
  "help.guide.home-send.body.1":
    "HomeSend takes photos, PDFs, text and CSV files, voice notes, links and pasted messages. Use the paperclip beside the microphone in HomeTalk, or the HomeSend screen, which also keeps an inbox of what is waiting for you.",
  "help.guide.home-send.body.2":
    "Install WonderHome on your phone — from the banner at the top of the screen on a phone, your account menu, or the HomeSend screen — and your phone's own Share button sends straight into HomeSend. A share started before you have signed in on that phone is picked up once you do.",
  "help.guide.home-send.body.3":
    "An AI model reads the whole document — every date of a series, every fee, every thing to buy — and WonderHome shows what it found against what is already on record: something new to add, an existing entry to update, one to cancel, or nothing to change. Nothing is written until you confirm, and you can edit each item or leave it out.",
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
  "help.guide.today-and-home.body.2": "Today's plan is the day as a timeline, in three views: your day, the family's, and the household's. Open it from the Calendar's day view for today. Items are commitments and deadlines — a meal that has to be ready, a bill due, a class — never chores to tick off. The household view also looks ahead two weeks at what is likely to run out or fall due.",
  "help.guide.today-and-home.body.3":
    "Plan something, on Home and Today, adds a family event without leaving the screen.",
  "help.guide.today-and-home.body.4": "On a phone, swipe left or right to move between Home, Calendar, HomeTalk, Family and More.",
  "help.guide.today-and-home.body.5":
    "Under Family status, Home shows your pets, if you have any. Each opens to the same details the Family screen shows; to change them, go to Family.",
  "help.guide.today-and-home.body.6": "What's new, at the top of Home, lists what has been added to WonderHome since you last opened it here, each opening where it lives. Got it hides the list; it never shows the same thing twice, and an entry leaves on its own a month after it arrived.",

  // Calendar
  "help.guide.calendar.title": "Calendar",
  "help.guide.calendar.summary": "Everything the family has on, by month, week, day or year.",
  "help.guide.calendar.body.1": "Calendar is the second tab. It opens on the month: each day shows a coloured dot for each thing on (on a wider screen, the first titles), and tapping a day lists it underneath. Week, Day and Year are one tap away. On a phone you can also pinch: spread two fingers to go from Year to Month to Week to Day, and pinch them together to go back. Swipe left or right on the calendar to move to the next or previous month, week or day.",
  "help.guide.calendar.body.2": "It shows family events, everyone's birthdays and special days from their profile, and public holidays. Holidays come from the Government of India's published list for central government offices, each labelled with that source; choose national or Delhi, or turn them off, in Filters. Each entry opens the screen it belongs to — an event opens its own page, which is where it is changed.",
  "help.guide.calendar.body.3": "Add puts a plan on the calendar: what, when (or all day), who's going and a category. Under More options you can make it repeat, choose who can see it — everyone, only the people going, or just you — and add notes. Before it is added, WonderHome checks for clashes and tells you what it clashes with; someone busy with something you can't see is shown only as busy. You can still add it anyway.",
  "help.guide.calendar.body.4": "Open one day of a repeating event and its planner can skip just that day, or bring it back; the rest carry on. A proposed plan has a dashed edge and says \"Proposed\".",
  "help.guide.calendar.body.5": "Filters only change what you see: categories, people, only things you're part of, only confirmed plans, holidays, and the view the calendar opens on. Today's plan — meals, bills, school and what needs you — is one tap from today's day.",
  "help.guide.calendar.body.6": "Ask HomeTalk what's on for a month or more — \"any events in December?\", \"what's coming up in the next few months?\" — and it lists, by date, the events, birthdays and holidays on the Calendar that you can see. It reads the Calendar itself, so nothing private of someone else's is mentioned.",
  "help.guide.calendar.body.7": "Ask what comes next — \"what's the next upcoming event?\", \"when is the next public holiday?\", \"any birthdays coming up?\" — and HomeTalk names the next one on the Calendar and the two after it, looking up to a year ahead, with only what you can see.",

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
  "help.guide.bills.body.6": "Budgets: an Admin can set what the household means to spend on one kind of bill — utilities, rent, school fees — per month, quarter or year, and Bills shows what has been spent and what is left. A budget never blocks a bill. Spending in another currency is listed beside it, never added in, because nothing is converted.",

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
  "help.guide.school.body.5":
    "Each child has their own card on Kids & School. It shows the school, picked from Google Maps with its class and section, the class teacher and every subject teacher. An adult adds, changes or removes a teacher with the pencil and bin beside each name. The school's start and end times are set there too, and they are the same as in the child's details in Family: change one and the other follows.",
  "help.guide.school.body.6":
    "Classes outside school, such as music, piano, karate or any learning class, are folded rows under the child's card. A folded row shows the class, a short description and the days and times it meets. Opened, it shows the teacher, where it is (picked from Google Maps), from when until when, your notes, competitions coming up and the medals and awards won, and you can add more of each. Its days and times put every class on the Calendar on its own, including today's, with nothing to add by hand. Stopping a class takes it off the Calendar and keeps what was recorded.",

  // Meals, groceries and running out of things
  "help.guide.meals-and-shopping.title": "Meals, groceries and running out of things",
  "help.guide.meals-and-shopping.summary": "One list: what's at home and what to buy, side by side.",
  "help.guide.meals-and-shopping.body.1":
    "Groceries shows every item you track in one list. Each row says how much is in stock and how much is to buy, and the two never overwrite each other. The + and − on a row only change how much to buy. What's at home changes only when you set it on the item's own page (Update stock) or mark something bought, and only adults in the household can change it. An amount nobody has given is shown as not counted yet; WonderHome never guesses it, and a date you last bought something is never taken to mean it has run out.",
  "help.guide.meals-and-shopping.body.2":
    "To buy shows just what's on the list, by category. Mark as bought asks how much you actually bought of each: that amount is added to what's at home, and anything you bought less of stays on the list. Use soon shows use-by dates someone entered from the pack, and items at or below the low level you set on their page. Add item searches what you already have first, including things you stopped tracking, so the same thing isn't added twice.",
  "help.guide.meals-and-shopping.body.3":
    "Send a receipt through HomeSend and each line you keep becomes purchase history for that item. Lines it cannot match to something you track are yours to match, start tracking or skip; it never guesses. Ordering from a shop is not available, so nothing is ever bought on your behalf. Each kept line is also added to what's at home and taken off the list when it's waiting there; the review shows the amount before and after, and you can untick either. If someone counted the item after the receipt's day, it isn't added again unless you tick it. A receipt that looks already recorded — the same shop, day and total — is only recorded again when you tick Record it again. Undo takes the purchase, the amount at home and the list change back together.",
  "help.guide.meals-and-shopping.body.4":
    "Meals has a plan, your recipes, and preferences. A recipe can carry rough nutrients per serving. Suggest proposes a meal from what you have and what people like, and missing ingredients go on the shopping list.",
  "help.guide.meals-and-shopping.body.5":
    "Preferences record whose they are — a dislike, an allergy, a medical or ethical choice — so one person's dislike never quietly becomes a house rule. An allergy always wins.",
  "help.guide.meals-and-shopping.body.6":
    "You can also tell HomeTalk amounts in your own words: \"add 6 more eggs\", \"take 500 g rice off the list\", \"we have 10 eggs\", \"we used half a kilo of rice\", \"I bought 2 kg potatoes\". Asking to add something already on the list, with no amount, changes nothing; with an amount, it adds to what's there. Taking something off the list never stops tracking it. Changes to what's at home are proposed first and wait for your yes, unless your household lets WonderHome act on groceries on its own.",
  "help.guide.meals-and-shopping.body.7": "On a planned meal, Ingredients shows only what the meal is short of: what it needs for the servings you pick, less what is at home and what is already on the list. Change the servings and the amounts change with them. When nobody has said how much is at home it says the amount is an estimate, and when the recipe gives no amount it offers one usual pack. Add to the list puts just those on the list; nothing is bought twice, and an ingredient you don't track yet is added as a new item.",
  "help.guide.meals-and-shopping.body.8": "Add item also searches WonderHome's grocery catalog as you type, by English, Hindi or regional names. It shows the everyday choice first — eggs are white and brown eggs, not every kind — and the brands on sale, with pictures; a less common kind appears when you type it (\"duck eggs\"). No amount is shown until you pick one: then − and + move through the amounts shops sell and people ask for, like 250 g, 500 g, 750 g, 1 kg, 1.25 kg for vegetables, 1, 2, 5 or 10 kg for atta, and one at a time for eggs and packets. The same steps work on the list. An item you picked shows its picture until you add your own photo. Everyday Indian foods show nutrition per 100 g from the Indian Food Composition Tables 2017 (ICMR–National Institute of Nutrition), saying when the match is close rather than exact; a packed product shows what its label states. The catalog is shared by every household; what you add and keep stays yours.",
  "help.guide.meals-and-shopping.body.9": "Each row on the list shows the item's energy and protein per 100 g under its name, when its catalog source has them, from the same source the item's page credits. When you or HomeTalk add something by name — \"add pasta\" — it is counted the way the catalog counts it (pasta in grams, at the usual 500 g pack) and filed under the catalog's category, rather than one piece. An amount you say still decides the unit.",
  "help.guide.meals-and-shopping.body.10": "Change meal, on a meal's card, changes it right there: what it is, the recipe, the slot, the day, when it's ready and who cooks. When it has no recipe, Add a recipe under the recipe picker opens the recipe form, and the new recipe is picked for this meal. Remove from the plan, at the bottom of the same sheet, takes off a meal still to come; anything it already put on the shopping list stays there. A meal planned without a recipe can still have ingredients: open Ingredients and add each item on its own row, with how much and the unit (500 g rajma, 2 pieces of onion), or pick one of your recipes. Leave How much empty when you don't know it, and the list says the amount isn't known. A recipe's essential ingredients are added the same way, so every meal planned from it knows what to buy. The card says what is still to get and what is already on the shopping list.",

  // Health and fitness
  "help.guide.health.title": "Health and fitness",
  "help.guide.health.summary": "Records, vitals and routines, private to each person unless they share them.",
  "help.guide.health.body.1":
    "Health & Fitness keeps each adult's issues, checkups, appointments, vitals (weight, blood pressure, steps and more, or your own measurement), health records such as lab results and prescriptions, fitness goals and routines. It shows what needs attention and what is coming up — never a health score.",
  "help.guide.health.body.2":
    "Health information is private to its person by default. They can share it with people they choose, or share only the practical part with the whole household (\"unavailable 5–6pm\"), and take it back at any time. Being in the same household never by itself gives anyone access. A guardian can always see their child's.",
  "help.guide.health.body.3":
    "Whether HomeBrain may consider a person's health information at all is a separate switch on the Privacy tab, and even then nothing is shown to anyone the sharing setting excludes. Health documents sent through HomeSend always wait for a person to confirm. A child who asks HomeTalk about their own appointment is told one is coming up and that the adults in the family can see the details — never what or with whom.",

  // Home and upkeep
  "help.guide.home-upkeep.title": "Home and upkeep",
  "help.guide.home-upkeep.summary": "Maintenance, services, laundry and pets — only what needs a person.",
  "help.guide.home-upkeep.body.1":
    "Home & Upkeep brings together maintenance, service requests, laundry and pet care, and shows only what needs somebody. When nothing does, it says so.",
  "help.guide.home-upkeep.body.2":
    "An Admin records the home's appliances; any adult can raise a service request.",
  "help.guide.home-upkeep.body.3":
    "Weather speaks only when it changes a decision — washing that will not dry outside today, for example — and never as a forecast readout. It uses the area an Admin chose, kept only to about a kilometre.",
  "help.guide.home-upkeep.body.4": "Weather is used only where it is switched on for your WonderHome; Settings → Connected accounts shows whether it is.",

  // Members, roles and what each person sees
  "help.guide.household-and-roles.title": "Members, roles and what each person sees",
  "help.guide.household-and-roles.summary": "One household, several identities, and a different view for each.",
  "help.guide.household-and-roles.body.1":
    "The person who creates the household is its owner and an Admin. Every Admin can do the same things: any Admin can make another adult an Admin, or step one back to adult, from Family or Manage Household. Only adults can be Admins, and the owner always stays one, so a household is never left without an Admin.",
  "help.guide.household-and-roles.body.2":
    "Adults, children and househelpers each get their own view. This is not a filter applied on the screen: a section somebody may not see is never sent to their device at all, and WonderHome checks again behind the scenes every time.",
  "help.guide.household-and-roles.body.3":
    "Children get age-appropriate access. Househelpers are never asked to update chores, and WonderHome holds no productivity data about them.",
  "help.guide.household-and-roles.body.4":
    "Admins invite, change and remove members from Manage Household. Removing someone never deletes the history they were part of.",
  "help.guide.household-and-roles.body.5": "Admins can see who changed what, and when, under Manage Household → Activity: changes to roles, invitations, the playbook, your rules and connected accounts. It is kept as a record and never edited. It holds nothing anyone said, wrote or asked, and no keys or passwords.",

  // Family, pets and family time
  "help.guide.family.title": "Family, pets and family time",
  "help.guide.family.summary": "Everyone in one place, pets included, and time kept free for each other.",
  "help.guide.family.body.1":
    "Family lists everyone, with each person's details a tap away. You edit your own profile and photo in Settings; an Admin can edit anyone's. \"Family calls me\" records what the family calls a person — Dad, Nani — so WonderHome can talk about people the way you do.",
  "help.guide.family.body.2":
    "Pets are part of the family here, with a photo, a date of birth and their own care tracked alongside everyone else's.",
  "help.guide.family.body.3":
    "Family events — birthdays, outings, visits, appointments — can be marked as protected time, and WonderHome never schedules over them. Things that need a reply, such as a clash or a gift still to sort, are listed until they are settled.",
  "help.guide.family.body.4":
    "Tap an event to open it. It shows the details, what is still to plan (a place, who's coming, a note, a link), and everyone's replies. The event's planner or an Admin can edit or cancel it and choose who in the family is asked. \"Invite with a link\" makes a link you can send to anyone: it shows only the event's name, time, place and your household's name, and they reply yes, maybe or no with their name. Turning the link off stops it working; replies already given stay.",
  "help.guide.family.body.5": "Everyone can sign in as themselves — adults, children and househelpers. An Admin opens a person in Family, taps the pencil and adds their sign-in email. When that person signs in with that email, by password or with Google, and the email is confirmed, they come straight into the household with the role they already have; what they see follows that role. An Admin can also tap Invite on someone without an account: Create invite link makes a link that works once and stops after 7 days, and Send email, Share (WhatsApp and other apps) or Copy link passes it on. When the person has a sign-in email in their details, Invite also offers to email the invite to that address: WonderHome sends it from connect@wonderapps.biz, only to the email on record, and says whether it went. Create a link instead skips the email. Otherwise Send email opens your own email app.",
  "help.guide.family.body.6": "Every member can have a phone number in their details — an adult, a child or a househelper. An Admin adds it with the pencil in Family, or when adding a helper; an Indian number works as it is, and any other needs its country code. Admins and the household's adults can see everyone's number, and everyone sees their own. Where your WonderHome offers signing in by phone, Sign in shows Sign in with your phone number instead: a code is texted to the number, and someone whose number is in their details comes straight into the household as themselves, with the role they already have — so a helper with no email can sign in too.",

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
  "help.guide.outcomes.body.4": "Share the load, on Manage Household → Responsibilities, shows how many times a week each person's responsibilities come round. When one person carries far more than another, it can suggest that the backup already named takes one over; nothing changes until an Admin accepts.",

  // Your plan
  "help.guide.plan.title": "Your plan",
  "help.guide.plan.summary": "Free, Pro and Max — and free to switch during early access.",
  "help.guide.plan.body.1":
    "Settings → Your plan shows the plans, what each includes and its monthly limits, and your household's usage this period. Free covers the household basics: outcomes, reminders, upkeep, groceries and text conversation. Pro adds school, meals, bills, family time, health and fitness, voice and weather. Max adds acting without asking first, deeper connections, and no monthly limits.",
  "help.guide.plan.body.2":
    "During early access, switching plans is free and nothing is charged. Prices are shown monthly or yearly so you know what to expect later.",
  "help.guide.plan.body.3":
    "Something that is not part of your plan says so where it would appear, rather than offering a button that does nothing. If a feature is part of a trial, Settings tells you.",
  "help.guide.plan.body.4": "When paid plans begin, you will pay on the payment provider's own page — WonderHome never sees your card — and Settings → Your plan → Billing keeps each payment and invoice. A cancellation or a move to a smaller plan waits until the end of the period you paid for.",

  // How much WonderHome may do on its own
  "help.guide.ai-autonomy.title": "How much WonderHome may do on its own",
  "help.guide.ai-autonomy.summary": "Four levels, set per responsibility, and you choose them.",
  "help.guide.ai-autonomy.body.1":
    "Each responsibility carries an autonomy level, which an Admin sets in Manage Household → AI autonomy: Suggest (watch and tell you), Prepare (get things ready and wait), Ask approval (do the work once you say yes) or Execute (handle it and tell you what was done). WonderHome enforces it behind the scenes — not just on the screen.",
  "help.guide.ai-autonomy.body.2":
    "Payments, permission changes and deletions always need a person, whatever the setting, and paying money needs you to confirm it is you at the moment you approve.",

  // HomeBrain and asking "why?"
  "help.guide.certification.title": "HomeBrain and asking \"why?\"",
  "help.guide.certification.summary": "Everything WonderHome believes, where each belief came from, and how to fix it.",
  "help.guide.certification.body.1":
    "HomeBrain shows what WonderHome believes about your household and where each belief came from — you told it, it observed it, or something you sent said so. Anything it has wrong, you can correct, add or remove.",
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
    "Who can see what is decided behind the scenes, before anything reaches a device. A screen hiding something is presentation; it is never the thing keeping it private. Wherever you enter personal details, such as an address, a date of birth or a photo, a short line links to how we protect them.",
  "help.guide.privacy.body.3":
    "Settings → Privacy & security lets you download a copy of your data after confirming your password. You can also ask for your data to be deleted: there is a 30-day countdown you can call off, and things the household shares, such as the playbook and what was paid, stay with the household. The household's owner hands that role to someone else first.",
  "help.guide.privacy.body.4":
    "An Admin decides in Settings → AI Assistant what kinds of information the assistant may share with the AI service — children's details, health, amounts and bills, where people are, private messages. What is not allowed is left out of anything the assistant sends.",

  // Which model powers the assistant
  "help.guide.ai-key.title": "Which model powers the assistant",
  "help.guide.ai-key.summary": "Ours by default; yours if you would rather.",
  "help.guide.ai-key.body.1":
    "WonderHome runs the assistant on its own account with an AI provider, so you do not need one with an AI company. Settings → AI Assistant shows whose key is in use.",
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
  "help.guide.connections.body.5": "Where your WonderHome has it switched on, an Admin can let an app the household trusts see or add to the grocery list, or see the household's name, time zone and how many people are in it. The key is created under Settings → Connected accounts → Developer access: tick only what it may do, and choose when it stops working (30 days, 90 days, a year or never). Each key is shown once and can be revoked at any time; a sandbox key uses sample data and changes nothing.",

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
  "help.faq.calendar-private.q": "Can others see my private events?",
  "help.faq.calendar-private.a": "No. An event set to \"Just me\" is seen only by you — not even an Admin can open it — and one set to \"Only the people going\" is seen by you and the people you asked. If someone plans something at the same time with you in it, WonderHome may tell them you're busy then, never what it is.",
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
    "Manage Household lists every step. Steps that do not apply to your home — no children, no helper — are left out of the total, so 100% is reachable for every household.",
  "help.faq.budget.q": "Can I set a budget?",
  "help.faq.budget.a": "Yes. On Bills, an Admin can set a budget for one kind of bill per month, quarter or year, and everyone who can see money sees what is left. A budget never stops a bill being paid.",
  "help.faq.other-apps.q": "Can other apps connect to WonderHome?",
  "help.faq.other-apps.a": "Where it is switched on for your WonderHome, an Admin can create a key in Settings → Connected accounts that lets an app you trust see or add to the grocery list — only what you ticked, and it can be revoked at any time.",
  "help.faq.activity-trail.q": "Can I see who changed a setting?",
  "help.faq.activity-trail.a": "If you are an Admin, yes. Manage Household → Activity lists who changed what and when — roles, invitations, the playbook, your rules and connected accounts. It never records what anyone said or asked.",
} as const;
