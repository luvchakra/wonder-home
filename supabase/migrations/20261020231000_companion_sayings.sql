-- The cat's sayings (the owner, 2026-10-20: "store a long list of such quotes
-- in a table, tag with age, gender etc. use that to display, never repeat
-- these for a child").
--
-- `companion_sayings` is WonderHome's own list: facts, sayings, ideas, jokes
-- and riddles, each tagged with the ages it suits, whether it is for any
-- child or chosen for a girl or a boy, and its topics, in every language the
-- app speaks. Every member reads it; nobody writes it from a session.
--
-- `companion_sayings_heard` is what each child has already been told: the cat
-- picks only from what this child has not heard, so nothing is said twice.
-- When a child has heard every saying for their age the cat keeps to their
-- own reminders and says hello.
--
-- The seed below is `packages/core/src/school/companion-sayings.json`, kept in
-- step by `companion-sayings.test.ts`; a later edit is a new migration that
-- upserts the same way.
--
-- Rollback: drop function public.companion_sayings_for(uuid, integer);
-- drop table public.companion_sayings_heard; drop table public.companion_sayings;

create table if not exists public.companion_sayings (
  id text primary key check (id ~ '^[a-z0-9-]{3,40}$'),
  kind text not null check (kind in ('fact', 'quote', 'idea', 'joke', 'riddle')),
  min_age smallint not null check (min_age between 3 and 18),
  max_age smallint not null check (max_age between 3 and 18 and max_age >= min_age),
  gender text not null default 'any' check (gender in ('any', 'girl', 'boy')),
  tags text[] not null default '{}',
  words jsonb not null check (jsonb_typeof(words) = 'object' and words ? 'en'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.companion_sayings is
  'What a child''s cat can tell them (story 08-018): facts, sayings, ideas, jokes and riddles, tagged by age, gender and topic, in every app language. Platform data, read-only from a session.';

alter table public.companion_sayings enable row level security;

drop policy if exists companion_sayings_read on public.companion_sayings;
create policy companion_sayings_read on public.companion_sayings for select
  to authenticated
  using (active);

grant select on public.companion_sayings to authenticated;

create table if not exists public.companion_sayings_heard (
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  saying_id text not null references public.companion_sayings(id) on delete cascade,
  heard_at timestamptz not null default now(),
  primary key (member_id, saying_id)
);

comment on table public.companion_sayings_heard is
  'Each saying a child''s cat has already shown them, so it is never shown to them again.';

create index if not exists companion_sayings_heard_household_idx on public.companion_sayings_heard (household_id);
create index if not exists companion_sayings_heard_saying_idx on public.companion_sayings_heard (saying_id);

alter table public.companion_sayings_heard enable row level security;

-- A person reads and records only what they themselves were told.
drop policy if exists companion_sayings_heard_own_read on public.companion_sayings_heard;
create policy companion_sayings_heard_own_read on public.companion_sayings_heard for select
  to authenticated
  using ((household_id, member_id) in (select household_id, member_id from wh.my_memberships()));

drop policy if exists companion_sayings_heard_own_insert on public.companion_sayings_heard;
create policy companion_sayings_heard_own_insert on public.companion_sayings_heard for insert
  to authenticated
  with check ((household_id, member_id) in (select household_id, member_id from wh.my_memberships()));

grant select, insert on public.companion_sayings_heard to authenticated;

-- What the cat may say next to this child: suited to their age (8–12 when no
-- birthday is on record) and to them (a saying chosen for a girl or a boy goes
-- only to a child whose gender is on record as one), not yet heard, in an
-- order that changes each day. Security invoker: it reads the child's own
-- member row and their own heard list, as the child.
create or replace function public.companion_sayings_for(p_member_id uuid, p_limit integer default 6)
returns table (id text, kind text, words jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  with child as (
    select
      coalesce(extract(year from age(current_date, m.date_of_birth))::integer, 10) as years,
      case
        when lower(coalesce(m.gender, '')) ~ '^(f|female|girl|woman)' then 'girl'
        when lower(coalesce(m.gender, '')) ~ '^(m|male|boy|man)' then 'boy'
        else 'any'
      end as gender
    from public.household_members m
    where m.id = p_member_id
  )
  select s.id, s.kind, s.words
  from public.companion_sayings s, child c
  where s.active
    and s.min_age <= c.years and s.max_age >= c.years
    and (s.gender = 'any' or s.gender = c.gender)
    and not exists (
      select 1 from public.companion_sayings_heard h
      where h.member_id = p_member_id and h.saying_id = s.id
    )
  order by md5(s.id || p_member_id::text || current_date::text)
  limit least(greatest(coalesce(p_limit, 6), 1), 20);
$$;

revoke all on function public.companion_sayings_for(uuid, integer) from public;
grant execute on function public.companion_sayings_for(uuid, integer) to authenticated;

insert into public.companion_sayings (id, kind, min_age, max_age, gender, tags, words)
select s.id, s.kind, s."minAge", s."maxAge", s.gender, s.tags, s.words
from jsonb_to_recordset($sayings$[
{
"id": "y-fact-001",
"kind": "fact",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "An octopus has three hearts and blue blood!",
"hi": "ऑक्टोपस के तीन दिल होते हैं और उसका खून नीला होता है!",
"mr": "ऑक्टोपसला तीन हृदये असतात आणि त्याचे रक्त निळे असते!",
"es": "¡Un pulpo tiene tres corazones y la sangre azul!",
"fr": "Une pieuvre a trois cœurs et du sang bleu !",
"de": "Ein Oktopus hat drei Herzen und blaues Blut!",
"ar": "للأخطبوط ثلاثة قلوب ودمه أزرق!",
"zh": "章鱼有三颗心脏,还有蓝色的血液哦!"
}
},
{
"id": "y-fact-002",
"kind": "fact",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "A baby kangaroo is called a joey, and it is as small as a jelly bean when it is born.",
"hi": "कंगारू के बच्चे को जोई कहते हैं, और जब वह पैदा होता है तो जेली बीन जितना छोटा होता है।",
"mr": "कांगारूच्या पिल्लाला जोई म्हणतात, आणि ते जन्मतः जेलीबीनएवढे लहान असते.",
"es": "A la cría del canguro se le llama cría o «joey», y cuando nace es tan pequeña como una gominola.",
"fr": "Un bébé kangourou s’appelle un joey, et il est aussi petit qu’un bonbon quand il naît.",
"de": "Ein Känguru-Baby heißt Joey und ist bei der Geburt so klein wie ein Gummibärchen.",
"ar": "صغير الكنغر اسمه «جوي»، وحين يولد يكون صغيراً مثل حبة الجيلي.",
"zh": "小袋鼠叫“小袋袋”,刚出生的时候只有一颗软糖那么小。"
}
},
{
"id": "y-fact-003",
"kind": "fact",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "Cats sleep for about 12 to 16 hours a day. That's even more than you!",
"hi": "बिल्लियाँ दिन में लगभग 12 से 16 घंटे सोती हैं। यह तो तुमसे भी ज़्यादा है!",
"mr": "मांजरी दिवसातून सुमारे १२ ते १६ तास झोपतात. तुझ्यापेक्षाही जास्त!",
"es": "Los gatos duermen de 12 a 16 horas al día. ¡Hasta más que tú!",
"fr": "Les chats dorment environ 12 à 16 heures par jour. C’est encore plus que toi !",
"de": "Katzen schlafen etwa 12 bis 16 Stunden am Tag. Das ist sogar mehr als du!",
"ar": "القطط تنام نحو 12 إلى 16 ساعة في اليوم. وهذا أكثر منك حتى!",
"zh": "小猫一天要睡大约12到16个小时,比你睡得还多呢!"
}
},
{
"id": "y-fact-004",
"kind": "fact",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "An elephant's trunk can hold about 8 litres of water. That's like 30 glasses!",
"hi": "हाथी की सूंड में करीब 8 लीटर पानी आ सकता है। यानी लगभग 30 गिलास!",
"mr": "हत्तीची सोंड सुमारे ८ लिटर पाणी सामावू शकते. म्हणजे जवळजवळ ३० ग्लास!",
"es": "La trompa de un elefante puede guardar unos 8 litros de agua. ¡Como 30 vasos!",
"fr": "La trompe d’un éléphant peut contenir environ 8 litres d’eau. C’est comme 30 verres !",
"de": "In den Rüssel eines Elefanten passen ungefähr 8 Liter Wasser. Das sind etwa 30 Gläser!",
"ar": "خرطوم الفيل يتّسع لنحو 8 لترات من الماء. أي مثل 30 كوباً!",
"zh": "大象的鼻子能装下大约8升水,差不多有30杯那么多!"
}
},
{
"id": "y-fact-005",
"kind": "fact",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "Butterflies taste with their feet.",
"hi": "तितलियाँ अपने पैरों से स्वाद चखती हैं।",
"mr": "फुलपाखरे आपल्या पायांनी चव घेतात.",
"es": "Las mariposas saborean con las patas.",
"fr": "Les papillons goûtent avec leurs pattes.",
"de": "Schmetterlinge schmecken mit ihren Füßen.",
"ar": "الفراشات تتذوّق الطعام بأقدامها.",
"zh": "蝴蝶是用脚来尝味道的。"
}
},
{
"id": "y-fact-006",
"kind": "fact",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "A snail can sleep for up to three years.",
"hi": "घोंघा तीन साल तक सो सकता है।",
"mr": "गोगलगाय तीन वर्षांपर्यंत झोपू शकते.",
"es": "Un caracol puede dormir hasta tres años.",
"fr": "Un escargot peut dormir jusqu’à trois ans.",
"de": "Eine Schnecke kann bis zu drei Jahre lang schlafen.",
"ar": "الحلزون يستطيع أن ينام حتى ثلاث سنوات.",
"zh": "蜗牛最长可以睡上三年。"
}
},
{
"id": "y-fact-007",
"kind": "fact",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"space"
],
"words": {
"en": "The Sun is a star, and it's the closest star to us.",
"hi": "सूरज एक तारा है, और वह हमारे सबसे पास का तारा है।",
"mr": "सूर्य हा एक तारा आहे, आणि तो आपल्या सर्वात जवळचा तारा आहे.",
"es": "El Sol es una estrella, y es la estrella más cercana a nosotros.",
"fr": "Le Soleil est une étoile, et c’est l’étoile la plus proche de nous.",
"de": "Die Sonne ist ein Stern, und zwar der Stern, der uns am nächsten ist.",
"ar": "الشمس نجمة، وهي أقرب نجمة إلينا.",
"zh": "太阳是一颗星星,而且是离我们最近的那一颗。"
}
},
{
"id": "y-fact-008",
"kind": "fact",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"space"
],
"words": {
"en": "The Moon has no air, so footprints left there can stay for millions of years.",
"hi": "चाँद पर हवा नहीं है, इसलिए वहाँ बने पैरों के निशान लाखों सालों तक रह सकते हैं।",
"mr": "चंद्रावर हवा नाही, म्हणून तिथे उमटलेली पावलांची ठसे लाखो वर्षे तशीच राहू शकतात.",
"es": "En la Luna no hay aire, así que las huellas que se dejan allí pueden durar millones de años.",
"fr": "Il n’y a pas d’air sur la Lune, alors les traces de pas peuvent y rester des millions d’années.",
"de": "Auf dem Mond gibt es keine Luft, deshalb bleiben Fußspuren dort Millionen von Jahren zu sehen.",
"ar": "لا يوجد هواء على القمر، لذلك تبقى آثار الأقدام هناك ملايين السنين.",
"zh": "月亮上没有空气,所以留在那里的脚印可以保存好几百万年。"
}
},
{
"id": "y-fact-009",
"kind": "fact",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"nature"
],
"words": {
"en": "A rainbow has seven colours: red, orange, yellow, green, blue, indigo and violet.",
"hi": "इंद्रधनुष में सात रंग होते हैं: लाल, नारंगी, पीला, हरा, नीला, जामुनी और बैंगनी।",
"mr": "इंद्रधनुष्याला सात रंग असतात: लाल, नारिंगी, पिवळा, हिरवा, निळा, पारवा आणि जांभळा.",
"es": "El arcoíris tiene siete colores: rojo, naranja, amarillo, verde, azul, añil y violeta.",
"fr": "Un arc-en-ciel a sept couleurs : rouge, orange, jaune, vert, bleu, indigo et violet.",
"de": "Ein Regenbogen hat sieben Farben: Rot, Orange, Gelb, Grün, Blau, Indigo und Violett.",
"ar": "في قوس قزح سبعة ألوان: الأحمر والبرتقالي والأصفر والأخضر والأزرق والنيلي والبنفسجي.",
"zh": "彩虹有七种颜色:红、橙、黄、绿、蓝、靛、紫。"
}
},
{
"id": "y-fact-010",
"kind": "fact",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "Cows have best friends and feel calmer when they are together.",
"hi": "गायों के भी पक्के दोस्त होते हैं, और साथ रहने पर वे ज़्यादा शांत महसूस करती हैं।",
"mr": "गायींनाही जिवलग मैत्रिणी असतात, आणि त्या एकत्र असल्या की शांत वाटतात.",
"es": "Las vacas tienen mejores amigas y se sienten más tranquilas cuando están juntas.",
"fr": "Les vaches ont des meilleures amies et se sentent plus calmes quand elles sont ensemble.",
"de": "Kühe haben beste Freunde und sind ruhiger, wenn sie zusammen sind.",
"ar": "للأبقار أصدقاء مقرّبون، وتشعر بهدوء أكبر حين تكون معهم.",
"zh": "奶牛也有最好的朋友,和朋友在一起时会觉得更安心。"
}
},
{
"id": "y-fact-011",
"kind": "fact",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "A group of flamingos is called a flamboyance.",
"hi": "फ्लेमिंगो के झुंड को अंग्रेज़ी में फ्लैम्बॉयन्स कहते हैं।",
"mr": "फ्लेमिंगोंच्या थव्याला फ्लॅम्बॉयन्स म्हणतात.",
"es": "A un grupo de flamencos se le llama «bandada», pero en inglés tiene un nombre muy divertido: «flamboyance», que significa «lleno de color».",
"fr": "Un groupe de flamants roses s’appelle une flamboyance.",
"de": "Eine Gruppe Flamingos nennt man auf Englisch \"Flamboyance\", das heißt so viel wie \"Prachtschau\".",
"ar": "مجموعة الفلامنغو اسمها بالإنجليزية «فلامبويانس»، أي «البهرجة».",
"zh": "一群火烈鸟在一起,英文有个很华丽的名字,叫“flamboyance”,意思就是“超级闪亮的一群”。"
}
},
{
"id": "y-fact-012",
"kind": "fact",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"body"
],
"words": {
"en": "You have more bones as a baby than you do as a grown-up. Some of them join together as you grow.",
"hi": "बच्चे की हड्डियाँ बड़ों से ज़्यादा होती हैं। बड़े होते-होते उनमें से कुछ आपस में जुड़ जाती हैं।",
"mr": "मोठ्या माणसापेक्षा बाळाच्या शरीरात जास्त हाडे असतात. तू मोठा होत जातोस तशी त्यातली काही हाडे एकमेकांना जुळतात.",
"es": "De bebé tienes más huesos que de mayor. Algunos se van uniendo mientras creces.",
"fr": "Tu as plus d’os quand tu es bébé que quand tu es grand. Certains se soudent entre eux pendant que tu grandis.",
"de": "Als Baby hast du mehr Knochen als als Erwachsener. Einige wachsen beim Großwerden zusammen.",
"ar": "عندك عظام وأنت طفل رضيع أكثر مما عندك وأنت كبير. بعضها يلتحم ببعض كلما كبرتَ.",
"zh": "你小宝宝的时候,骨头比长大后还要多。长大的过程中,有些骨头会连在一起。"
}
},
{
"id": "y-fact-013",
"kind": "fact",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"nature"
],
"words": {
"en": "Bees visit about two million flowers to make one jar of honey.",
"hi": "मधुमक्खियाँ शहद का एक डिब्बा भरने के लिए लगभग बीस लाख फूलों पर जाती हैं।",
"mr": "मधाची एक बरणी भरायला मधमाश्या सुमारे वीस लाख फुलांना भेट देतात.",
"es": "Las abejas visitan unos dos millones de flores para hacer un tarro de miel.",
"fr": "Les abeilles visitent environ deux millions de fleurs pour faire un seul pot de miel.",
"de": "Bienen besuchen etwa zwei Millionen Blüten, um ein einziges Glas Honig zu machen.",
"ar": "تزور النحلات نحو مليوني زهرة لتصنع جرّة عسل واحدة.",
"zh": "蜜蜂要飞过大约两百万朵花,才能酿出一罐蜂蜜。"
}
},
{
"id": "y-fact-014",
"kind": "fact",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "Penguins can't fly, but they are amazing swimmers.",
"hi": "पेंगुइन उड़ नहीं सकते, पर वे कमाल के तैराक होते हैं।",
"mr": "पेंग्विन उडू शकत नाहीत, पण ते कमाल पोहतात.",
"es": "Los pingüinos no pueden volar, pero nadan de maravilla.",
"fr": "Les manchots ne peuvent pas voler, mais ce sont des nageurs extraordinaires.",
"de": "Pinguine können nicht fliegen, aber sie sind fantastische Schwimmer.",
"ar": "البطريق لا يستطيع الطيران، لكنه سبّاح رائع.",
"zh": "企鹅不会飞,但它们游泳特别棒。"
}
},
{
"id": "y-fact-015",
"kind": "fact",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"animals",
"india"
],
"words": {
"en": "The peacock is India's national bird. Only the boys have the big, bright tails.",
"hi": "मोर हमारे भारत का राष्ट्रीय पक्षी है। बड़ी और रंग-बिरंगी पूँछ सिर्फ़ नर मोर की होती है।",
"mr": "मोर हा भारताचा राष्ट्रीय पक्षी आहे. मोठा, रंगीबेरंगी पिसारा फक्त नर मोरांनाच असतो.",
"es": "El pavo real es el ave nacional de la India. Solo los machos tienen esa cola grande y brillante.",
"fr": "Le paon est l’oiseau national de l’Inde. Seuls les mâles ont la grande queue aux belles couleurs.",
"de": "Der Pfau ist der Nationalvogel von Indien. Nur die Männchen haben die großen, bunten Schwanzfedern.",
"ar": "الطاووس هو الطائر الوطني للهند. والذكور فقط لهم الذيل الكبير الزاهي.",
"zh": "孔雀是印度的国鸟。只有男孩子孔雀才有又大又漂亮的尾巴。"
}
},
{
"id": "y-fact-016",
"kind": "fact",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "A giraffe's tongue is so long it can clean its own ears.",
"hi": "जिराफ़ की जीभ इतनी लंबी होती है कि वह अपने कान भी साफ़ कर लेता है।",
"mr": "जिराफाची जीभ इतकी लांब असते की तो तिने स्वतःचे कान साफ करू शकतो.",
"es": "La lengua de una jirafa es tan larga que puede limpiarse las orejas.",
"fr": "La langue d’une girafe est si longue qu’elle peut se nettoyer les oreilles toute seule.",
"de": "Die Zunge einer Giraffe ist so lang, dass sie sich damit die eigenen Ohren putzen kann.",
"ar": "لسان الزرافة طويل جداً حتى إنها تنظّف به أذنيها!",
"zh": "长颈鹿的舌头特别长,长到可以舔干净自己的耳朵。"
}
},
{
"id": "y-fact-017",
"kind": "fact",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"nature"
],
"words": {
"en": "Some trees can live for thousands of years.",
"hi": "कुछ पेड़ हज़ारों साल तक जीते हैं।",
"mr": "काही झाडे हजारो वर्षे जगू शकतात.",
"es": "Algunos árboles pueden vivir miles de años.",
"fr": "Certains arbres peuvent vivre des milliers d’années.",
"de": "Manche Bäume können tausende Jahre alt werden.",
"ar": "بعض الأشجار تعيش آلاف السنين.",
"zh": "有些树可以活几千年。"
}
},
{
"id": "y-fact-018",
"kind": "fact",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "Dolphins give each other names using special whistles.",
"hi": "डॉल्फ़िन खास सीटियों से एक-दूसरे को नाम देती हैं।",
"mr": "डॉल्फिन खास शिट्ट्या वाजवून एकमेकांना नावे देतात.",
"es": "Los delfines se llaman unos a otros con silbidos especiales, como si fueran nombres.",
"fr": "Les dauphins se donnent des noms grâce à des sifflements spéciaux.",
"de": "Delfine geben einander Namen, indem sie besondere Pfiffe benutzen.",
"ar": "الدلافين تنادي بعضها بأسماء باستخدام صفير خاص.",
"zh": "海豚会用特别的哨声给彼此起名字。"
}
},
{
"id": "y-fact-019",
"kind": "fact",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"space"
],
"words": {
"en": "There are more stars in the sky than grains of sand on a beach.",
"hi": "आसमान में तारे समुद्र किनारे की रेत के कणों से भी ज़्यादा हैं।",
"mr": "आकाशातील ताऱ्यांची संख्या समुद्रकिनाऱ्यावरील वाळूच्या कणांपेक्षा जास्त आहे.",
"es": "Hay más estrellas en el cielo que granos de arena en una playa.",
"fr": "Il y a plus d’étoiles dans le ciel que de grains de sable sur une plage.",
"de": "Am Himmel gibt es mehr Sterne als Sandkörner an einem Strand.",
"ar": "نجوم السماء أكثر من حبّات الرمل على الشاطئ.",
"zh": "天上的星星比海滩上的沙粒还要多。"
}
},
{
"id": "y-fact-020",
"kind": "fact",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "A hummingbird can fly backwards!",
"hi": "हमिंगबर्ड उल्टा भी उड़ सकती है!",
"mr": "हमिंगबर्ड मागेही उडू शकतो!",
"es": "¡Un colibrí puede volar hacia atrás!",
"fr": "Un colibri peut voler en arrière !",
"de": "Ein Kolibri kann rückwärts fliegen!",
"ar": "الطائر الطنّان يستطيع الطيران إلى الخلف!",
"zh": "蜂鸟还会向后飞呢!"
}
},
{
"id": "y-joke-001",
"kind": "joke",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"fun"
],
"words": {
"en": "Why did the teddy bear say no to dessert? Because it was already stuffed!",
"hi": "टेडी बियर ने मिठाई के लिए मना क्यों कर दिया? क्योंकि उसका पेट तो पहले से ही भरा हुआ था!",
"mr": "टेडी बेअरने गोड खायला का नाही म्हटले? कारण त्याचे पोट आधीच भरलेले (स्टफ्ड) होते!",
"es": "¿Por qué el osito de peluche dijo que no al postre? ¡Porque ya estaba relleno!",
"fr": "Pourquoi l’ours en peluche a-t-il dit non au dessert ? Parce qu’il était déjà rembourré !",
"de": "Warum sagt der Teddybär nein zum Nachtisch? Weil er schon ausgestopft ist!",
"ar": "لماذا رفض الدبدوب الحلوى؟ لأنه كان محشوّاً أصلاً!",
"zh": "泰迪熊为什么不吃甜点?因为它的肚子已经塞得满满的啦!"
}
},
{
"id": "y-joke-002",
"kind": "joke",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"fun",
"animals"
],
"words": {
"en": "What do you call a sleeping dinosaur? A dino-snore!",
"hi": "सोते हुए डायनासोर को क्या कहते हैं? डायनो-खर्राटा!",
"mr": "झोपलेल्या डायनासोरला काय म्हणतात? घोरोसॉरस!",
"es": "¿Cómo se llama un dinosaurio dormido? ¡Dino-ronquido!",
"fr": "Comment appelle-t-on un dinosaure qui dort ? Un dino-ronfleur !",
"de": "Wie nennt man einen schlafenden Dinosaurier? Einen Dino-Schnarcher!",
"ar": "ماذا نسمّي ديناصوراً نائماً؟ ديناصوراً يشخر!",
"zh": "睡着的恐龙叫什么?呼噜龙!"
}
},
{
"id": "y-joke-003",
"kind": "joke",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"fun",
"animals"
],
"words": {
"en": "What do cats like to eat for breakfast? Mice Krispies!",
"hi": "बिल्लियाँ नाश्ते में क्या खाना पसंद करती हैं? चूहा-क्रिस्पीज़!",
"mr": "मांजरींना नाश्त्याला काय आवडते? उंदीर-पोहे!",
"es": "¿Qué desayunan los gatos? ¡Miau-sli de ratón!",
"fr": "Que mangent les chats au petit-déjeuner ? Un croque-souris !",
"de": "Was frühstücken Katzen am liebsten? Maus-li!",
"ar": "ماذا تحب القطط أن تأكل على الفطور؟ فئراناً مقرمشة!",
"zh": "小猫早餐最爱吃什么?“鼠”条!"
}
},
{
"id": "y-joke-004",
"kind": "joke",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"fun"
],
"words": {
"en": "Why did the banana go to the doctor? It wasn't peeling well!",
"hi": "केला डॉक्टर के पास क्यों गया? क्योंकि उसका छिलका उतरा-उतरा लग रहा था!",
"mr": "केळे डॉक्टरकडे का गेले? कारण त्याला सालकाढू वाटत नव्हते... म्हणजे बरे वाटत नव्हते!",
"es": "¿Por qué el plátano fue al médico? ¡Porque no se sentía nada bien de la cáscara!",
"fr": "Pourquoi la banane est-elle allée chez le médecin ? Parce qu’elle n’avait pas la pêche !",
"de": "Warum ging die Banane zum Arzt? Ihr war nicht ganz geschält zumute!",
"ar": "لماذا ذهبت الموزة إلى الطبيب؟ لأنها لم تكن تشعر أن قشرتها بخير!",
"zh": "香蕉为什么要去看医生?因为它最近很“蕉”虑!"
}
},
{
"id": "y-joke-005",
"kind": "joke",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"fun",
"animals"
],
"words": {
"en": "What do you call a fish with no eyes? A fsh!",
"hi": "बिना आँखों वाली मछली को क्या कहते हैं? बस मछ-ली, जिसे कुछ दिखता ही नहीं!",
"mr": "डोळे नसलेल्या माशाला काय म्हणतात? आंधळा मासा!",
"es": "¿Cómo se llama un pez sin ojos? ¡Un pz!",
"fr": "Comment appelle-t-on un poisson sans yeux ? Un posson !",
"de": "Wie nennt man einen Fisch ohne Augen? Einen Fsch!",
"ar": "ماذا نسمّي سمكة بلا عينين؟ سمكة لا ترى شيئاً، لكنها تسبح بمهارة!",
"zh": "没有眼睛的鱼叫什么?叫“看不见的鱼”,因为它什么都看不见!"
}
},
{
"id": "y-joke-006",
"kind": "joke",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"fun"
],
"words": {
"en": "What has hands but can't clap? A clock!",
"hi": "किसके हाथ होते हैं पर वह ताली नहीं बजा सकता? घड़ी!",
"mr": "हात आहेत पण टाळ्या वाजवता येत नाहीत, ते काय? घड्याळ!",
"es": "¿Qué tiene manos pero no puede aplaudir? ¡Un reloj!",
"fr": "Qu’est-ce qui a des aiguilles mais ne sait pas coudre ? Une horloge !",
"de": "Was hat Zeiger, aber kann nicht zeigen, wo es langgeht? Eine Uhr!",
"ar": "ما الذي له يدان ولا يستطيع التصفيق؟ الساعة!",
"zh": "什么东西有手,却不会拍手?时钟!"
}
},
{
"id": "y-riddle-001",
"kind": "riddle",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"fun"
],
"words": {
"en": "Riddle: what gets wetter the more it dries? A towel!",
"hi": "पहेली: ऐसी कौन-सी चीज़ है जो जितना सुखाओ उतनी गीली होती जाती है? तौलिया!",
"mr": "कोडे: वाळवले की जास्त ओले होते, ते काय? टॉवेल!",
"es": "Adivinanza: ¿qué se moja más cuanto más seca? ¡Una toalla!",
"fr": "Devinette : qu’est-ce qui devient plus mouillé à force de sécher ? Une serviette !",
"de": "Rätsel: Was wird nasser, je mehr es trocknet? Ein Handtuch!",
"ar": "لغز: ما الذي يزداد بللاً كلما جفّف؟ المنشفة!",
"zh": "谜语:什么东西越擦越湿?毛巾!"
}
},
{
"id": "y-riddle-002",
"kind": "riddle",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"fun"
],
"words": {
"en": "Riddle: what has a neck but no head? A bottle!",
"hi": "पहेली: किसकी गर्दन होती है पर सिर नहीं? बोतल!",
"mr": "कोडे: मान आहे पण डोके नाही, ते काय? बाटली!",
"es": "Adivinanza: ¿qué tiene cuello pero no tiene cabeza? ¡Una botella!",
"fr": "Devinette : qu’est-ce qui a un col mais pas de tête ? Une bouteille !",
"de": "Rätsel: Was hat einen Hals, aber keinen Kopf? Eine Flasche!",
"ar": "لغز: ما الذي له عنق وليس له رأس؟ الزجاجة!",
"zh": "谜语:什么东西有脖子,却没有头?瓶子!"
}
},
{
"id": "y-riddle-003",
"kind": "riddle",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"fun"
],
"words": {
"en": "Riddle: what goes up but never comes down? Your age!",
"hi": "पहेली: क्या ऊपर ही ऊपर जाता है, कभी नीचे नहीं आता? तुम्हारी उम्र!",
"mr": "कोडे: वर जाते पण खाली कधीच येत नाही, ते काय? तुझे वय!",
"es": "Adivinanza: ¿qué sube siempre pero nunca baja? ¡Tu edad!",
"fr": "Devinette : qu’est-ce qui monte toujours sans jamais redescendre ? Ton âge !",
"de": "Rätsel: Was geht immer nur nach oben und nie wieder nach unten? Dein Alter!",
"ar": "لغز: ما الذي يصعد ولا ينزل أبداً؟ عمرك!",
"zh": "谜语:什么东西只会往上长,不会往下掉?你的年龄!"
}
},
{
"id": "y-quote-001",
"kind": "quote",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"kindness"
],
"words": {
"en": "Being kind is like being a superhero.",
"hi": "दयालु होना सुपरहीरो होने जैसा है।",
"mr": "दयाळू असणे म्हणजे सुपरहिरो असल्यासारखे आहे.",
"es": "Ser amable es como ser un superhéroe.",
"fr": "Être gentil, c’est comme être un super-héros.",
"de": "Nett zu sein ist wie ein Superheld zu sein.",
"ar": "أن تكون لطيفاً مثل أن تكون بطلاً خارقاً.",
"zh": "做个善良的人,就像超级英雄一样。"
}
},
{
"id": "y-quote-002",
"kind": "quote",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"growth"
],
"words": {
"en": "Mistakes help your brain grow. Try again!",
"hi": "गलतियाँ तुम्हारे दिमाग को बढ़ने में मदद करती हैं। फिर से कोशिश करो!",
"mr": "चुकांमुळे तुझा मेंदू वाढतो. पुन्हा प्रयत्न कर!",
"es": "Los errores ayudan a tu cerebro a crecer. ¡Inténtalo otra vez!",
"fr": "Les erreurs aident ton cerveau à grandir. Essaie encore !",
"de": "Fehler helfen deinem Gehirn beim Wachsen. Versuch es noch einmal!",
"ar": "الأخطاء تساعد عقلك على النمو. حاول مرة أخرى!",
"zh": "犯错能让你的大脑长大。再试一次吧!"
}
},
{
"id": "y-quote-003",
"kind": "quote",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"growth"
],
"words": {
"en": "Little by little, a little becomes a lot.",
"hi": "बूंद-बूंद से सागर भरता है।",
"mr": "थोडे थोडे करता करता थोड्याचे खूप होते.",
"es": "Poco a poco, lo pequeño se hace grande.",
"fr": "Petit à petit, un petit peu devient beaucoup.",
"de": "Nach und nach wird aus wenig ganz viel.",
"ar": "شيئاً فشيئاً، يصير القليل كثيراً.",
"zh": "一点一点来,小小的也会变成大大的。"
}
},
{
"id": "y-quote-004",
"kind": "quote",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"kindness"
],
"words": {
"en": "A smile is a gift you can give every day.",
"hi": "मुस्कान एक ऐसा तोहफ़ा है जो तुम रोज़ दे सकते हो।",
"mr": "हसू ही अशी भेट आहे जी तू रोज देऊ शकतोस.",
"es": "Una sonrisa es un regalo que puedes dar todos los días.",
"fr": "Un sourire est un cadeau que tu peux offrir chaque jour.",
"de": "Ein Lächeln ist ein Geschenk, das du jeden Tag verschenken kannst.",
"ar": "الابتسامة هدية تستطيع أن تقدّمها كل يوم.",
"zh": "微笑是一份你每天都能送出的礼物。"
}
},
{
"id": "y-quote-005",
"kind": "quote",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"growth"
],
"words": {
"en": "You are braver than you think.",
"hi": "तुम जितना सोचते हो, उससे कहीं ज़्यादा बहादुर हो।",
"mr": "तू स्वतःला वाटतोस त्यापेक्षा खूप धाडसी आहेस.",
"es": "Eres más valiente de lo que piensas.",
"fr": "Tu es plus courageux que tu ne le crois.",
"de": "Du bist mutiger, als du denkst.",
"ar": "أنت أشجع مما تظن.",
"zh": "你比自己想的更勇敢。"
}
},
{
"id": "y-idea-001",
"kind": "idea",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"art"
],
"words": {
"en": "Idea: draw your family as animals. Which animal is everyone?",
"hi": "आइडिया: अपने परिवार को जानवरों के रूप में बनाओ। कौन-सा जानवर कौन है?",
"mr": "कल्पना: तुझे कुटुंब प्राण्यांच्या रूपात काढ. प्रत्येकजण कोणता प्राणी आहे?",
"es": "Idea: dibuja a tu familia como animales. ¿Qué animal es cada uno?",
"fr": "Idée : dessine ta famille en animaux. Quel animal est chacun ?",
"de": "Idee: Male deine Familie als Tiere. Welches Tier ist jeder?",
"ar": "فكرة: ارسم عائلتك على شكل حيوانات. أيّ حيوان هو كل واحد منكم؟",
"zh": "好点子:把你的家人画成小动物吧。每个人是什么动物呢?"
}
},
{
"id": "y-idea-002",
"kind": "idea",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"nature"
],
"words": {
"en": "Idea: find five things that are green around you.",
"hi": "आइडिया: अपने आसपास हरे रंग की पाँच चीज़ें ढूँढो।",
"mr": "कल्पना: आजूबाजूला हिरव्या रंगाच्या पाच गोष्टी शोध.",
"es": "Idea: busca cinco cosas verdes a tu alrededor.",
"fr": "Idée : trouve cinq choses vertes autour de toi.",
"de": "Idee: Finde fünf grüne Dinge um dich herum.",
"ar": "فكرة: ابحث حولك عن خمسة أشياء خضراء.",
"zh": "好点子:在身边找找看,有五样绿色的东西。"
}
},
{
"id": "y-idea-003",
"kind": "idea",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"kindness"
],
"words": {
"en": "Idea: give someone at home a big hug today.",
"hi": "आइडिया: आज घर में किसी को एक बड़ी-सी झप्पी दो।",
"mr": "कल्पना: आज घरातल्या कोणाला तरी मोठी मिठी दे.",
"es": "Idea: dale hoy un abrazo enorme a alguien de casa.",
"fr": "Idée : fais un gros câlin à quelqu’un de la maison aujourd’hui.",
"de": "Idee: Gib heute jemandem zu Hause eine ganz große Umarmung.",
"ar": "فكرة: أعطِ أحداً في البيت عناقاً كبيراً اليوم.",
"zh": "好点子:今天给家里的某个人一个大大的拥抱。"
}
},
{
"id": "y-idea-004",
"kind": "idea",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"music"
],
"words": {
"en": "Idea: make a drum from a box and play a song.",
"hi": "आइडिया: एक डिब्बे से ढोल बनाओ और कोई गाना बजाओ।",
"mr": "कल्पना: खोक्याचा ढोल बनव आणि एखादे गाणे वाजव.",
"es": "Idea: haz un tambor con una caja y toca una canción.",
"fr": "Idée : fabrique un tambour avec une boîte et joue une chanson.",
"de": "Idee: Bau dir aus einem Karton eine Trommel und spiel ein Lied.",
"ar": "فكرة: اصنع طبلة من علبة واعزف عليها أغنية.",
"zh": "好点子:用一个盒子做一面小鼓,再敲一首歌。"
}
},
{
"id": "y-idea-005",
"kind": "idea",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"helping"
],
"words": {
"en": "Idea: help set the table for dinner tonight.",
"hi": "आइडिया: आज रात खाने के लिए मेज़ लगाने में मदद करो।",
"mr": "कल्पना: आज रात्री जेवणासाठी ताट-वाट्या मांडायला मदत कर.",
"es": "Idea: ayuda a poner la mesa para la cena de esta noche.",
"fr": "Idée : aide à mettre la table pour le dîner de ce soir.",
"de": "Idee: Hilf heute Abend beim Tischdecken.",
"ar": "فكرة: ساعد في تجهيز مائدة العشاء الليلة.",
"zh": "好点子:今晚帮忙摆好晚饭的碗筷。"
}
},
{
"id": "y-idea-006",
"kind": "idea",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"nature"
],
"words": {
"en": "Idea: look at the clouds and find one shaped like an animal.",
"hi": "आइडिया: बादलों को देखो और जानवर जैसा दिखने वाला कोई बादल ढूँढो।",
"mr": "कल्पना: ढगांकडे बघ आणि प्राण्याच्या आकाराचा एखादा ढग शोध.",
"es": "Idea: mira las nubes y encuentra una con forma de animal.",
"fr": "Idée : regarde les nuages et trouves-en un qui ressemble à un animal.",
"de": "Idee: Schau dir die Wolken an und finde eine, die wie ein Tier aussieht.",
"ar": "فكرة: انظر إلى الغيوم وابحث عن غيمة تشبه حيواناً.",
"zh": "好点子:看看天上的云,找一朵像小动物的。"
}
},
{
"id": "y-idea-007",
"kind": "idea",
"minAge": 4,
"maxAge": 7,
"gender": "any",
"tags": [
"reading"
],
"words": {
"en": "Idea: ask someone to read you a story, then tell it back in your own words.",
"hi": "आइडिया: किसी से कहानी सुनाने को कहो, फिर उसे अपने शब्दों में वापस सुनाओ।",
"mr": "कल्पना: कोणाला तरी गोष्ट वाचून दाखवायला सांग, आणि मग ती तुझ्या स्वतःच्या शब्दांत परत सांग.",
"es": "Idea: pídele a alguien que te lea un cuento y luego cuéntalo con tus propias palabras.",
"fr": "Idée : demande à quelqu’un de te lire une histoire, puis raconte-la avec tes propres mots.",
"de": "Idee: Lass dir eine Geschichte vorlesen und erzähl sie dann mit deinen eigenen Worten nach.",
"ar": "فكرة: اطلب من أحد أن يقرأ لك قصة، ثم احكِها بكلماتك أنت.",
"zh": "好点子:请人给你讲个故事,然后用你自己的话讲回给他听。"
}
},
{
"id": "y-idea-008",
"kind": "idea",
"minAge": 4,
"maxAge": 7,
"gender": "girl",
"tags": [
"art"
],
"words": {
"en": "Idea: make a crown from paper and decorate it with your favourite colours.",
"hi": "आइडिया: कागज़ से एक ताज बनाओ और उसे अपने पसंदीदा रंगों से सजाओ।",
"mr": "कल्पना: कागदाचा मुकुट बनव आणि तुझ्या आवडत्या रंगांनी सजव.",
"es": "Idea: haz una corona de papel y decórala con tus colores favoritos.",
"fr": "Idée : fabrique une couronne en papier et décore-la avec tes couleurs préférées.",
"de": "Idee: Bastle eine Krone aus Papier und verziere sie mit deinen Lieblingsfarben.",
"ar": "فكرة: اصنعي تاجاً من الورق وزيّنيه بألوانك المفضلة.",
"zh": "好点子:用纸做一顶皇冠,再用你最喜欢的颜色装饰它。"
}
},
{
"id": "y-idea-009",
"kind": "idea",
"minAge": 4,
"maxAge": 7,
"gender": "boy",
"tags": [
"building"
],
"words": {
"en": "Idea: build the tallest tower you can with blocks or boxes.",
"hi": "आइडिया: ब्लॉक या डिब्बों से जितनी ऊँची हो सके, उतनी ऊँची मीनार बनाओ।",
"mr": "कल्पना: ठोकळ्यांचा किंवा खोक्यांचा वापर करून जमेल तितका उंच मनोरा बांध.",
"es": "Idea: construye la torre más alta que puedas con bloques o cajas.",
"fr": "Idée : construis la plus haute tour possible avec des blocs ou des boîtes.",
"de": "Idee: Bau den höchsten Turm, den du mit Bausteinen oder Kartons schaffst.",
"ar": "فكرة: ابنِ أعلى برج تستطيعه بالمكعبات أو العلب.",
"zh": "好点子:用积木或盒子搭一座你能搭出的最高的塔。"
}
},
{
"id": "o-fact-001",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"space"
],
"words": {
"en": "A day on Venus is longer than a year on Venus. It spins very slowly!",
"hi": "शुक्र ग्रह पर एक दिन वहाँ के एक साल से भी लंबा होता है। वह बहुत धीरे घूमता है!",
"mr": "शुक्रावरचा एक दिवस शुक्रावरच्या एका वर्षापेक्षा मोठा असतो. तो खूप हळू फिरतो!",
"es": "Un día en Venus dura más que un año en Venus. ¡Gira muy despacio!",
"fr": "Sur Vénus, un jour est plus long qu’une année. Elle tourne très lentement sur elle-même !",
"de": "Ein Tag auf der Venus ist länger als ein Jahr auf der Venus. Sie dreht sich nämlich ganz langsam!",
"ar": "اليوم على كوكب الزهرة أطول من سنته. فهو يدور ببطء شديد!",
"zh": "金星上的一天比金星上的一年还长。它转得特别特别慢!"
}
},
{
"id": "o-fact-002",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"space"
],
"words": {
"en": "You could fit about 1.3 million Earths inside the Sun.",
"hi": "सूरज के अंदर लगभग 13 लाख पृथ्वियाँ समा सकती हैं।",
"mr": "सूर्याच्या आत सुमारे १३ लाख पृथ्वी मावू शकतील.",
"es": "Dentro del Sol cabrían unas 1,3 millones de Tierras.",
"fr": "On pourrait faire tenir environ 1,3 million de Terres dans le Soleil.",
"de": "In die Sonne würden etwa 1,3 Millionen Erden hineinpassen.",
"ar": "يتّسع جوف الشمس لنحو 1.3 مليون كرة أرضية.",
"zh": "太阳里面大约能装下130万个地球。"
}
},
{
"id": "o-fact-003",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"space",
"india"
],
"words": {
"en": "In 2023, India's Chandrayaan-3 became the first mission to land near the Moon's south pole.",
"hi": "2023 में भारत का चंद्रयान-3 चाँद के दक्षिणी ध्रुव के पास उतरने वाला पहला मिशन बना।",
"mr": "२०२३ मध्ये भारताचे चांद्रयान-३ चंद्राच्या दक्षिण ध्रुवाजवळ उतरणारे पहिले यान ठरले.",
"es": "En 2023, la Chandrayaan-3 de la India fue la primera misión en aterrizar cerca del polo sur de la Luna.",
"fr": "En 2023, la mission indienne Chandrayaan-3 a été la première à se poser près du pôle sud de la Lune.",
"de": "2023 landete die indische Mission Chandrayaan-3 als erste in der Nähe des Südpols des Mondes.",
"ar": "في عام 2023، أصبحت المركبة الهندية «تشاندرايان-3» أول مهمة تهبط بالقرب من القطب الجنوبي للقمر.",
"zh": "2023年,印度的月船3号成为第一个降落在月球南极附近的任务。"
}
},
{
"id": "o-fact-004",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"body"
],
"words": {
"en": "Your heart beats about 100,000 times every day.",
"hi": "तुम्हारा दिल हर दिन लगभग 1,00,000 बार धड़कता है।",
"mr": "तुझे हृदय रोज सुमारे १,००,००० वेळा धडकते.",
"es": "Tu corazón late unas 100.000 veces cada día.",
"fr": "Ton cœur bat environ 100 000 fois par jour.",
"de": "Dein Herz schlägt jeden Tag etwa 100.000 Mal.",
"ar": "يخفق قلبك نحو 100,000 مرة كل يوم.",
"zh": "你的心脏每天大约跳10万次。"
}
},
{
"id": "o-fact-005",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"body"
],
"words": {
"en": "Your nose can tell apart over a trillion different smells.",
"hi": "तुम्हारी नाक एक ट्रिलियन से भी ज़्यादा अलग-अलग गंधों में फ़र्क कर सकती है।",
"mr": "तुझे नाक एका ट्रिलियनपेक्षा जास्त वेगवेगळे वास ओळखू शकते.",
"es": "Tu nariz puede distinguir más de un billón de olores distintos.",
"fr": "Ton nez peut distinguer plus de mille milliards d’odeurs différentes.",
"de": "Deine Nase kann mehr als eine Billion verschiedene Gerüche unterscheiden.",
"ar": "يستطيع أنفك أن يميّز بين أكثر من تريليون رائحة مختلفة.",
"zh": "你的鼻子能分辨出超过一万亿种不同的气味。"
}
},
{
"id": "o-fact-006",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "A shrimp's heart is in its head.",
"hi": "झींगे का दिल उसके सिर में होता है।",
"mr": "कोळंबीचे हृदय तिच्या डोक्यात असते.",
"es": "El corazón de una gamba está en su cabeza.",
"fr": "Le cœur d’une crevette se trouve dans sa tête.",
"de": "Das Herz einer Garnele sitzt in ihrem Kopf.",
"ar": "قلب الروبيان في رأسه.",
"zh": "虾的心脏长在头里面。"
}
},
{
"id": "o-fact-007",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"nature"
],
"words": {
"en": "Lightning is about five times hotter than the surface of the Sun.",
"hi": "बिजली सूरज की सतह से लगभग पाँच गुना ज़्यादा गर्म होती है।",
"mr": "वीज सूर्याच्या पृष्ठभागापेक्षा सुमारे पाच पट जास्त गरम असते.",
"es": "Un rayo es unas cinco veces más caliente que la superficie del Sol.",
"fr": "Un éclair est environ cinq fois plus chaud que la surface du Soleil.",
"de": "Ein Blitz ist etwa fünfmal heißer als die Oberfläche der Sonne.",
"ar": "البرق أسخن بخمس مرات تقريباً من سطح الشمس.",
"zh": "闪电的温度大约是太阳表面的五倍。"
}
},
{
"id": "o-fact-008",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"history",
"india"
],
"words": {
"en": "Chess grew out of an old Indian game called chaturanga, played about 1,500 years ago.",
"hi": "शतरंज एक पुराने भारतीय खेल चतुरंग से बना है, जो लगभग 1,500 साल पहले खेला जाता था।",
"mr": "बुद्धिबळ हा खेळ चतुरंग नावाच्या जुन्या भारतीय खेळातून आला, जो सुमारे १,५०० वर्षांपूर्वी खेळला जायचा.",
"es": "El ajedrez nació de un antiguo juego indio llamado chaturanga, que se jugaba hace unos 1.500 años.",
"fr": "Les échecs viennent d’un ancien jeu indien appelé chaturanga, auquel on jouait il y a environ 1 500 ans.",
"de": "Schach ist aus einem alten indischen Spiel namens Chaturanga entstanden, das vor etwa 1.500 Jahren gespielt wurde.",
"ar": "الشطرنج تطوّر من لعبة هندية قديمة اسمها «تشاتورانغا»، كان الناس يلعبونها قبل نحو 1,500 سنة.",
"zh": "国际象棋源自一种古老的印度游戏,叫恰图兰卡,大约在1500年前就有人玩了。"
}
},
{
"id": "o-fact-009",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"maths",
"india"
],
"words": {
"en": "Indian mathematicians were among the first to use zero as a number.",
"hi": "भारतीय गणितज्ञ शून्य को एक संख्या की तरह इस्तेमाल करने वाले सबसे पहले लोगों में से थे।",
"mr": "शून्य ही संख्या म्हणून वापरणाऱ्या सर्वात पहिल्या लोकांमध्ये भारतीय गणितज्ञ होते.",
"es": "Los matemáticos de la India fueron de los primeros en usar el cero como número.",
"fr": "Les mathématiciens indiens ont été parmi les premiers à utiliser le zéro comme un nombre.",
"de": "Indische Mathematiker gehörten zu den Ersten, die die Null als Zahl benutzt haben.",
"ar": "كان علماء الرياضيات الهنود من أوائل من استخدموا الصفر عدداً.",
"zh": "印度的数学家是最早把零当作一个数来使用的人之一。"
}
},
{
"id": "o-fact-010",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "Sea otters hold hands while they sleep so they don't drift apart.",
"hi": "समुद्री ऊदबिलाव सोते समय एक-दूसरे का हाथ पकड़ लेते हैं ताकि बहकर दूर न चले जाएँ।",
"mr": "समुद्री ऊद मांजरे झोपताना एकमेकांचे हात धरतात, म्हणजे ते वाहत दूर जात नाहीत.",
"es": "Las nutrias marinas se dan la mano mientras duermen para no separarse.",
"fr": "Les loutres de mer se tiennent la main pendant leur sommeil pour ne pas s’éloigner les unes des autres.",
"de": "Seeotter halten beim Schlafen Händchen, damit sie nicht auseinandertreiben.",
"ar": "قضاعات البحر تمسك أيدي بعضها وهي نائمة كي لا يبتعد بعضها عن بعض.",
"zh": "海獭睡觉的时候会手拉手,这样就不会被水冲散了。"
}
},
{
"id": "o-fact-011",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"nature"
],
"words": {
"en": "Bamboo is a kind of grass, and some kinds can grow almost a metre in a single day.",
"hi": "बाँस एक तरह की घास है, और कुछ किस्में एक ही दिन में लगभग एक मीटर तक बढ़ जाती हैं।",
"mr": "बांबू हा गवताचाच एक प्रकार आहे, आणि काही प्रकार एका दिवसात जवळजवळ एक मीटर वाढू शकतात.",
"es": "El bambú es un tipo de hierba, y algunas clases pueden crecer casi un metro en un solo día.",
"fr": "Le bambou est une sorte d’herbe, et certaines espèces peuvent pousser de presque un mètre en une seule journée.",
"de": "Bambus ist eine Grasart, und manche Sorten wachsen an einem einzigen Tag fast einen Meter.",
"ar": "الخيزران نوع من العشب، وبعض أنواعه تنمو نحو متر في يوم واحد.",
"zh": "竹子其实是一种草,有些品种一天能长高差不多一米。"
}
},
{
"id": "o-fact-012",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "A cheetah can go from standing still to 100 km an hour in about three seconds.",
"hi": "चीता खड़े-खड़े सिर्फ़ तीन सेकंड में 100 किमी प्रति घंटे की रफ़्तार पकड़ सकता है।",
"mr": "चित्ता उभ्या जागेवरून सुमारे तीन सेकंदांत ताशी १०० किमी वेग गाठू शकतो.",
"es": "Un guepardo puede pasar de estar quieto a 100 km por hora en unos tres segundos.",
"fr": "Un guépard peut passer de l’arrêt à 100 km/h en environ trois secondes.",
"de": "Ein Gepard kann in etwa drei Sekunden aus dem Stand auf 100 Kilometer pro Stunde beschleunigen.",
"ar": "يستطيع الفهد أن ينطلق من الوقوف إلى سرعة 100 كم في الساعة في نحو ثلاث ثوانٍ.",
"zh": "猎豹从站着不动到加速到每小时100公里,只要大约三秒钟。"
}
},
{
"id": "o-fact-013",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"science"
],
"words": {
"en": "Hot water can sometimes freeze faster than cold water. Scientists are still studying why.",
"hi": "कभी-कभी गर्म पानी ठंडे पानी से भी जल्दी जम सकता है। वैज्ञानिक अब भी इसकी वजह खोज रहे हैं।",
"mr": "गरम पाणी कधीकधी थंड पाण्यापेक्षा लवकर गोठू शकते. असे का होते यावर शास्त्रज्ञ अजूनही अभ्यास करत आहेत.",
"es": "A veces el agua caliente puede congelarse más rápido que la fría. Los científicos todavía estudian por qué.",
"fr": "L’eau chaude peut parfois geler plus vite que l’eau froide. Les scientifiques cherchent encore pourquoi.",
"de": "Heißes Wasser kann manchmal schneller gefrieren als kaltes. Forschende untersuchen noch, warum.",
"ar": "الماء الساخن قد يتجمد أحياناً أسرع من البارد. ولا يزال العلماء يدرسون السبب.",
"zh": "热水有时候比冷水结冰更快。科学家们还在研究这是为什么。"
}
},
{
"id": "o-fact-014",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"nature"
],
"words": {
"en": "Mount Everest grows a few millimetres taller every year.",
"hi": "माउंट एवरेस्ट हर साल कुछ मिलीमीटर और ऊँचा हो जाता है।",
"mr": "माउंट एव्हरेस्ट दरवर्षी काही मिलिमीटरने उंच होत आहे.",
"es": "El monte Everest crece unos pocos milímetros cada año.",
"fr": "Le mont Everest grandit de quelques millimètres chaque année.",
"de": "Der Mount Everest wird jedes Jahr ein paar Millimeter höher.",
"ar": "يزداد ارتفاع جبل إفرست بضعة مليمترات كل سنة.",
"zh": "珠穆朗玛峰每年还会长高几毫米。"
}
},
{
"id": "o-fact-015",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"science"
],
"words": {
"en": "Honey never goes bad. Honey found in ancient Egyptian tombs could still be eaten.",
"hi": "शहद कभी खराब नहीं होता। प्राचीन मिस्र की कब्रों में मिला शहद भी खाया जा सकता था।",
"mr": "मध कधीच खराब होत नाही. प्राचीन इजिप्शियन थडग्यांमध्ये सापडलेला मध आजही खाता आला असता.",
"es": "La miel nunca se estropea. La miel que se encontró en tumbas del antiguo Egipto todavía se podía comer.",
"fr": "Le miel ne se gâte jamais. Du miel trouvé dans des tombes de l’Égypte ancienne pouvait encore être mangé.",
"de": "Honig wird nie schlecht. Honig aus uralten ägyptischen Gräbern konnte man noch essen.",
"ar": "العسل لا يفسد أبداً. والعسل الذي وُجد في مقابر مصر القديمة كان لا يزال صالحاً للأكل.",
"zh": "蜂蜜永远不会坏。在古埃及陵墓里找到的蜂蜜,居然还能吃。"
}
},
{
"id": "o-fact-016",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "Owls can't move their eyes, so they turn their heads instead, nearly all the way round.",
"hi": "उल्लू अपनी आँखें घुमा नहीं सकते, इसलिए वे अपना सिर घुमाते हैं, लगभग पूरा गोल।",
"mr": "घुबडांना डोळे हलवता येत नाहीत, म्हणून ते डोके फिरवतात, जवळजवळ पूर्ण गोल.",
"es": "Los búhos no pueden mover los ojos, así que giran la cabeza, casi hasta dar la vuelta entera.",
"fr": "Les chouettes ne peuvent pas bouger les yeux, alors elles tournent la tête, presque complètement.",
"de": "Eulen können ihre Augen nicht bewegen, deshalb drehen sie stattdessen den Kopf, fast ganz herum.",
"ar": "لا تستطيع البومة تحريك عينيها، فتدير رأسها بدلاً من ذلك، تقريباً دورة كاملة.",
"zh": "猫头鹰的眼睛不能转动,所以它们转头,几乎能转完一整圈。"
}
},
{
"id": "o-fact-017",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"body"
],
"words": {
"en": "You are a little taller in the morning than at night, because the discs in your back squash during the day.",
"hi": "तुम सुबह रात के मुकाबले थोड़े लंबे होते हो, क्योंकि दिन भर में पीठ की गद्दियाँ दब जाती हैं।",
"mr": "रात्रीपेक्षा सकाळी तू थोडा जास्त उंच असतोस, कारण दिवसभरात पाठीच्या कण्यातील चकत्या दबल्या जातात.",
"es": "Por la mañana eres un poquito más alto que por la noche, porque los discos de tu espalda se aplastan durante el día.",
"fr": "Tu es un peu plus grand le matin que le soir, parce que les disques de ton dos se tassent pendant la journée.",
"de": "Morgens bist du ein kleines bisschen größer als abends, weil die Bandscheiben in deinem Rücken tagsüber zusammengedrückt werden.",
"ar": "تكون أطول قليلاً في الصباح منك في الليل، لأن الأقراص في ظهرك تنضغط خلال النهار.",
"zh": "你早上会比晚上高一点点,因为背部的椎间盘白天会被压扁。"
}
},
{
"id": "o-fact-018",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"space"
],
"words": {
"en": "Astronauts on the space station see about 16 sunrises every day.",
"hi": "अंतरिक्ष स्टेशन पर अंतरिक्ष यात्री हर दिन लगभग 16 सूर्योदय देखते हैं।",
"mr": "अंतराळ स्थानकातील अंतराळवीरांना रोज सुमारे १६ सूर्योदय दिसतात.",
"es": "Los astronautas de la estación espacial ven unos 16 amaneceres cada día.",
"fr": "Les astronautes de la station spatiale voient environ 16 levers de soleil par jour.",
"de": "Astronauten auf der Raumstation sehen jeden Tag etwa 16 Sonnenaufgänge.",
"ar": "يرى روّاد الفضاء في المحطة الفضائية نحو 16 شروقاً للشمس كل يوم.",
"zh": "空间站上的宇航员,一天能看到大约16次日出。"
}
},
{
"id": "o-fact-019",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "The blue whale is the biggest animal that has ever lived, bigger than any dinosaur.",
"hi": "ब्लू व्हेल अब तक का सबसे बड़ा जीव है, किसी भी डायनासोर से भी बड़ा।",
"mr": "ब्लू व्हेल हा आतापर्यंत जगलेला सर्वात मोठा प्राणी आहे, कोणत्याही डायनासोरपेक्षाही मोठा.",
"es": "La ballena azul es el animal más grande que ha existido, más grande que cualquier dinosaurio.",
"fr": "La baleine bleue est le plus grand animal ayant jamais vécu, plus grand que n’importe quel dinosaure.",
"de": "Der Blauwal ist das größte Tier, das jemals gelebt hat, größer als jeder Dinosaurier.",
"ar": "الحوت الأزرق أكبر حيوان عاش على الإطلاق، أكبر من أي ديناصور.",
"zh": "蓝鲸是地球上有史以来最大的动物,比任何一种恐龙都大。"
}
},
{
"id": "o-fact-020",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"nature"
],
"words": {
"en": "More than half the oxygen we breathe comes from tiny plants in the ocean.",
"hi": "हम जिस ऑक्सीजन में साँस लेते हैं, उसका आधे से ज़्यादा हिस्सा समुद्र के नन्हे पौधों से आता है।",
"mr": "आपण श्वासात घेतो त्या प्राणवायूपैकी निम्म्याहून जास्त वायू समुद्रातील लहानशा वनस्पतींपासून मिळतो.",
"es": "Más de la mitad del oxígeno que respiramos viene de diminutas plantas del océano.",
"fr": "Plus de la moitié de l’oxygène que nous respirons vient de minuscules plantes de l’océan.",
"de": "Mehr als die Hälfte des Sauerstoffs, den wir atmen, stammt von winzigen Pflanzen im Meer.",
"ar": "أكثر من نصف الأكسجين الذي نتنفسه يأتي من نباتات صغيرة في المحيط.",
"zh": "我们呼吸的氧气,有一半以上来自海洋里的微小植物。"
}
},
{
"id": "o-fact-021",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"sports",
"india"
],
"words": {
"en": "Kabaddi is a sport that started in India thousands of years ago, and players have to hold their breath while they raid.",
"hi": "कबड्डी एक ऐसा खेल है जो हज़ारों साल पहले भारत में शुरू हुआ, और इसमें रेड डालते समय खिलाड़ी को साँस रोकनी पड़ती है।",
"mr": "कबड्डी हा खेळ हजारो वर्षांपूर्वी भारतात सुरू झाला, आणि चढाई करताना खेळाडूंना श्वास रोखून धरावा लागतो.",
"es": "El kabaddi es un deporte que nació en la India hace miles de años, y los jugadores tienen que aguantar la respiración mientras atacan.",
"fr": "Le kabaddi est un sport né en Inde il y a des milliers d’années, et les joueurs doivent retenir leur souffle pendant leur raid.",
"de": "Kabaddi ist ein Sport, der vor tausenden Jahren in Indien entstanden ist. Beim Angriff müssen die Spieler die Luft anhalten.",
"ar": "الكابادي رياضة بدأت في الهند قبل آلاف السنين، وعلى اللاعب أن يحبس أنفاسه وهو يقوم بهجومه.",
"zh": "卡巴迪是一项几千年前起源于印度的运动,进攻的队员出击时必须一口气憋住不换气。"
}
},
{
"id": "o-fact-022",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"science"
],
"words": {
"en": "Sound travels about four times faster in water than in air.",
"hi": "आवाज़ पानी में हवा के मुकाबले लगभग चार गुना तेज़ चलती है।",
"mr": "आवाज हवेपेक्षा पाण्यात सुमारे चार पट वेगाने प्रवास करतो.",
"es": "El sonido viaja unas cuatro veces más rápido en el agua que en el aire.",
"fr": "Le son voyage environ quatre fois plus vite dans l’eau que dans l’air.",
"de": "Schall bewegt sich im Wasser etwa viermal schneller als in der Luft.",
"ar": "ينتقل الصوت في الماء أسرع بنحو أربع مرات منه في الهواء.",
"zh": "声音在水里传播的速度,大约是在空气中的四倍。"
}
},
{
"id": "o-fact-023",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "Ants don't have lungs. They breathe through tiny holes in their bodies.",
"hi": "चींटियों के फेफड़े नहीं होते। वे अपने शरीर के नन्हे छेदों से साँस लेती हैं।",
"mr": "मुंग्यांना फुफ्फुसे नसतात. त्या शरीरावरील लहान लहान छिद्रांतून श्वास घेतात.",
"es": "Las hormigas no tienen pulmones. Respiran por diminutos agujeritos de su cuerpo.",
"fr": "Les fourmis n’ont pas de poumons. Elles respirent par de minuscules trous dans leur corps.",
"de": "Ameisen haben keine Lungen. Sie atmen durch winzige Löcher in ihrem Körper.",
"ar": "ليس للنمل رئتان. إنه يتنفس من ثقوب صغيرة في جسمه.",
"zh": "蚂蚁没有肺。它们是通过身体上的小小气孔来呼吸的。"
}
},
{
"id": "o-fact-024",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"history"
],
"words": {
"en": "The Great Wall of China is thousands of kilometres long, but you can't see it from the Moon with your eyes.",
"hi": "चीन की महान दीवार हज़ारों किलोमीटर लंबी है, पर चाँद से उसे आँखों से नहीं देखा जा सकता।",
"mr": "चीनची भिंत हजारो किलोमीटर लांब आहे, पण चंद्रावरून ती उघड्या डोळ्यांनी दिसत नाही.",
"es": "La Gran Muralla china mide miles de kilómetros, pero no se puede ver desde la Luna a simple vista.",
"fr": "La Grande Muraille de Chine mesure des milliers de kilomètres, mais on ne peut pas la voir à l’œil nu depuis la Lune.",
"de": "Die Chinesische Mauer ist tausende Kilometer lang, aber vom Mond aus kann man sie mit bloßem Auge nicht sehen.",
"ar": "سور الصين العظيم طوله آلاف الكيلومترات، لكنك لا تستطيع رؤيته من القمر بعينيك المجرّدتين.",
"zh": "中国的万里长城有好几千公里长,但是你用肉眼在月球上是看不到它的。"
}
},
{
"id": "o-fact-025",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "girl",
"tags": [
"space",
"india",
"rolemodel"
],
"words": {
"en": "Kalpana Chawla, born in Karnal, India, became the first woman of Indian origin to go to space, in 1997.",
"hi": "भारत के करनाल में जन्मी कल्पना चावला 1997 में अंतरिक्ष जाने वाली पहली भारतीय मूल की महिला बनीं।",
"mr": "भारतातील कर्नाल येथे जन्मलेल्या कल्पना चावला १९९७ मध्ये अंतराळात जाणाऱ्या भारतीय वंशाच्या पहिल्या महिला ठरल्या.",
"es": "Kalpana Chawla, nacida en Karnal, India, fue la primera mujer de origen indio en viajar al espacio, en 1997.",
"fr": "Kalpana Chawla, née à Karnal, en Inde, est devenue en 1997 la première femme d’origine indienne à aller dans l’espace.",
"de": "Kalpana Chawla, geboren in Karnal in Indien, war 1997 die erste Frau indischer Herkunft im Weltraum.",
"ar": "كالبانا تشاولا، المولودة في كارنال بالهند، كانت أول امرأة من أصل هندي تصل إلى الفضاء، عام 1997.",
"zh": "出生在印度卡尔纳尔的卡尔帕娜·乔拉,在1997年成为第一位飞向太空的印度裔女性。"
}
},
{
"id": "o-fact-026",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "boy",
"tags": [
"space",
"india",
"rolemodel"
],
"words": {
"en": "Rakesh Sharma was the first Indian in space. Asked how India looked from up there, he said: \"Saare jahan se achha.\"",
"hi": "राकेश शर्मा अंतरिक्ष में जाने वाले पहले भारतीय थे। जब पूछा गया कि वहाँ से भारत कैसा दिखता है, तो उन्होंने कहा: “सारे जहाँ से अच्छा।”",
"mr": "राकेश शर्मा हे अंतराळात जाणारे पहिले भारतीय होते. वरून भारत कसा दिसतो असे विचारल्यावर ते म्हणाले: “सारे जहाँ से अच्छा.”",
"es": "Rakesh Sharma fue el primer indio en el espacio. Cuando le preguntaron cómo se veía la India desde allá arriba, dijo: «Saare jahan se achha».",
"fr": "Rakesh Sharma a été le premier Indien dans l’espace. Quand on lui a demandé comment l’Inde apparaissait de là-haut, il a répondu : « Saare jahan se achha. »",
"de": "Rakesh Sharma war der erste Inder im Weltraum. Als man ihn fragte, wie Indien von dort oben aussieht, sagte er: \"Saare jahan se achha.\" (Besser als die ganze Welt.)",
"ar": "كان راكيش شارما أول هندي في الفضاء. وحين سُئل كيف تبدو الهند من هناك قال: «ساري جهان سي أتشا» أي أجمل بلاد الدنيا.",
"zh": "拉凯什·夏尔马是第一位进入太空的印度人。有人问他从太空看印度是什么样子,他说:“Saare jahan se achha(比全世界都美好)。”"
}
},
{
"id": "o-fact-027",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"science",
"india",
"rolemodel"
],
"words": {
"en": "A.P.J. Abdul Kalam, who helped build India's rockets, sold newspapers as a boy to help his family.",
"hi": "ए.पी.जे. अब्दुल कलाम, जिन्होंने भारत के रॉकेट बनाने में मदद की, बचपन में अपने परिवार की मदद के लिए अखबार बेचते थे।",
"mr": "भारताची रॉकेट्स बनवण्यात मदत करणारे ए.पी.जे. अब्दुल कलाम लहानपणी कुटुंबाला मदत करण्यासाठी वर्तमानपत्रे विकायचे.",
"es": "A.P.J. Abdul Kalam, que ayudó a construir los cohetes de la India, vendía periódicos de niño para ayudar a su familia.",
"fr": "A.P.J. Abdul Kalam, qui a aidé à construire les fusées de l’Inde, vendait des journaux quand il était enfant pour aider sa famille.",
"de": "A.P.J. Abdul Kalam, der half, Indiens Raketen zu bauen, verkaufte als Junge Zeitungen, um seiner Familie zu helfen.",
"ar": "إيه. بي. جي. عبد الكلام، الذي ساعد في بناء صواريخ الهند، باع الصحف وهو صبي ليساعد أسرته.",
"zh": "帮助印度建造火箭的A.P.J. 阿卜杜尔·卡拉姆,小时候曾经卖报纸来帮助家里。"
}
},
{
"id": "o-fact-028",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "Crows can recognise human faces and remember them for years.",
"hi": "कौए इंसानों के चेहरे पहचान सकते हैं और उन्हें सालों तक याद रखते हैं।",
"mr": "कावळे माणसांचे चेहरे ओळखू शकतात आणि वर्षानुवर्षे लक्षात ठेवतात.",
"es": "Los cuervos pueden reconocer caras humanas y recordarlas durante años.",
"fr": "Les corbeaux savent reconnaître les visages humains et s’en souviennent pendant des années.",
"de": "Krähen erkennen Menschengesichter und können sich jahrelang an sie erinnern.",
"ar": "الغربان تستطيع أن تتعرّف إلى وجوه البشر وتتذكرها سنوات.",
"zh": "乌鸦能认出人的脸,而且能记住好多年。"
}
},
{
"id": "o-fact-029",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"nature"
],
"words": {
"en": "A single cloud can weigh as much as a hundred elephants.",
"hi": "एक अकेला बादल सौ हाथियों जितना भारी हो सकता है।",
"mr": "एका ढगाचे वजन शंभर हत्तींच्या वजनाएवढे असू शकते.",
"es": "Una sola nube puede pesar como cien elefantes.",
"fr": "Un seul nuage peut peser autant que cent éléphants.",
"de": "Eine einzige Wolke kann so viel wiegen wie hundert Elefanten.",
"ar": "قد تزن سحابة واحدة ما يزنه مئة فيل.",
"zh": "一朵云的重量,可以和一百头大象一样重。"
}
},
{
"id": "o-fact-030",
"kind": "fact",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"language"
],
"words": {
"en": "India has 22 official languages listed in its Constitution, and hundreds more are spoken.",
"hi": "भारत के संविधान में 22 आधिकारिक भाषाएँ दर्ज हैं, और इनके अलावा सैकड़ों और भाषाएँ बोली जाती हैं।",
"mr": "भारतीय संविधानात २२ अधिकृत भाषा नमूद आहेत, आणि त्याहून शेकडो जास्त भाषा बोलल्या जातात.",
"es": "La India tiene 22 idiomas oficiales en su Constitución, y se hablan cientos más.",
"fr": "L’Inde compte 22 langues officielles dans sa Constitution, et des centaines d’autres y sont parlées.",
"de": "Indien hat 22 offizielle Sprachen, die in der Verfassung stehen, und hunderte weitere werden gesprochen.",
"ar": "للهند 22 لغة رسمية مذكورة في دستورها، ويُتحدَّث فيها بمئات اللغات الأخرى.",
"zh": "印度宪法中列出了22种官方语言,另外还有几百种语言在使用。"
}
},
{
"id": "o-joke-001",
"kind": "joke",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"fun",
"maths"
],
"words": {
"en": "Why was the maths book sad? It had too many problems.",
"hi": "गणित की किताब उदास क्यों थी? क्योंकि उसमें बहुत सारे सवाल थे, यानी बहुत सारी परेशानियाँ।",
"mr": "गणिताचे पुस्तक उदास का होते? कारण त्यात खूप सारी गणिते (अडचणी) होती.",
"es": "¿Por qué estaba triste el libro de mates? ¡Porque tenía demasiados problemas!",
"fr": "Pourquoi le livre de maths était-il triste ? Parce qu’il avait trop de problèmes.",
"de": "Warum war das Mathebuch traurig? Es hatte so viele Probleme.",
"ar": "لماذا كان كتاب الحساب حزيناً؟ لأن عنده مسائل كثيرة.",
"zh": "数学书为什么不开心?因为它有太多“问题”了。"
}
},
{
"id": "o-joke-002",
"kind": "joke",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"fun",
"science"
],
"words": {
"en": "Why can't you trust atoms? They make up everything!",
"hi": "परमाणुओं पर भरोसा क्यों नहीं करना चाहिए? क्योंकि वे सब कुछ बनाते हैं, बातें भी बना लेते हैं!",
"mr": "अणूंवर विश्वास का ठेवू नये? कारण ते सगळे काही बनवतात, म्हणजे बनवाबनवी करतात!",
"es": "¿Por qué no puedes fiarte de los átomos? ¡Porque lo componen todo!",
"fr": "Pourquoi ne peut-on pas faire confiance aux atomes ? Parce qu’ils composent tout… même les histoires !",
"de": "Warum kann man Atomen nicht trauen? Sie machen einfach alles aus!",
"ar": "لماذا لا نثق بالذرّات؟ لأنها تؤلّف كل شيء!",
"zh": "为什么不能相信原子?因为什么东西都是它们“编”出来的!"
}
},
{
"id": "o-joke-003",
"kind": "joke",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"fun",
"space"
],
"words": {
"en": "How do you throw a party in space? You planet!",
"hi": "अंतरिक्ष में पार्टी कैसे करते हैं? पहले प्लैनेट, मेरा मतलब है प्लान बनाकर!",
"mr": "अवकाशात पार्टी कशी करतात? ग्रह-प्रवेश करून!",
"es": "¿Cómo se hace una fiesta en el espacio? ¡La planeteas!",
"fr": "Comment fait-on la fête dans l’espace ? On organise une fête… planétaire !",
"de": "Wie schmeißt man eine Party im Weltall? Man plan-et sie!",
"ar": "كيف تقيم حفلة في الفضاء؟ تدعو كل الكواكب!",
"zh": "在太空里怎么开派对?先把它“星”划好!"
}
},
{
"id": "o-joke-004",
"kind": "joke",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"fun"
],
"words": {
"en": "Why did the student eat his homework? The teacher said it was a piece of cake!",
"hi": "बच्चे ने अपना होमवर्क क्यों खा लिया? क्योंकि टीचर ने कहा था कि यह तो केक का टुकड़ा है!",
"mr": "विद्यार्थ्याने स्वतःचा गृहपाठ का खाल्ला? कारण शिक्षक म्हणाले होते की तो एकदम केकवॉक आहे, म्हणजे केकसारखा सोपा!",
"es": "¿Por qué se comió el estudiante su tarea? ¡Porque la maestra dijo que era pan comido!",
"fr": "Pourquoi l’élève a-t-il mangé ses devoirs ? Parce que le maître avait dit que c’était du gâteau !",
"de": "Warum hat der Schüler seine Hausaufgaben gegessen? Der Lehrer hatte gesagt, sie seien ein Kinderspiel, also ein Stück Kuchen!",
"ar": "لماذا أكل الطالب واجبه؟ لأن المعلم قال إنه أسهل من أكل الحلوى!",
"zh": "同学为什么把作业吃掉了?因为老师说这是“小菜一碟”!"
}
},
{
"id": "o-joke-005",
"kind": "joke",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"fun",
"animals"
],
"words": {
"en": "What do you call a dog magician? A labracadabrador!",
"hi": "कुत्ते जादूगर को क्या कहते हैं? लैब्रा-कडाब्रा-डोर!",
"mr": "जादूगार कुत्र्याला काय म्हणतात? जादूगर-ब्रॅडोर!",
"es": "¿Cómo se llama un perro mago? ¡Abracadabrador!",
"fr": "Comment appelle-t-on un chien magicien ? Un labracadabra !",
"de": "Wie nennt man einen Zauberer-Hund? Einen Hokuspokus-Pudel!",
"ar": "ماذا نسمّي كلباً ساحراً؟ لابرا-كادابرا-دور!",
"zh": "会变魔术的狗叫什么?叫“阿布拉卡达布拉多”!"
}
},
{
"id": "o-joke-006",
"kind": "joke",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"fun"
],
"words": {
"en": "Why did the scarecrow win a prize? He was outstanding in his field.",
"hi": "बिजूका को इनाम क्यों मिला? क्योंकि वह अपने खेत में सबसे अलग खड़ा था।",
"mr": "बुजगावण्याला बक्षीस का मिळाले? कारण तो आपल्या शेतात सगळ्यांपेक्षा उठून दिसत होता.",
"es": "¿Por qué ganó un premio el espantapájaros? ¡Porque era sobresaliente en su campo!",
"fr": "Pourquoi l’épouvantail a-t-il gagné un prix ? Parce qu’il était formidable dans son champ.",
"de": "Warum hat die Vogelscheuche einen Preis gewonnen? Sie war auf ihrem Gebiet einfach überragend.",
"ar": "لماذا فاز الفزّاعة بجائزة؟ لأنه تميّز في حقله.",
"zh": "稻草人为什么得了奖?因为他“出类拔萃”,还一直站在田里!"
}
},
{
"id": "o-riddle-001",
"kind": "riddle",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"fun"
],
"words": {
"en": "Riddle: the more you take, the more you leave behind. What are they? Footsteps!",
"hi": "पहेली: जितने ज़्यादा लोगे, उतने ज़्यादा पीछे छूटेंगे। वे क्या हैं? क़दमों के निशान!",
"mr": "कोडे: जितकी जास्त घेशील, तितकी जास्त मागे राहतात. ती काय? पावलांचे ठसे!",
"es": "Adivinanza: cuantos más tomas, más dejas atrás. ¿Qué son? ¡Los pasos!",
"fr": "Devinette : plus tu en prends, plus tu en laisses derrière toi. Qu’est-ce que c’est ? Des pas !",
"de": "Rätsel: Je mehr du davon nimmst, desto mehr lässt du zurück. Was ist das? Schritte!",
"ar": "لغز: كلما أخذتَ منها أكثر، تركتَ وراءك أكثر. ما هي؟ الخطوات!",
"zh": "谜语:你拿得越多,留下的就越多。它们是什么?脚印!"
}
},
{
"id": "o-riddle-002",
"kind": "riddle",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"fun"
],
"words": {
"en": "Riddle: what has keys but can't open locks? A piano!",
"hi": "पहेली: किसमें कुंजियाँ होती हैं पर वह ताला नहीं खोल सकता? पियानो!",
"mr": "कोडे: कळा (चाव्या) आहेत पण कुलूप उघडता येत नाही, ते काय? पियानो!",
"es": "Adivinanza: ¿qué tiene teclas pero no puede abrir cerraduras? ¡Un piano!",
"fr": "Devinette : qu’est-ce qui a des touches mais n’ouvre aucune serrure ? Un piano !",
"de": "Rätsel: Was hat Tasten, aber kann keine Schlösser öffnen? Ein Klavier!",
"ar": "لغز: ما الذي له مفاتيح ولا يفتح الأقفال؟ البيانو!",
"zh": "谜语:什么东西有“键”,却打不开锁?钢琴!"
}
},
{
"id": "o-riddle-003",
"kind": "riddle",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"fun"
],
"words": {
"en": "Riddle: what can you catch but not throw? A cold!",
"hi": "पहेली: क्या पकड़ा जा सकता है पर फेंका नहीं जा सकता? ज़ुकाम!",
"mr": "कोडे: पकडता येते पण फेकता येत नाही, ते काय? सर्दी!",
"es": "Adivinanza: ¿qué se puede coger pero no lanzar? ¡Un resfriado!",
"fr": "Devinette : qu’est-ce qu’on peut attraper mais pas lancer ? Un rhume !",
"de": "Rätsel: Was kann man sich holen, aber nicht werfen? Eine Erkältung!",
"ar": "لغز: ما الذي تلتقطه ولا تستطيع رميه؟ الزكام!",
"zh": "谜语:什么东西你能“染上”,却扔不出去?感冒!"
}
},
{
"id": "o-riddle-004",
"kind": "riddle",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"fun",
"maths"
],
"words": {
"en": "Riddle: I'm an odd number. Take away one letter and I become even. What am I? Seven!",
"hi": "पहेली: मैं एक विषम संख्या हूँ, एक हफ़्ते में मेरे जितने दिन होते हैं। मैं कौन हूँ? सात!",
"mr": "कोडे: मी एक विषम संख्या आहे. माझे एक अक्षर काढले की मी सम होतो. मी कोण? सात! (इंग्रजीत ‘सेव्हन’ मधून ‘स’ काढला की ‘इव्हन’, म्हणजे सम, उरते!)",
"es": "Adivinanza: tengo ciudades pero no casas, montañas pero no árboles y agua pero no peces. ¿Qué soy? ¡Un mapa!",
"fr": "Devinette : je suis un nombre impair. Enlève une lettre et je deviens pair. Qui suis-je ? Sept ! En anglais, « seven » sans le « s » donne « even », qui veut dire pair.",
"de": "Rätsel: Ich bin eine ungerade Zahl. Nimm mir einen Buchstaben weg, und ich werde gerade. Was bin ich? Sieben!",
"ar": "لغز: أنا عدد زوجي. إذا أضفتَ إليّ نصفي صرتُ ستة. من أنا؟ أربعة!",
"zh": "谜语:我是一个奇数,去掉一笔就变成偶数。我是谁?三!"
}
},
{
"id": "o-quote-001",
"kind": "quote",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"growth"
],
"words": {
"en": "\"It always seems impossible until it's done.\" Nelson Mandela",
"hi": "“जब तक कोई काम हो न जाए, वह हमेशा नामुमकिन ही लगता है।” नेल्सन मंडेला",
"mr": "“जोपर्यंत ते पूर्ण होत नाही तोपर्यंत ते नेहमी अशक्यच वाटते.” नेल्सन मंडेला",
"es": "«Siempre parece imposible hasta que se hace». Nelson Mandela",
"fr": "« Cela semble toujours impossible jusqu’à ce que ce soit fait. » Nelson Mandela",
"de": "\"Es scheint immer unmöglich, bis es geschafft ist.\" Nelson Mandela",
"ar": "«يبدو الأمر دائماً مستحيلاً حتى يتم إنجازه.» نيلسون مانديلا",
"zh": "“在做成之前,一切看起来总是不可能的。”纳尔逊·曼德拉"
}
},
{
"id": "o-quote-002",
"kind": "quote",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"growth",
"india"
],
"words": {
"en": "\"Dream, dream, dream. Dreams transform into thoughts, and thoughts result in action.\" A.P.J. Abdul Kalam",
"hi": "“सपने देखो, सपने देखो, सपने देखो। सपने विचारों में बदलते हैं, और विचार कर्म में।” ए.पी.जे. अब्दुल कलाम",
"mr": "“स्वप्ने बघा, स्वप्ने बघा, स्वप्ने बघा. स्वप्नांचे रूपांतर विचारांमध्ये होते, आणि विचारांतून कृती घडते.” ए.पी.जे. अब्दुल कलाम",
"es": "«Sueña, sueña, sueña. Los sueños se convierten en pensamientos, y los pensamientos se convierten en acción». A.P.J. Abdul Kalam",
"fr": "« Rêve, rêve, rêve. Les rêves se transforment en pensées, et les pensées donnent des actions. » A.P.J. Abdul Kalam",
"de": "\"Träume, träume, träume. Träume verwandeln sich in Gedanken, und Gedanken führen zu Taten.\" A.P.J. Abdul Kalam",
"ar": "«احلم، احلم، احلم. الأحلام تتحول إلى أفكار، والأفكار تثمر عملاً.» إيه. بي. جي. عبد الكلام",
"zh": "“做梦吧,做梦吧,多多做梦。梦会变成想法,想法会变成行动。”A.P.J. 阿卜杜尔·卡拉姆"
}
},
{
"id": "o-quote-003",
"kind": "quote",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"kindness"
],
"words": {
"en": "\"No act of kindness, no matter how small, is ever wasted.\" Aesop",
"hi": "“दयालुता का कोई भी काम, चाहे कितना भी छोटा हो, कभी बेकार नहीं जाता।” ईसप",
"mr": "“दयाळूपणाची कोणतीही कृती, कितीही लहान असली तरी, कधीच वाया जात नाही.” ईसाप",
"es": "«Ningún acto de bondad, por pequeño que sea, se desperdicia jamás». Esopo",
"fr": "« Aucun geste de bonté, aussi petit soit-il, n’est jamais perdu. » Ésope",
"de": "\"Keine gute Tat, so klein sie auch ist, ist jemals verschwendet.\" Aesop",
"ar": "«لا يضيع أي عمل طيب، مهما كان صغيراً.» إيسوب",
"zh": "“再小的善意,也不会白费。”伊索"
}
},
{
"id": "o-quote-004",
"kind": "quote",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"growth"
],
"words": {
"en": "Practice doesn't make perfect. Practice makes progress.",
"hi": "अभ्यास से कोई परफ़ेक्ट नहीं बनता। अभ्यास से तरक्की होती है।",
"mr": "सरावाने परिपूर्णता येत नाही. सरावाने प्रगती होते.",
"es": "Practicar no hace perfecto. Practicar hace progresar.",
"fr": "Ce n’est pas la pratique qui rend parfait. La pratique fait progresser.",
"de": "Übung macht nicht perfekt. Übung macht Fortschritt.",
"ar": "التدريب لا يصنع الكمال. التدريب يصنع التقدّم.",
"zh": "练习不会让人完美,练习会让人进步。"
}
},
{
"id": "o-quote-005",
"kind": "quote",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"growth"
],
"words": {
"en": "The expert in anything was once a beginner.",
"hi": "किसी भी चीज़ का माहिर कभी शुरुआत करने वाला ही था।",
"mr": "कोणत्याही गोष्टीतला तज्ज्ञ एकेकाळी नवशिकाच होता.",
"es": "Quien es experto en algo, una vez fue principiante.",
"fr": "L’expert en n’importe quoi a un jour été un débutant.",
"de": "Jeder Profi war einmal ein Anfänger.",
"ar": "الخبير في أي شيء كان يوماً مبتدئاً.",
"zh": "每个行家,曾经也都是新手。"
}
},
{
"id": "o-quote-006",
"kind": "quote",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"reading"
],
"words": {
"en": "\"The more that you read, the more things you will know.\" Dr. Seuss",
"hi": "“तुम जितना ज़्यादा पढ़ोगे, उतनी ज़्यादा चीज़ें जानोगे।” डॉ. सुस",
"mr": "“तुम्ही जितके जास्त वाचाल, तितक्या जास्त गोष्टी तुम्हाला कळतील.” डॉ. सुस",
"es": "«Cuanto más leas, más cosas sabrás». Dr. Seuss",
"fr": "« Plus tu lis, plus tu sauras de choses. » Dr. Seuss",
"de": "\"Je mehr du liest, desto mehr Dinge wirst du wissen.\" Dr. Seuss",
"ar": "«كلما قرأتَ أكثر، عرفتَ أشياء أكثر.» الدكتور سوس",
"zh": "“你读的书越多,你知道的事情就越多。”苏斯博士"
}
},
{
"id": "o-quote-007",
"kind": "quote",
"minAge": 8,
"maxAge": 12,
"gender": "girl",
"tags": [
"growth",
"rolemodel"
],
"words": {
"en": "\"One child, one teacher, one book and one pen can change the world.\" Malala Yousafzai",
"hi": "“एक बच्चा, एक शिक्षक, एक किताब और एक कलम दुनिया बदल सकते हैं।” मलाला यूसुफ़ज़ई",
"mr": "“एक मूल, एक शिक्षक, एक पुस्तक आणि एक लेखणी जग बदलू शकते.” मलाला युसुफझई",
"es": "«Un niño, un maestro, un libro y un lápiz pueden cambiar el mundo». Malala Yousafzai",
"fr": "« Un enfant, un enseignant, un livre et un stylo peuvent changer le monde. » Malala Yousafzai",
"de": "\"Ein Kind, ein Lehrer, ein Buch und ein Stift können die Welt verändern.\" Malala Yousafzai",
"ar": "«طفل واحد، ومعلّم واحد، وكتاب واحد، وقلم واحد يستطيع أن يغيّر العالم.» ملالا يوسفزاي",
"zh": "“一个孩子,一位老师,一本书,一支笔,就能改变世界。”马拉拉·优素福扎伊"
}
},
{
"id": "o-quote-008",
"kind": "quote",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"sports",
"rolemodel"
],
"words": {
"en": "Every champion was once a beginner who refused to give up.",
"hi": "हर चैंपियन कभी एक शुरुआत करने वाला था जिसने हार मानने से इनकार कर दिया।",
"mr": "प्रत्येक विजेता कधी ना कधी असा नवशिका होता ज्याने हार मानली नाही.",
"es": "Todo campeón fue una vez un principiante que se negó a rendirse.",
"fr": "Chaque champion a un jour été un débutant qui a refusé d’abandonner.",
"de": "Jeder Champion war einmal ein Anfänger, der nicht aufgeben wollte.",
"ar": "كل بطل كان يوماً مبتدئاً رفض أن يستسلم.",
"zh": "每一位冠军,都曾是一个不肯放弃的新手。"
}
},
{
"id": "o-idea-001",
"kind": "idea",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"science"
],
"words": {
"en": "Idea: put a celery stick in coloured water and check it tomorrow. Watch the colour climb!",
"hi": "आइडिया: अजवाइन की एक डंडी रंगीन पानी में रखो और कल देखो। रंग को ऊपर चढ़ते देखो!",
"mr": "कल्पना: रंगीत पाण्यात सेलरीचा देठ ठेव आणि उद्या पाहा. रंग वर चढताना बघ!",
"es": "Idea: pon un tallo de apio en agua con colorante y míralo mañana. ¡Verás cómo sube el color!",
"fr": "Idée : mets une branche de céleri dans de l’eau colorée et regarde demain. Observe la couleur grimper !",
"de": "Idee: Stell eine Selleriestange in gefärbtes Wasser und schau morgen nach. Sieh zu, wie die Farbe nach oben wandert!",
"ar": "فكرة: ضع ساق كرفس في ماء ملوّن وانظر إليها غداً. شاهد اللون وهو يصعد!",
"zh": "好点子:把一根芹菜放进有颜色的水里,明天再来看看。看颜色慢慢往上爬!"
}
},
{
"id": "o-idea-002",
"kind": "idea",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"writing"
],
"words": {
"en": "Idea: write a short story where your cat is the hero.",
"hi": "आइडिया: एक छोटी कहानी लिखो जिसमें तुम्हारी बिल्ली हीरो हो।",
"mr": "कल्पना: तुझी मांजर हिरो असलेली एक छोटी गोष्ट लिही.",
"es": "Idea: escribe un cuento corto en el que tu gato sea el héroe.",
"fr": "Idée : écris une petite histoire où ton chat est le héros.",
"de": "Idee: Schreib eine kurze Geschichte, in der deine Katze die Heldin oder der Held ist.",
"ar": "فكرة: اكتب قصة قصيرة بطلها قطّتك.",
"zh": "好点子:写一个小故事,让你的小猫当主角。"
}
},
{
"id": "o-idea-003",
"kind": "idea",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"family"
],
"words": {
"en": "Idea: ask a grandparent what games they played when they were your age.",
"hi": "आइडिया: दादा-दादी या नाना-नानी से पूछो कि वे तुम्हारी उम्र में कौन-से खेल खेलते थे।",
"mr": "कल्पना: आजी-आजोबांना विचार की ते तुझ्या वयाचे असताना कोणते खेळ खेळायचे.",
"es": "Idea: pregúntale a un abuelo o abuela a qué jugaba cuando tenía tu edad.",
"fr": "Idée : demande à un grand-parent à quels jeux il jouait quand il avait ton âge.",
"de": "Idee: Frag Oma oder Opa, welche Spiele sie gespielt haben, als sie so alt waren wie du.",
"ar": "فكرة: اسأل أحد الجدّين أو الجدّتين عن الألعاب التي كان يلعبها حين كان في عمرك.",
"zh": "好点子:问问爷爷奶奶或外公外婆,他们在你这个年纪玩什么游戏。"
}
},
{
"id": "o-idea-004",
"kind": "idea",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"cooking",
"helping"
],
"words": {
"en": "Idea: help make one part of dinner, like washing the vegetables or making the salad.",
"hi": "आइडिया: रात के खाने का एक हिस्सा बनाने में मदद करो, जैसे सब्ज़ियाँ धोना या सलाद बनाना।",
"mr": "कल्पना: जेवणातला एक भाग बनवायला मदत कर, जसे भाज्या धुणे किंवा कोशिंबीर बनवणे.",
"es": "Idea: ayuda a preparar una parte de la cena, como lavar las verduras o hacer la ensalada.",
"fr": "Idée : aide à préparer une partie du dîner, comme laver les légumes ou faire la salade.",
"de": "Idee: Hilf dabei, einen Teil vom Abendessen zu machen, zum Beispiel das Gemüse waschen oder den Salat zubereiten.",
"ar": "فكرة: ساعد في تحضير جزء من العشاء، مثل غسل الخضار أو تحضير السلطة.",
"zh": "好点子:帮忙做晚饭的一小部分,比如洗菜或者拌沙拉。"
}
},
{
"id": "o-idea-005",
"kind": "idea",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"space"
],
"words": {
"en": "Idea: tonight, look for the brightest thing in the sky. It may be a planet, not a star!",
"hi": "आइडिया: आज रात आसमान में सबसे चमकती चीज़ ढूँढो। हो सकता है वह तारा नहीं, कोई ग्रह हो!",
"mr": "कल्पना: आज रात्री आकाशातली सर्वात तेजस्वी गोष्ट शोध. तो तारा नसून ग्रहही असू शकतो!",
"es": "Idea: esta noche, busca lo más brillante del cielo. ¡Puede ser un planeta, no una estrella!",
"fr": "Idée : ce soir, cherche la chose la plus brillante dans le ciel. Ce peut être une planète, pas une étoile !",
"de": "Idee: Such heute Abend nach dem hellsten Punkt am Himmel. Es könnte ein Planet sein, kein Stern!",
"ar": "فكرة: الليلة، ابحث عن ألمع شيء في السماء. قد يكون كوكباً وليس نجماً!",
"zh": "好点子:今晚找找天上最亮的东西。它可能是一颗行星,不是星星哦!"
}
},
{
"id": "o-idea-006",
"kind": "idea",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"maths"
],
"words": {
"en": "Idea: count how many steps it takes to walk around your home. Guess first!",
"hi": "आइडिया: गिनो कि अपने घर के चारों ओर चलने में कितने कदम लगते हैं। पहले अंदाज़ा लगाओ!",
"mr": "कल्पना: तुझ्या घराभोवती फिरायला किती पावले लागतात ते मोज. आधी अंदाज कर!",
"es": "Idea: cuenta cuántos pasos das al caminar alrededor de tu casa. ¡Primero adivina!",
"fr": "Idée : compte combien de pas il faut pour faire le tour de ta maison. Devine d’abord !",
"de": "Idee: Zähl, wie viele Schritte du brauchst, um einmal um euer Zuhause zu laufen. Rate vorher!",
"ar": "فكرة: عُدّ كم خطوة تحتاج لتدور حول بيتك. خمّن الرقم أولاً!",
"zh": "好点子:数一数绕着你家走一圈要走多少步。先猜一猜!"
}
},
{
"id": "o-idea-007",
"kind": "idea",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"kindness"
],
"words": {
"en": "Idea: write a thank-you note to someone who helped you this week.",
"hi": "आइडिया: इस हफ़्ते जिसने तुम्हारी मदद की, उसके लिए धन्यवाद का एक नोट लिखो।",
"mr": "कल्पना: या आठवड्यात ज्याने तुला मदत केली त्याला एक आभाराचे पत्र लिही.",
"es": "Idea: escribe una nota de agradecimiento para alguien que te ayudó esta semana.",
"fr": "Idée : écris un mot de remerciement à quelqu’un qui t’a aidé cette semaine.",
"de": "Idee: Schreib einen Dankeszettel an jemanden, der dir diese Woche geholfen hat.",
"ar": "فكرة: اكتب رسالة شكر لشخص ساعدك هذا الأسبوع.",
"zh": "好点子:给这周帮过你的人写一张感谢卡。"
}
},
{
"id": "o-idea-008",
"kind": "idea",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"nature"
],
"words": {
"en": "Idea: plant a seed in a small pot and watch it grow every day.",
"hi": "आइडिया: एक छोटे गमले में बीज बोओ और उसे रोज़ बढ़ते हुए देखो।",
"mr": "कल्पना: एका लहान कुंडीत बी लाव आणि रोज ते कसे वाढते ते बघ.",
"es": "Idea: planta una semilla en una maceta pequeña y mira cómo crece cada día.",
"fr": "Idée : plante une graine dans un petit pot et regarde-la grandir chaque jour.",
"de": "Idee: Pflanz einen Samen in einen kleinen Topf und schau jeden Tag, wie er wächst.",
"ar": "فكرة: ازرع بذرة في أصيص صغير وراقب نموّها كل يوم.",
"zh": "好点子:在小花盆里种下一粒种子,每天看着它长大。"
}
},
{
"id": "o-idea-009",
"kind": "idea",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"art"
],
"words": {
"en": "Idea: make a comic strip of your day in four boxes.",
"hi": "आइडिया: अपने दिन की कॉमिक स्ट्रिप चार खानों में बनाओ।",
"mr": "कल्पना: तुझ्या दिवसाची चार चौकटींची कॉमिक पट्टी बनव.",
"es": "Idea: haz una tira cómica de tu día en cuatro viñetas.",
"fr": "Idée : fais une bande dessinée de ta journée en quatre cases.",
"de": "Idee: Zeichne einen Comic von deinem Tag in vier Kästchen.",
"ar": "فكرة: ارسم شريطاً مصوّراً ليومك في أربعة مربعات.",
"zh": "好点子:用四个格子,画一段你今天的漫画。"
}
},
{
"id": "o-idea-010",
"kind": "idea",
"minAge": 8,
"maxAge": 12,
"gender": "any",
"tags": [
"language"
],
"words": {
"en": "Idea: learn to say \"thank you\" in a language nobody at home speaks.",
"hi": "आइडिया: “धन्यवाद” कहना किसी ऐसी भाषा में सीखो जो घर में कोई नहीं बोलता।",
"mr": "कल्पना: घरात कोणीही न बोलणाऱ्या भाषेत “धन्यवाद” म्हणायला शिक.",
"es": "Idea: aprende a decir «gracias» en un idioma que nadie en casa hable.",
"fr": "Idée : apprends à dire « merci » dans une langue que personne ne parle chez toi.",
"de": "Idee: Lerne, \"danke\" in einer Sprache zu sagen, die zu Hause niemand spricht.",
"ar": "فكرة: تعلّم أن تقول «شكراً» بلغة لا يتكلمها أحد في بيتك.",
"zh": "好点子:学一句“谢谢”,用一种家里没有人会说的语言。"
}
},
{
"id": "o-idea-011",
"kind": "idea",
"minAge": 8,
"maxAge": 12,
"gender": "boy",
"tags": [
"building",
"science"
],
"words": {
"en": "Idea: build a paper plane, then change one fold at a time to make it fly further.",
"hi": "आइडिया: कागज़ का हवाई जहाज़ बनाओ, फिर एक-एक मोड़ बदलकर देखो कि वह और दूर कैसे उड़े।",
"mr": "कल्पना: कागदाचे विमान बनव, मग ते आणखी दूर उडावे म्हणून एकेक घडी बदलून बघ.",
"es": "Idea: construye un avión de papel y cambia un doblez cada vez para que vuele más lejos.",
"fr": "Idée : construis un avion en papier, puis change un pli à la fois pour le faire voler plus loin.",
"de": "Idee: Falte einen Papierflieger und ändere immer nur eine Falte, damit er weiter fliegt.",
"ar": "فكرة: اصنع طائرة ورقية، ثم غيّر طيّة واحدة في كل مرة لتطير أبعد.",
"zh": "好点子:折一架纸飞机,然后每次只改变一个折法,看看怎样能飞得更远。"
}
},
{
"id": "o-idea-012",
"kind": "idea",
"minAge": 8,
"maxAge": 12,
"gender": "girl",
"tags": [
"science"
],
"words": {
"en": "Idea: make a small volcano with baking soda and vinegar, with a grown-up nearby.",
"hi": "आइडिया: किसी बड़े के साथ रहकर, बेकिंग सोडा और सिरके से एक छोटा ज्वालामुखी बनाओ।",
"mr": "कल्पना: मोठ्या माणसाला जवळ ठेवून खायचा सोडा आणि व्हिनेगर वापरून एक छोटा ज्वालामुखी बनव.",
"es": "Idea: haz un pequeño volcán con bicarbonato y vinagre, con un adulto cerca.",
"fr": "Idée : fabrique un petit volcan avec du bicarbonate et du vinaigre, avec un adulte à côté.",
"de": "Idee: Bau mit Natron und Essig einen kleinen Vulkan, und zwar mit einem Erwachsenen in der Nähe.",
"ar": "فكرة: اصنعي بركاناً صغيراً من بيكربونات الصوديوم والخل، وبجانبك شخص كبير.",
"zh": "好点子:在大人的陪伴下,用小苏打和白醋做一座小火山。"
}
},
{
"id": "t-fact-001",
"kind": "fact",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"body",
"science"
],
"words": {
"en": "Your brain is about 2% of your body weight but uses about 20% of your energy.",
"hi": "तुम्हारा दिमाग तुम्हारे शरीर के वज़न का लगभग 2% है, पर वह तुम्हारी लगभग 20% ऊर्जा इस्तेमाल करता है।",
"mr": "तुझा मेंदू तुझ्या शरीराच्या वजनाच्या सुमारे २% असतो, पण तो सुमारे २०% ऊर्जा वापरतो.",
"es": "Tu cerebro es solo un 2 % del peso de tu cuerpo, pero usa cerca del 20 % de tu energía.",
"fr": "Ton cerveau représente environ 2 % du poids de ton corps, mais il utilise environ 20 % de ton énergie.",
"de": "Dein Gehirn macht nur etwa 2 % deines Körpergewichts aus, braucht aber etwa 20 % deiner Energie.",
"ar": "وزن دماغك نحو 2% من وزن جسمك، لكنه يستهلك نحو 20% من طاقتك.",
"zh": "你的大脑只占体重的大约2%,却用掉了大约20%的能量。"
}
},
{
"id": "t-fact-002",
"kind": "fact",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"body"
],
"words": {
"en": "Teenagers' body clocks really do shift later, which is why waking up early feels harder at your age.",
"hi": "किशोरों की बॉडी क्लॉक सचमुच देर की ओर खिसक जाती है, इसीलिए तुम्हारी उम्र में जल्दी उठना ज़्यादा मुश्किल लगता है।",
"mr": "किशोरवयीन मुलांचे शरीरातील घड्याळ खरोखरच उशिरा सरकते, म्हणूनच तुमच्या वयात लवकर उठणे कठीण वाटते.",
"es": "El reloj biológico de los adolescentes de verdad se retrasa, por eso levantarse temprano cuesta más a tu edad.",
"fr": "L’horloge interne des ados se décale vraiment plus tard, c’est pourquoi se lever tôt est plus dur à ton âge.",
"de": "Die innere Uhr von Teenagern verschiebt sich wirklich nach hinten, deshalb fällt dir frühes Aufstehen in deinem Alter schwerer.",
"ar": "ساعة جسم المراهقين تتأخر فعلاً، ولهذا يصعب الاستيقاظ مبكراً في عمرك.",
"zh": "青少年的生物钟真的会往后推迟,所以在你这个年纪,早起才会这么难。"
}
},
{
"id": "t-fact-003",
"kind": "fact",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"science"
],
"words": {
"en": "If you uncoiled the DNA in one of your cells, it would be about two metres long.",
"hi": "अगर तुम अपनी एक कोशिका का डीएनए खोलकर सीधा करो, तो वह लगभग दो मीटर लंबा होगा।",
"mr": "तुझ्या एका पेशीतील डीएनए उलगडला तर तो सुमारे दोन मीटर लांब असेल.",
"es": "Si estiraras el ADN de una sola de tus células, mediría unos dos metros.",
"fr": "Si tu déroulais l’ADN d’une seule de tes cellules, il mesurerait environ deux mètres.",
"de": "Wenn man die DNA in einer deiner Zellen auseinanderziehen würde, wäre sie etwa zwei Meter lang.",
"ar": "لو فردتَ الحمض النووي في خلية واحدة منك لبلغ طوله نحو مترين.",
"zh": "如果把你一个细胞里的DNA拉直,大约有两米长。"
}
},
{
"id": "t-fact-004",
"kind": "fact",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"space"
],
"words": {
"en": "Light from the Sun takes about eight minutes to reach Earth, so you always see the Sun as it was eight minutes ago.",
"hi": "सूरज की रोशनी को पृथ्वी तक पहुँचने में लगभग आठ मिनट लगते हैं, यानी हम सूरज को हमेशा वैसा देखते हैं जैसा वह आठ मिनट पहले था।",
"mr": "सूर्याचा प्रकाश पृथ्वीवर पोहोचायला सुमारे आठ मिनिटे लागतात, म्हणजे तू नेहमी सूर्य आठ मिनिटांपूर्वी जसा होता तसा पाहतोस.",
"es": "La luz del Sol tarda unos ocho minutos en llegar a la Tierra, así que siempre ves el Sol tal como era hace ocho minutos.",
"fr": "La lumière du Soleil met environ huit minutes pour atteindre la Terre : tu vois donc toujours le Soleil tel qu’il était il y a huit minutes.",
"de": "Das Licht der Sonne braucht etwa acht Minuten bis zur Erde, du siehst die Sonne also immer so, wie sie vor acht Minuten war.",
"ar": "يحتاج ضوء الشمس نحو ثماني دقائق ليصل إلى الأرض، فأنت ترى الشمس دائماً كما كانت قبل ثماني دقائق.",
"zh": "太阳光大约需要八分钟才能到达地球,所以你看到的太阳,永远是八分钟前的样子。"
}
},
{
"id": "t-fact-005",
"kind": "fact",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"maths",
"india",
"rolemodel"
],
"words": {
"en": "Srinivasa Ramanujan taught himself advanced maths from a library book and went on to change number theory.",
"hi": "श्रीनिवास रामानुजन ने लाइब्रेरी की एक किताब से खुद ही उन्नत गणित सीखा और आगे चलकर संख्या सिद्धांत को बदल दिया।",
"mr": "श्रीनिवास रामानुजन यांनी ग्रंथालयातील एका पुस्तकातून स्वतःच प्रगत गणित शिकले आणि पुढे संख्यासिद्धांतात क्रांती घडवली.",
"es": "Srinivasa Ramanujan aprendió matemáticas avanzadas solo, con un libro de la biblioteca, y acabó cambiando la teoría de números.",
"fr": "Srinivasa Ramanujan a appris seul des mathématiques avancées dans un livre de bibliothèque, puis a changé la théorie des nombres.",
"de": "Srinivasa Ramanujan hat sich fortgeschrittene Mathematik aus einem Bibliotheksbuch selbst beigebracht und die Zahlentheorie verändert.",
"ar": "علّم سرينيفاسا رامانوجان نفسه الرياضيات المتقدمة من كتاب في مكتبة، ثم غيّر نظرية الأعداد.",
"zh": "斯里尼瓦萨·拉马努金靠一本图书馆的书自学了高深的数学,后来改变了数论。"
}
},
{
"id": "t-fact-006",
"kind": "fact",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"science"
],
"words": {
"en": "Bananas are slightly radioactive because they contain potassium. Totally safe to eat!",
"hi": "केलों में पोटैशियम होता है, इसलिए वे थोड़े रेडियोधर्मी होते हैं। खाने के लिए बिल्कुल सुरक्षित!",
"mr": "केळ्यांमध्ये पोटॅशियम असल्यामुळे ती थोडी किरणोत्सारी असतात. तरीही खायला पूर्णपणे सुरक्षित!",
"es": "Los plátanos son un poco radiactivos porque contienen potasio. ¡Y son totalmente seguros de comer!",
"fr": "Les bananes sont légèrement radioactives parce qu’elles contiennent du potassium. Elles se mangent sans aucun danger !",
"de": "Bananen sind leicht radioaktiv, weil sie Kalium enthalten. Trotzdem völlig ungefährlich zu essen!",
"ar": "الموز مشعّ قليلاً لأنه يحتوي على البوتاسيوم. وأكله آمن تماماً!",
"zh": "香蕉里含有钾,所以带有一点点放射性。吃起来完全安全!"
}
},
{
"id": "t-fact-007",
"kind": "fact",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"tech"
],
"words": {
"en": "The first computer programmer is often said to be Ada Lovelace, who wrote an algorithm in the 1840s.",
"hi": "कहा जाता है कि पहली कंप्यूटर प्रोग्रामर एडा लवलेस थीं, जिन्होंने 1840 के दशक में एक एल्गोरिद्म लिखा था।",
"mr": "पहिल्या संगणक प्रोग्रामर म्हणून अनेकदा एडा लव्हलेस यांचे नाव घेतले जाते, ज्यांनी १८४० च्या दशकात एक अल्गोरिदम लिहिला.",
"es": "A menudo se dice que la primera programadora fue Ada Lovelace, que escribió un algoritmo en la década de 1840.",
"fr": "On dit souvent que la première programmeuse informatique est Ada Lovelace, qui a écrit un algorithme dans les années 1840.",
"de": "Als erste Programmiererin der Welt gilt oft Ada Lovelace, die in den 1840er-Jahren einen Algorithmus geschrieben hat.",
"ar": "يُقال غالباً إن أول مبرمجة في التاريخ هي آدا لافلايس، التي كتبت خوارزمية في أربعينيات القرن التاسع عشر.",
"zh": "人们常说,世界上第一位程序员是阿达·洛芙莱斯,她在19世纪40年代写下了一个算法。"
}
},
{
"id": "t-fact-008",
"kind": "fact",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"body",
"study"
],
"words": {
"en": "Sleep helps your brain store what you learned during the day. Pulling an all-nighter can make you remember less.",
"hi": "नींद तुम्हारे दिमाग को दिन भर में सीखी बातें सहेजने में मदद करती है। पूरी रात जागकर पढ़ने से तुम्हें कम याद रह सकता है।",
"mr": "झोप तुझ्या मेंदूला दिवसभरात शिकलेले साठवायला मदत करते. रात्रभर जागून अभ्यास केल्यास कमी लक्षात राहू शकते.",
"es": "Dormir ayuda a tu cerebro a guardar lo que aprendiste durante el día. Pasar la noche en vela puede hacer que recuerdes menos.",
"fr": "Le sommeil aide ton cerveau à garder ce que tu as appris dans la journée. Faire une nuit blanche peut te faire retenir moins de choses.",
"de": "Im Schlaf speichert dein Gehirn, was du tagsüber gelernt hast. Wer die Nacht durchmacht, merkt sich oft weniger.",
"ar": "النوم يساعد دماغك على تخزين ما تعلّمته في النهار. والسهر طوال الليل قد يجعلك تتذكر أقل.",
"zh": "睡眠能帮助大脑存好白天学到的东西。熬夜通宵反而可能让你记得更少。"
}
},
{
"id": "t-fact-009",
"kind": "fact",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"science",
"india",
"rolemodel"
],
"words": {
"en": "C.V. Raman won the Nobel Prize in Physics in 1930 for discovering how light scatters. India celebrates National Science Day on 28 February for it.",
"hi": "सी.वी. रमन ने रोशनी के बिखरने की खोज के लिए 1930 में भौतिकी का नोबेल पुरस्कार जीता। इसी की याद में भारत 28 फ़रवरी को राष्ट्रीय विज्ञान दिवस मनाता है।",
"mr": "सी.व्ही. रमण यांना प्रकाशाच्या विकिरणाचा शोध लावल्याबद्दल १९३० मध्ये भौतिकशास्त्राचे नोबेल पारितोषिक मिळाले. त्यासाठी भारत २८ फेब्रुवारीला राष्ट्रीय विज्ञान दिन साजरा करतो.",
"es": "C.V. Raman ganó el Premio Nobel de Física en 1930 por descubrir cómo se dispersa la luz. Por eso la India celebra el Día Nacional de la Ciencia el 28 de febrero.",
"fr": "C.V. Raman a reçu le prix Nobel de physique en 1930 pour avoir découvert comment la lumière se diffuse. L’Inde célèbre pour cela la Journée nationale de la science le 28 février.",
"de": "C.V. Raman bekam 1930 den Nobelpreis für Physik, weil er entdeckt hat, wie sich Licht streut. Indien feiert deshalb am 28. Februar den Nationalen Tag der Wissenschaft.",
"ar": "فاز سي. في. رامان بجائزة نوبل في الفيزياء عام 1930 لاكتشافه كيف يتشتّت الضوء. وتحتفل الهند بيوم العلم الوطني في 28 فبراير تكريماً لذلك.",
"zh": "C.V. 拉曼因为发现光的散射,在1930年获得诺贝尔物理学奖。印度把每年的2月28日定为国家科学日,就是为了纪念这件事。"
}
},
{
"id": "t-fact-010",
"kind": "fact",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"nature"
],
"words": {
"en": "Trees in a forest can share nutrients with each other through fungi in the soil.",
"hi": "जंगल के पेड़ मिट्टी में मौजूद फफूंद के ज़रिए एक-दूसरे के साथ पोषक तत्व बाँट सकते हैं।",
"mr": "जंगलातील झाडे जमिनीतील बुरशीच्या मदतीने एकमेकांना पोषक द्रव्ये देऊ शकतात.",
"es": "Los árboles de un bosque pueden compartir nutrientes entre sí a través de hongos del suelo.",
"fr": "Les arbres d’une forêt peuvent échanger des nutriments entre eux grâce à des champignons dans le sol.",
"de": "Bäume in einem Wald können über Pilze im Boden Nährstoffe miteinander teilen.",
"ar": "أشجار الغابة تستطيع أن تتشارك المغذّيات بعضها مع بعض عبر الفطريات في التربة.",
"zh": "森林里的树木,可以通过土壤里的真菌互相分享养分。"
}
},
{
"id": "t-fact-011",
"kind": "fact",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"study"
],
"words": {
"en": "Testing yourself on what you learned works better than just re-reading your notes.",
"hi": "जो सीखा है उस पर खुद को परखना, सिर्फ़ नोट्स दोबारा पढ़ने से ज़्यादा काम करता है।",
"mr": "शिकलेल्या गोष्टींवर स्वतःची परीक्षा घेणे हे फक्त नोट्स पुन्हा वाचण्यापेक्षा जास्त उपयोगी ठरते.",
"es": "Ponerte a prueba con lo que aprendiste funciona mejor que releer tus apuntes.",
"fr": "Te tester sur ce que tu as appris marche mieux que relire tes notes.",
"de": "Dich selbst abzufragen, was du gelernt hast, funktioniert besser, als deine Notizen nur noch einmal zu lesen.",
"ar": "اختبار نفسك فيما تعلّمته أنفع من إعادة قراءة ملاحظاتك فقط.",
"zh": "给自己出题测验学过的内容,比单纯反复看笔记更有效。"
}
},
{
"id": "t-fact-012",
"kind": "fact",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"space"
],
"words": {
"en": "A teaspoon of material from a neutron star would weigh about a billion tonnes on Earth.",
"hi": "न्यूट्रॉन तारे के एक चम्मच पदार्थ का वज़न पृथ्वी पर लगभग एक अरब टन होगा।",
"mr": "न्यूट्रॉन ताऱ्याचा एक चमचाभर पदार्थ पृथ्वीवर सुमारे एक अब्ज टन वजनाचा असेल.",
"es": "Una cucharadita de material de una estrella de neutrones pesaría unos mil millones de toneladas en la Tierra.",
"fr": "Une cuillère à café de matière d’étoile à neutrons pèserait environ un milliard de tonnes sur Terre.",
"de": "Ein Teelöffel Material von einem Neutronenstern würde auf der Erde etwa eine Milliarde Tonnen wiegen.",
"ar": "ملعقة صغيرة من مادة نجم نيوتروني تزن على الأرض نحو مليار طن.",
"zh": "取一茶匙中子星上的物质,在地球上大约重十亿吨。"
}
},
{
"id": "t-fact-013",
"kind": "fact",
"minAge": 13,
"maxAge": 17,
"gender": "girl",
"tags": [
"science",
"rolemodel"
],
"words": {
"en": "Marie Curie was the first person to win Nobel Prizes in two different sciences: physics and chemistry.",
"hi": "मैरी क्यूरी दो अलग-अलग विज्ञानों, भौतिकी और रसायन विज्ञान, में नोबेल पुरस्कार जीतने वाली पहली इंसान थीं।",
"mr": "मेरी क्युरी या दोन वेगवेगळ्या विज्ञानशाखांमध्ये, भौतिकशास्त्र आणि रसायनशास्त्र, नोबेल पारितोषिक मिळवणाऱ्या पहिल्या व्यक्ती होत्या.",
"es": "Marie Curie fue la primera persona en ganar Premios Nobel en dos ciencias distintas: física y química.",
"fr": "Marie Curie a été la première personne à recevoir des prix Nobel dans deux sciences différentes : la physique et la chimie.",
"de": "Marie Curie war die erste Person, die Nobelpreise in zwei verschiedenen Wissenschaften gewonnen hat: Physik und Chemie.",
"ar": "ماري كوري أول إنسان فاز بجائزتَي نوبل في علمين مختلفين: الفيزياء والكيمياء.",
"zh": "玛丽·居里是第一位在两个不同科学领域都获得诺贝尔奖的人:物理学和化学。"
}
},
{
"id": "t-fact-014",
"kind": "fact",
"minAge": 13,
"maxAge": 17,
"gender": "boy",
"tags": [
"sports",
"india",
"rolemodel"
],
"words": {
"en": "Neeraj Chopra won India's first Olympic gold in athletics, in javelin, at Tokyo 2020.",
"hi": "नीरज चोपड़ा ने टोक्यो 2020 में भाला फेंक में एथलेटिक्स का भारत का पहला ओलंपिक स्वर्ण पदक जीता।",
"mr": "नीरज चोप्राने टोकियो २०२० मध्ये भालाफेकीत भारताचे ॲथलेटिक्समधील पहिले ऑलिम्पिक सुवर्णपदक जिंकले.",
"es": "Neeraj Chopra ganó el primer oro olímpico de la India en atletismo, en jabalina, en Tokio 2020.",
"fr": "Neeraj Chopra a remporté la première médaille d’or olympique de l’Inde en athlétisme, au javelot, aux Jeux de Tokyo 2020.",
"de": "Neeraj Chopra gewann bei den Spielen in Tokio 2020 im Speerwurf Indiens erstes olympisches Gold in der Leichtathletik.",
"ar": "فاز نيراج شوبرا بأول ذهبية أولمبية للهند في ألعاب القوى، في رمي الرمح، في طوكيو 2020.",
"zh": "尼拉杰·乔普拉在2020年东京奥运会上拿下标枪金牌,这是印度田径项目的第一枚奥运金牌。"
}
},
{
"id": "t-fact-015",
"kind": "fact",
"minAge": 13,
"maxAge": 17,
"gender": "girl",
"tags": [
"sports",
"india",
"rolemodel"
],
"words": {
"en": "P.V. Sindhu became the first Indian woman to win two Olympic medals in individual events.",
"hi": "पी.वी. सिंधु व्यक्तिगत स्पर्धाओं में दो ओलंपिक पदक जीतने वाली पहली भारतीय महिला बनीं।",
"mr": "पी.व्ही. सिंधू वैयक्तिक खेळात दोन ऑलिम्पिक पदके जिंकणारी पहिली भारतीय महिला ठरली.",
"es": "P.V. Sindhu fue la primera mujer india en ganar dos medallas olímpicas en pruebas individuales.",
"fr": "P.V. Sindhu est devenue la première Indienne à remporter deux médailles olympiques en individuel.",
"de": "P.V. Sindhu wurde die erste Inderin, die zwei olympische Medaillen in Einzelwettbewerben gewonnen hat.",
"ar": "أصبحت بي. في. سيندهو أول امرأة هندية تفوز بميداليتين أولمبيتين في المنافسات الفردية.",
"zh": "P.V. 信德胡成为第一位在个人项目中两次获得奥运奖牌的印度女性。"
}
},
{
"id": "t-fact-016",
"kind": "fact",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"body",
"study"
],
"words": {
"en": "Even ten minutes of exercise can help you focus better afterwards.",
"hi": "सिर्फ़ दस मिनट की कसरत भी बाद में तुम्हें बेहतर ध्यान लगाने में मदद कर सकती है।",
"mr": "फक्त दहा मिनिटांचा व्यायामही नंतर तुला अधिक चांगले लक्ष केंद्रित करायला मदत करू शकतो.",
"es": "Incluso diez minutos de ejercicio pueden ayudarte a concentrarte mejor después.",
"fr": "Même dix minutes d’exercice peuvent t’aider à mieux te concentrer ensuite.",
"de": "Schon zehn Minuten Bewegung können dir helfen, dich danach besser zu konzentrieren.",
"ar": "حتى عشر دقائق من التمارين قد تساعدك على التركيز بعدها.",
"zh": "哪怕只运动十分钟,之后也能帮你更专心。"
}
},
{
"id": "t-fact-017",
"kind": "fact",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"tech"
],
"words": {
"en": "The first message sent over the internet's ancestor, ARPANET, in 1969 was meant to be \"LOGIN\". It crashed after \"LO\".",
"hi": "1969 में इंटरनेट के पूर्वज ARPANET पर भेजा गया पहला संदेश “LOGIN” होना था। वह “LO” के बाद ही क्रैश हो गया।",
"mr": "१९६९ मध्ये इंटरनेटचा पूर्वज असलेल्या ARPANET वरून पाठवला गेलेला पहिला संदेश “LOGIN” असा असायला हवा होता. पण “LO” नंतर तो बंद पडला.",
"es": "El primer mensaje enviado por ARPANET, el antepasado de internet, en 1969, debía ser «LOGIN». Se cayó después de «LO».",
"fr": "Le premier message envoyé sur ARPANET, l’ancêtre d’internet, en 1969, devait être « LOGIN ». Le système a planté après « LO ».",
"de": "Die erste Nachricht, die 1969 über ARPANET, den Vorläufer des Internets, geschickt wurde, sollte \"LOGIN\" heißen. Nach \"LO\" stürzte das System ab.",
"ar": "كانت أول رسالة تُرسل عبر «أربانت»، جدّ الإنترنت، عام 1969 هي «LOGIN». لكنه تعطّل بعد «LO».",
"zh": "1969年,互联网的前身ARPANET上发出的第一条消息,本来要发“LOGIN”,结果发到“LO”就崩溃了。"
}
},
{
"id": "t-fact-018",
"kind": "fact",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"history",
"india"
],
"words": {
"en": "Nalanda, in Bihar, was one of the world's first great universities, with students from across Asia over 1,500 years ago.",
"hi": "बिहार का नालंदा दुनिया के पहले महान विश्वविद्यालयों में से एक था, जहाँ 1,500 साल से भी पहले पूरे एशिया से छात्र पढ़ने आते थे।",
"mr": "बिहारमधील नालंदा हे जगातील पहिल्या महान विद्यापीठांपैकी एक होते, जिथे १,५०० वर्षांपूर्वी संपूर्ण आशियातून विद्यार्थी येत असत.",
"es": "Nalanda, en Bihar, fue una de las primeras grandes universidades del mundo, con estudiantes de toda Asia hace más de 1.500 años.",
"fr": "Nalanda, au Bihar, était l’une des premières grandes universités du monde, avec des étudiants venus de toute l’Asie il y a plus de 1 500 ans.",
"de": "Nalanda in Bihar war eine der ersten großen Universitäten der Welt, mit Studierenden aus ganz Asien, vor über 1.500 Jahren.",
"ar": "كانت نالاندا في ولاية بيهار من أوائل الجامعات الكبرى في العالم، وفيها طلاب من أنحاء آسيا قبل أكثر من 1,500 سنة.",
"zh": "比哈尔邦的那烂陀寺是世界上最早的大学之一,1500多年前就有来自亚洲各地的学生在这里学习。"
}
},
{
"id": "t-fact-019",
"kind": "fact",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"science"
],
"words": {
"en": "Water expands when it freezes, which is why ice floats and lakes freeze from the top down.",
"hi": "पानी जमने पर फैलता है, इसीलिए बर्फ़ तैरती है और झीलें ऊपर से नीचे की ओर जमती हैं।",
"mr": "पाणी गोठताना प्रसरण पावते, म्हणूनच बर्फ तरंगतो आणि तलाव वरून खाली गोठतात.",
"es": "El agua se expande al congelarse, por eso el hielo flota y los lagos se congelan de arriba hacia abajo.",
"fr": "L’eau se dilate en gelant, c’est pourquoi la glace flotte et les lacs gèlent par le haut.",
"de": "Wasser dehnt sich beim Gefrieren aus. Deshalb schwimmt Eis oben und Seen frieren von oben nach unten zu.",
"ar": "يتمدد الماء حين يتجمد، ولهذا يطفو الجليد وتتجمد البحيرات من الأعلى إلى الأسفل.",
"zh": "水结冰时会膨胀,所以冰会浮在水面上,湖也是从上往下结冰的。"
}
},
{
"id": "t-fact-020",
"kind": "fact",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"language"
],
"words": {
"en": "Sanskrit grammar was written down by Panini about 2,500 years ago, in nearly 4,000 precise rules.",
"hi": "संस्कृत का व्याकरण लगभग 2,500 साल पहले पाणिनि ने लिखा था, लगभग 4,000 सटीक नियमों में।",
"mr": "संस्कृत व्याकरण पाणिनी यांनी सुमारे २,५०० वर्षांपूर्वी जवळजवळ ४,००० अचूक सूत्रांमध्ये लिहून ठेवले.",
"es": "La gramática del sánscrito fue puesta por escrito por Panini hace unos 2.500 años, en casi 4.000 reglas precisas.",
"fr": "La grammaire du sanskrit a été mise par écrit par Panini il y a environ 2 500 ans, en près de 4 000 règles précises.",
"de": "Die Grammatik des Sanskrit wurde vor etwa 2.500 Jahren von Panini in fast 4.000 genauen Regeln aufgeschrieben.",
"ar": "دوّن بانيني قواعد اللغة السنسكريتية قبل نحو 2,500 سنة في ما يقارب 4,000 قاعدة دقيقة.",
"zh": "大约2500年前,波你尼把梵语语法写成了近4000条精确的规则。"
}
},
{
"id": "t-joke-001",
"kind": "joke",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"fun",
"science"
],
"words": {
"en": "I'd tell you a chemistry joke, but I know I wouldn't get a reaction.",
"hi": "मैं तुम्हें केमिस्ट्री का जोक सुनाता, पर जानता हूँ कि उस पर कोई रिएक्शन नहीं मिलेगा।",
"mr": "मी तुला रसायनशास्त्रावरचा विनोद सांगितला असता, पण मला माहीत आहे की त्यावर काही प्रतिक्रिया येणार नाही.",
"es": "Te contaría un chiste de química, pero seguro que no tendría reacción.",
"fr": "Je te raconterais bien une blague de chimie, mais je sais que je n’aurais aucune réaction.",
"de": "Ich würde dir einen Chemiewitz erzählen, aber ich weiß, dass ich keine Reaktion bekäme.",
"ar": "كنت سأحكي لك نكتة كيمياء، لكنني أعرف أنها لن تثير أي تفاعل.",
"zh": "我本来想讲个化学笑话,但我怕你没“反应”。"
}
},
{
"id": "t-joke-002",
"kind": "joke",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"fun",
"maths"
],
"words": {
"en": "Parallel lines have so much in common. It's a shame they'll never meet.",
"hi": "समानांतर रेखाओं में कितना कुछ एक जैसा होता है। अफ़सोस, वे कभी मिल नहीं पातीं।",
"mr": "समांतर रेषांमध्ये किती साम्य असते. पण वाईट याचे की त्या कधीच भेटणार नाहीत.",
"es": "Las rectas paralelas tienen tanto en común... Es una pena que nunca se vayan a encontrar.",
"fr": "Les droites parallèles ont tellement de choses en commun. Dommage qu’elles ne se rencontrent jamais.",
"de": "Parallelen haben so viel gemeinsam. Schade, dass sie sich nie treffen.",
"ar": "المستقيمات المتوازية بينها أشياء كثيرة مشتركة. ومن المؤسف أنها لن تلتقي أبداً.",
"zh": "平行线有那么多共同点,可惜它们永远不会相遇。"
}
},
{
"id": "t-joke-003",
"kind": "joke",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"fun",
"tech"
],
"words": {
"en": "Why do programmers prefer dark mode? Because light attracts bugs.",
"hi": "प्रोग्रामर डार्क मोड क्यों पसंद करते हैं? क्योंकि रोशनी कीड़ों यानी बग्स को खींचती है।",
"mr": "प्रोग्रामरना डार्क मोड का आवडतो? कारण प्रकाशाकडे बग्स (किडे) आकर्षित होतात.",
"es": "¿Por qué los programadores prefieren el modo oscuro? Porque la luz atrae a los bichos (los «bugs»).",
"fr": "Pourquoi les programmeurs préfèrent-ils le mode sombre ? Parce que la lumière attire les bugs.",
"de": "Warum nutzen Programmierer gern den Dunkelmodus? Weil Licht Bugs anzieht.",
"ar": "لماذا يفضّل المبرمجون الوضع المظلم؟ لأن الضوء يجذب الحشرات، أو الأخطاء البرمجية!",
"zh": "程序员为什么喜欢深色模式?因为光会招来虫子(bug)。"
}
},
{
"id": "t-joke-004",
"kind": "joke",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"fun"
],
"words": {
"en": "I'm reading a book about anti-gravity. It's impossible to put down.",
"hi": "मैं गुरुत्वाकर्षण-विरोधी पर एक किताब पढ़ रहा हूँ। उसे नीचे रखना नामुमकिन है।",
"mr": "मी गुरुत्वाकर्षणविरोधी विषयावरचे पुस्तक वाचतोय. ते खाली ठेवणे अशक्य आहे.",
"es": "Estoy leyendo un libro sobre antigravedad. Es imposible dejarlo.",
"fr": "Je lis un livre sur l’antigravité. Impossible de le poser.",
"de": "Ich lese gerade ein Buch über Antigravitation. Man kann es einfach nicht aus der Hand legen.",
"ar": "أقرأ كتاباً عن انعدام الجاذبية. من المستحيل أن أتركه من يدي.",
"zh": "我在读一本讲反重力的书,根本放不下来。"
}
},
{
"id": "t-riddle-001",
"kind": "riddle",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"fun"
],
"words": {
"en": "Riddle: what can travel around the world while staying in a corner? A stamp!",
"hi": "पहेली: ऐसी कौन-सी चीज़ है जो एक कोने में रहकर भी पूरी दुनिया घूम आती है? डाक टिकट!",
"mr": "कोडे: एका कोपऱ्यात राहूनही जगभर फिरू शकते, ते काय? तिकीट (स्टॅम्प)!",
"es": "Adivinanza: ¿qué puede viajar por todo el mundo quedándose en una esquina? ¡Un sello!",
"fr": "Devinette : qu’est-ce qui peut faire le tour du monde en restant dans un coin ? Un timbre !",
"de": "Rätsel: Was kann um die ganze Welt reisen und trotzdem in der Ecke bleiben? Eine Briefmarke!",
"ar": "لغز: ما الذي يسافر حول العالم وهو باقٍ في زاوية؟ الطابع البريدي!",
"zh": "谜语:什么东西待在角落里,却能环游全世界?邮票!"
}
},
{
"id": "t-riddle-002",
"kind": "riddle",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"fun",
"maths"
],
"words": {
"en": "Riddle: a bat and a ball cost 110 rupees. The bat costs 100 more than the ball. How much is the ball? 5 rupees, not 10!",
"hi": "पहेली: एक बल्ला और एक गेंद मिलाकर 110 रुपये के हैं। बल्ला गेंद से 100 रुपये महँगा है। गेंद कितने की है? 5 रुपये की, 10 की नहीं!",
"mr": "कोडे: एक बॅट आणि एक चेंडू मिळून ११० रुपयांना आहेत. बॅट चेंडूपेक्षा १०० रुपयांनी महाग आहे. तर चेंडूची किंमत किती? ५ रुपये, १० नाही!",
"es": "Adivinanza: un bate y una pelota cuestan 110 rupias. El bate cuesta 100 más que la pelota. ¿Cuánto cuesta la pelota? ¡5 rupias, no 10!",
"fr": "Devinette : une batte et une balle coûtent 110 roupies. La batte coûte 100 de plus que la balle. Combien coûte la balle ? 5 roupies, pas 10 !",
"de": "Rätsel: Ein Schläger und ein Ball kosten zusammen 110 Rupien. Der Schläger kostet 100 Rupien mehr als der Ball. Wie viel kostet der Ball? 5 Rupien, nicht 10!",
"ar": "لغز: مضرب وكرة ثمنهما 110 روبيات. المضرب أغلى من الكرة بمئة روبية. كم ثمن الكرة؟ 5 روبيات وليس 10!",
"zh": "谜语:一根球棒和一个球一共110卢比,球棒比球贵100卢比。球多少钱?5卢比,不是10卢比!"
}
},
{
"id": "t-quote-001",
"kind": "quote",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"growth"
],
"words": {
"en": "\"I have not failed. I've just found 10,000 ways that won't work.\" Thomas Edison",
"hi": "“मैं नाकाम नहीं हुआ। मैंने बस 10,000 ऐसे तरीके खोज लिए जो काम नहीं करते।” थॉमस एडिसन",
"mr": "“मी अपयशी झालो नाही. जे काम करणार नाही असे १०,००० मार्ग मला सापडले आहेत.” थॉमस एडिसन",
"es": "«No he fracasado. Solo he encontrado 10.000 formas que no funcionan». Thomas Edison",
"fr": "« Je n’ai pas échoué. J’ai simplement trouvé 10 000 façons qui ne marchent pas. » Thomas Edison",
"de": "\"Ich bin nicht gescheitert. Ich habe nur 10.000 Wege gefunden, die nicht funktionieren.\" Thomas Edison",
"ar": "«لم أفشل. لقد وجدتُ فقط 10,000 طريقة لا تنجح.» توماس إديسون",
"zh": "“我没有失败,我只是找到了一万种行不通的方法。”托马斯·爱迪生"
}
},
{
"id": "t-quote-002",
"kind": "quote",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"growth",
"india"
],
"words": {
"en": "\"Be the change you wish to see in the world.\" A line often credited to Mahatma Gandhi",
"hi": "“वह बदलाव बनो जो तुम दुनिया में देखना चाहते हो।” यह पंक्ति अक्सर महात्मा गांधी के नाम से कही जाती है",
"mr": "“जो बदल तुम्हाला जगात पाहायचा आहे, तो स्वतः व्हा.” महात्मा गांधींच्या नावाने अनेकदा सांगितली जाणारी ओळ",
"es": "«Sé el cambio que quieres ver en el mundo». Una frase que a menudo se atribuye a Mahatma Gandhi",
"fr": "« Sois le changement que tu veux voir dans le monde. » Une phrase souvent attribuée à Mahatma Gandhi",
"de": "\"Sei du selbst die Veränderung, die du dir für die Welt wünschst.\" Ein Satz, der oft Mahatma Gandhi zugeschrieben wird",
"ar": "«كن التغيير الذي تريد أن تراه في العالم.» عبارة تُنسب غالباً إلى المهاتما غاندي",
"zh": "“成为你希望在这个世界上看到的改变。”常被认为是圣雄甘地说的话"
}
},
{
"id": "t-quote-003",
"kind": "quote",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"study"
],
"words": {
"en": "You don't have to be great to start, but you have to start to be great.",
"hi": "शुरू करने के लिए महान होना ज़रूरी नहीं, पर महान बनने के लिए शुरू करना ज़रूरी है।",
"mr": "सुरुवात करायला तू महान असण्याची गरज नाही, पण महान होण्यासाठी सुरुवात करावी लागते.",
"es": "No tienes que ser genial para empezar, pero tienes que empezar para ser genial.",
"fr": "Tu n’as pas besoin d’être excellent pour commencer, mais tu dois commencer pour devenir excellent.",
"de": "Du musst nicht großartig sein, um anzufangen, aber du musst anfangen, um großartig zu werden.",
"ar": "لا يجب أن تكون عظيماً لتبدأ، لكن يجب أن تبدأ لتصبح عظيماً.",
"zh": "你不必很厉害才能开始,但你必须开始,才会变得厉害。"
}
},
{
"id": "t-quote-004",
"kind": "quote",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"growth"
],
"words": {
"en": "Comparing yourself to others is a race you can't win. Compare yourself to who you were yesterday.",
"hi": "दूसरों से अपनी तुलना करना ऐसी दौड़ है जो तुम जीत नहीं सकते। खुद की तुलना कल वाले खुद से करो।",
"mr": "स्वतःची इतरांशी तुलना करणे ही अशी शर्यत आहे जी तू जिंकू शकत नाहीस. स्वतःची तुलना कालच्या स्वतःशी कर.",
"es": "Compararte con los demás es una carrera que no puedes ganar. Compárate con quien eras ayer.",
"fr": "Te comparer aux autres est une course que tu ne peux pas gagner. Compare-toi à celui que tu étais hier.",
"de": "Dich mit anderen zu vergleichen ist ein Rennen, das du nicht gewinnen kannst. Vergleiche dich mit dem, der du gestern warst.",
"ar": "مقارنة نفسك بالآخرين سباق لا تستطيع الفوز به. قارن نفسك بما كنتَ عليه أمس.",
"zh": "和别人比较,是一场赢不了的比赛。和昨天的自己比一比吧。"
}
},
{
"id": "t-quote-005",
"kind": "quote",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"growth"
],
"words": {
"en": "Discipline is choosing between what you want now and what you want most.",
"hi": "अनुशासन का मतलब है, जो अभी चाहिए और जो सबसे ज़्यादा चाहिए, उनमें से सही को चुनना।",
"mr": "शिस्त म्हणजे आत्ता काय हवे आहे आणि सर्वात जास्त काय हवे आहे यातून योग्य ते निवडणे.",
"es": "La disciplina es elegir entre lo que quieres ahora y lo que más quieres.",
"fr": "La discipline, c’est choisir entre ce que tu veux maintenant et ce que tu veux le plus.",
"de": "Disziplin heißt, dich zwischen dem zu entscheiden, was du jetzt willst, und dem, was du am meisten willst.",
"ar": "الانضباط هو أن تختار بين ما تريده الآن وما تريده أكثر.",
"zh": "自律,就是在你现在想要的和你最想要的之间,做出选择。"
}
},
{
"id": "t-quote-006",
"kind": "quote",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"kindness"
],
"words": {
"en": "Be kind online too. There's a real person behind every screen.",
"hi": "ऑनलाइन भी दयालु रहो। हर स्क्रीन के पीछे एक असली इंसान होता है।",
"mr": "ऑनलाइनही दयाळू राहा. प्रत्येक स्क्रीनमागे एक खरीखुरी व्यक्ती असते.",
"es": "Sé amable también en internet. Detrás de cada pantalla hay una persona real.",
"fr": "Sois gentil aussi en ligne. Derrière chaque écran, il y a une vraie personne.",
"de": "Sei auch online nett. Hinter jedem Bildschirm sitzt ein echter Mensch.",
"ar": "كن لطيفاً على الإنترنت أيضاً. خلف كل شاشة إنسان حقيقي.",
"zh": "在网上也要善良。每个屏幕后面,都是一个真实的人。"
}
},
{
"id": "t-quote-007",
"kind": "quote",
"minAge": 13,
"maxAge": 17,
"gender": "girl",
"tags": [
"growth",
"rolemodel"
],
"words": {
"en": "\"Nothing in life is to be feared, it is only to be understood.\" Marie Curie",
"hi": "“जीवन में किसी चीज़ से डरने की ज़रूरत नहीं है, बस उसे समझने की ज़रूरत है।” मैरी क्यूरी",
"mr": "“आयुष्यात कशाचीही भीती बाळगायची नाही, ते फक्त समजून घ्यायचे असते.” मेरी क्युरी",
"es": "«Nada en la vida debe ser temido, solo comprendido». Marie Curie",
"fr": "« Rien dans la vie n’est à craindre, tout est à comprendre. » Marie Curie",
"de": "\"Im Leben muss man nichts fürchten, man muss es nur verstehen.\" Marie Curie",
"ar": "«لا شيء في الحياة يُخشى، بل يجب فقط أن يُفهم.» ماري كوري",
"zh": "“生活中没有什么可怕的,只有需要去了解的。”玛丽·居里"
}
},
{
"id": "t-quote-008",
"kind": "quote",
"minAge": 13,
"maxAge": 17,
"gender": "boy",
"tags": [
"sports",
"growth"
],
"words": {
"en": "Hard work beats talent when talent doesn't work hard.",
"hi": "जब प्रतिभा मेहनत नहीं करती, तब मेहनत प्रतिभा को हरा देती है।",
"mr": "प्रतिभा मेहनत करत नसेल, तर मेहनत प्रतिभेला हरवते.",
"es": "El trabajo duro le gana al talento cuando el talento no trabaja duro.",
"fr": "Le travail bat le talent quand le talent ne travaille pas.",
"de": "Harte Arbeit schlägt Talent, wenn Talent nicht hart arbeitet.",
"ar": "الاجتهاد يتفوّق على الموهبة حين لا تجتهد الموهبة.",
"zh": "当有天赋的人不努力时,努力就会胜过天赋。"
}
},
{
"id": "t-idea-001",
"kind": "idea",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"study"
],
"words": {
"en": "Idea: try 25 minutes of focused study with your phone in another room, then take a 5-minute break.",
"hi": "आइडिया: फ़ोन को दूसरे कमरे में रखकर 25 मिनट मन लगाकर पढ़ो, फिर 5 मिनट का ब्रेक लो।",
"mr": "कल्पना: फोन दुसऱ्या खोलीत ठेवून २५ मिनिटे लक्ष देऊन अभ्यास करून बघ, मग ५ मिनिटांचा ब्रेक घे.",
"es": "Idea: prueba 25 minutos de estudio concentrado con el móvil en otra habitación y luego descansa 5 minutos.",
"fr": "Idée : essaie 25 minutes d’étude concentrée avec ton téléphone dans une autre pièce, puis fais une pause de 5 minutes.",
"de": "Idee: Probier 25 Minuten konzentriertes Lernen mit dem Handy in einem anderen Zimmer, dann mach 5 Minuten Pause.",
"ar": "فكرة: جرّب 25 دقيقة من الدراسة المركّزة وهاتفك في غرفة أخرى، ثم خذ استراحة 5 دقائق.",
"zh": "好点子:试试专心学习25分钟,把手机放到另一个房间,然后休息5分钟。"
}
},
{
"id": "t-idea-002",
"kind": "idea",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"cooking"
],
"words": {
"en": "Idea: cook one dish for the family this week, start to finish.",
"hi": "आइडिया: इस हफ़्ते परिवार के लिए एक पकवान शुरू से आखिर तक खुद बनाओ।",
"mr": "कल्पना: या आठवड्यात कुटुंबासाठी एक पदार्थ सुरुवातीपासून शेवटपर्यंत स्वतः बनव.",
"es": "Idea: cocina un plato para la familia esta semana, de principio a fin.",
"fr": "Idée : cuisine un plat pour la famille cette semaine, du début à la fin.",
"de": "Idee: Koch diese Woche ein Gericht für die Familie, von Anfang bis Ende.",
"ar": "فكرة: اطبخ طبقاً واحداً للعائلة هذا الأسبوع، من البداية إلى النهاية.",
"zh": "好点子:这周为家人做一道菜,从头到尾都自己来。"
}
},
{
"id": "t-idea-003",
"kind": "idea",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"family"
],
"words": {
"en": "Idea: ask a parent about the hardest thing they did at your age.",
"hi": "आइडिया: किसी माता-पिता से पूछो कि तुम्हारी उम्र में उन्होंने सबसे मुश्किल काम कौन-सा किया था।",
"mr": "कल्पना: तुझ्या वयात आई-बाबांनी केलेली सर्वात अवघड गोष्ट कोणती होती ते त्यांना विचार.",
"es": "Idea: pregúntale a uno de tus padres cuál fue lo más difícil que hizo a tu edad.",
"fr": "Idée : demande à un parent quelle a été la chose la plus difficile qu’il ait faite à ton âge.",
"de": "Idee: Frag einen Elternteil, was das Schwerste war, das er oder sie in deinem Alter geschafft hat.",
"ar": "فكرة: اسأل أحد والديك عن أصعب شيء فعله حين كان في عمرك.",
"zh": "好点子:问问爸爸或妈妈,他们在你这个年纪时做过最难的事是什么。"
}
},
{
"id": "t-idea-004",
"kind": "idea",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"money",
"maths"
],
"words": {
"en": "Idea: pick something you want and work out how many weeks of saving it would take.",
"hi": "आइडिया: कोई चीज़ चुनो जो तुम्हें चाहिए और हिसाब लगाओ कि उसके लिए कितने हफ़्ते बचत करनी पड़ेगी।",
"mr": "कल्पना: तुला हवी असलेली एखादी वस्तू निवड आणि ती घेण्यासाठी पैसे साठवायला किती आठवडे लागतील ते काढ.",
"es": "Idea: elige algo que quieras y calcula cuántas semanas tardarías en ahorrar para comprarlo.",
"fr": "Idée : choisis quelque chose que tu veux et calcule combien de semaines d’économies il te faudrait.",
"de": "Idee: Such dir etwas aus, das du dir wünschst, und rechne aus, wie viele Wochen Sparen dafür nötig wären.",
"ar": "فكرة: اختر شيئاً تريده واحسب كم أسبوعاً من الادخار تحتاج لشرائه.",
"zh": "好点子:挑一样你想要的东西,算一算要存几个星期的钱才买得起。"
}
},
{
"id": "t-idea-005",
"kind": "idea",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"tech"
],
"words": {
"en": "Idea: learn one keyboard shortcut today that saves you time.",
"hi": "आइडिया: आज एक कीबोर्ड शॉर्टकट सीखो जो तुम्हारा समय बचाए।",
"mr": "कल्पना: आज वेळ वाचवणारा एक कीबोर्ड शॉर्टकट शिक.",
"es": "Idea: aprende hoy un atajo de teclado que te ahorre tiempo.",
"fr": "Idée : apprends aujourd’hui un raccourci clavier qui te fait gagner du temps.",
"de": "Idee: Lerne heute eine Tastenkombination, die dir Zeit spart.",
"ar": "فكرة: تعلّم اليوم اختصاراً واحداً على لوحة المفاتيح يوفّر عليك الوقت.",
"zh": "好点子:今天学一个能帮你省时间的键盘快捷键。"
}
},
{
"id": "t-idea-006",
"kind": "idea",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"writing"
],
"words": {
"en": "Idea: write down three things that went well today, however small.",
"hi": "आइडिया: आज की तीन अच्छी बातें लिखो, चाहे वे कितनी भी छोटी हों।",
"mr": "कल्पना: आज चांगल्या झालेल्या तीन गोष्टी लिहून ठेव, त्या कितीही लहान असल्या तरी.",
"es": "Idea: escribe tres cosas que salieron bien hoy, por pequeñas que sean.",
"fr": "Idée : note trois choses qui se sont bien passées aujourd’hui, même toutes petites.",
"de": "Idee: Schreib drei Dinge auf, die heute gut gelaufen sind, egal wie klein.",
"ar": "فكرة: اكتب ثلاثة أشياء سارت على ما يرام اليوم، مهما كانت صغيرة.",
"zh": "好点子:写下今天顺利的三件事,再小的事也可以。"
}
},
{
"id": "t-idea-007",
"kind": "idea",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"helping"
],
"words": {
"en": "Idea: teach a younger kid something you're good at.",
"hi": "आइडिया: किसी छोटे बच्चे को वह सिखाओ जिसमें तुम अच्छे हो।",
"mr": "कल्पना: तुला चांगले जमते असे काहीतरी एखाद्या लहान मुलाला शिकव.",
"es": "Idea: enséñale a un niño más pequeño algo que se te dé bien.",
"fr": "Idée : apprends à un plus jeune quelque chose que tu sais bien faire.",
"de": "Idee: Bring einem jüngeren Kind etwas bei, worin du gut bist.",
"ar": "فكرة: علّم طفلاً أصغر منك شيئاً تجيده.",
"zh": "好点子:把你擅长的一件事教给一个年纪更小的孩子。"
}
},
{
"id": "t-idea-008",
"kind": "idea",
"minAge": 13,
"maxAge": 17,
"gender": "any",
"tags": [
"music"
],
"words": {
"en": "Idea: make a playlist for studying with no lyrics, and see if it helps you focus.",
"hi": "आइडिया: पढ़ाई के लिए बिना बोल वाले गानों की प्लेलिस्ट बनाओ और देखो कि उससे ध्यान लगाने में मदद मिलती है या नहीं।",
"mr": "कल्पना: शब्द नसलेल्या गाण्यांची अभ्यासासाठी एक प्लेलिस्ट बनव, आणि त्याने लक्ष लागायला मदत होते का ते बघ.",
"es": "Idea: haz una lista de música para estudiar sin letra y comprueba si te ayuda a concentrarte.",
"fr": "Idée : crée une playlist sans paroles pour travailler, et vois si elle t’aide à te concentrer.",
"de": "Idee: Mach eine Playlist zum Lernen ohne Gesang und schau, ob sie dir beim Konzentrieren hilft.",
"ar": "فكرة: أنشئ قائمة تشغيل للدراسة بلا كلمات، وانظر هل تساعدك على التركيز.",
"zh": "好点子:做一个没有歌词的学习歌单,看看是不是能帮你更专心。"
}
},
{
"id": "a-fact-001",
"kind": "fact",
"minAge": 4,
"maxAge": 17,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "A cat's purr may help its bones heal. Purring vibrates at a healing frequency!",
"hi": "बिल्ली की गुरगुराहट शायद उसकी हड्डियों को जोड़ने में मदद करती है। गुरगुराहट ठीक करने वाली आवृत्ति पर काँपती है!",
"mr": "मांजरीच्या गुरगुरण्याने (प्युरिंगने) तिची हाडे बरी व्हायला मदत होऊ शकते. गुरगुरण्याचे कंपन उपचार करणाऱ्या वारंवारितेचे असते!",
"es": "El ronroneo de un gato puede ayudar a que sus huesos sanen. ¡Ronronear vibra a una frecuencia que cura!",
"fr": "Le ronronnement d’un chat pourrait aider ses os à guérir. Il vibre à une fréquence qui soigne !",
"de": "Das Schnurren einer Katze hilft vielleicht ihren Knochen beim Heilen. Es vibriert nämlich in einer heilenden Frequenz!",
"ar": "قد يساعد خرخرة القطة عظامها على الالتئام. فالخرخرة تهتز بتردد يشفي!",
"zh": "小猫的呼噜声也许能帮助骨头愈合。呼噜的振动正好是有疗愈作用的频率!"
}
},
{
"id": "a-fact-002",
"kind": "fact",
"minAge": 4,
"maxAge": 17,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "Cats can't taste sweet things, so I'll leave the sweets for you.",
"hi": "बिल्लियाँ मीठा नहीं चख सकतीं, इसलिए मिठाइयाँ मैं तुम्हारे लिए छोड़ देती हूँ।",
"mr": "मांजरींना गोड चव कळत नाही, म्हणून मिठाई मी तुझ्यासाठीच ठेवते.",
"es": "Los gatos no pueden saborear lo dulce, así que te dejo los dulces a ti.",
"fr": "Les chats ne sentent pas le goût sucré, alors je te laisse les bonbons.",
"de": "Katzen können Süßes nicht schmecken, deshalb überlasse ich die Süßigkeiten dir.",
"ar": "القطط لا تستطيع تذوّق الطعم الحلو، لذلك سأترك الحلوى لك.",
"zh": "小猫尝不出甜味,所以甜甜的东西就留给你吧。"
}
},
{
"id": "a-fact-003",
"kind": "fact",
"minAge": 4,
"maxAge": 17,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "Every cat's nose has its own pattern, just like your fingerprint.",
"hi": "हर बिल्ली की नाक का अपना अलग पैटर्न होता है, बिल्कुल तुम्हारी उंगली के निशान जैसा।",
"mr": "प्रत्येक मांजरीच्या नाकाचा स्वतःचा वेगळा नमुना असतो, अगदी तुझ्या बोटांच्या ठशांसारखा.",
"es": "La nariz de cada gato tiene su propio dibujo, igual que tu huella dactilar.",
"fr": "Le nez de chaque chat a son propre dessin, comme ton empreinte digitale.",
"de": "Jede Katzennase hat ihr eigenes Muster, genau wie dein Fingerabdruck.",
"ar": "لكل قطة نمط خاص على أنفها، مثل بصمة إصبعك تماماً.",
"zh": "每只小猫的鼻子都有自己独特的花纹,就像你的指纹一样。"
}
},
{
"id": "a-fact-004",
"kind": "fact",
"minAge": 4,
"maxAge": 17,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "Cats use their whiskers to check if they can fit through a gap.",
"hi": "बिल्लियाँ अपनी मूंछों से जाँचती हैं कि वे किसी तंग जगह से निकल सकती हैं या नहीं।",
"mr": "मांजरी एखाद्या फटीतून आपण जाऊ शकतो का हे तपासायला मिशांचा वापर करतात.",
"es": "Los gatos usan sus bigotes para comprobar si caben por un hueco.",
"fr": "Les chats utilisent leurs moustaches pour savoir s’ils peuvent passer dans une ouverture.",
"de": "Katzen prüfen mit ihren Schnurrhaaren, ob sie durch eine Lücke passen.",
"ar": "تستخدم القطط شواربها لتعرف هل تستطيع المرور من فتحة ضيقة.",
"zh": "小猫用胡须来量一量自己能不能钻过一个缝隙。"
}
},
{
"id": "a-fact-005",
"kind": "fact",
"minAge": 4,
"maxAge": 17,
"gender": "any",
"tags": [
"animals"
],
"words": {
"en": "A cat has 32 muscles in each ear, so it can turn them to listen in different directions.",
"hi": "बिल्ली के हर कान में 32 मांसपेशियाँ होती हैं, इसलिए वह उन्हें अलग-अलग दिशाओं में घुमाकर सुन सकती है।",
"mr": "मांजरीच्या प्रत्येक कानात ३२ स्नायू असतात, म्हणून ती कान वेगवेगळ्या दिशांना फिरवून ऐकू शकते.",
"es": "Un gato tiene 32 músculos en cada oreja, así que puede girarlas para escuchar en distintas direcciones.",
"fr": "Un chat a 32 muscles dans chaque oreille, alors il peut les tourner pour écouter dans différentes directions.",
"de": "Eine Katze hat in jedem Ohr 32 Muskeln und kann die Ohren deshalb in verschiedene Richtungen drehen, um zu lauschen.",
"ar": "في كل أذن من أذني القطة 32 عضلة، لذلك تستطيع أن تديرهما لتسمع في اتجاهات مختلفة.",
"zh": "小猫每只耳朵里有32块肌肉,所以它们能把耳朵转向不同的方向去听。"
}
},
{
"id": "a-quote-001",
"kind": "quote",
"minAge": 4,
"maxAge": 17,
"gender": "any",
"tags": [
"kindness"
],
"words": {
"en": "Drink some water, take a breath, and you're ready for anything.",
"hi": "थोड़ा पानी पियो, एक गहरी साँस लो, और तुम किसी भी चीज़ के लिए तैयार हो।",
"mr": "थोडे पाणी पी, एक दीर्घ श्वास घे, आणि तू कशासाठीही तयार आहेस.",
"es": "Bebe un poco de agua, respira hondo y estarás listo para lo que sea.",
"fr": "Bois un peu d’eau, respire un bon coup, et tu es prêt pour tout.",
"de": "Trink etwas Wasser, atme tief durch, und du bist für alles bereit.",
"ar": "اشرب بعض الماء، وخذ نفَساً عميقاً، وستكون جاهزاً لأي شيء.",
"zh": "喝点水,深呼吸一下,你就准备好迎接任何事啦。"
}
},
{
"id": "a-quote-002",
"kind": "quote",
"minAge": 4,
"maxAge": 17,
"gender": "any",
"tags": [
"growth"
],
"words": {
"en": "Done is better than perfect.",
"hi": "पूरा हो जाना, परफ़ेक्ट होने से बेहतर है।",
"mr": "परिपूर्णतेपेक्षा पूर्ण केलेले चांगले.",
"es": "Hecho es mejor que perfecto.",
"fr": "Fait vaut mieux que parfait.",
"de": "Fertig ist besser als perfekt.",
"ar": "إنجاز العمل أفضل من الكمال.",
"zh": "完成,比完美更重要。"
}
},
{
"id": "a-idea-001",
"kind": "idea",
"minAge": 4,
"maxAge": 17,
"gender": "any",
"tags": [
"helping"
],
"words": {
"en": "Idea: tidy one small corner of your room. Just one. It counts!",
"hi": "आइडिया: अपने कमरे का एक छोटा-सा कोना साफ़ करो। बस एक। यह भी गिना जाएगा!",
"mr": "कल्पना: तुझ्या खोलीचा एक लहानसा कोपरा आवर. फक्त एकच. तेही चालते!",
"es": "Idea: ordena un pequeño rincón de tu cuarto. Solo uno. ¡Cuenta!",
"fr": "Idée : range un petit coin de ta chambre. Un seul. Ça compte !",
"de": "Idee: Räum eine kleine Ecke in deinem Zimmer auf. Nur eine. Das zählt!",
"ar": "فكرة: رتّب زاوية صغيرة واحدة من غرفتك. واحدة فقط. وهذا يُحسب!",
"zh": "好点子:收拾一下房间里的一个小角落,只要一个就好。这也算数哦!"
}
},
{
"id": "a-idea-002",
"kind": "idea",
"minAge": 4,
"maxAge": 17,
"gender": "any",
"tags": [
"body"
],
"words": {
"en": "Idea: stand up and stretch as tall as you can, then touch your toes.",
"hi": "आइडिया: खड़े होकर जितना ऊँचा हो सके खिंचाव लगाओ, फिर अपने पैर की उंगलियाँ छुओ।",
"mr": "कल्पना: उभा राहा आणि जमेल तितका उंच ताणून घे, मग पायाच्या बोटांना हात लाव.",
"es": "Idea: ponte de pie y estírate todo lo alto que puedas, luego toca la punta de los pies.",
"fr": "Idée : lève-toi et étire-toi le plus haut possible, puis touche tes orteils.",
"de": "Idee: Steh auf und streck dich, so hoch du kannst, und dann berühre deine Zehen.",
"ar": "فكرة: قف وتمدّد طويلاً قدر ما تستطيع، ثم المس أصابع قدميك.",
"zh": "好点子:站起来,尽量伸长身体,然后再弯腰摸摸脚趾。"
}
}
]$sayings$::jsonb)
  as s(id text, kind text, "minAge" smallint, "maxAge" smallint, gender text, tags text[], words jsonb)
on conflict (id) do update
  set kind = excluded.kind, min_age = excluded.min_age, max_age = excluded.max_age,
      gender = excluded.gender, tags = excluded.tags, words = excluded.words;

notify pgrst, 'reload schema';
