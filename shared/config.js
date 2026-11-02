// Clicky Keys: the game's data and formulas, shared by the client and the server.
// The loop: press giant keys and every press gives Keyboards (and XP: levels raise what a press gives); spend your
// Keyboards building the bridge across the sea, a key at a time; touch the Win Pad on the far side for Wins; Wins buy
// Keypals out of the capsule machines, upgrades at the Workshop, better keyboards and rebirths; rebirths open the
// other worlds.
// Everything is bought with Keyboards, Wins or Gems, all earned in the game. There are no in-app purchases.
export const lookup = (o) => Object.assign(Object.create(null), o);

export const CFG = {
    maxPlayers: 16,
    // moving: walk speed, gravity, the fastest fall, a jump's power
    walk: 24, grav: 110, fallMax: 210, airDash: 46, hopV: 22, power: 62,
    // clicks the server counts: at most this many a second, a few saved for a hiccup in the network
    clickRate: 14, clickBurst: 18,
    // a tap (not walking onto a new key) repeats no faster than this on your screen
    tapGap: 0.07,
    // the server keeps this many bots about the island when it's quiet (one leaves per player who joins)
    bots: 3,
    boostX2Gems: 25, boostX2Mins: 15, boostW2Gems: 40, boostW2Mins: 10,
    spinMins: 7, spinMax: 3,
    // a Win Pad can be touched again after this long
    padSecs: 100,
    // offline: your keyboards keep typing while you're away, at this many clicks a second, for at most this long
    offlineRate: 0.25, offlineHours: 2,
};

// ----- jump power -> height (studs) -----
export const jumpH = (p) => Math.max(0, p) * Math.max(0, p) / 392;
export const jumpV = (p) => Math.sqrt(2 * CFG.grav * jumpH(p));
export const powerFor = (h) => Math.ceil(Math.sqrt(h * 392));

// ----- the keyboards on each world's island: a press on one gives x mult. Some open with Wins, some with rebirths -----
// (sound: which switch they have, client/src/asmr.js)
export const BOARDS = [
    { id: 'office', name: 'Office', mult: 1, wins: 0, reb: 0, sound: 'membrane', cap: [0xe6e9f2, 0xcfd5e4], acc: 0x8a94ac, edge: 0x4a5270, ink: '#2a3048' },
    { id: 'bubble', name: 'Bubblegum', mult: 2, wins: 40, reb: 0, sound: 'pop', cap: [0xff8ad0, 0xffb4e4], acc: 0xff4ab0, edge: 0xb02a80, ink: '#7a0a58' },
    { id: 'mech', name: 'Mechanical', mult: 4, wins: 0, reb: 1, sound: 'thock', cap: [0x4a8aff, 0x8ab8ff], acc: 0xffb02a, edge: 0x1a3a90, ink: '#ffffff' },
    { id: 'type', name: 'Typewriter', mult: 10, wins: 900, reb: 0, sound: 'clack', cap: [0x2a2c34, 0x3c3f4a], acc: 0xd8a848, edge: 0x6a4a1a, ink: '#ffe8b0' },
    { id: 'rgb', name: 'Gamer RGB', mult: 25, wins: 0, reb: 3, sound: 'clicky', cap: [0x1a1c2a, 0x262a3c], acc: 0x3affd8, edge: 0x0a0c18, ink: '#3affd8', rgb: true },
    { id: 'piano', name: 'Grand Piano', mult: 60, wins: 9000, reb: 0, sound: 'piano', cap: [0xffffff, 0x1c1c24], acc: 0x8a1a2a, edge: 0x101018, ink: '#8a1a2a', blank: true },
    { id: 'gold', name: 'Solid Gold', mult: 200, wins: 0, reb: 7, sound: 'gold', cap: [0xffd23a, 0xffe88a], acc: 0xff9a1a, edge: 0x9a6010, ink: '#7a4a00' },
];
// ----- the worlds: an island of keyboards and a chain of bridges out to sea. Later ones: everything bigger -----
export const WORLDS = [
    { id: 'cove', name: 'Clicky Cove', icon: '🏝️', reb: 0, bridges: 20, kb: 1, cost: 1, wins: 1, mood: 'cove', floor: 0x62e04e, floor2: 0x52d440, path: 0xffe9a8, sea: 0x18c8d8, sea2: 0x7af0e8, rim: 0xfff0b8, tree: 'palm' },
    { id: 'arcade', name: 'Neon Arcade', icon: '🕹️', reb: 4, bridges: 20, kb: 30, cost: 30, wins: 5, mood: 'arcade', floor: 0x3a2a78, floor2: 0x30226a, path: 0x5a48a8, sea: 0x120a3a, sea2: 0xc83aff, rim: 0x3affd8, tree: 'neon' },
    { id: 'cosmos', name: 'Cosmic Desk', icon: '🪐', reb: 12, bridges: 20, kb: 900, cost: 900, wins: 25, mood: 'cosmos', floor: 0x2a3a6a, floor2: 0x24325e, path: 0x4a5a9a, sea: 0x060a24, sea2: 0x6a8aff, rim: 0xffd23a, tree: 'crystal' },
    { id: 'candy', name: 'Sugar Switch', icon: '🍭', reb: 18, bridges: 20, kb: 27000, cost: 27000, wins: 110, mood: 'rainbow', floor: 0xffc4e4, floor2: 0xffb0da, path: 0xfff4fa, sea: 0xff7ac0, sea2: 0xfff0a8, rim: 0x5ad8ff, tree: 'lolly' },
    { id: 'lava', name: 'Molten Core', icon: '🌋', reb: 25, bridges: 20, kb: 810000, cost: 810000, wins: 500, mood: 'lava', floor: 0x4a3038, floor2: 0x3e2830, path: 0x7a4a3a, sea: 0xd8300a, sea2: 0xffd23a, rim: 0xff8a1a, tree: 'rock' },
];
// a bridge's price in Keyboards (bridge k of world w, k from 1)
export const bridgeCost = (w, k) => Math.round(40 * Math.pow(2.2, k - 1) * (WORLDS[w] || WORLDS[0]).cost);
// a Win Pad's Wins (the pad after bridge k); the first touch of a run pays x3
export const padWins = (w, k) => Math.round((4 + 3 * k + k * k * 0.7) * (WORLDS[w] || WORLDS[0]).wins);
export const FIRST_CROSS = 3;

