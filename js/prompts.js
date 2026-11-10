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

// What makes a good category: lots of possible answers for any letter, quick to
// read, and room for a funny or debatable answer. Nothing that needs special
// knowledge (one sport, one band, one cuisine) or fights the letter (rhymes,
// word endings). Many are classics from the board game and popular fan lists.
export const PROMPTS = [
  // Food & drink
  'A fruit', 'A vegetable', 'Something you put on a sandwich', 'A breakfast food', 'A pizza topping',
  'A dessert', 'A type of cheese', 'A cereal', 'A candy', 'Something you grill',
  'A soup', 'A spice or herb', 'Something in a salad', 'A snack food', 'A drink you order at a bar',
  'A non-alcoholic drink', 'A food at a ballpark', 'A Thanksgiving dish', 'A pasta or noodle dish', 'A crunchy food',
  'Something you dip', 'A restaurant', 'A sandwich', 'Something you bake', 'A flavor of ice cream',
  'A junk food', 'Something in a picnic basket', 'A sticky food', 'A diner menu item', 'A bread or pastry',
  'A fish or seafood', 'A food you eat with your hands', 'A spicy food', 'A food you eat raw', 'A beer, wine or cocktail',
  'A food you hated as a kid', 'Something in the fridge', 'A condiment or sauce', 'A comfort food', 'Something on a kids\' menu',
  'A food that goes bad fast', 'Something you would never eat', 'A food that is green',

  // Animals & nature
  'An animal', 'A bird', 'A dog breed', 'A sea creature', 'An insect or bug',
  'Something at the zoo', 'A farm animal', 'A flower or plant', 'A tree', 'A reptile or amphibian',
  'A famous animal (real or fictional)', 'Something you find in the woods', 'A body of water', 'A type of weather', 'Something in the sky',
  'Something you find at the beach', 'A name for a pet', 'Something that grows', 'A rock, mineral or gem', 'Something that stings or bites',
  'Something with wings', 'Something with a tail', 'Something with spots or stripes', 'An animal you would not want as a pet', 'Something in outer space',
  'Something found in the ocean', 'A natural disaster',

  // Places
  'A U.S. state', 'A country', 'A U.S. city', 'A world capital', 'A vacation spot',
  'A college or university', 'Something in a hospital', 'A street name', 'A tourist attraction', 'A store',
  'A room or part of a house', 'Something in a classroom', 'An island', 'Something in an airport', 'A place you would not want to be stuck',
  'A place to go on a date', 'Somewhere you wait in line', 'Something at an amusement park', 'A place you need a ticket for', 'Something in a hotel',
  'A foreign city', 'A place in Europe', 'Something on a map', 'A place to hide', 'A place kids love',
  'Something in a park', 'A place that is always crowded', 'A place to be alone', 'Something in an office', 'Something at a gas station',

  // People
  'A famous person', 'A boy\'s name', 'A girl\'s name', 'A baseball player', 'A football player',
  'A basketball player', 'A president or politician', 'A singer', 'A band or musical group', 'An actor or actress',
  'A cartoon character', 'A superhero', 'A villain or monster', 'A famous athlete (any sport)', 'An author',
  'A comedian', 'A TV star', 'A historical figure', 'A character in a children\'s book', 'A Disney character',
  'A famous duo or trio', 'A fictional character', 'A nickname', 'A job or occupation', 'Someone you might call for help',
  'A relative (aunt, cousin...)', 'Someone in uniform', 'A title people can have (Dr., Captain...)', 'A notorious person', 'A name from the Bible',
  'A term of endearment', 'A personality trait', 'A bad job to have', 'A world leader', 'A famous artist or musician',
  'Someone you would invite to dinner', 'A name that is out of style',

  // Entertainment
  'A movie', 'A TV show', 'A song title', 'A Broadway musical or play', 'A board game',
  'A card game', 'A video game', 'A book title', 'A kids\' TV show', 'A sitcom',
  'A game show', 'A musical instrument', 'A dance', 'A kind of music', 'A magazine or newspaper',
  'A cartoon', 'Something at a circus or carnival', 'Something at a concert', 'A scary movie', 'A children\'s book',
  'A reality TV show', 'A movie you have seen more than twice', 'A song everybody knows', 'A toy', 'A game kids play',
  'A hobby', 'A website or app', 'A holiday', 'A movie star', 'An award or awards show',

  // Sports & outdoors
  'A sport', 'A team name (any sport)', 'An Olympic event', 'Something you need to go fishing', 'Sports equipment',
  'Something at a gym', 'Something you yell at a game', 'Something you take camping', 'A summer activity', 'A winter activity',
  'A weekend activity', 'Something at a football game', 'A word about exercise', 'Something you do at the beach', 'Something on a hiking trail',

  // Around the house
  'Something in the kitchen', 'Something in the bathroom', 'Something in a garage', 'A piece of furniture', 'A household chore',
  'A tool', 'Something you plug in', 'Something in a junk drawer', 'Something under the bed', 'Something in a purse or wallet',
  'A cleaning product', 'Something on a desk', 'An appliance', 'Something you throw away', 'Something you replace',
  'Something you store things in', 'Something in the attic or basement', 'Something in a medicine cabinet', 'Something in a suitcase', 'Something in a backpack',
  'Something in a vending machine', 'Something that comes in the mail', 'Something you keep in your car', 'Something that uses a remote', 'Something that needs batteries',
  'An electronic gadget', 'Something in this room', 'Something you sit on', 'Something you hang on a wall', 'A school supply',
  'Something in a grocery store', 'Something from a hardware store', 'Something from a pharmacy', 'Something in a souvenir shop', 'Something you order online',

  // Things that are...
  'Something soft', 'Something round', 'Something red', 'Something green', 'Something yellow',
  'Something blue', 'Something black', 'Something cold', 'Something hot', 'Something loud',
  'Something sharp', 'Something heavy', 'Something tiny', 'Something that smells good', 'Something that smells bad',
  'Something that bounces or jumps', 'Something that melts', 'Something with buttons', 'Something with a handle', 'Something with wheels',
  'Something with a lid', 'Something square', 'Something sticky', 'Something that flies', 'Something that floats',
  'Something that breaks easily', 'Something you fold', 'Something made of wood', 'Something made of metal', 'Something made of glass',
  'Something made of paper', 'Something that comes in pairs', 'Something that spins', 'Something that makes noise', 'Something that glows',

  // Clothing & body
  'An article of clothing', 'Something you wear on your head', 'Footwear', 'A piece of jewelry', 'A fabric or material',
  'A part of the body', 'A hairstyle', 'Something you put on your face', 'A brand of clothing or shoes', 'Something you wear to a wedding',
  'Something you wear in winter', 'Something you wear at the beach', 'A reason to see a doctor', 'A Halloween costume', 'A cosmetic or toiletry',
  'Something you are allergic to', 'An illness or injury',

  // Getting around & stuff you buy
  'A car', 'A way to get from here to there', 'A part of a car', 'Something with an engine', 'A brand name',
  'A company', 'Something you save up to buy', 'A gift for a grandparent', 'A gift for a kid', 'Something you collect',
  'Something advertised on TV', 'Something that costs too much', 'Something you get for free', 'Something you regret buying', 'Something you rent or borrow',

  // Everyday life
  'An excuse for being late', 'A reason to celebrate', 'Something you do on vacation', 'Something you do on a rainy day', 'A bad habit',
  'A good habit', 'Something you are afraid of', 'Something that makes you smile', 'Something you do every morning', 'Something you do before bed',
  'A compliment', 'A way to say hello or goodbye', 'A school subject', 'Something to bring to a deserted island', 'A superpower',
  'Something you can never have too many of', 'Something old-fashioned', 'Something at a wedding', 'Something at a birthday party', 'Something at a family reunion',
  'Something you lose all the time', 'Something in grandma\'s house', 'Something a dog would chew', 'Something you shout', 'Something you can\'t live without',
  'A New Year\'s resolution', 'Something you do at work', 'Something you do on a date', 'Something you do at a party', 'Something you bring to a party',
  'A reason to make a phone call', 'Something you forget', 'Something you make', 'Something you wish you were good at', 'Something that takes forever',

  // Trouble & opinions
  'A reason to quit your job', 'Something you shouldn\'t touch', 'Something you hide', 'A crime', 'A weapon',
  'Something that can kill you', 'A reason to call 911', 'A reason to stay home', 'Something kids get in trouble for', 'Something that keeps you up at night',
  'Something you should not say to your boss', 'Something that annoys you', 'Something parents always say', 'A lie people tell', 'A sign you are getting old',
  'Something that gets better with age', 'Something you do when nobody is watching', 'Something you whisper', 'A reason to throw a party', 'Something you would wish for',

  // Words
  'A word to describe your family', 'An adjective to describe a person', 'A verb', 'A four-letter word', 'Something you say when you are surprised',
  'A word about money', 'A color', 'A language', 'An acronym or abbreviation', 'A sound or noise',
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

// The 5 prompts for a day. The whole list is shuffled once per "cycle" of
// several weeks and dealt out 35 a week, so no prompt repeats within a cycle
// (9 weeks with ~350 prompts). Weeks before CYCLES_START used a per-week shuffle.
const CYCLES_START = '2026-11-16'; // a Monday
const PER_WEEK = 35;

export function promptsFor(dayId, weekId, weekdayIdx) {
  const special = SPECIAL_CARDS[dayId];
  if (special?.prompts?.length === 5) return special.prompts.slice();
  if (weekId < CYCLES_START) {
    const deck = shuffled(PROMPTS, `week:${weekId}`);
    return deck.slice(weekdayIdx * 5, weekdayIdx * 5 + 5);
  }
  const weekNo = Math.round((Date.parse(`${weekId}T12:00:00Z`) - Date.parse(`${CYCLES_START}T12:00:00Z`)) / (7 * 86400e3));
  const weeksPerCycle = Math.max(1, Math.floor(PROMPTS.length / PER_WEEK));
  const deck = shuffled(PROMPTS, `cycle:${Math.floor(weekNo / weeksPerCycle)}`);
  const start = (weekNo % weeksPerCycle) * PER_WEEK + weekdayIdx * 5;
  return deck.slice(start, start + 5);
}

// Safety net for when the list is edited mid-week: swap out any prompt that was
// already played this week for one that wasn't. Same result on every phone.
export function swapRepeats(prompts, usedThisWeek, seed) {
  const used = new Set(usedThisWeek);
  if (!prompts.some((p) => used.has(p))) return prompts;
  const spares = shuffled(PROMPTS, `spare:${seed}`).filter((p) => !used.has(p) && !prompts.includes(p));
  return prompts.map((p) => (used.has(p) && spares.length ? spares.shift() : p));
}

// Pick a random letter that hasn't been used yet this week.
export function rollLetter(usedThisWeek = [], random = Math.random) {
  const pool = LETTERS.filter((l) => !usedThisWeek.includes(l));
  const from = pool.length ? pool : LETTERS;
  return from[Math.floor(random() * from.length)];
}
