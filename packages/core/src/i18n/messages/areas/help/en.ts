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
    "When you ask for something everyday — plan an evening, add to the list, plan a meal, say you're away — HomeTalk does it straight away and tells you what it did; say or type \"undo\" to take it back. When a request involves other people, such as inviting guests or changing someone else's duties, it asks once in the conversation, and a spoken or typed yes is enough. Payments, orders and changes to who can do what always wait for your OK on screen. An Admin can turn on \"Ask before acting on what I say\" in Settings → AI Assistant to be asked first every time.",
  "help.guide.talk-to-wonderhome.body.3":
    "You can correct it the way you would a person: \"no, I meant Manan\", \"not milk, almond milk\", \"actually, make that Friday\", \"make that 2 litres\" (the item stays, only the amount changes). If the change had not happened yet, the proposal is replaced; if it had, WonderHome undoes it and makes the corrected one, and both steps stay on record.",
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
  "help.guide.talk-to-wonderhome.body.13": "HomeTalk answers from everything your household has recorded, not only the next few days: an event months ahead with who replied to its invite and how many are coming, everything you told it someone likes, the Meals screen's preferences, your saved places and your home address. It reads what you may see and nothing more, and a change you make shows up in its next answer. Ask \"what does the family like to eat?\" or \"who likes what?\" and it lists everyone's likes, person by person, from the same records; by Gemini Live too.",
  "help.guide.talk-to-wonderhome.body.14": "When nothing seems to be on record, HomeTalk looks again before it says so: it reads that part of the home afresh, as you could see it on screen, and answers from what it finds. Say \"check again\" or \"look in the database\" to ask it to. It also notices what two records mean together and says it plainly, from the records themselves: movie night the evening before a child's exam, a meal short of something you don't have, a bill due on a day its payer is away, a job whose only owner is away with nobody to cover, or how many guests have said yes (each reply added up). Ask \"should we…?\" and those come first; ask \"when is…?\" and the answer comes first, then what it noticed. It never decides money or health for you, and it never joins two things with \"because\" unless one of these noticed links says so.",
  "help.guide.talk-to-wonderhome.body.15": "When a child or a helper asks HomeTalk to change something, HomeTalk shows them what it would do, and their \"Ask a grown-up\" sends it to their guardian, or else an Admin, for the final OK. Nothing is added until that adult taps Approve, under \"Asking for your OK\" on Notifications; Decline leaves everything as it was. Either way, the child or helper is told in their own conversation. A request waits up to 48 hours, and if what it would do has changed meanwhile, it is not carried out.",

  // Voice and hands-free conversation
  "help.guide.voice.title": "Voice and hands-free conversation",
  "help.guide.voice.summary": "Tap to speak and review, or talk back and forth hands-free.",
  "help.guide.voice.body.1":
    "Tap the microphone and your words appear in the box for you to check before sending. Nothing is sent until you do.",
  "help.guide.voice.body.2":
    "Live conversation is hands-free: WonderHome listens, answers out loud and keeps going until you end it, and you can pause and resume. It runs on WonderHome's own voice or, where your household has chosen it and it is available, on Gemini Live. The composer shows which one is answering and lets you switch. By voice you can do what typing does: ask about the household, plan something, add to the list, set reminders, say someone is away and tell WonderHome what someone likes — and say \"undo\" to take back what it just did. Payments and orders stay on screen. When you start a live conversation, wait until it says it is listening: while it shows \"Getting ready… don't speak yet\" it cannot hear you, and Gemini Live can take a few seconds. \"Ready — speak now\" means go ahead. With Gemini Live, the chat shows what you said in your own words: after each turn, WonderHome writes that turn down again from its audio, using your listening language and your family's names, and replaces the first line if Gemini misheard it. Nothing is kept beyond the line on screen.",
  "help.guide.voice.body.3":
    "Settings → Voice starts with what is talking with you right now — Gemini Live in a conversation, and the voice that reads typed replies aloud — and a few tips for using voice. Then come who runs a live conversation, the voice for reading replies (your phone's own, or a Google voice where one is set up), and how it listens. A choice that isn't available to your household is shown with the reason rather than offered and broken; if an Admin can fix that reason, for example Gemini Live needing a Google AI key, a link goes straight to the setting and brings you back once it is saved.",
  "help.guide.voice.body.4":
    "Voice assistants such as Alexa or Gemini Voice can be linked to one person from Settings → Voice assistants once they are available for your WonderHome. A linked assistant speaks as that person and sees only what they may see, and it can never pay or place an order.",
  "help.guide.voice.body.5":
    "While WonderHome is listening or a live conversation is going, the HomeTalk button in the middle of the tab bar pulses with a ring around it, so you can see from any screen that a conversation is in progress.",
  "help.guide.voice.body.6":
    "Gemini voice always runs on Google. If your assistant's key under Settings → AI Assistant is a Google (Gemini) key, voice uses that same key. If your assistant uses Anthropic or OpenAI, an Admin can add a separate Gemini voice key on the same page: it is used only for Gemini voice, and everything else keeps using the assistant's key.",
  "help.guide.voice.body.7":
    "In a live conversation you can ask HomeTalk to open a screen — \"take me to the grocery list\", \"open the calendar\", \"go back to HomeTalk\" — and it goes there and keeps listening. Add or remove things on that screen by voice, move on to another, and come back to the conversation whenever you like. While it runs, a glowing bar at the bottom of every screen shows whether it is listening, thinking or speaking, with pause, end, and a tap back to the conversation. Typed, the same words open the screen too. HomeTalk only opens screens you can use, and opening one changes nothing. When HomeTalk changes something for you, typed or spoken, it opens the screen that shows the change, already up to date: add tomato, and the shopping list opens with tomato on it.",
  "help.guide.voice.body.8":
    "You can also take HomeTalk with you into other apps. If you switch to another app in the middle of a live conversation, HomeTalk floats on its own where your phone allows it, so you never have to remember the button. During a live conversation, tap Float — the small-window icon beside End — and HomeTalk shrinks to a small window that stays over whatever you open next: a message, a browser, another app. It keeps listening and answering out loud, shows what it heard and what it said, and its pause button pauses the conversation. Tap the window to come back to WonderHome, or close it and carry on in the app; the conversation ends only when you end it. The button appears only on phones and browsers that can float a window (Chrome on Android does; on an iPhone it depends on Safari), and nothing extra is recorded: the window is only a picture of the conversation you can already see. With Gemini Live, its voice plays through that small window, which is what lets a phone float it on its own; where the phone won't allow that, the voice comes from the speaker as before.",

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
  "help.guide.today-and-home.body.2": "Today's plan is the day as a timeline, in three views: your day, the family's, and the household's. Open it from the Calendar's day view for today. Items are commitments and deadlines — a meal that has to be ready, a bill due, a class — never chores to tick off. The household view also looks ahead two weeks at what is likely to run out or fall due. Each entry opens where it lives: an event its page, a meal Meals, a bill Bills, school work Kids & School. An adult can change a meal from its pencil (another dish, time or cook) and plan a new one for today with Plan a meal.",
  "help.guide.today-and-home.body.3":
    "Plan something, on Home and Today, adds a family event without leaving the screen.",
  "help.guide.today-and-home.body.4": "On a phone, swipe left or right to move between Home, Calendar, HomeTalk, Family and More.",
  "help.guide.today-and-home.body.5":
    "Under Family status, Home shows your pets, if you have any. Each opens to the same details the Family screen shows; to change them, go to Family.",
  "help.guide.today-and-home.body.6": "What's new, at the top of Home, lists what has been added to WonderHome since you last opened it here, each opening where it lives. Got it hides the list; it never shows the same thing twice, and an entry leaves on its own a month after it arrived. For everything that has changed, version by version, see Release notes at the end of Get help.",

  // Calendar
  "help.guide.calendar.title": "Calendar",
  "help.guide.calendar.summary": "Everything the family has on, by month, week, day or year.",
  "help.guide.calendar.body.1": "Calendar is the second tab. It opens on the month: each day shows a coloured dot for each thing on (on a wider screen, the first titles), and tapping a day lists it underneath. Week, Day and Year are one tap away. On a phone you can also pinch: spread two fingers to go from Year to Month to Week to Day, and pinch them together to go back. Swipe left or right on the calendar to move to the next or previous month, week or day.",
  "help.guide.calendar.body.2": "It shows family events, everyone's birthdays and special days from their profile, and public holidays. Holidays come from the Government of India's published list for central government offices, each labelled with that source; choose national or Delhi, or turn them off, in Filters. Each entry opens the screen it belongs to — an event opens its own page, which is where it is changed.",
  "help.guide.calendar.body.3": "Add puts a plan on the calendar: what, when (or all day), who's going and a category. Under More options you can make it repeat, choose who can see it — everyone, only the people going, or just you — and add notes. Before it is added, WonderHome checks for clashes and tells you what it clashes with; someone busy with something you can't see is shown only as busy. You can still add it anyway. For Where, an adult can search Google Maps and pick the place; the event then shows its address and opens in Google Maps, for guests too. A place you type, such as Home, is kept as written.",
  "help.guide.calendar.body.4": "Open one day of a repeating event and its planner can skip just that day, or bring it back; the rest carry on. A proposed plan has a dashed edge and says \"Proposed\".",
  "help.guide.calendar.body.5": "Filters only change what you see: categories, people, only things you're part of, only confirmed plans, holidays, and the view the calendar opens on. Today's plan — meals, bills, school and what needs you — is one tap from today's day.",
  "help.guide.calendar.body.6": "Ask HomeTalk what's on for a month or more — \"any events in December?\", \"what's coming up in the next few months?\" — and it lists, by date, the events, birthdays and holidays on the Calendar that you can see. It reads the Calendar itself, so nothing private of someone else's is mentioned.",
  "help.guide.calendar.body.7": "Ask what comes next — \"what's the next upcoming event?\", \"when is the next public holiday?\", \"any birthdays coming up?\" — and HomeTalk names the next one on the Calendar and the two after it, looking up to a year ahead, with only what you can see.",
  "help.guide.calendar.body.8": "An event's invite link has a design: birthday, anniversary, wedding, festival, puja, housewarming, baby, get-together or classic. Until you choose one, the design follows the event — a \"Diwali at ours\" gets lanterns and diyas. You can add a line for your guests; they see it on the invitation, but never your notes. When you send the link on WhatsApp, the chat shows the invitation as a large picture with what, when and where; Preview invitation shows you the page your guests open. Preview shows the invitation with the design and line you've picked before you save. Share invitation sends it as a tall picture, shaped for a phone, with the link under it. Type who it is for under \"Who is it for?\" first — or, on Android, pick them from your contacts — and the link you copy or share opens with their name already in \"Your name\"; they can change it.",
  "help.guide.calendar.body.9": "The calendar also shows the rest of the home, each only to those who may see it: school work and exams, with homework and projects marked \"Due\"; bills still to pay, by name only and only to those who can see money; appointments; days a helper is away; booked service visits; and grocery deliveries on their way. Someone else's appointment says only \"Busy\", unless it is yours, your child's, or shared with the whole family. Planned meals and responsibilities due start hidden. Switch each on or off under \"Also show\" in Filters; anything not in your plan isn't offered. Each entry opens its own screen, where it is changed.",
  "help.guide.calendar.body.10": "Ask HomeTalk when the family is free to go away — \"what's the best time for a 2-day getaway?\", \"which weekend is free for a trip?\" — and it works it out from the Calendar: the long weekends public holidays make (a Friday or Monday holiday, or a Thursday or Tuesday one with a day taken off) where nothing is on for the family, then the next free weekends, and what is on the others, such as an exam the morning after. It is worked out from your records, not guessed by AI, and uses only what you can see. Where to go comes with it: up to five places worth the drive from home, as cards you can open in Google Maps or save, sized to the trip (three days for a long weekend). To ask for places on their own, say \"suggest a 2-day getaway\".",

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
  "help.guide.notifications.body.6": "Push on this phone, in Settings → Notifications, lets WonderHome reach that device when it has push switched on. A push goes only to the person a reminder is for, at the time chosen for them and in their language: anything critical always, something urgent, and reminders timed for you — a bill due, school things to pack, the cook's list — up to a few a day. Everything else waits in the app, a settled reminder never arrives, and quiet hours hold except for something critical. Send a test shows what it looks like; Turn off forgets that device only. On an iPhone, add WonderHome to your Home Screen first.",
  "help.guide.notifications.body.7": "Email, where your WonderHome has it set up, sends a reminder to the address of your own account — the one you sign in with — by the same rules as push: anything critical always, something urgent up to a dozen a day, and reminders timed for you up to a few. Each email has a button back into WonderHome and says why it came. Turn it on under Settings → Notifications → Email. It is off until you do, and someone with no confirmed email address on their own account gets none.",
  "help.guide.notifications.body.8": "Under Settings → Notifications, What goes where lists each kind of reminder — meals, school, groceries, bills, home, pets, appointments, family and system — against the channels you have turned on, as tick boxes. Everything starts ticked. Untick one and that kind of reminder stops using that channel: bills can go by WhatsApp and school by push, say, while the app keeps all of them. Anything critical still reaches you on every channel you have on. Only channels that reach someone on your WonderHome are listed, and the choice is yours alone.",
  "help.guide.notifications.body.9": "Under each channel in Settings → Notifications, WonderHome says whether a reminder will reach you there, and if it may not, why in plain words: the channel is off, no device or address is saved, it is inside that channel’s quiet hours, today’s ordinary reminders have all been sent, or the last attempt did not go through. Send a test on Email or WhatsApp (or on this phone, under Push) sends one message to you alone, right away, even in quiet hours, so you can see it arrive.",
  "help.guide.notifications.body.10": "Every notification email ends with a link that turns email off with one tap; opening it asks first, so nothing changes until you press the button, and reminders and alerts stay in the app. If the mail server refuses your address three times in a row, WonderHome stops trying and pauses email, and Settings → Notifications tells you why. Check the email on your account, then tick “Send here” and save to turn it back on.",
  "help.guide.notifications.body.11": "When an email, push or WhatsApp message fails for a reason that may pass, such as the service not answering, WonderHome tries again a couple of minutes later, up to three tries in all, and never for something that has since been settled. Admins can see how it is going under Manage Household → Notification delivery: for each channel over the last week, how many were sent, how many did not arrive and why, how many arrived on a retry, and how many are waiting. It shows counts only, never the messages or anyone’s address.",
  "help.guide.notifications.body.12": "Some notifications are about something that happened, not a time. Each goes to the one person it is for, once, and clears itself when the thing is dealt with: something sent to HomeSend that is waiting for your OK (it says only what kind of thing it is); the replies guests give to an event you made, as one notice that updates; a helper who will not be in; a grocery order being placed, shipped or delivered; an event someone else moved or cancelled, to the people going; and, only where Weather is on, rain that changes a plan, such as an outing or washing that will not dry. WonderHome never tells you about your own change.",
  "help.guide.notifications.body.13": "If a bill, school or pet reminder goes unanswered, WonderHome also sends it once by email or WhatsApp, whichever you have on, before it reaches your backup. Under each channel in Settings → Notifications you can switch on one morning summary at a time you choose: today’s reminders in one message, with the ordinary ones staying in the app instead of buzzing too. Anything urgent still comes through, and a day with nothing in it sends nothing.",
  "help.guide.notifications.body.14": "A child’s reminders stay quiet at night by age until a guardian sets something else: 7:30 PM to 7:00 AM under 8, 8:30 PM to 7:00 AM from 8 to 12, 10 PM to 7 AM from 13 to 17. An Admin or the child’s guardian changes it in Family, in the child’s details. Someone with no confirmed email on their account, such as a helper who signs in by phone, is not offered email, only WhatsApp and push.",

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
  "help.guide.bills.body.6": "Budgets: an Admin can set what the household means to spend on one bill — electricity, water, piped gas, petrol and diesel, rent, school fees and the rest, picked from a list grouped by kind — per month, quarter or year, and Bills shows what has been spent and what is left. A budget set earlier for a whole kind, such as utilities, keeps counting that kind. A budget never blocks a bill. Spending in another currency is listed beside it, never added in, because nothing is converted.",
  "help.guide.bills.body.7": "Add a bill starts from what it is: pick Electricity, Rent, a home loan EMI, school fees, petrol and diesel or one of the other everyday bills, or Something else. Picking one fills in its kind and how often it comes, and the Payee list offers the companies that serve your home first — BESCOM for a home in Bengaluru, say — from the address saved under Manage Household, then the ones anywhere in India; Add a new payee is always there. Under This bill you give its amount, which can wait until the bill arrives, and when it is due. Who in the family pays it is picked too.",
  "help.guide.bills.body.8": "Open a recurring bill and Month by month shows its last three months, this one and the next. A past month says Paid with the amount and the day, or Not entered, and its pencil lets you say what it came to and when you paid it. The coming month says the amount someone gave, or Usually and the last amount paid — never a figure nobody gave. Paying the current month moves the bill on to its next date by itself; paying the next month ahead keeps it in the history, and the bill skips that month when it gets there. A month paid ahead isn't counted in the monthly spend until it comes.",
  "help.guide.bills.body.9": "HomeTalk can do the same. \"Add the electricity bill, 2,400 due on the 5th every month\" is asked once, then added. \"I paid the electricity bill, 2,340 yesterday\" marks that month paid at once, and \"next month's rent is 26,000\" notes the amount; say undo to take either back. When two bills fit, it asks which. None of this moves money: paying from WonderHome is not available yet. Only an Admin can change bills, and HomeBrain answers \"how much was the electricity bill last month?\" from the months on record.",

  // School and children's work
  "help.guide.school.title": "School and children's work",
  "help.guide.school.summary": "Homework, exams and notices, and deadlines that will not fit.",
  "help.guide.school.body.1":
    "Kids & School shows each child's homework, exams, events and teacher updates, grouped by when they are due. Add homework by hand, or upload a screenshot and WonderHome fills in the form for you to check before adding. With more than one child, it shows one child at a time: tap a name at the top to switch; the first child is shown to begin with.",
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
  "help.guide.school.body.7": "Each child's card on Kids & School also holds their school timetable and their exams. Add each period of the week (the day, the subject, when it starts and ends, and the teacher or room if you like); the week then shows as one row per school day, opening to its periods. Under Exams, add an exam by its kind (Unit test, Mid-term, Finals, or one of your own, which is then there to pick next time) and give it a name such as Term 1. Open it to add each subject on its day and time, with what it covers and links to material. Each subject is on the Calendar on its day, and HomeTalk can answer \"when is Asmi's maths exam?\" or \"what does it cover?\" from them. A child sees their own timetable and exams; their guardians and Admins change them. Removing a period, an exam or a subject keeps its record.",
  "help.guide.school.body.8": "Goals, on Kids & School, is where a parent or an Admin sets small goals with a child: what it is, a picture, how often it counts (every day, some days a week, or just once), how many stars each time, and a reward if you like. You can change or retire a goal at any time; a retired goal keeps the stars it already earned. The tab shows where each goal stands this week. Fun on a child's Home comes from the family calendar — outings, family time, gatherings, trips, birthdays and special occasions they can see — so you add fun in Calendar.",
  "help.guide.school.body.9": "A child's WonderHome is brighter and works like a game. Their Home opens with their level, stars and streak, and the tabs Today, School, Goals and Fun. Today shows their missions (goals for today and school work due today), what is on the family calendar today and the next fun thing. They tap \"I did it!\" on a goal or a piece of school work, and tap again to take it back. Every star is counted from those taps — each goal's stars, and one for each piece of school work marked done — and the card says how many came from each; badges mark milestones such as a 3-day streak. Nothing an adult sees changes.",
  "help.guide.school.body.10": "A child's Home also has a cat. Only the child names it, and the pencil beside the name changes it later. The child also picks the cat's colour there, from ginger, grey, black, white, brown or calico; the cat tries each one on before they save. The cat says one thing at a time, worked out from the child's own things: something new under the bell, missions left today, a streak to keep, a goal one tick from done, the next fun plan on the calendar, then a saying and an idea of the day. Show me opens what a line is about, and Tell me another moves on. Under the missions, Ways to earn stars lists each of the child's goals with the stars it brings, one star for each piece of school work marked done, a new level every 20 stars, and a streak for doing one thing every day. Between those reminders, which include the next piece of school work, the next class today and what the child looks after, the cat shares true facts picked for the child's age. Each time the page or a tab opens, it starts on a new line. The facts, sayings, ideas, jokes and riddles come from WonderHome's own list, chosen for the child's age, and the cat never tells the same child the same one twice. Once a child has heard them all, the cat keeps to their reminders.",
  "help.guide.school.body.11": "Each child's score is on the Kids & School Overview, under their name: their level, their stars (how many from goals and how many from school work), their streak, how many goals are met right now and every reward earned. It is the same count the child sees on their Home. When you add a goal on Goals, Start from lists the child's classes outside school and their open school work. Picking a class fills in a weekly goal, as many times a week as the class meets. Picking school work fills in a one-off goal that ends on its due date. That goal is met the day the child marks the work done, so there is nothing else to tick. You can change any field before saving, and add a reward. On a child's Home, a piece of school work opens under its chevron to everything on record about it, and Show me scrolls to the part the cat is talking about. When a child taps Done on a goal, it waits for a grown-up: the child sees Waiting for a grown-up, and their guardian (or an Admin) gets a notification. Under Waiting for you on Goals, Yes, done counts it and its stars, and Not yet takes the tick back so the child can try again. A tick a guardian or Admin makes counts at once.",

  // Meals, groceries and running out of things
  "help.guide.meals-and-shopping.title": "Meals, groceries and running out of things",
  "help.guide.meals-and-shopping.summary": "One list: what's at home and what to buy, side by side.",
  "help.guide.meals-and-shopping.body.1":
    "Groceries shows every item you track in one list. Each row says how much is in stock and how much is to buy, and the two never overwrite each other. A row has two sets of + and −, side by side: In stock changes what's at home, and To buy changes the list, so one never changes the other. Only adults in the household change what's at home: on the row, on the item's own page (Update stock), or by marking something bought. An amount nobody has given is shown as not counted yet; WonderHome never guesses it, and a date you last bought something is never taken to mean it has run out.",
  "help.guide.meals-and-shopping.body.2":
    "To buy shows just what's on the list, in one list, under three cards: At home and Not counted yet count your items, and the Mark as bought card asks how much you actually bought of each: that amount is added to what's at home, and anything you bought less of stays on the list. Use soon keeps two lists apart. Use first shows dates printed on the pack or entered by someone, soonest first: a date that has passed says to check it before using, and a date that is only an estimate is never shown. Running low shows items at or below the low level you set on their page, and says whether the amount was counted by someone or worked out from what was bought and used, and when it hasn’t been counted in over a month. Add item searches what you already have first, including things you stopped tracking, so the same thing isn't added twice. Remove, under a To buy amount, takes the item off the list in one tap: it leaves To buy and stays under All, where the cart button puts it back. Tap At home or Not counted yet to show just those items; tap it again to go back.",
  "help.guide.meals-and-shopping.body.3":
    "Send a receipt through HomeSend and each line you keep becomes purchase history for that item. Lines it cannot match to something you track are yours to match, start tracking or skip; it never guesses. Ordering from a shop is not available, so nothing is ever bought on your behalf. Each kept line is also added to what's at home and taken off the list when it's waiting there; the review shows the amount before and after, and you can untick either. If someone counted the item after the receipt's day, it isn't added again unless you tick it. A receipt that looks already recorded — the same shop, day and total — is only recorded again when you tick Record it again. Undo takes the purchase, the amount at home and the list change back together.",
  "help.guide.meals-and-shopping.body.4":
    "Meals has a plan, your recipes, and preferences. A recipe can carry rough nutrients per serving. Suggest proposes a meal from what you have and what people like, and missing ingredients go on the shopping list.",
  "help.guide.meals-and-shopping.body.5":
    "Preferences record whose they are — a dislike, an allergy, a medical or ethical choice — so one person's dislike never quietly becomes a house rule. An allergy always wins.",
  "help.guide.meals-and-shopping.body.6":
    "You can also tell HomeTalk amounts in your own words: \"add 6 more eggs\", \"take 500 g rice off the list\", \"we have 10 eggs\", \"we used half a kilo of rice\", \"I bought 2 kg potatoes\". Asking to add something already on the list, with no amount, changes nothing; with an amount, it adds to what's there. Taking something off the list never stops tracking it. Changes to what's at home are proposed first and wait for your yes, unless your household lets WonderHome act on groceries on its own.",
  "help.guide.meals-and-shopping.body.7": "On a planned meal, Ingredients shows only what the meal is short of: what it needs for the servings you pick, less what is at home and what is already on the list. Change the servings and the amounts change with them. When nobody has said how much is at home it says the amount is an estimate, and when the recipe gives no amount it offers one usual pack. Add to the list puts just those on the list; nothing is bought twice, and an ingredient you don't track yet is added as a new item.",
  "help.guide.meals-and-shopping.body.8": "Add item also searches WonderHome's grocery catalog as you type, by English, Hindi or regional names. It shows the everyday choice first — eggs are white and brown eggs, not every kind — and the brands on sale, with pictures; a less common kind appears when you type it (\"duck eggs\"). No amount is shown until you pick one: then − and + move by one even step that suits the item: 250 g at a time for vegetables, 1 kg at a time for atta and rice, 500 g for dal, and one at a time for eggs and packets. The same steps work on the list. An item you picked shows its picture until you add your own photo. Everyday Indian foods show nutrition per 100 g from the Indian Food Composition Tables 2017 (ICMR–National Institute of Nutrition), saying when the match is close rather than exact; a packed product shows what its label states. The catalog is shared by every household; what you add and keep stays yours.",
  "help.guide.meals-and-shopping.body.9": "Each row on the list shows the item's energy and protein per 100 g under its name, when its catalog source has them, from the same source the item's page credits. When you or HomeTalk add something by name — \"add pasta\" — it is counted the way the catalog counts it (pasta in grams, at the usual 500 g pack) and filed under the catalog's category, rather than one piece. An amount you say still decides the unit.",
  "help.guide.meals-and-shopping.body.10": "Change meal, on a meal's card, changes it right there: what it is, the recipe, the slot, the day, when it's ready and who cooks. When it has no recipe, Add a recipe under the recipe picker opens the recipe form, and the new recipe is picked for this meal. Remove from the plan, at the bottom of the same sheet, takes off a meal still to come; anything it already put on the shopping list stays there. A meal planned without a recipe can still have ingredients: open Ingredients and add each item on its own row, with how much and the unit (500 g rajma, 2 pieces of onion), or pick one of your recipes. Leave How much empty when you don't know it, and the list says the amount isn't known. A recipe's essential ingredients are added the same way, so every meal planned from it knows what to buy. The card says what is still to get and what is already on the shopping list.",
  "help.guide.meals-and-shopping.body.11": "Plan a meal starts with the recipe. Pick one and the meal's name and its essential ingredients, with their amounts, fill in from it; change anything you like. Then choose where those ingredients apply: Just for this meal leaves the recipe as it was, Save to the recipe as well makes the recipe use them from now on (its nice-to-have items stay), and Save as a new recipe keeps them as a recipe of their own, under the name you give it, and plans this meal from it. A dish with no recipe can be saved as a new recipe the same way. If that slot already has a meal, nothing is planned and no recipe changes.",
  "help.guide.meals-and-shopping.body.12": "Every ingredient row — a recipe's essentials and its nice-to-haves, a meal's ingredients and the Ingredients sheet — searches your own grocery items and WonderHome's grocery catalog as you type, with pictures and \"At home\" beside what you already track. Pick one and the row is that very item, the one the shopping list and what's at home use; Use \"…\" as a new item adds anything that isn't listed. A picked item starts in a recipe's unit (grams rather than kilos). When you leave a recipe's calories, protein, carbs or fat empty, WonderHome works them out per serving from the ingredients it can weigh — each one's nutrition per 100 g or 100 ml times its amount, added up and divided by the servings — and says how many ingredients it counted. An ingredient in pieces, or with no amount, is left out rather than guessed; what you type yourself always stands.",
  "help.guide.meals-and-shopping.body.13": "Suggest, on the Meals plan, also offers Ideas from what's at home, and this works even before you have any recipes. Pick the meal and how many it serves, then Suggest dishes. This is an AI suggestion: the household's assistant proposes up to three dishes from what Groceries says is at home. WonderHome then checks every ingredient against your own items. Each is marked At home, Check you have it (salt, oil, everyday spices, or something tracked without an amount) or To buy. A dish with anything the family avoids (an allergy, a medical or ethical rule, a dislike, from Preferences) is left out, as is one mostly to buy or one you already have as a recipe. Open an idea to see its ingredients and how to cook it, then Plan it (with Save as a recipe too if you like) or Save as a recipe; nothing is saved until you choose. Each request counts like a HomeTalk message, and it needs the AI assistant to be set up.",
  "help.guide.meals-and-shopping.body.14": "Meals → Recipes keeps Your recipes at the top, and Ideas from WonderHome below them: everyday Indian dishes — poha, dal tadka, rajma, idli, sambar, kheer and more — each with a picture, short steps written for WonderHome, and what it needs, using the grocery catalog's own items. Filter them by Breakfast, Mains, Sides, Rice, Snacks or Sweets. A dish's page shows how long it takes, what one serving holds and how many of its ingredients that was counted from, using the Indian Food Composition Tables 2017 where an ingredient has them. Oil for deep frying isn't counted, and where too little is known about an ingredient — sugar, curd, cream, a batter — no figures are given rather than low ones. Each picture is from Wikimedia Commons, credited under it with its licence. The dishes' names and steps are in English for now.",
  "help.guide.meals-and-shopping.body.15": "Plan this, on a dish's page, plans it for the meal and day you pick and saves it under Your recipes, so the meal knows what to buy. Save my version only saves it. Your copy is yours to change: the pencil on its card opens the same recipe form, filled in, for its name, ingredients, steps or figures, and Remove from your recipes takes it off without touching meals already planned from it. Saving a dish you already have finds your copy instead of making a second one. In HomeTalk, \"plan poha for breakfast tomorrow\" uses your own poha if you have one, and otherwise WonderHome's, saved under Your recipes as it is planned.",
  "help.guide.meals-and-shopping.body.16": "Plan a meal's From a recipe shows every recipe, yours and WonderHome's, with its picture, calories and protein a serving, and how long it takes. Filter by diet, calories or protein, or order by most protein or fewest calories. Planning a WonderHome dish saves it to your recipes. Under Preferences, Diet sets one diet for the whole family and one for anyone who eats differently: vegetarian, vegetarian with eggs, non-vegetarian, vegan or Jain. Plan a meal then shows what fits and says who a dish doesn't suit and why, worked out by rules from what the dish is made of. Anyone can set the family's diet and their own; an Admin can set anyone's.",
  "help.guide.meals-and-shopping.body.17": "Meals → Plan is your week, Monday to Sunday. Use ‹ and › to move a week, and This week to come back; the line under it counts the breakfasts, lunches and dinners planned out of those still to come. Every day shows Breakfast, Lunch and Dinner, and an empty one is a + you can tap to plan a meal straight into that day and slot, with its usual time filled in. Repeat last week plans last week's meals again a week on, only into slots that are still empty and not past — nothing already planned is moved or replaced. On Recipes, All, Veg and Non-veg under Ideas from WonderHome show every dish or only those (a dish with egg counts as non-veg).",

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
  "help.guide.household-and-roles.body.6": "Under Manage Household → Members & roles, Relationships says how the family is related, one line each: pick a person, how they are related, and the person they are that to — \"Kunal is father of Asmi\", \"Upasana is wife of Kunal\". If the relation you need isn't listed, choose Something else and type it. Each pair needs one line: WonderHome says the other way round for you (\"So Asmi is Kunal's daughter\", worded from gender where it is recorded), and refuses a line that can't be right, such as a parent younger than their child. It also suggests lines from what is already on record — a child's guardians as their parents, children as siblings — which you add with one tap; it never adds them on its own. Everyone in the family can read the lines, only an Admin adds, changes or removes them, and each person's details in Family show what they are to the others. HomeTalk answers \"Who is Asmi's father?\" or \"How is Upasana related to Manan?\" from these lines, and says so when a line is missing.",

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
    "Record leave with the first day off and the number of days; the last day fills itself in (or pick the last day and the number follows). WonderHome checks what they normally handle on those days and shows what needs cover, with a way to arrange it.",
  "help.guide.househelp.body.3":
    "Househelpers are never asked to tick off chores, and there are no productivity scores.",
  "help.guide.househelp.body.4": "Looks after, on each helper's card, lists the outcomes they own. An Admin adds another with Add responsibility, which starts with that helper as the owner, and taps one to change who owns or backs it up, or to remove it. It is the same list as Manage Household → Responsibilities.",

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
    "HomeBrain shows what WonderHome believes about your household and where each belief came from — you told it, it observed it, or something you sent said so. Anything it has wrong, you can correct, add or remove. What a family member tells WonderHome is registered straight away — it no longer waits under Needs review. An Admin can remove or correct anything here at any time; only something that contradicts what is already registered still waits for a person to decide.",
  "help.guide.certification.body.2":
    "Ask HomeTalk \"why?\" — why it needs approval, why it did not do something, where a fact came from — and the answer comes from what is actually on record, not from a guess.",
  "help.guide.certification.body.3":
    "Answers are checked before you see them. A name, date, amount or event that is not on record is never stated as fact; if nothing is on record, WonderHome says so.",
  "help.guide.certification.body.4": "To decide many at once, tap Select above the list, tick the ones you mean (or Select all) and choose Register selected, Remove selected or Later for selected. Removing asks first. Each item is recorded in History as its own decision; a correction is still made one item at a time, in its own words.",
  "help.guide.certification.body.5": "Each night, between 2 and 5 in the morning on your household's clock, HomeBrain tidies what it remembers, the way a brain does in sleep. It folds notes that say the same thing into one, splits a sentence about several people into one fact each, files a note under the person it is about, lets go of notes that say nothing or whose time has passed, and rests what nobody has used in months. Rested facts are still found when HomeBrain looks deeper, and anything about health, an allergy or safety never rests. It also connects records across the home — a liking and the meal that plans it — so HomeTalk answers with what belongs together. Where your AI Assistant is set up and your data-use settings allow it, an AI model helps judge close cases and spots connections; it never writes anything itself, and no names are sent for this. Admins see each change under Learned → While you slept, with Undo beside it and Bring back for a resting fact. Only a contradiction — the same thing liked and disliked — comes to Needs review. Household understanding counts what you keep on your own screens too — family members, relationships, responsibilities, routines, school, bills, pets and allergies — as well as what HomeBrain was told.",

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
    "An Admin decides in Settings → AI Assistant what kinds of information the assistant may share with the AI service — children's details, health, amounts and bills, where people are, private messages. What is not allowed is left out of anything the assistant sends. Children's details are allowed from the start, so HomeTalk and HomeBrain can use what you tell them about your children; an Admin can untick them there. The rest waits until an Admin allows it.",

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

  // Release notes (help/release-notes.ts).
  "help.release.title": "Release notes",
  "help.release.lede": "What changed in WonderHome, newest first. A new entry is added each time a new version goes live.",
  "help.release.liveSince": "Live since {date}",
  "help.release.2026-10-19.title": "The family Calendar, HomeFood and a HomeBrain that looks deeper",
  "help.release.2026-10-19.item.1": "Calendar is now a main tab, with Month, Week, Day and Year views. It shows family events (which can repeat or be kept private), everyone's birthdays and special days, and public holidays.",
  "help.release.2026-10-19.item.2": "A family event opens to its full plan, with an invite link anyone can open. Invitations come in designs, show as a picture on WhatsApp, and can be previewed and shared as a tall picture.",
  "help.release.2026-10-19.item.3": "Groceries are one list of what is at home and what to buy. Add an item searches a shared catalog with pictures, brands and nutrition, including Indian values from IFCT 2017. A photo of a receipt adds what was bought to what is at home and takes it off the list.",
  "help.release.2026-10-19.item.4": "A planned meal shows what it still needs and adds it to the list. Plan a meal starts from a recipe, and a recipe's ingredients are picked from the grocery catalog, with nutrition per serving worked out for you.",
  "help.release.2026-10-19.item.5": "HomePlaces: ask HomeTalk for somewhere to eat or go out near home, a child's school or the office, or for a short getaway. Places, under More, remembers the places your family saved and the ones that were not for you.",
  "help.release.2026-10-19.item.6": "HomeTalk understands what you meant and does everyday things straight away — the list, a reminder, a plan — and \"undo\" takes it back. Anything that involves other people is asked first. An Admin can choose to be asked first every time.",
  "help.release.2026-10-19.item.7": "HomeTalk's voice follows you across screens (\"take me to the grocery list\"), keeps going in a small floating window when you switch apps, and with Gemini Live the chat shows what was really said.",
  "help.release.2026-10-19.item.8": "HomeBrain answers from everything your household has recorded. It looks again before saying something is not there, connects people, days, meals and duties, and when it points something out, it shows the records behind it.",
  "help.release.2026-10-19.item.9": "Kids & School keeps each child's teachers and classes outside school, and today's classes appear on the Calendar. A child's classes show in Family too.",
  "help.release.2026-10-19.item.10": "Every member signs in as themselves, by email or phone number, from an invitation WonderHome emails them. Each person can list the languages they speak, and the family's pets appear on Home.",
  "help.release.2026-10-19.item.11": "Push notifications reach your phone when a reminder is due and matters, and stay quiet during quiet hours. Turn them on for each device in Settings → Notifications.",
  "help.release.2026-10-19.item.12": "What's new, at the top of Home, shows the features you have not seen yet. Setup finds your home and schools on Google Maps and adds photos, nicknames and birthdays.",
  "help.release.2026-10-19.item.13": "Settings → Voice says which voice speaks for HomeTalk, and an Admin can add a separate Gemini voice key when the assistant runs on another provider.",
} as const;
