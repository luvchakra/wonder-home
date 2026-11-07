import type { TriviaCard, TriviaLevel } from "./trivia";

/**
 * Kids Trivia's built-in cards (story 08-034): written and checked by hand, so
 * the card works with no AI key and never waits on a model. Each fact is one
 * or two short sentences a parent can read aloud; each quiz has 3–4 choices
 * and one line on why the right one is right. English only: a card in another
 * language comes from the generated pool (08-035), and a child reading another
 * language is told it is in English.
 *
 * A child's own topic finds its cards through `categoryFor`: "T. rex" is
 * dinosaurs, "Minecraft" is computers and games, "K-pop" is music. A topic no
 * category covers still gets a card, from a category, and the card says so.
 */

type Entry = [kind: "fact" | "quiz", difficulty: TriviaLevel, text: string, options?: readonly string[], answer?: number, explain?: string];

export const TRIVIA_CATEGORIES = [
  "animals",
  "dinosaurs",
  "space",
  "ocean",
  "insects",
  "plants",
  "weather",
  "human_body",
  "science",
  "geography",
  "history",
  "cricket",
  "football",
  "sports",
  "music",
  "art",
  "computers",
  "vehicles",
  "books",
  "food",
  "maths",
] as const;
export type TriviaCategory = (typeof TRIVIA_CATEGORIES)[number];

/** The words a child might type for each category, lower case, whole words or phrases. */
const SYNONYMS: Record<TriviaCategory, readonly string[]> = {
  animals: ["animal", "animals", "pet", "pets", "cat", "cats", "dog", "dogs", "puppy", "puppies", "kitten", "kittens", "lion", "lions", "tiger", "tigers", "elephant", "elephants", "horse", "horses", "bird", "birds", "wildlife", "zoo", "jungle", "giraffe", "giraffes", "monkey", "monkeys", "panda", "pandas", "bear", "bears", "wolf", "wolves", "fox", "foxes", "rabbit", "rabbits", "bunny", "bunnies", "kangaroo", "koala", "cheetah", "parrot", "parrots", "owl", "owls", "penguin", "penguins", "bat", "bats", "reptile", "reptiles", "snake", "snakes", "frog", "frogs", "farm animals", "safari", "nature"],
  dinosaurs: ["dinosaur", "dinosaurs", "dino", "dinos", "t rex", "trex", "tyrannosaurus", "triceratops", "jurassic", "jurassic park", "jurassic world", "fossil", "fossils", "prehistoric", "raptor", "raptors", "velociraptor"],
  space: ["space", "planet", "planets", "star", "stars", "moon", "sun", "astronaut", "astronauts", "nasa", "isro", "rocket", "rockets", "galaxy", "galaxies", "solar system", "universe", "mars", "jupiter", "saturn", "astronomy", "black hole", "black holes", "comet", "comets", "chandrayaan", "aliens", "telescope"],
  ocean: ["ocean", "oceans", "sea", "seas", "fish", "shark", "sharks", "whale", "whales", "dolphin", "dolphins", "octopus", "coral", "coral reef", "beach", "marine life", "sea animals", "underwater", "turtle", "turtles", "jellyfish"],
  insects: ["insect", "insects", "bug", "bugs", "butterfly", "butterflies", "bee", "bees", "ant", "ants", "spider", "spiders", "ladybird", "ladybug", "beetle", "beetles", "caterpillar", "caterpillars", "dragonfly"],
  plants: ["plant", "plants", "tree", "trees", "flower", "flowers", "garden", "gardening", "forest", "forests", "leaves", "seeds", "sunflower", "sunflowers", "bamboo", "cactus"],
  weather: ["weather", "rain", "rainbow", "rainbows", "cloud", "clouds", "storm", "storms", "thunder", "lightning", "snow", "wind", "monsoon", "tornado", "tornadoes", "climate", "seasons"],
  human_body: ["human body", "body", "brain", "bones", "skeleton", "heart", "teeth", "muscles", "senses", "eyes"],
  science: ["science", "experiment", "experiments", "chemistry", "physics", "magnet", "magnets", "electricity", "inventions", "inventors", "scientist", "scientists", "volcano", "volcanoes", "rocks", "light", "sound", "energy", "robot", "robots", "stem"],
  geography: ["geography", "country", "countries", "map", "maps", "flag", "flags", "mountain", "mountains", "river", "rivers", "world", "india", "capitals", "continents", "deserts", "desert", "travel", "cities"],
  history: ["history", "king", "kings", "queen", "queens", "pyramid", "pyramids", "egypt", "ancient egypt", "romans", "rome", "knights", "castle", "castles", "vikings", "mughals", "ancient", "explorers", "mummies"],
  cricket: ["cricket", "ipl", "virat kohli", "kohli", "sachin", "sachin tendulkar", "rohit sharma", "dhoni", "ms dhoni", "test cricket", "t20", "world cup cricket"],
  football: ["football", "soccer", "messi", "ronaldo", "neymar", "mbappe", "premier league", "fifa", "world cup", "goalkeeper", "manchester united", "real madrid", "barcelona"],
  sports: ["sport", "sports", "olympics", "olympic", "basketball", "tennis", "badminton", "hockey", "swimming", "running", "athletics", "kabaddi", "chess", "cycling", "gymnastics", "skating", "karate", "volleyball", "table tennis", "baseball"],
  music: ["music", "song", "songs", "singing", "singer", "singers", "k pop", "kpop", "bts", "blackpink", "piano", "guitar", "drums", "violin", "flute", "band", "bands", "dance", "dancing", "bollywood songs", "taylor swift", "concert", "rap", "pop music"],
  art: ["art", "drawing", "draw", "painting", "paint", "colours", "colors", "origami", "craft", "crafts", "sketching", "artists", "lego", "clay", "anime drawing"],
  computers: ["computer", "computers", "coding", "code", "programming", "minecraft", "roblox", "video games", "video game", "games", "gaming", "fortnite", "pokemon", "nintendo", "mario", "super mario", "internet", "technology", "tech", "ai", "apps", "python", "scratch"],
  vehicles: ["car", "cars", "train", "trains", "plane", "planes", "aeroplane", "aeroplanes", "airplane", "airplanes", "truck", "trucks", "f1", "formula 1", "formula one", "racing", "bikes", "motorbikes", "ships", "boats", "bus", "buses", "metro", "railways", "transport"],
  books: ["book", "books", "reading", "stories", "story", "story books", "harry potter", "fairy tales", "fairytales", "comics", "poems", "poetry", "panchatantra", "authors", "writing", "library"],
  food: ["food", "foods", "cooking", "baking", "fruit", "fruits", "vegetables", "chocolate", "pizza", "ice cream", "cake", "cakes", "desserts", "sweets", "snacks", "mango", "mangoes", "recipes", "chef"],
  maths: ["maths", "math", "mathematics", "numbers", "counting", "shapes", "puzzles", "sudoku", "geometry", "times tables"],
};

