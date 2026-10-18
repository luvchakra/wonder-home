import type { AreaCatalog } from "../types";
import type { welcomeEn } from "./en";

export const welcomeZh: AreaCatalog<typeof welcomeEn> = {
  "welcome.intro": "欢迎加入 WonderHome 大家庭，{name}！我会和你一起分担家里的大事小事。",
  "welcome.household": "我了解到的你家是这样的：{people}。",
  "welcome.pets": "当然，还有{pets}。",
  "welcome.helpers#one": "{helpers}在家里帮忙。",
  "welcome.helpers#other": "{helpers}在家里帮忙。",
  "welcome.what": "学校、三餐、买菜、账单和家庭安排，我都会帮你记着，只在需要你的时候才告诉你。",
  "welcome.howTo": "你可以用三种方式跟我说话：在这里打字，点一下麦克风说一句话，或者开始实时对话，我们就这样聊下去。",
  "welcome.getToKnow": "我们一个问题一个问题地互相认识一下吧。随时说“跳过”就行。",
  "welcome.q.food": "你们家最爱吃什么？喜欢的菜、菜系，什么都可以。",
  "welcome.q.dislikes": "有没有谁不吃或不喜欢的东西？比如过敏，或者有人忌口的食物？",
  "welcome.q.together": "你们喜欢一起做什么？看电影、玩游戏、出去玩，什么都行。",
  "welcome.q.petOne": "跟我说说{pet}吧。有什么我该知道的吗，比如吃的或者遛弯？",
  "welcome.q.petMany": "跟我说说{pets}吧。有什么我该知道的吗，比如吃的或者遛弯？",
  "welcome.q.noPets": "家里有宠物吗，或者打算养一只？",
  "welcome.ack": "好的，我记住了。",
  "welcome.ackNone": "好，这个没什么要记的。",
  "welcome.done": "谢谢！这些我都放在了“HomeBrain”里，你随时可以修改。你想先做什么？",
  "welcome.skipped": "没关系，我们下次再聊。你想先做什么？",
  "welcome.listen": "听欢迎语",
};