// ----- what a press gives -----
// every level adds to your Click Power
export const levelMult = (lv) => 1 + 0.12 * (Math.max(1, lv | 0) - 1);
export const rebirthMult = (r) => 1 + 0.5 * (r || 0);
// XP for the next level (every press gives 1, the Workshop's Fast Learner more)
export const xpNeed = (lv) => Math.round(12 * Math.pow(1.17, Math.max(1, lv)));
export const upLevel = (p, id) => (p.ups && p.ups[id]) || 0;
export const palMult = (p) => { let m = 1; for (const id of p.team || []) { const k = palById[id]; if (k) m += k.mult - 1; } return m; };
// Keyboards for one press on board b of world w, before luck
export function perClick(p, w, b, x2) {
    const B = BOARDS[b] || BOARDS[0], W = WORLDS[w] || WORLDS[0];
    return Math.round(B.mult * W.kb * levelMult(p.lv) * rebirthMult(p.rebirths) * palMult(p) * (1 + 0.2 * upLevel(p, 'power')) * (x2 ? 2 : 1) * 10) / 10;
}
export const walkOf = (p) => CFG.walk * (1 + 0.06 * upLevel(p, 'speed'));
export const luckOf = (p) => { const n = upLevel(p, 'luck'); return n ? 0.015 + 0.012 * n : 0.01; };
export const LUCK_MULT = 10;
export const autoRate = (p) => upLevel(p, 'auto');
export const xpOf = (p) => 1 + upLevel(p, 'learn');
export const teamSize = (p) => 3 + upLevel(p, 'slots');
// how fast a bridge fills: at least a fraction of its price a second, more with the Workshop's Fast Hands
export const fillRate = (p, cost) => cost * (0.35 + 0.15 * upLevel(p, 'fill'));