const CARDS: Record<TriviaCategory, readonly Entry[]> = {
  animals: [
    ["fact", 1, "A group of flamingos is called a flamboyance."],
    ["fact", 1, "A cheetah can sprint at around 100 km an hour, but only for a short burst."],
    ["fact", 2, "Sloths move so slowly that tiny plants called algae can grow on their fur."],
    ["quiz", 1, "Which animal is the tallest in the world?", ["Elephant", "Giraffe", "Camel", "Horse"], 1, "A grown-up giraffe can be taller than 5 metres."],
    ["quiz", 2, "What is a baby kangaroo called?", ["A cub", "A joey", "A kit", "A calf"], 1, "A joey lives in its mother's pouch for months."],
    ["quiz", 3, "Which is the only mammal that can truly fly?", ["Flying squirrel", "Bat", "Sugar glider", "Penguin"], 1, "Flying squirrels and sugar gliders glide, but bats flap their wings and fly."],
  ],
  dinosaurs: [
    ["fact", 1, "The word dinosaur means terrible lizard."],
    ["fact", 2, "Birds are living dinosaurs: they come from the same group of meat-eating dinosaurs as T. rex."],
    ["fact", 3, "T. rex lived closer in time to us than to Stegosaurus."],
    ["quiz", 1, "Which dinosaur had three horns on its face?", ["Triceratops", "Stegosaurus", "Velociraptor", "Brachiosaurus"], 0, "Tri means three, so Triceratops means three-horned face."],
    ["quiz", 2, "What do we call a scientist who studies dinosaur fossils?", ["Astronomer", "Palaeontologist", "Botanist", "Chemist"], 1, "Palaeontologists study life from long, long ago."],
    ["quiz", 3, "About how long ago did the last big dinosaurs die out?", ["66 thousand years", "6.6 million years", "66 million years", "660 million years"], 2, "A huge asteroid hit Earth about 66 million years ago."],
  ],
  space: [
    ["fact", 1, "The Sun is a star, and it is the closest star to Earth."],
    ["fact", 2, "Footprints on the Moon can last for millions of years, because there is no wind to blow them away."],
    ["fact", 3, "A day on Venus is longer than its whole year."],
    ["quiz", 1, "Which planet is known as the Red Planet?", ["Venus", "Mars", "Jupiter", "Saturn"], 1, "Mars looks red because of rusty dust on its ground."],
    ["quiz", 2, "Which is the biggest planet in our Solar System?", ["Saturn", "Earth", "Jupiter", "Neptune"], 2, "More than a thousand Earths could fit inside Jupiter."],
    ["quiz", 3, "About how long does sunlight take to reach Earth?", ["8 seconds", "8 minutes", "8 hours", "8 days"], 1, "Light from the Sun takes a little over 8 minutes to get here."],
  ],
  ocean: [
    ["fact", 1, "An octopus has three hearts and blue blood."],
    ["fact", 2, "The blue whale is the largest animal that has ever lived, bigger than any dinosaur."],
    ["fact", 3, "About half the oxygen on Earth is made by tiny ocean plants called phytoplankton."],
    ["quiz", 1, "Which of these is a mammal?", ["Shark", "Dolphin", "Tuna", "Octopus"], 1, "Dolphins breathe air and feed their babies milk."],
    ["quiz", 2, "Which is the largest ocean on Earth?", ["Atlantic", "Indian", "Pacific", "Arctic"], 2, "The Pacific is bigger than all the land on Earth put together."],
  ],
  insects: [
    ["fact", 1, "A butterfly tastes with its feet."],
    ["fact", 2, "Honeybees dance to tell each other where to find flowers."],
    ["quiz", 1, "How many legs does an insect have?", ["4", "6", "8", "10"], 1, "Every insect has six legs."],
    ["quiz", 2, "Is a spider an insect?", ["Yes", "No, it is an arachnid", "Only big ones"], 1, "Spiders have eight legs, so they are arachnids, not insects."],
  ],
  plants: [
    ["fact", 1, "Sunflowers can grow taller than a grown-up person."],
    ["fact", 2, "Bamboo is a grass, and some kinds can grow almost a metre in one day."],
    ["quiz", 1, "What do plants need from the Sun to make their food?", ["Light", "Sound", "Wind", "Snow"], 0, "Plants use sunlight to make food from air and water."],
    ["quiz", 2, "Which gas do plants give out that we breathe in?", ["Carbon dioxide", "Oxygen", "Helium", "Smoke"], 1, "Plants take in carbon dioxide and give out oxygen."],
  ],
  weather: [
    ["fact", 1, "A snowflake almost always has six sides."],
    ["fact", 2, "A flash of lightning is hotter than the surface of the Sun."],
    ["quiz", 1, "What do you need to see a rainbow?", ["Sunlight and raindrops", "Wind and clouds", "Snow and ice", "Moonlight and fog"], 0, "Raindrops split sunlight into its colours."],
    ["quiz", 2, "What do we call a scientist who studies the weather?", ["Meteorologist", "Biologist", "Astronaut", "Architect"], 0, "Meteorologists tell us when rain or sunshine is coming."],
  ],
  human_body: [
    ["fact", 1, "Your heart beats about 100,000 times every day."],
    ["fact", 2, "Babies are born with about 300 bones, and grown-ups have 206, because some join together."],
    ["quiz", 1, "Which part of your body do you use to smell?", ["Ears", "Nose", "Elbows", "Knees"], 1, "Your nose can tell apart thousands of smells."],
    ["quiz", 2, "What is the biggest organ of the human body?", ["Heart", "Brain", "Skin", "Liver"], 2, "Your skin covers and protects your whole body."],
  ],
  science: [
    ["fact", 1, "Water can be ice, liquid or steam: the same stuff in three forms."],
    ["fact", 2, "Sound travels about four times faster through water than through air."],
    ["quiz", 1, "What pulls things down to the ground when you drop them?", ["Magnetism", "Gravity", "Electricity", "Wind"], 1, "Gravity pulls everything towards the Earth."],
    ["quiz", 2, "At what temperature does water boil at sea level?", ["50 °C", "75 °C", "100 °C", "150 °C"], 2, "At sea level, water boils at 100 degrees Celsius."],
    ["quiz", 3, "Which metal is a liquid at room temperature?", ["Iron", "Mercury", "Gold", "Copper"], 1, "Mercury is the only metal that is runny at room temperature."],
  ],
  geography: [
    ["fact", 1, "Mount Everest is the highest mountain above sea level on Earth."],
    ["fact", 2, "Russia is so wide that it has eleven time zones."],
    ["quiz", 1, "Which is the largest continent?", ["Africa", "Asia", "Europe", "Australia"], 1, "Asia is the biggest continent, and India is part of it."],
    ["quiz", 2, "What is the capital of Japan?", ["Beijing", "Seoul", "Tokyo", "Bangkok"], 2, "Tokyo is one of the biggest cities in the world."],
    ["quiz", 3, "Which is the largest hot desert in the world?", ["Thar", "Gobi", "Sahara", "Kalahari"], 2, "The Sahara covers a big part of North Africa."],
  ],
  history: [
    ["fact", 1, "The Great Pyramid of Giza is more than 4,500 years old."],
    ["fact", 2, "The Great Wall of China was built and rebuilt over about 2,000 years."],
    ["quiz", 1, "In which country are the ancient pyramids of Giza?", ["India", "Egypt", "Mexico", "Greece"], 1, "The pyramids of Giza stand near Cairo, in Egypt."],
    ["quiz", 2, "Who was the first person to walk on the Moon?", ["Neil Armstrong", "Yuri Gagarin", "Rakesh Sharma", "Buzz Aldrin"], 0, "Neil Armstrong stepped onto the Moon in 1969."],
    ["quiz", 3, "Which empire built the Colosseum?", ["Roman", "Mughal", "Ottoman", "Chinese"], 0, "The Romans built the Colosseum almost 2,000 years ago."],
  ],
  cricket: [
    ["fact", 1, "A cricket pitch is 22 yards long, about 20 metres."],
    ["fact", 2, "In cricket, a duck means a batter is out without scoring a run."],
    ["quiz", 1, "How many balls are in one over?", ["4", "6", "8", "10"], 1, "A bowler bowls six balls in an over."],
    ["quiz", 2, "How many players does a cricket team have on the field?", ["9", "10", "11", "12"], 2, "Each team has eleven players."],
    ["quiz", 3, "Which country hosted the first men's Cricket World Cup in 1975?", ["India", "Australia", "England", "West Indies"], 2, "England hosted it, and the West Indies won."],
  ],
  football: [
    ["fact", 1, "A football match has two halves of 45 minutes each."],
    ["fact", 2, "The men's FIFA World Cup is held every four years."],
    ["quiz", 1, "How many players does each team have on the pitch?", ["9", "10", "11", "12"], 2, "Each side has eleven players, including the goalkeeper."],
    ["quiz", 2, "Which player may touch the ball with their hands in their own penalty area?", ["The striker", "The goalkeeper", "The captain", "The defender"], 1, "Only the goalkeeper may handle the ball there."],
  ],
  sports: [
    ["fact", 1, "The Olympic symbol is five rings joined together."],
    ["fact", 2, "A marathon is about 42 kilometres long."],
    ["quiz", 1, "In which sport do you hit a shuttlecock?", ["Tennis", "Badminton", "Hockey", "Golf"], 1, "Badminton players hit a shuttlecock over a net."],
    ["quiz", 2, "How often are the Summer Olympic Games usually held?", ["Every year", "Every two years", "Every four years", "Every ten years"], 2, "The Summer Games usually come round every four years."],
  ],
  music: [
    ["fact", 1, "A standard piano has 88 keys."],
    ["fact", 2, "K-pop is pop music from South Korea."],
    ["quiz", 1, "How many strings does a standard guitar have?", ["4", "6", "8", "12"], 1, "Most guitars have six strings."],
    ["quiz", 2, "Which of these instruments do you blow into?", ["Drum", "Flute", "Violin", "Piano"], 1, "You play a flute by blowing across a hole."],
  ],
  art: [
    ["fact", 1, "Mixing blue and yellow paint makes green."],
    ["fact", 2, "Origami is the art of folding paper into shapes without cutting or glue."],
    ["quiz", 1, "Which colour do you get when you mix red and white?", ["Pink", "Purple", "Orange", "Brown"], 0, "Red and white make pink."],
    ["quiz", 2, "Who painted the Mona Lisa?", ["Vincent van Gogh", "Leonardo da Vinci", "Pablo Picasso", "Raja Ravi Varma"], 1, "Leonardo da Vinci painted her more than 500 years ago."],
  ],
  computers: [
    ["fact", 1, "The first computer mouse was made of wood."],
    ["fact", 2, "Computers keep everything, games, songs and photos, as ones and zeros."],
    ["quiz", 1, "What do we call the instructions that tell a computer what to do?", ["Code", "Glue", "Paint", "Soup"], 0, "People who write code are called programmers."],
    ["quiz", 2, "In Minecraft, which block do you need to build a Nether portal frame?", ["Obsidian", "Dirt", "Glass", "Wool"], 0, "A Nether portal frame is made of obsidian."],
  ],
  vehicles: [
    ["fact", 1, "The first passenger train in India ran in 1853, from Bombay to Thane."],
    ["fact", 2, "Japan's bullet trains can travel at about 300 km an hour."],
    ["quiz", 1, "Which of these runs on rails?", ["Bus", "Train", "Boat", "Bicycle"], 1, "Trains run on rails."],
    ["quiz", 2, "Who made the first powered aeroplane flight, in 1903?", ["The Wright brothers", "Thomas Edison", "Henry Ford", "Isaac Newton"], 0, "Orville and Wilbur Wright flew it in America."],
  ],
  books: [
    ["fact", 1, "The Panchatantra is a very old collection of animal stories from India."],
    ["fact", 2, "Lewis Carroll, who wrote Alice's Adventures in Wonderland, also taught maths."],
    ["quiz", 1, "Who won the race in The Tortoise and the Hare?", ["The hare", "The tortoise", "Nobody", "A rabbit"], 1, "Slow and steady, the tortoise won."],
    ["quiz", 2, "What do we call the person who writes a book?", ["Author", "Pilot", "Chef", "Doctor"], 0, "An author writes the words of a book."],
  ],
  food: [
    ["fact", 1, "Bananas grow pointing upwards on the plant."],
    ["fact", 2, "Pots of honey thousands of years old have been found in ancient Egyptian tombs."],
    ["quiz", 1, "Which fruit is called the king of fruits in India?", ["Mango", "Apple", "Banana", "Grapes"], 0, "The mango is India's national fruit too."],
    ["quiz", 2, "Chocolate is made from the beans of which tree?", ["Coffee", "Cacao", "Coconut", "Neem"], 1, "Cacao beans are dried and roasted to make chocolate."],
  ],
  maths: [
    ["fact", 1, "Zero as a number was developed by mathematicians in ancient India."],
    ["fact", 2, "A shape with eight sides is called an octagon."],
    ["quiz", 1, "How many sides does a triangle have?", ["2", "3", "4", "5"], 1, "Tri means three."],
    ["quiz", 2, "What is 7 times 8?", ["54", "56", "58", "64"], 1, "Seven eights are fifty-six."],
  ],
};

