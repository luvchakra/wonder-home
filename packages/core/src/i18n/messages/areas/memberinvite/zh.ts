import type { AreaCatalog } from "../types";
import type { memberInviteEn } from "./en";

export const memberInviteZh: AreaCatalog<typeof memberInviteEn> = {
  "memberInvite.button": "邀请",
  "memberInvite.buttonLabel": "邀请{name}登录",
  "memberInvite.title": "邀请{name}",
  "memberInvite.lede": "{name}用自己的账户登录，并按其角色查看家庭。",
  "memberInvite.emailHint": "{name}用 {email} 登录时（密码或 Google），会直接进入。也可以用链接。",
  "memberInvite.noEmail": "在{name}的资料中添加其邮箱，用它登录即可直接进入。或者给他们发送链接。",
  "memberInvite.create": "创建邀请链接",
  "memberInvite.creating": "正在创建…",
  "memberInvite.ready": "链接已准备好。只能使用一次，7 天后失效。",
  "memberInvite.newLinkNote": "创建新链接后，之前的链接会失效。",
  "memberInvite.sendEmail": "发送邮件",
  "memberInvite.share": "分享",
  "memberInvite.copy": "复制链接",
  "memberInvite.copied": "已复制",
  "memberInvite.failed": "无法创建链接，请重试。",
  "memberInvite.subject": "在 WonderHome 加入{household}",
  "memberInvite.message": "{inviter}邀请你在 WonderHome 加入{household}。打开此链接即可进入：",
  "memberInvite.factEmail": "登录邮箱",
  "memberInvite.signsIn": "可登录",
} as const;
