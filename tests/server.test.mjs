// The whole loop and its guards, headless: starts its own server (QA=1, a temporary data folder) and plays it over the
// network as real clients do. Run: npm --prefix tests run server
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@colyseus/sdk';
import { levelMult, bridgeCost, padWins, FIRST_CROSS, rebirthCost, CFG, UPGRADES, upgradeCost, CAPSULES, BOARDS, CODES, QUESTS } from '../shared/config.js';
import { BOARD_SPOTS, BOARD_KEYS, W, spanStart, isleMid, capsulesOf } from '../shared/world.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 2973, URL_ = 'http://localhost:' + PORT;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-test-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(cond, what) { if (cond) { pass++; console.log('  ok  ' + what); } else { fail++; console.log('FAIL  ' + what); } }
const near = (a, b, e) => Math.abs(a - b) <= (e ?? 0.2);

class Bot {
    constructor(name) { this.name = name; this.msgs = {}; this.p = {}; this.x = 0; this.z = W.spawn.z; this.y = 0; this.seq = 0; this.snaps = 0; }
    async join(extra) {
        const c = new Client(URL_);
        this.room = await c.joinOrCreate('keys', { uid: 'test_' + this.name, name: this.name, ...(extra || {}) });
        const R = this.room;
        for (const t of ['hello', 'pong', 'toast', 'broke', 'code', 'boards', 'reward', 'levelup', 'lucky', 'bridge', 'padok', 'warped', 'reborn', 'warp', 'spun', 'bought', 'hatched', 'taskdone', 'questdone', 'offline', 'toastreward', 'authed', 'emote', 'chat']) R.onMessage(t, (m) => { (this.msgs[t] || (this.msgs[t] = [])).push(m); });
        R.onMessage('profile', (m) => { Object.assign(this.p, m); this.profiles = (this.profiles || 0) + 1; });
        R.onMessage('lite', (m) => { Object.assign(this.p, m); const o = this.p.spans[this.p.world] || (this.p.spans[this.p.world] = {}); o.n = m.n; o.part = m.part; });
        R.onMessage('snap', (m) => { this.snaps++; this.x = m.x; this.y = m.y; this.z = m.z; });
        await this.wait(() => this.p.now);
        const me = R.state.players.get(R.sessionId);
        this.x = me.x; this.z = me.z;
        return this;
    }
    send(t, m) { this.room.send(t, m || {}); }
    async wait(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms ?? 5000)) { const v = fn(); if (v) return v; await sleep(15); } return null; }
    got(t) { return (this.msgs[t] || []).length; }
    last(t) { const l = this.msgs[t]; return l && l[l.length - 1]; }
    clear(t) { this.msgs[t] = []; }
    move(x, y, z, ts) { this.x = x; this.y = y; this.z = z; this.send('move', { x, y, z, ry: 0, a: 1, ts: ts ?? Date.now() }); }
    // walks there at a legal speed
    async walkTo(x, z) {
        const step = 1.2;
        for (;;) {
            const dx = x - this.x, dz = z - this.z, d = Math.hypot(dx, dz);
            if (d < step) { this.move(x, 0, z); await sleep(45); return; }
            this.move(this.x + dx / d * step, 0, this.z + dz / d * step);
            await sleep(45);
        }
    }
    // a QA teleport: next move is checked from there
    async tp(x, z) { this.send('qa', { tp: [x, 0, z] }); this.x = x; this.z = z; this.y = 0; await sleep(40); this.move(x, 0, z); await sleep(40); }
    press(b, k) { this.send('press', { b, k, s: ++this.seq }); }
    me() { return this.room.state.players.get(this.room.sessionId); }
    leave() { return this.room.leave(); }
}

const srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(ROOT, 'server'), env: { ...process.env, PORT: String(PORT), QA: '1', DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(d); });
srv.stderr.on('data', (d) => process.stderr.write(d));
const up = async () => { for (let i = 0; i < 80; i++) { try { const r = await fetch(URL_ + '/health'); if (r.ok) return true; } catch (e) { /* not yet */ } await sleep(150); } return false; };

