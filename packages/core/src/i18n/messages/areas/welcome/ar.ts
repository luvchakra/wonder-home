import type { AreaCatalog } from "../types";
import type { welcomeEn } from "./en";

export const welcomeAr: AreaCatalog<typeof welcomeEn> = {
  "welcome.intro": "أهلًا بك في عائلة WonderHome يا {name}! أنا هنا لأحمل معك هموم البيت.",
  "welcome.household": "هذا بيتك كما أعرفه: {people}.",
  "welcome.pets": "و{pets} طبعًا.",
  "welcome.helpers#zero": "{helpers} يساعدون في البيت.",
  "welcome.helpers#one": "{helpers} يساعد في البيت.",
  "welcome.helpers#two": "{helpers} يساعدان في البيت.",
  "welcome.helpers#few": "{helpers} يساعدون في البيت.",
  "welcome.helpers#many": "{helpers} يساعدون في البيت.",
  "welcome.helpers#other": "{helpers} يساعدون في البيت.",
  "welcome.what": "سأتابع المدرسة والوجبات والمشتريات والفواتير وخطط العائلة، ولن أخبرك إلا بما يحتاج إليك.",
  "welcome.howTo": "يمكنك أن تكلّمني بثلاث طرق: اكتب رسالة هنا، أو اضغط على الميكروفون لتقول شيئًا واحدًا، أو ابدأ محادثة مباشرة ونتكلم بكل بساطة.",
  "welcome.getToKnow": "لنتعرّف على بعضنا، سؤالًا بعد سؤال. قل «تخطي» متى شئت.",
  "welcome.q.food": "ما الذي تحب عائلتك أكله؟ أطباق مفضلة، مطابخ، أي شيء.",
  "welcome.q.dislikes": "هل هناك شيء لا يأكله أحد أو لا يحبه؟ حساسية مثلًا، أو طعام يتجنبه أحد؟",
  "welcome.q.together": "ماذا تحبون أن تفعلوا معًا؟ أفلام، ألعاب، نزهات، أي شيء.",
  "welcome.q.petOne": "حدّثني عن {pet}. هل هناك ما يجب أن أعرفه، كالطعام أو المشي؟",
  "welcome.q.petMany": "حدّثني عن {pets}. هل هناك ما يجب أن أعرفه، كالطعام أو المشي؟",
  "welcome.q.noPets": "هل في البيت حيوانات أليفة، أو هناك واحد في الطريق؟",
  "welcome.ack": "حسنًا، سأتذكّر ذلك.",
  "welcome.ackNone": "حسنًا، لا شيء يُسجَّل هنا.",
  "welcome.done": "شكرًا! حفظتُ كل ذلك في «مراجعة HomeBrain»، ويمكنك تغييره في أي وقت. ماذا تريد أن تفعل أولًا؟",
  "welcome.skipped": "لا مشكلة، نكمل هذا في وقت آخر. ماذا تريد أن تفعل أولًا؟",
  "welcome.listen": "استمع إلى الترحيب",
};