// ----- the Workshop: upgrades for Wins -----
export const UPGRADES = [
    { id: 'power', name: 'Click Power', icon: '⚡', text: '+20% Keyboards a press', base: 15, grow: 1.7, max: 20, stat: (n) => '+' + n * 20 + '%' },
    { id: 'speed', name: 'Quick Feet', icon: '👟', text: '+6% run speed (more keys a second)', base: 20, grow: 1.8, max: 12, stat: (n) => '+' + n * 6 + '%' },
    { id: 'auto', name: 'Auto Clicker', icon: '🖱️', text: 'Clicks for you, standing on a keyboard', base: 70, grow: 3, max: 6, stat: (n) => n + ' a second' },
    { id: 'fill', name: 'Fast Hands', icon: '🌉', text: 'Bridges fill faster', base: 25, grow: 2, max: 8, stat: (n) => '+' + n * 15 + '%' },
    { id: 'luck', name: 'Lucky Keys', icon: '🍀', text: 'A press may pay x10', base: 40, grow: 2.2, max: 10, stat: (n) => Math.round((n ? 0.015 + 0.012 * n : 0.01) * 1000) / 10 + '%' },
    { id: 'learn', name: 'Fast Learner', icon: '📘', text: '+1 XP a press', base: 60, grow: 2.6, max: 6, stat: (n) => '+' + n + ' XP' },
    { id: 'slots', name: 'Keypal Slots', icon: '🐾', text: '+1 Keypal on your team', base: 250, grow: 6, max: 3, stat: (n) => 3 + n + ' Keypals' },
];
export const upgradeById = lookup(Object.fromEntries(UPGRADES.map((u) => [u.id, u])));
export const upgradeCost = (u, n) => Math.round(u.base * Math.pow(u.grow, n));

// ----- rebirths: back to level 1 with the bridges down, x1.5 and more for good; unlocks keyboards and worlds -----
export const rebirthCost = (r) => Math.round(700 * Math.pow(1.45, r || 0));

