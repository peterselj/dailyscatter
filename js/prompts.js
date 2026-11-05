// The prompt pool, letters, and how a day's card is chosen.
//
// To add a special card (a birthday, a holiday), add an entry to SPECIAL_CARDS
// keyed by date. Give it exactly 5 prompts; `letter` is optional (if left out,
// the first person to open the app that day rolls one as usual).

export const SPECIAL_CARDS = {
  // '2026-12-25': {
  //   title: 'Merry Christmas!',
  //   prompts: ['Things on a Christmas tree', 'Christmas movies', 'Gifts you would love to get', 'Holiday foods', 'Reindeer names (real or made up)'],
  //   letter: 'S',
  // },
};

// Hard letters are left out on purpose.
export const LETTERS = 'ABCDEFGHIJKLMNOPRSTW'.split('');

export const PROMPTS = [
  // Food & drink
  'A fruit', 'A vegetable', 'Something you put on a sandwich', 'A breakfast food', 'A pizza topping',
  'A dessert', 'A type of cheese', 'A cereal brand', 'A candy bar or candy', 'Something you grill',
  'A soup', 'A spice or herb', 'Something in a salad', 'A snack food', 'A drink you order at a bar',
  'A non-alcoholic drink', 'A food at a ballpark', 'A Thanksgiving dish', 'A type of pasta', 'A food that is crunchy',
  'Something you dip', 'A restaurant chain', 'A food from Italy', 'A food from Mexico', 'A food from China or Japan',
  'Something you bake', 'A flavor of ice cream', 'A kind of nut', 'Something in a picnic basket', 'A food that is sticky',
  'A diner menu item', 'Something you put in coffee or tea', 'A kind of bread', 'A kind of fish or seafood', 'A food you eat with your hands',

  // Animals & nature
  'An animal', 'A bird', 'A dog breed', 'A sea creature', 'An insect or bug',
  'Something at the zoo', 'A farm animal', 'A flower', 'A tree', 'A reptile or amphibian',
  'A famous animal (real or fictional)', 'Something you find in the woods', 'A body of water', 'A mountain or mountain range', 'A type of weather',
  'Something in the night sky', 'Something you find at the beach', 'A pet name', 'An animal sound', 'Something that grows in a garden',
  'A rock, mineral or gem', 'Something that stings or bites', 'A sports team mascot', 'An endangered animal', 'Something with wings',

  // Places
  'A U.S. state', 'A country', 'A city', 'A world capital', 'A vacation spot',
  'A college or university', 'Something in a hospital', 'A street name', 'A famous landmark', 'A place in New York City',
  'A store at the mall', 'A room in a house', 'Something in a classroom', 'A national park', 'An island',
  'Something in an airport', 'A place you would not want to be stuck', 'A place to go on a date', 'A river', 'Somewhere you wait in line',
  'A theme park ride or attraction', 'A place with a gift shop', 'A place you need a ticket for', 'Something in a church or temple', 'A hotel or motel feature',

  // People
  'A famous person', 'A boy\'s name', 'A girl\'s name', 'A baseball player', 'A football player',
  'A basketball player', 'A U.S. president', 'A singer or band', 'An actor or actress', 'A cartoon character',
  'A superhero or villain', 'A famous athlete (any sport)', 'An author', 'A comedian', 'A TV host',
  'A famous chef', 'A royal (real or fictional)', 'A Broadway star', 'A famous scientist or inventor', 'A historical figure',
  'A character in a children\'s book', 'A Disney character', 'A famous couple', 'A villain from a movie', 'A nickname',
  'A job or occupation', 'Someone you might call for help', 'A family relative (aunt, cousin...)', 'Someone famous from New England', 'A famous artist or painter',

  // Entertainment
  'A movie', 'A TV show', 'A song title', 'A Broadway musical', 'A play',
  'A board game', 'A card game', 'A video game', 'A book title', 'A kids\' TV show',
  'A sitcom', 'A game show', 'A musical instrument', 'A dance', 'A genre of music',
  'A movie with a number in the title', 'A Christmas song', 'A love song', 'A magazine or newspaper', 'A podcast or radio show',
  'A cartoon', 'A famous movie quote (first word counts)', 'Something at a circus', 'A theater word', 'Something at a concert',
  'A classic rock song', 'A Beatles song', 'A movie set in space', 'A scary movie', 'An Oscar-winning movie',

  // Sports & games
  'A sport', 'A baseball term', 'A golf term', 'Something used in tennis', 'A team name (any sport)',
  'An Olympic event', 'Something you need to go fishing', 'A football term', 'A playground game', 'Something you find at a gym',
  'A swimming stroke or water activity', 'Exercise equipment', 'Something you yell at a game', 'A hobby', 'A camping item',

  // Around the house
  'Something in the kitchen', 'Something in the bathroom', 'Something in a garage', 'A piece of furniture', 'A household chore',
  'A tool', 'Something you plug in', 'Something in a junk drawer', 'Something in the fridge', 'Something under the bed',
  'Something in a toolbox', 'Something you find in a purse or wallet', 'A cleaning product', 'Something on a desk', 'Something that is soft',
  'Something that is round', 'Something that is red', 'Something that is green', 'Something that is yellow', 'Something that is blue',
  'Something that is cold', 'Something that is hot', 'Something that is loud', 'Something that is sharp', 'Something that is heavy',
  'Something that is tiny', 'Something that smells good', 'Something that smells bad', 'Something that bounces', 'Something that melts',
  'Something with buttons', 'Something with a handle', 'Something with stripes', 'Something with wheels', 'Something with a lid',

  // Clothing & body
  'An article of clothing', 'Something you wear on your head', 'Something you wear on your feet', 'A piece of jewelry', 'A fabric',
  'A part of the body', 'A hairstyle', 'Something you put on your face', 'A brand of clothing or shoes', 'Something you wear to a wedding',
  'Something you wear in winter', 'Something you wear in summer', 'Something in a medicine cabinet', 'A reason to see a doctor', 'A Halloween costume',

  // Getting around & things
  'A car make or model', 'A form of transportation', 'Something on a car', 'Something in a car\'s glove box', 'A boat or ship',
  'A brand name', 'A website or app', 'Something you buy at a hardware store', 'Something you buy at a pharmacy', 'Something sold at a gas station',
  'A gift for a grandparent', 'A gift for a baby', 'A toy', 'Something you collect', 'Something made of wood',
  'Something made of metal', 'Something made of glass', 'Something made of paper', 'Something you can fold', 'Something you can break',

  // Words & ideas
  'A word with double letters', 'A word that rhymes with "cat"', 'An adjective to describe a person', 'A verb (action word)', 'A word that ends in "-ing"',
  'A four-letter word (keep it clean!)', 'A compound word', 'Something you say when you are surprised', 'An excuse for being late', 'A reason to celebrate',
  'A holiday', 'Something you do on vacation', 'Something you do on a rainy day', 'A New Year\'s resolution', 'A bad habit',
  'A good habit', 'Something you are afraid of', 'Something that makes you happy', 'Something you do every morning', 'Something you do before bed',
  'A thing you say to a baby', 'A phrase your mom always says', 'A phrase your dad always says', 'A compliment', 'A way to say hello or goodbye',
  'A school subject', 'Something you learn in school', 'A math word', 'A science word', 'A foreign word',
  'A thing you would bring to a deserted island', 'A superpower you would want', 'Something you can never have too many of', 'Something you would find in a time capsule', 'A thing that is old-fashioned',
  'Something people collect for good luck', 'A wedding tradition', 'A birthday party item', 'Something at a family reunion', 'A summer activity',
  'A winter activity', 'A fall thing', 'A spring thing', 'A reason to call your mother', 'Something you lose all the time',
  'Something you would find in grandma\'s house', 'A thing a dog might chew', 'Something you might find in a backpack', 'A thing you yell', 'Something you can\'t live without',

  // Grab bag
  'A famous pair (salt and ...)', 'Something in a parade', 'A thing at a carnival or fair', 'Something you find in a barn', 'Something at a wedding reception',
  'Something you do at a party', 'A type of shoe', 'Something you would see on a farm', 'A thing that runs on batteries', 'A word that describes the weather',
  'Something in a first aid kit', 'A famous horse or dog', 'Something you might hear at the theater', 'A souvenir', 'A sound a car makes',
  'Something you sit on', 'Something you find in the attic', 'A thing you plant', 'A type of hat', 'A kind of dance party song',
  'Something sweet that is not candy', 'A thing you would see at a drive-in', 'A thing you take on a road trip', 'Something with a tail', 'A food that is orange',
];

// Small, fast, deterministic random number generator (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function shuffled(list, seed) {
  const r = rng(hash(seed));
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The 5 prompts for a day. Shuffled per week, so no prompt repeats within a week.
export function promptsFor(dayId, weekId, weekdayIdx) {
  const special = SPECIAL_CARDS[dayId];
  if (special?.prompts?.length === 5) return special.prompts.slice();
  const deck = shuffled(PROMPTS, `week:${weekId}`);
  return deck.slice(weekdayIdx * 5, weekdayIdx * 5 + 5);
}

// Pick a random letter that hasn't been used yet this week.
export function rollLetter(usedThisWeek = [], random = Math.random) {
  const pool = LETTERS.filter((l) => !usedThisWeek.includes(l));
  const from = pool.length ? pool : LETTERS;
  return from[Math.floor(random() * from.length)];
}
