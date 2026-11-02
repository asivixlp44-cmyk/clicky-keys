// A simulated typical first session, for the pacing: when each new thing happens in the first hour.
// A typical player: 5 presses a second on their best keyboard, a few seconds' walk to the bridge and back, spends Wins the
// way the game suggests (a capsule, then upgrades, better keyboards, the next rebirth).
import { CFG, BOARDS, WORLDS, CAPSULES, UPGRADES, palById, bridgeCost, padWins, FIRST_CROSS, rebirthCost, upgradeCost, perClick, xpNeed, xpOf, teamSize, GIFTS, DAILY, walkOf } from '../shared/config.js';

const CLICKS = 5, TRIP = 7;
const p = { lv: 1, xp: 0, rebirths: 0, ups: {}, team: [], kb: 0, wins: 0, world: 0, pals: {} };
let t = 0, n = 0, part = 0, gems = 0, claimed = new Set(), nextPad = new Map(), hatched = 0, opened = new Set([0]);
const log = (s) => console.log(String(Math.floor(t / 60)).padStart(3) + ':' + String(Math.floor(t % 60)).padStart(2, '0') + '  ' + s);
const hasB = (b) => BOARDS[b].reb <= p.rebirths && (!BOARDS[b].wins || opened.has(p.world * 10 + b));
const best = () => { let k = 0; for (let b = 0; b < BOARDS.length; b++) if (hasB(b)) k = b; return k; };
const bought = {};
const gifts = GIFTS.map((g) => ({ ...g, got: false }));
function claimGifts() {
    for (const g of gifts) if (!g.got && t >= g.min * 60) { g.got = true; if (g.wins) { p.wins += g.wins; log('  FREE gift: +' + g.wins + ' Wins'); } if (g.clicks) p.kb += g.clicks * perClick(p, p.world, 0); if (g.gems) gems += g.gems; }
}
function spend() {
    let did = true;
    while (did) {
        did = false;
        const W = WORLDS[p.world];
        // a keyboard you can open
        for (let b = 1; b < BOARDS.length; b++) { const B = BOARDS[b]; if (B.wins && !hasB(b) && B.reb <= p.rebirths && p.wins >= B.wins * W.wins && B.mult > BOARDS[best()].mult) { p.wins -= B.wins * W.wins; opened.add(p.world * 10 + b); log('Keyboard: ' + B.name + ' x' + B.mult * W.kb); did = true; } }
        // the first capsule, then the next capsules while there's room for better ones
        const caps = CAPSULES.filter((c) => c.world === p.world && (hatched < 3 ? c === CAPSULES.find((x) => x.world === p.world) : c.wins <= p.wins * 0.5));
        const c = caps[caps.length - 1];
        const cheap = c && (hatched < 3 || (c.wins < p.wins * 0.12 && (bought[c.id] || 0) < 6));
        if (c && cheap && p.wins >= c.wins && (c.id !== 'c2' || n >= 3) && (c.id !== 'c3' || n >= 7)) {
            p.wins -= c.wins; hatched++; bought[c.id] = (bought[c.id] || 0) + 1;
            let r = Math.random() * c.pals.reduce((a, x) => a + x.w, 0), id = c.pals[0].id;
            for (const x of c.pals) { r -= x.w; if (r < 0) { id = x.id; break; } }
            p.pals[id] = (p.pals[id] || 0) + 1;
            if (p.team.length < teamSize(p)) p.team.push(id); else { let w = 0; p.team.forEach((x, i) => { if (palById[x].mult < palById[p.team[w]].mult) w = i; }); if (palById[id].mult > palById[p.team[w]].mult) p.team[w] = id; }
            if (hatched <= 3 || hatched % 10 === 0) log('Capsule #' + hatched + ': ' + palById[id].name + ' x' + palById[id].mult);
            did = true; continue;
        }
        // upgrades
        const cost = (u) => upgradeCost(u, p.ups[u.id] || 0);
        const rc0 = rebirthCost(p.rebirths), save = p.wins > rc0 * 0.3;
        const up = UPGRADES.filter((u) => (p.ups[u.id] || 0) < u.max && cost(u) <= p.wins * (save ? 0.12 : 0.4)).sort((a, b) => cost(a) - cost(b))[0];
        if (up) { p.wins -= cost(up); p.ups[up.id] = (p.ups[up.id] || 0) + 1; if (p.ups[up.id] <= 2) log('Upgrade: ' + up.name + ' ' + p.ups[up.id]); did = true; continue; }
    }
}
function press(sec) {
    const b = best();
    const speed = walkOf(p) / CFG.walk, clicks = (CLICKS * Math.min(1.6, speed) + (p.ups.auto || 0) * 0.7) * sec;
    const lv0 = p.lv;
    for (let i = 0; i < clicks; i++) {
        p.kb += perClick(p, p.world, b);
        p.xp += xpOf(p);
        while (p.xp >= xpNeed(p.lv)) { p.xp -= xpNeed(p.lv); p.lv++; }
    }
    if (Math.floor(lv0 / 10) !== Math.floor(p.lv / 10)) log('Level ' + p.lv);
    t += sec;
}
const END = (Number(process.argv[2]) || 60) * 60;
let firstBridge = true;
log('start');
while (t < END) {
    claimGifts();
    const W = WORLDS[p.world], k = n + 1;
    // a rebirth when you can afford it (and it's worth it: most of the bridges done or Wins plenty)
    const rc = rebirthCost(p.rebirths);
    if (p.wins >= rc && (n >= 5 || p.wins >= rc * 2)) {
        p.wins -= rc; p.rebirths++; p.lv = 1; p.xp = 0; p.kb = 0; n = 0; part = 0; claimed = new Set();
        log('REBIRTH ' + p.rebirths + ' (cost ' + rc + ')');
        const nw = WORLDS.findIndex((x, i) => i > p.world && x.reb <= p.rebirths);
        if (nw > 0) { p.world = nw; log('WORLD: ' + WORLDS[nw].name); }
        continue;
    }
    if (k <= W.bridges) {
        const cost = bridgeCost(p.world, k), left = cost - part;
        // go when you have enough for it, or now and then to put in what you have
        press(4);
        if (p.kb >= left) {
            p.kb -= left; part = 0; n = k; t += TRIP;
            if (firstBridge || k % 3 === 0) log('Bridge ' + k + ' built (' + cost + ')');
            firstBridge = false;
            const w = Math.round(padWins(p.world, k) * FIRST_CROSS);
            p.wins += w; t += 2;
            if (k <= 2) log('Win Pad: +' + w + ' Wins');
            spend();
            continue;
        }
        // old pads pay again
        for (let j = Math.max(1, n - 1); j <= n; j++) { if ((nextPad.get(p.world + ':' + j) || 0) <= t && j > 0 && Math.random() < 0.02) { nextPad.set(p.world + ':' + j, t + CFG.padSecs); p.wins += padWins(p.world, j); t += 5; } }
        spend();
    } else { press(6); for (let j = Math.max(1, n - 2); j <= n; j++) if ((nextPad.get(p.world + ':' + j) || 0) <= t) { nextPad.set(p.world + ':' + j, t + CFG.padSecs); p.wins += padWins(p.world, j); t += 5; } spend(); }
}
log('end: level ' + p.lv + ', ' + p.rebirths + ' rebirths, bridge ' + n + ', ' + Math.round(p.wins) + ' Wins, ' + hatched + ' capsules, ' + gems + ' Gems earned, click x' + perClick(p, p.world, best()));
void DAILY;