// ----- Keypals: little key creatures out of the capsule machines -----
export const RARITIES = lookup({
    common: { name: 'Common', color: '#c8d0dc' }, rare: { name: 'Rare', color: '#3ab4ff' }, epic: { name: 'Epic', color: '#b45aff' },
    legendary: { name: 'Legendary', color: '#ffc42a' }, mythic: { name: 'Mythic', color: '#ff4a8a' },
});
const pal = (id, name, key, color, mult, rarity) => ({ id, name, key, color, mult, rarity });
export const PALS = [
    pal('tappy', 'Tappy', 'A', 0x7ad8ff, 1.15, 'common'), pal('clacky', 'Clacky', 'S', 0xffa86a, 1.2, 'common'), pal('shifty', 'Shifty', 'D', 0x8aff7a, 1.3, 'rare'), pal('tabby', 'Tabby', 'F', 0xffe24a, 1.5, 'epic'),
    pal('escy', 'Escy', 'Q', 0xff7a9a, 1.4, 'common'), pal('alty', 'Alty', 'W', 0xc8a0ff, 1.55, 'common'), pal('ctrly', 'Ctrly', 'E', 0x5affc8, 1.8, 'rare'), pal('enty', 'Enty', 'R', 0xff5ac0, 2.4, 'epic'),
    pal('capsy', 'Capsy', 'Z', 0xffd23a, 2.2, 'common'), pal('numby', 'Numby', 'X', 0x4ac8ff, 2.6, 'rare'), pal('homey', 'Homey', 'C', 0xff8a3a, 3.2, 'epic'), pal('ftwelve', 'F-Twelve', 'V', 0xffffff, 5, 'legendary'),
    pal('glitchy', 'Glitchy', 'G', 0xff3aff, 5, 'common'), pal('pixly', 'Pixly', 'H', 0x3affd8, 6.5, 'rare'), pal('buffy', 'Buffy', 'J', 0xffe02a, 9, 'epic'), pal('rgby', 'RGBy', 'K', 0xff4a6a, 14, 'legendary'),
    pal('zipper', 'Zipper', 'B', 0x5a8aff, 16, 'common'), pal('macro', 'Macro', 'N', 0xb45aff, 22, 'rare'), pal('turbo', 'Turbo', 'M', 0xff6a2a, 32, 'epic'), pal('overclock', 'Overclock', 'L', 0xffffff, 55, 'mythic'),
    pal('moony', 'Moony', '1', 0xd8e0ff, 70, 'common'), pal('comet', 'Comet', '2', 0x8ae8ff, 95, 'rare'), pal('saturny', 'Saturny', '3', 0xffc88a, 140, 'epic'), pal('nova', 'Nova', '4', 0xffe88a, 240, 'legendary'),
    pal('quasar', 'Quasar', '5', 0x8a6aff, 300, 'common'), pal('pulsar', 'Pulsar', '6', 0x4affff, 420, 'rare'), pal('blackkey', 'Black Key', '7', 0x2a2438, 650, 'epic'), pal('bigbang', 'Big Bang', '8', 0xff5a3a, 1200, 'mythic'),
    pal('lolly', 'Lolly', 'P', 0xff8ad0, 1600, 'common'), pal('gummy', 'Gummy', 'O', 0x8aff9a, 2300, 'rare'), pal('fudge', 'Fudge', 'I', 0xa8683a, 3400, 'epic'), pal('sugarking', 'Sugar King', 'U', 0xfff0a8, 6000, 'legendary'),
    pal('sprinkle', 'Sprinkle', 'Y', 0xffb4e4, 8000, 'common'), pal('taffy', 'Taffy', 'T', 0x8ae8ff, 11000, 'rare'), pal('cocoa', 'Cocoa', 'R', 0x7a4a2a, 16000, 'epic'), pal('cavity', 'Mega Cavity', 'E', 0xffffff, 30000, 'mythic'),
    pal('ember', 'Ember', 'W', 0xff8a3a, 40000, 'common'), pal('cinder', 'Cinder', 'Q', 0x8a6a5a, 55000, 'rare'), pal('magma', 'Magma', '9', 0xff5a1a, 80000, 'epic'), pal('obsidian', 'Obsidian', '1', 0x2a2030, 140000, 'legendary'),
    pal('scorch', 'Scorch', '2', 0xffb02a, 190000, 'common'), pal('blaze', 'Blaze', '3', 0xff7a1a, 260000, 'rare'), pal('inferno', 'Inferno', '4', 0xff3a1a, 380000, 'epic'), pal('corekey', 'Core Key', '5', 0xffe24a, 800000, 'mythic'),
];
export const palById = lookup(Object.fromEntries(PALS.map((k) => [k.id, k])));
const eggs = (ids, odds) => ids.map((id, i) => ({ id, w: odds[i] }));
export const CAPSULES = [
    { id: 'c1', name: 'Starter Capsule', wins: 8, world: 0, color: 0x3ab4ff, pals: eggs(['tappy', 'clacky', 'shifty', 'tabby'], [55, 30, 12, 3]) },
    { id: 'c2', name: 'Beach Capsule', wins: 60, world: 0, color: 0xff7a5a, pals: eggs(['escy', 'alty', 'ctrly', 'enty'], [55, 30, 12, 3]) },
    { id: 'c3', name: 'Sunset Capsule', wins: 400, world: 0, color: 0xffb02a, pals: eggs(['capsy', 'numby', 'homey', 'ftwelve'], [60, 28, 11, 1]) },
    { id: 'c4', name: 'Neon Capsule', wins: 1500, world: 1, color: 0xff3aff, pals: eggs(['glitchy', 'pixly', 'buffy', 'rgby'], [60, 28, 11, 1]) },
    { id: 'c5', name: 'Turbo Capsule', wins: 8000, world: 1, color: 0x3affd8, pals: eggs(['zipper', 'macro', 'turbo', 'overclock'], [62, 28, 9.5, 0.5]) },
    { id: 'c6', name: 'Lunar Capsule', wins: 40000, world: 2, color: 0x8ae8ff, pals: eggs(['moony', 'comet', 'saturny', 'nova'], [60, 28, 11, 1]) },
    { id: 'c7', name: 'Quasar Capsule', wins: 220000, world: 2, color: 0x8a6aff, pals: eggs(['quasar', 'pulsar', 'blackkey', 'bigbang'], [62, 28, 9.5, 0.5]) },
    { id: 'c8', name: 'Sugar Capsule', wins: 1000000, world: 3, color: 0xff8ad0, pals: eggs(['lolly', 'gummy', 'fudge', 'sugarking'], [60, 28, 11, 1]) },
    { id: 'c9', name: 'Cocoa Capsule', wins: 5000000, world: 3, color: 0xa8683a, pals: eggs(['sprinkle', 'taffy', 'cocoa', 'cavity'], [62, 28, 9.5, 0.5]) },
    { id: 'c10', name: 'Ember Capsule', wins: 12000000, world: 4, color: 0xff8a3a, pals: eggs(['ember', 'cinder', 'magma', 'obsidian'], [60, 28, 11, 1]) },
    { id: 'c11', name: 'Core Capsule', wins: 60000000, world: 4, color: 0xffe24a, pals: eggs(['scorch', 'blaze', 'inferno', 'corekey'], [62, 28, 9.5, 0.5]) },
];
export const capsuleById = lookup(Object.fromEntries(CAPSULES.map((c) => [c.id, c])));
// every Keypal of a capsule seen: Gems, once
export const INDEX_GEMS = [5, 10, 15, 25, 40, 60, 100, 150, 200, 300, 500];

