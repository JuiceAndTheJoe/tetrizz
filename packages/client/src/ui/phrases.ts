// Text data tables. UI-only — kept out of @tetrizz/shared so server doesn't have to ship them.
// Add to these freely; nothing in the game logic indexes by content.

export const CLEAR_PHRASES: Readonly<Record<1 | 2 | 3 | 4, readonly string[]>> = {
  1: ['BUSSIN!', 'no cap', 'goofy ahh', 'OK SIGMA', 'BASED', 'I LIKE YA CUT G', 'very demure', 'no diddy', 'chin up king 👑'],
  2: ['SHEESH', 'GRIDDY!', 'two-piece', 'POGGERS', 'AURA +500', 'HIT OR MISS', 'MATCH MY FREAK', 'canon event', 'very mindful'],
  3: ['MEWING!', 'GIGACHAD', 'REDPILLED', 'jaw locked in', 'AYO THE PIZZA HERE', 'BING CHILLING', 'LOCKED IN', 'BIG 2026 ENERGY', 'CROWN ON 👑'],
  4: ['RIZZ GOD!!', 'TETRIZZ', 'OHIO RIZZ', 'GOATED W/ THE SAUCE', 'KAI CENAT W', 'MORBIN TIME', 'unc said FOUR', 'PUT THE FRIES IN THE BAG', "IT'S COOKED", "NPCs RATIO'D"],
};

export const CHAT_LINES: readonly string[] = [
  "@gigachad420: bro is HIM 😤",
  "@duke_dennis: did you pray today brodie?",
  "@kai_cenat: AYO THE PIZZA HERE 🍕",
  "@livvy_dunne: rizzing up baby gronk fr",
  "@john_pork: i'm here",
  "@grimace_shake: this is goofy ahh gameplay",
  "@ishowspeed: SUIIIII",
  "@npc_steve: skibidi sigma",
  "@mewingmaxxer: gyatt damn 🥶",
  "@ankha_dancer: only in ohio 💀",
  "@blud_dawg: blud really thinks he's carti",
  "@nathaniel_b: lightskin stare engaged",
  "@bing_chilling_69: +99 social credit",
  "@andrew_t8: top G grindset only",
  "@quandale.d: hitting the griddy rn",
  "@looksmaxxer: this is mogging energy",
  "@delulu_queen: it's giving alpha omega",
  "@chungus_69: wholesome 100 keanu reeves",
  "@bababooey: L + ratio + you fell off",
  "@sigmafemale: aura points stacking",
  "@brainrotcore: NO BC HE'S CRASHING OUT",
  "@huggywuggy: garten of banban gameplay",
  "@omar_referee: OFFSIDE bro that was sus",
  "@sin.city: monday left me broken 🥀",
  "@gronk_jr: literally hitting the griddy",
  "@josh.hutch: coffin of andy and leyley",
  "@biggest_bird: PLUH",
  "@mr.beast.fan: 10000 rizz incoming",
  "@momofiveboys: my son is watching this fr",
  "@bro.wat: 'tetrizz' is killing me 💀",
  "@fries_in_bag: PUT THE FRIES IN THE BAG BRO 🍟",
  "@aura_check: you do not have aura",
  "@crashout_core: this is crashout core ngl",
  "@match.my.freak: trying to match my freak",
  "@big_2026: it's giving big 2026 fr",
  "@actuallycooked: it's actually cooked bro",
  "@lockin_szn: bro is SO locked in 🔒",
  "@motion_check: no motion. zero. nada.",
  "@zero_tea: absolute zero tea ☕",
  "@nodiddy_fr: no diddy 🚫",
  "@micro_inf: strictly micro-influencer behavior",
  "@demure.mindful: very demure, very mindful ✨",
  "@chinup.king: chin up king, your crown is slipping 👑",
  "@canon_event: this is a canon event you can't intervene",
  "@absolute.opp: you absolute opp 💀",
  "@standard.npc: standard issue NPC behavior",
];

export const STREAK_LOSS_MSGS: readonly string[] = [
  'streak cooked 😭',
  'aura LOST',
  'crown is slipping 👑',
  'absolute opp 💀',
  'no motion bro',
  'standard issue NPC',
  'canon event ig',
];

export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
