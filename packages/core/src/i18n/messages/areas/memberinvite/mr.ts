import type { AreaCatalog } from "../types";
import type { memberInviteEn } from "./en";

export const memberInviteMr: AreaCatalog<typeof memberInviteEn> = {
  "memberInvite.button": "आमंत्रित करा",
  "memberInvite.buttonLabel": "{name} यांना साइन इनसाठी आमंत्रित करा",
  "memberInvite.title": "{name} यांना आमंत्रित करा",
  "memberInvite.lede": "{name} स्वतः साइन इन करतात आणि घर त्यांच्या भूमिकेनुसार पाहतात.",
  "memberInvite.emailHint": "{name} {email} ने साइन इन करतील, पासवर्डने किंवा Google ने, तेव्हा ते थेट आत येतील. लिंकही चालते.",
  "memberInvite.noEmail": "{name} यांचा ईमेल त्यांच्या माहितीत जोडा, त्याने साइन इन करताच ते थेट आत येतील. किंवा त्यांना लिंक पाठवा.",
  "memberInvite.create": "आमंत्रण लिंक तयार करा",
  "memberInvite.creating": "तयार होत आहे…",
  "memberInvite.ready": "लिंक तयार आहे. ती एकदाच चालते आणि 7 दिवसांनी बंद होते.",
  "memberInvite.newLinkNote": "नवीन लिंक तयार केल्यावर आधीची बंद होते.",
  "memberInvite.sendEmail": "ईमेल पाठवा",
  "memberInvite.share": "शेअर करा",
  "memberInvite.copy": "लिंक कॉपी करा",
  "memberInvite.copied": "कॉपी झाले",
  "memberInvite.failed": "लिंक तयार करता आली नाही. कृपया पुन्हा प्रयत्न करा.",
  "memberInvite.subject": "WonderHome वर {household} मध्ये सामील व्हा",
  "memberInvite.message": "{inviter} यांनी तुम्हाला WonderHome वर {household} मध्ये सामील होण्यासाठी आमंत्रित केले आहे. आत येण्यासाठी ही लिंक उघडा:",
  "memberInvite.factEmail": "साइन-इन ईमेल",
  "memberInvite.signsIn": "साइन इन करतात",
} as const;