// ----- the wheel: one spin's prizes (weights) -----
export const SPIN = [
    { w: 22, kb: 1, text: 'Keyboards', color: '#3ab4ff' }, { w: 18, wins: 1, text: 'Wins', color: '#ffd028' }, { w: 14, gems: 5, text: '5 Gems', color: '#b45aff' },
    { w: 12, kb: 3, text: 'Big Keyboards', color: '#2ad8e8' }, { w: 10, wins: 3, text: 'Big Wins', color: '#ff9a1a' }, { w: 10, x2: 10, text: 'x2 Keyboards', color: '#46ec50' },
    { w: 8, gems: 15, text: '15 Gems', color: '#7a4aff' }, { w: 6, wins: 10, text: 'Huge Wins', color: '#ff5a8a' },
];
// a spin's prize grows with what you've reached
export function spinPrize(s, p) {
    const unit = perClick(p, p.world || 0, 0), best = Math.max(1, p.bestBridge || 1);
    return { kb: s.kb ? Math.round(s.kb * 60 * unit) : 0, wins: s.wins ? Math.round(s.wins * (3 + best * best * 0.6) * (WORLDS[p.world || 0] || WORLDS[0]).wins) : 0, gems: s.gems || 0, x2: s.x2 || 0 };
}

// ----- daily tasks -----
export const TASKS = lookup({
    wins: { text: 'Collect Wins', icon: '👑', n: 40, gems: 6, wins: 6 },
    press: { text: 'Press Keys', icon: '⌨️', n: 1500, gems: 5, wins: 4 },
    bridge: { text: 'Build Bridges', icon: '🌉', n: 4, gems: 6, wins: 6 },
    levels: { text: 'Level Up', icon: '⭐', n: 8, gems: 6, wins: 5 },
    hatch: { text: 'Open Capsules', icon: '🥚', n: 4, gems: 5, wins: 4 },
    spins: { text: 'Spin the Wheel', icon: '🎡', n: 2, gems: 5, wins: 3 },
    pads: { text: 'Touch Win Pads', icon: '🏆', n: 6, gems: 5, wins: 6 },
});
const TASK_POOL = ['press', 'bridge', 'levels', 'hatch', 'spins', 'pads'];
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export const dayLeft = (ms) => 86400 - Math.floor(ms / 1000) % 86400;
export function tasksFor(day) {
    let h = 2166136261;
    for (let i = 0; i < day.length; i++) { h ^= day.charCodeAt(i); h = Math.imul(h, 16777619); }
    const r = rngFrom(h >>> 0), pool = TASK_POOL.slice(), out = ['wins'];
    while (out.length < 3) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    return out;
}

// ----- quests: always a next goal (shown at the top of the screen) -----
export const QUESTS = [
    { kind: 'presses', n: 25, text: 'Press 25 keys', gems: 2 },
    { kind: 'bestBridge', n: 1, text: 'Build your first bridge', wins: 3 },
    { kind: 'pads', n: 1, text: 'Touch a Win Pad', gems: 3 },
    { kind: 'hatched', n: 1, text: 'Open a capsule', gems: 3 },
    { kind: 'lv', n: 8, text: 'Reach Level 8', wins: 5 },
    { kind: 'bestBridge', n: 2, text: 'Build Bridge 2', gems: 3 },
    { kind: 'upgrades', n: 1, text: 'Buy a Workshop upgrade', wins: 6 },
    { kind: 'boards', n: 2, text: 'Open the Bubblegum keyboard', gems: 4 },
    { kind: 'presses', n: 500, text: 'Press 500 keys', gems: 5 },
    { kind: 'bestBridge', n: 4, text: 'Build Bridge 4', wins: 15 },
    { kind: 'hatched', n: 5, text: 'Open 5 capsules', gems: 5 },
    { kind: 'auto', n: 1, text: 'Get the Auto Clicker', wins: 20 },
    { kind: 'lv', n: 18, text: 'Reach Level 18', gems: 6 },
    { kind: 'pads', n: 10, text: 'Touch 10 Win Pads', gems: 8 },
    { kind: 'rebirths', n: 1, text: 'Rebirth once', gems: 10 },
    { kind: 'spins', n: 5, text: 'Spin the wheel 5 times', gems: 6 },
    { kind: 'bestBridge', n: 8, text: 'Build Bridge 8', wins: 120 },
    { kind: 'upgrades', n: 10, text: 'Own 10 Workshop upgrades', wins: 150 },
    { kind: 'rebirths', n: 3, text: 'Rebirth 3 times (opens Gamer RGB)', gems: 15 },
    { kind: 'presses', n: 10000, text: 'Press 10,000 keys', gems: 15 },
    { kind: 'rebirths', n: 4, text: 'Rebirth 4 times (opens Neon Arcade)', gems: 25 },
    { kind: 'bestBridge', n: 12, text: 'Clear Stage 12', wins: 2000 },
    { kind: 'hatched', n: 25, text: 'Open 25 capsules', gems: 30 },
    { kind: 'rebirths', n: 12, text: 'Rebirth 12 times (opens Cosmic Desk)', gems: 60 },
    { kind: 'bestBridge', n: 20, text: 'Clear all 20 stages of a world', wins: 20000 },
    { kind: 'hatched', n: 100, text: 'Open 100 capsules', gems: 80 },
    { kind: 'rebirths', n: 18, text: 'Rebirth 18 times (opens Sugar Switch)', gems: 100 },
    { kind: 'rebirths', n: 25, text: 'Rebirth 25 times (opens Molten Core)', gems: 150 },
];