async function main() {
    ok(await up(), 'the server comes up on its port');
    // ----- a new player -----
    console.log('\n--- a new player');
    const a = await new Bot('alice').join();
    ok(a.p.kb === 0 && a.p.wins === 0 && a.p.lv === 1, 'starts with nothing, at level 1');
    ok(a.p.spins === 1, 'with a free spin');
    a.send('ping', { c: Date.now() });
    await a.wait(() => a.got('pong'));
    ok(a.got('hello') === 1 && a.got('pong') === 1 && Math.abs(a.last('pong').s - Date.now()) < 3000, 'hello and ping give the server clock');
    await sleep(120);
    let bots = 0;
    a.room.state.players.forEach((p) => { if (p.bot) bots++; });
    ok(bots === CFG.bots - 1, 'bots about the island: ' + bots + ' (' + CFG.bots + ' minus each player)');
    ok(a.p.jq && a.p.jq.list.length === 3, 'three daily tasks');

    // ----- pressing -----
    console.log('\n--- pressing keys');
    a.press(0, 0);
    await sleep(120);
    ok(a.p.presses === 0, 'a key out of reach counts for nothing');
    await a.tp(0, 30);
    const sp = BOARD_SPOTS[0];
    const near0 = BOARD_KEYS.findIndex((k) => Math.hypot(sp.x + k.x, sp.z + k.z - 30) < 4);
    a.press(0, near0);
    await a.wait(() => a.p.presses === 1, 800);
    ok(a.p.presses === 1 && (near(a.p.kb, 1) || near(a.p.kb, 10)), 'a key under your feet: +1 Keyboard (x10 if it was a lucky one)');
    ok(a.p.ack === a.seq, 'the answer says which press it covers (the counter stays right over 400 ms)');
    a.press(1, near0);
    await sleep(100);
    ok(a.p.presses === 1, 'a key of a locked keyboard counts for nothing');
    const k0 = a.p.presses;
    for (let i = 0; i < 60; i++) a.press(0, near0);
    await sleep(350);
    ok(a.p.presses - k0 <= CFG.clickBurst + 8, 'a burst of 60 presses counts only ' + (a.p.presses - k0));
    ok(a.p.lv > 1, 'presses give XP and levels: level ' + a.p.lv);
    const lv = a.p.lv;
    await sleep(800);
    const before = a.p.kb;
    a.press(0, near0);
    await a.wait(() => a.p.kb > before, 800);
    ok(a.p.kb - before >= levelMult(lv) - 0.1, 'a higher level gives more a press: +' + (a.p.kb - before).toFixed(1));

    await sleep(350);
    ok(a.p.qi === 0 && a.p.qv === a.p.presses && a.p.qv > 0, 'the first quest counts your presses: ' + a.p.qv + ' / ' + QUESTS[0].n);
    // ----- moving -----
    console.log('\n--- the move guard');
    await sleep(200);
    let s0 = a.snaps;
    a.move(a.x + 300, 0, a.z);
    await a.wait(() => a.snaps > s0, 800);
    ok(a.snaps > s0, 'moving far too far: snapped back');
    await sleep(350); s0 = a.snaps;
    a.move(a.x, 40, a.z);
    await a.wait(() => a.snaps > s0, 800);
    ok(a.snaps > s0, 'jumping far too high: snapped back');
    await sleep(350); s0 = a.snaps;
    for (let i = 0; i < 40 && a.snaps === s0; i++) { a.move(a.x + 5, 0, a.z); await sleep(50); }
    ok(a.snaps > s0, 'a speed hack (100 studs a second): snapped back');
    await a.tp(0, W.island.z0 + 2);
    await sleep(350); s0 = a.snaps;
    a.move(0, 0, spanStart(1) - 12);
    await a.wait(() => a.snaps > s0, 800);
    ok(a.snaps > s0, 'onto a bridge not built yet: snapped back');

    // ----- a bridge -----
    console.log('\n--- building a bridge');
    const cost1 = bridgeCost(0, 1);
    await a.tp(0, 20);
    await sleep(350);
    const kb0 = a.p.kb;
    a.send('qa', { kb: cost1 - kb0 + 1 });
    await a.wait(() => a.p.kb >= cost1, 800);
    await sleep(600);
    ok(a.p.spans[0] === undefined || a.p.spans[0].n === 0, 'away from it: no bridge');
    const part0 = (a.p.spans[0] && a.p.spans[0].part) || 0;
    await a.tp(4, spanStart(1) + 3);
    const br = await a.wait(() => a.last('bridge'), 8000);
    ok(br && br.k === 1, 'standing at its head, your Keyboards build it');
    await sleep(350);
    ok(a.p.kb < 2 + part0, 'and they\'re spent: ' + a.p.kb + ' left');
    s0 = a.snaps;
    // a pad not reached, then the pad
    a.send('pad', { k: 1 });
    await sleep(120);
    ok(!a.got('padok'), 'the Win Pad from the wrong spot: nothing');
    a.send('pad', { k: 2 });
    await sleep(80);
    ok(!a.got('padok'), 'a Win Pad past your bridges: nothing');
    await a.walkTo(0, spanStart(1) - 8);
    ok(a.snaps === s0, 'across the bridge you built: no snap');
    await a.tp(0, isleMid(1));
    const w0 = a.p.wins;
    a.send('pad', { k: 1 });
    const pk = await a.wait(() => a.last('padok'), 1000);
    ok(pk && pk.n === padWins(0, 1) * FIRST_CROSS && pk.first, 'the Win Pad, the first time this run: x' + FIRST_CROSS + ' = ' + (pk && pk.n) + ' Wins');
    await a.wait(() => a.p.wins > w0, 800);
    ok(a.p.wins === w0 + pk.n && a.p.pads === 1, 'the Wins arrive');
    ok(!!pk.home, 'out of Keyboards for the next bridge: sent back to the keys');
    a.x = pk.home.x; a.z = pk.home.z; a.y = 0;
    a.move(a.x, 0, a.z);
    await sleep(60);
    a.clear('padok');
    await a.tp(0, isleMid(1));
    a.send('pad', { k: 1 });
    await sleep(150);
    ok(!a.got('padok'), 'touching it again at once: nothing (it needs ' + CFG.padSecs + ' s)');
    // part way: what's gone in stays
    const cost2 = bridgeCost(0, 2);
    await a.tp(0, spanStart(2) + 12);
    a.send('qa', { kb: Math.floor(cost2 / 2) });
    await sleep(200);
    await a.tp(0, spanStart(2) + 3);
    await a.wait(() => a.p.spans[0].part > cost2 / 2 - 3, 6000);
    ok(a.p.spans[0].part > cost2 / 2 - 3 && a.p.spans[0].n === 1, 'half the Keyboards: half the next bridge, and it stays: ' + a.p.spans[0].part);

    // ----- spending -----
    console.log('\n--- the Workshop, keyboards, capsules');
    await a.tp(0, 20);
    a.clear('broke');
    const expensive = UPGRADES.find((u) => u.id === 'slots');
    a.send('upgrade', { id: expensive.id });
    await a.wait(() => a.got('broke'), 500);
    ok(a.got('broke'), 'an upgrade without the Wins: refused');
    a.send('qa', { wins: 5000 });
    await a.wait(() => a.p.wins >= 5000, 800);
    const uw = a.p.wins;
    a.send('upgrade', { id: 'power' });
    await a.wait(() => a.p.ups.power === 1, 800);
    ok(a.p.ups.power === 1 && a.p.wins === uw - upgradeCost(UPGRADES[0], 0), 'an upgrade costs its Wins');
    const pc0 = a.p.kb;
    a.press(0, near0);
    await a.wait(() => a.p.kb > pc0, 800);
    ok((a.p.kb - pc0) > 1.2, 'Click Power makes a press worth more: +' + (a.p.kb - pc0).toFixed(1));
    a.send('upgrade', { id: 'nonsense' });
    a.send('unlock', { b: 2 });
    await sleep(100);
    ok(!((a.p.boardsOpen[0] || 0) & 4), 'a keyboard opened only by rebirths can\'t be bought');
    a.send('unlock', { b: 1 });
    await a.wait(() => (a.p.boardsOpen[0] || 0) & 2, 800);
    ok((a.p.boardsOpen[0] || 0) & 2, 'the Bubblegum keyboard opens with Wins');
    await a.tp(BOARD_SPOTS[1].x, BOARD_SPOTS[1].z);
    const b1k = BOARD_KEYS.findIndex((k) => Math.hypot(k.x, k.z) < 4);
    const pc1 = a.p.kb;
    a.press(1, b1k);
    await a.wait(() => a.p.kb > pc1, 800);
    ok(a.p.kb - pc1 >= 2, 'a press on it is worth x2 and more: +' + (a.p.kb - pc1).toFixed(1));
    const c1 = capsulesOf(0)[0];
    a.send('hatch', { c: 'c1', n: 1 });
    await sleep(120);
    ok(!a.got('hatched'), 'a capsule from across the island: nothing');
    await a.tp(c1.x, c1.z + 8);
    const hw = a.p.wins;
    a.send('hatch', { c: 'c1', n: 3 });
    const ha = await a.wait(() => a.last('hatched'), 800);
    ok(ha && ha.out.length === 3 && a.p.team.length >= 1, 'three capsules: three Keypals, on your team');
    await a.wait(() => a.p.wins < hw, 500);
    ok(a.p.wins === hw - CAPSULES[0].wins * 3, 'they cost their Wins');
    await sleep(120);
    ok(a.me().team.length > 0, 'everyone can see your team');
    const c3 = CAPSULES[2];
    a.send('hatch', { c: c3.id, n: 1 });
    await sleep(120);
    ok(a.p.hatched === 3, 'a machine further out, from here: nothing');
    a.send('equip', { id: a.p.team[0], off: 1 });
    const tn = a.p.team.length;
    await a.wait(() => a.p.team.length === tn - 1, 500);
    ok(a.p.team.length === tn - 1, 'take a Keypal off the team');
    a.send('equip', { id: 'nova' });
    await sleep(80);
    ok(!a.p.team.includes('nova'), 'a Keypal you don\'t own can\'t go on');
    a.send('equipbest', {});
    await sleep(80);

    // ----- the wheel, rewards -----
    console.log('\n--- the wheel, rewards');
    a.send('spin', {});
    const sn = await a.wait(() => a.last('spun'), 800);
    ok(sn && a.p.spins === 0, 'the wheel: a spin used');
    a.clear('spun');
    a.send('spin', {});
    await sleep(100);
    ok(!a.got('spun'), 'no spins left: no prize');
    const g0 = a.p.gems;
    a.send('code', { code: Object.keys(CODES)[1] });
    await a.wait(() => a.last('code'), 500);
    ok(a.last('code').ok && a.p.gems > g0 - 1, 'a code');
    a.send('code', { code: Object.keys(CODES)[1] });
    await sleep(100);
    ok(!a.last('code').ok, 'once only');
    a.send('code', { code: 'NOPE' });
    await sleep(100);
    ok(!a.last('code').ok, 'a wrong one: nothing');
    a.send('daily', {});
    await a.wait(() => a.p.daily.last, 500);
    const ks = a.p.kb;
    a.send('daily', {});
    await sleep(120);
    ok(a.p.daily.streak === 1 && near(a.p.kb, ks, 0.1), 'the daily reward, once a day');
    a.send('gift', { i: 0 });
    await sleep(100);
    ok(!a.p.gifts[0], 'a gift before its time: nothing');
    a.send('qa', { playSecs: 121 });
    await sleep(60);
    a.send('gift', { i: 0 });
    await a.wait(() => a.p.gifts[0], 500);
    ok(a.p.gifts[0], 'a gift at its time');
    // (the wheel may have given some x2 already: what matters is that this buys none)
    a.send('qa', { gems: -a.p.gems });
    await a.wait(() => a.p.gems === 0, 500);
    a.clear('broke');
    const x20 = a.p.x2Until;
    a.send('x2', {});
    await a.wait(() => a.got('broke'), 500);
    ok(a.got('broke') === 1 && a.p.x2Until === x20, 'x2 without the Gems: refused');
    a.send('qa', { gems: 500 });
    await a.wait(() => a.p.gems >= 500, 500);
    a.send('x2', {});
    await a.wait(() => a.p.x2Until > Date.now(), 500);
    ok(a.p.x2Until > Date.now(), 'x2 Keyboards with Gems');
    // every quest in the chain reads a real number
    for (let i = 0; i < QUESTS.length; i++) {
        a.send('qa', { qi: i });
        await a.wait(() => a.p.qi === i, 500);
        if (typeof a.p.qv !== 'number' || Number.isNaN(a.p.qv)) ok(false, 'quest ' + i + ' reads a number');
        const v = { presses: a.p.presses, bestBridge: a.p.bestBridge, pads: a.p.pads, hatched: a.p.hatched, lv: a.p.lv, upgrades: a.p.upgrades, rebirths: a.p.rebirths, spins: a.p.spinsUsed }[QUESTS[i].kind];
        if (v !== undefined && v !== a.p.qv) ok(false, 'quest ' + i + ' (' + QUESTS[i].kind + ') shows ' + a.p.qv + ', the value is ' + v);
    }
    ok(true, 'all ' + QUESTS.length + ' quests read the right number');
    a.send('qa', { qi: 1 });
    await a.wait(() => a.p.qi === 1, 500);
    const qi0 = a.p.qi;
    a.send('qclaim', {});
    await a.wait(() => a.p.qi === qi0 + 1, 500);
    ok(a.p.qi === qi0 + 1, 'a quest done is claimed: ' + QUESTS[qi0].text);
    a.send('qa', { tasks: 1 });
    await sleep(60);
    a.send('tclaim', { i: 0 });
    await a.wait(() => a.p.jq.list[0].c, 500);
    const gt = a.p.wins;
    a.send('tclaim', { i: 0 });
    await sleep(100);
    ok(a.p.jq.list[0].c && a.p.wins === gt, 'a daily task claimed once');
    a.send('qa', { bridges: 5 });
    await sleep(60);

    // ----- warps, rebirth, worlds -----
    console.log('\n--- quick ways round, rebirth, worlds');
    a.clear('warped');
    a.send('warp', { to: 'bridge' });
    const wb = await a.wait(() => a.last('warped'), 500);
    ok(wb && Math.abs(wb.z - spanStart(6)) < 8, 'to the next bridge');
    a.x = wb.x; a.z = wb.z; a.move(a.x, 0, a.z);
    await sleep(760);
    a.send('warp', { to: 'board' });
    const wk = await a.wait(() => (a.msgs.warped.length > 1 ? a.last('warped') : null), 500);
    ok(wk && Math.abs(wk.z - BOARD_SPOTS[1].z) < 16, 'to your best keyboard');
    a.x = wk.x; a.z = wk.z; a.move(a.x, 0, a.z);
    await sleep(60);
    a.send('world', { w: 1 });
    await sleep(100);
    ok(a.p.world === 0, 'a world before its rebirths: no');
    a.send('qa', { wins: -a.p.wins });
    await a.wait(() => a.p.wins === 0, 500);
    a.clear('broke');
    a.send('rebirth', {});
    await a.wait(() => a.got('broke'), 500);
    ok(a.got('broke') && a.p.rebirths === 0, 'rebirth without the Wins: refused');
    const rc = rebirthCost(0);
    a.send('qa', { wins: rc + 3, kb: 500 });
    await a.wait(() => a.p.wins >= rc, 800);
    a.send('rebirth', {});
    const rb = await a.wait(() => a.last('reborn'), 800);
    await sleep(60);
    ok(rb && a.p.rebirths === 1 && a.p.lv === 1 && a.p.kb === 0 && a.p.wins === 3, 'rebirth: level 1, Keyboards gone, it costs its Wins');
    ok(!a.p.spans[0] || a.p.spans[0].n === 0, 'and the bridges come down');
    ok(a.p.ups.power === 1 && a.p.hatched === 3, 'upgrades and Keypals stay');
    a.x = rb.x; a.z = rb.z; a.move(a.x, 0, a.z);
    await a.tp(BOARD_SPOTS[2].x, BOARD_SPOTS[2].z);
    const k2 = BOARD_KEYS.findIndex((k) => Math.hypot(k.x, k.z) < 4);
    const pp = a.p.presses;
    a.press(2, k2);
    await a.wait(() => a.p.presses > pp, 800);
    ok(a.p.presses > pp, 'the rebirth opened the Mechanical keyboard');
    a.send('qa', { rebirths: 5 });
    await sleep(60);
    a.send('world', { w: 1 });
    await a.wait(() => a.p.world === 1, 500);
    ok(a.p.world === 1 && a.last('warp').w === 1, 'five rebirths open Neon Arcade');
    const m1 = a.last('warp');
    a.x = m1.x; a.z = m1.z; a.move(a.x, 0, a.z);
    a.send('world', { w: 0 });
    await a.wait(() => a.p.world === 0, 500);
    a.x = a.last('warp').x; a.z = a.last('warp').z; a.move(a.x, 0, a.z);

    // ----- two players on a server -----
    console.log('\n--- two players on a server');
    const b = await new Bot('bob').join();
    await sleep(100);
    ok(b.room.state.players.get(a.room.sessionId).name === 'alice', 'a second player sees the first');
    let bots2 = 0;
    a.room.state.players.forEach((p) => { if (p.bot) bots2++; });
    ok(bots2 === CFG.bots - 2, 'one bot went home');
    const stamp = Date.now();
    a.move(a.x + 1, 0, a.z, stamp);
    await sleep(160);
    const seen = b.room.state.players.get(a.room.sessionId);
    ok(Math.abs(seen.x - a.x) < 0.01 && seen.t === stamp, 'and where they are, stamped with the time they were there');
    ok(b.p.kb === 0 && b.p.wins === 0 && (!b.p.spans[0] || !b.p.spans[0].n), 'your bridges and Keyboards are your own');
    // the save
    console.log('\n--- the save');
    const saved = { wins: a.p.wins, ups: a.p.ups.power, hatched: a.p.hatched };
    await a.leave();
    await sleep(150);
    const a2 = await new Bot('alice').join();
    ok(a2.p.wins === saved.wins && a2.p.ups.power === saved.ups && a2.p.hatched === saved.hatched, 'rejoining: everything is still there');
    await a2.leave();
    await b.leave();
}

let code = 0;
try { await main(); } catch (e) { console.error(e); fail++; code = 1; }
console.log(`\n${pass} passed, ${fail} failed`);
srv.kill();
fs.rmSync(dataDir, { recursive: true, force: true });
process.exit(fail || code ? 1 : 0);