function toCard(category: TriviaCategory, entry: Entry, index: number): TriviaCard {
  const [kind, difficulty, text, options, answer, explain] = entry;
  return {
    key: `c:${category}-${index + 1}`,
    kind,
    text,
    ...(kind === "quiz" ? { options: options ?? [], answer: answer ?? 0, ...(explain ? { explain } : {}) } : {}),
    category,
    difficulty,
    language: "en",
  };
}

export const CURATED_CARDS: Readonly<Record<TriviaCategory, readonly TriviaCard[]>> = Object.fromEntries(
  TRIVIA_CATEGORIES.map((category) => [category, CARDS[category].map((entry, index) => toCard(category, entry, index))]),
) as unknown as Record<TriviaCategory, readonly TriviaCard[]>;

const BY_KEY = new Map(Object.values(CURATED_CARDS).flat().map((card) => [card.key, card]));

export function curatedCard(key: string): TriviaCard | null {
  return BY_KEY.get(key) ?? null;
}

function hasPhrase(key: string, phrase: string): boolean {
  return ` ${key} `.includes(` ${phrase} `);
}

/** The built-in category a child's topic belongs to, or null when none covers it. */
export function categoryFor(topicKey: string): TriviaCategory | null {
  const key = topicKey.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
  let best: { category: TriviaCategory; length: number } | null = null;
  for (const category of TRIVIA_CATEGORIES) {
    for (const phrase of [category.replace("_", " "), ...SYNONYMS[category]]) {
      // The longest phrase wins: "world cup cricket" is cricket, not football's "world cup".
      if (hasPhrase(key, phrase) && (!best || phrase.length > best.length)) best = { category, length: phrase.length };
    }
  }
  return best?.category ?? null;
}