// ----- rewards: the 7-day daily reward, playtime gifts, codes, the Gem shop -----
export const DAILY = [
    { clicks: 300 }, { spins: 2 }, { wins: 15 }, { gems: 10 }, { clicks: 2000 }, { x2: 30 }, { wins: 150, gems: 30 },
];
export function dailyStatus(d, now) {
    const today = dayKey(now), yest = dayKey(now - 86400000);
    if (!d || !d.last) return { can: true, day: 0, streak: 0 };
    if (d.last === today) return { can: false, day: d.streak % 7, streak: d.streak };
    const streak = d.last === yest ? d.streak : 0;
    return { can: true, day: streak % 7, streak };
}
// FREE gifts for playing (minutes into this session). clicks: that many presses' worth of Keyboards
export const GIFTS = [
    { min: 2, clicks: 80 }, { min: 5, wins: 12 }, { min: 9, spins: 1 }, { min: 14, gems: 8 }, { min: 20, wins: 50 }, { min: 30, x2: 15 }, { min: 45, wins: 200, gems: 10 },
];
export const CODES = lookup({
    CLICK: { clicks: 200 }, KEYBOARD: { gems: 5 }, QWERTY: { wins: 15 }, BLOXITY: { spins: 2 }, LEGION: { gems: 5 }, CLACK: { wins: 8, clicks: 100 },
});
export const PACKS = [
    { id: 'p1', gems: 10, wins: 20 }, { id: 'p2', gems: 30, wins: 90 }, { id: 'p3', gems: 80, wins: 320 },
];
// Rewards named in presses become Keyboards at what a press is worth to you now
export const rewardKb = (r, p) => Math.round((r.kb || 0) + (r.clicks || 0) * perClick(p, p.world || 0, 0));
// HTML: a Keyboard and a Win (a crown) are drawn (classes "kc", "wc"), Gems are 💎
export function rewardText(r, plain) {
    return [r.kb ? fmt(r.kb) + (plain ? ' Keyboards' : ' <i class="kc"></i>') : '', r.clicks && !r.kb ? r.clicks + ' presses of Keyboards' : '', r.wins ? fmtComma(r.wins) + (plain ? ' Wins' : ' <i class="wc"></i>') : '', r.gems ? r.gems + ' 💎' : '', r.spins ? r.spins + (r.spins > 1 ? ' spins' : ' spin') : '', r.x2 ? 'x2 Keyboards ' + r.x2 + ' min' : ''].filter(Boolean).join(' + ');
}

export const BOT_NAMES = [
    'ClackAttack', 'QwertyQueen', 'SpaceBarry', 'EnterKey99', 'xXCtrlAltXx', 'ShiftySam', 'TapDancer', 'KeyMasher', 'TypoTim', 'WASDwizard',
    'CapsLockKid', 'F5Frenzy', 'NumPadNia', 'BackspaceBen', 'ThockTheory', 'ModKeyMo', 'DeskGoblin', 'KeebKing', 'ClickyKate', 'TabHoarder',
];

// ----- helpers -----
export function rngFrom(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export function fmt(v) {
    v = Math.floor(v || 0);
    if (v < 1000) return String(v);
    const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
    let i = 0, x = v;
    while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
    return (x >= 100 ? Math.floor(x) : Math.floor(x * 100) / 100) + u[i];
}
export const fmtComma = (v) => { const s = String(Math.floor(v || 0)); return s.length < 4 || /e/.test(s) ? s : s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
export function clock(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
