import type { AreaCatalog } from "../types";
import type { welcomeEn } from "./en";

export const welcomeEs: AreaCatalog<typeof welcomeEn> = {
  "welcome.intro": "¡Bienvenido a la familia WonderHome, {name}! Estoy aquí para llevar contigo la carga mental de la casa.",
  "welcome.household": "Así conozco tu hogar: {people}.",
  "welcome.pets": "Y {pets}, por supuesto.",
  "welcome.helpers#one": "{helpers} ayuda en casa.",
  "welcome.helpers#other": "{helpers} ayudan en casa.",
  "welcome.what": "Me ocuparé del colegio, las comidas, la compra, las facturas y los planes de la familia, y solo te diré lo que te necesita.",
  "welcome.howTo": "Puedes hablar conmigo de tres maneras: escribe un mensaje aquí, toca el micro para decir una cosa, o empieza una conversación en directo y simplemente charlamos.",
  "welcome.getToKnow": "Vamos a conocernos, una pregunta cada vez. Di «saltar» cuando quieras.",
  "welcome.q.food": "¿Qué le encanta comer a tu familia? Platos favoritos, cocinas, lo que sea.",
  "welcome.q.dislikes": "¿Hay algo que alguien no coma o no le guste? ¿Alguna alergia, o algo que alguien evite?",
  "welcome.q.together": "¿Qué os gusta hacer juntos? Películas, juegos, salidas, lo que sea.",
  "welcome.q.petOne": "Háblame de {pet}. ¿Hay algo que deba saber, como la comida o los paseos?",
  "welcome.q.petMany": "Háblame de {pets}. ¿Hay algo que deba saber, como la comida o los paseos?",
  "welcome.q.noPets": "¿Tenéis mascotas en casa, o alguna en camino?",
  "welcome.ack": "Entendido, lo recordaré.",
  "welcome.ackNone": "Vale, no hay nada que anotar.",
  "welcome.done": "¡Gracias! He guardado todo eso en «HomeBrain», donde puedes cambiarlo cuando quieras. ¿Qué te gustaría hacer primero?",
  "welcome.skipped": "No pasa nada, lo hacemos en otro momento. ¿Qué te gustaría hacer primero?",
  "welcome.listen": "Escuchar la bienvenida",
};
