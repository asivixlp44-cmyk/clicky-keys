import { Room } from 'colyseus';
import { GameState, PlayerState } from './schema.js';
import {
    getProfile, hasProfile, markDirty, saveProfiles, adoptGuestProgress, loadProfile, releaseProfile,
    topProfiles, recordSession, saveSoon, USE_DB,
} from './profiles.js';
import { sealProfile, openSave } from './saves.js';
import { verifyBloxityToken } from './bloxity.js';
import {
    CFG, BOARDS, WORLDS, SPIN, spinPrize, rebirthCost, jumpH, perClick, xpNeed, xpOf, walkOf, luckOf, LUCK_MULT, fillRate, teamSize,
    bridgeCost, padWins, FIRST_CROSS, UPGRADES, upgradeById, upgradeCost, PALS, palById, CAPSULES, capsuleById, INDEX_GEMS,
    TASKS, tasksFor, dayKey, QUESTS, DAILY, dailyStatus, GIFTS, CODES, PACKS, rewardKb, rewardText, clamp, BOT_NAMES,
} from '../../shared/config.js';
import { W, BOARD_SPOTS, BOARD_KEYS, P as KEYP, spanStart, headOf, onPad, capsulesOf, isleMid, hubFor } from '../../shared/world.js';
import { newBody, stepBody } from '../../shared/physics.js';

const GREEN = '#7dff6b', GOLD = '#ffd028', RED = '#ff9a8a';
const cleanName = (name) => String(name || '').replace(/[^\w .\-]/g, '').trim().slice(0, 20);
const randomName = () => 'Typist' + Math.floor(1000 + Math.random() * 9000);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v, d) => (finite(v) ? v : d);
const rnd = (a, b) => a + Math.random() * (b - a);
const r1 = (v) => Math.round(v * 10) / 10;
// Guest ids come from the browser; they can never claim a Bloxity identity
const guestUid = (uid, fallback) => String(uid || fallback).replace(/^legion_/, 'guest_').slice(0, 64);
const cleanAvatar = (av) => (typeof av === 'string' && av.length <= 2000 ? av : '');
// clicks: a bucket that fills at clickRate a second, up to clickBurst saved (clicks bunched by a hiccup in the network still count)
function takeToken(o, now) {
    o.tokens = Math.min(CFG.clickBurst, (o.tokens ?? CFG.clickBurst) + (now - (o.tokAt || now)) / 1000 * CFG.clickRate);
    o.tokAt = now;
    if (o.tokens < 1) return false;
    o.tokens -= 1;
    return true;
}

// how far a move may go: you earn distance at your top speed as time passes (a second and a half's worth saved, for moves
// bunched up by a hiccup in the network), and each move spends it. Too far too fast and it's refused.
function moveBudget(s, dist, speed, dt) {
    s.moveB = Math.min((s.moveB ?? speed) + Math.max(0, dt) * speed, speed * 1.5 + 6);
    if (dist > s.moveB) return false;
    s.moveB -= dist;
    return true;
}

export const liveRooms = new Set();

// One server: up to 16 players pressing the same keyboards on the same islands (a few bots keep it lively when it's
// quiet). Moving is client-side; every press, every bridge, every Win and everything that earns or costs anything is
// counted and checked here.
export class KeyRoom extends Room {
    maxClients = CFG.maxPlayers;

    onCreate() {
        liveRooms.add(this);
        this.setState(new GameState());
        this.setPatchRate(50);
        this.sessions = new Map();
        this.bots = [];
        const on = (type, fn) => this.onMessage(type, (client, m) => { try { fn.call(this, client, m || {}); } catch (e) { console.warn('[msg]', type, e.message); } });
        on('ping', (client, m) => client.send('pong', { c: num(m.c, 0), s: Date.now() }));
        on('move', this.onMove);
        on('press', this.onPress);
        on('pad', this.onPadTouch);
        on('warp', this.onWarp);
        on('unlock', this.onUnlock);
        on('upgrade', this.onUpgrade);
        on('hatch', this.onHatch);
        on('equip', this.onEquip);
        on('equipbest', this.onEquipBest);
        on('rebirth', this.onRebirth);
        on('world', this.onWorld);
        on('spin', this.onSpin);
        on('pack', this.onPack);
        on('x2', this.onX2);
        on('w2', this.onW2);
        on('qclaim', this.onQuestClaim);
        on('tclaim', this.onTaskClaim);
        on('daily', this.onDaily);
        on('gift', this.onGift);
        on('code', this.onCode);
        on('tut', this.onTut);
        on('meta', this.onMeta);
        on('auth', this.onBloxityLogin);
        on('avatar', this.onAvatar);
        on('emote', this.onEmote);
        on('chat', this.onChat);
        // QA only (QA=1, never on Legion): give yourself Keyboards, Wins, Gems, levels...
        if (process.env.QA === '1' && !process.env.BLOXITY_GAME_ID) on('qa', this.onQa);
        this.lastTick = Date.now();
        this.secAcc = 0;
        this.setSimulationInterval(() => this.update(), 50);
        this.clock.setInterval(() => this.broadcastBoards(), 10000);
        this.fillBots();
    }

    async onAuth(client, options) {
        const legion = options && options.token ? await verifyBloxityToken(options.token) : null;
        return legion ? { legion } : { guest: true };
    }

    async onJoin(client, options, auth) {
        options = options || {};
        const guest = guestUid(options.uid, client.sessionId);
        let uid = guest, name = cleanName(options.name);
        if (auth && auth.legion) {
            uid = 'legion_' + auth.legion.id;
            name = cleanName(auth.legion.name) || name;
            await adoptGuestProgress(uid, guest, name);
        }
        await loadProfile(uid);
        // A fresh server on a temporary disk restores the browser's signed backup (never with a database)
        const restore = !USE_DB && !hasProfile(uid) && openSave(options.save, [uid, guest]);
        const profile = getProfile(uid, name, randomName());
        if (restore) { Object.assign(profile, restore); markDirty(); }
        this.fixProfile(profile);
        kickOthers(uid, null);
        const player = new PlayerState();
        player.name = profile.name;
        player.pid = this.freePid();
        player.av = cleanAvatar(options.av);
        const now = Date.now();
        Object.assign(player, { x: W.spawn.x + rnd(-4, 4), y: 0, z: W.spawn.z, ry: Math.PI, t: now, world: profile.world || 0 });
        this.state.players.set(client.sessionId, player);
        const s = {
            id: client.sessionId, client, profile, player, guest, joinedAt: now, lastChat: 0, playSecs: 0, dirtyAt: 0, sealAt: 0, ack: 0,
            gifts: {}, last: { x: player.x, y: 0, z: player.z }, lastAt: now, snapAt: 0, spinSecs: 0, warpAt: 0,
            stats: {
                fresh: now - (profile.firstPlay || 0) < 60000, presses: 0, wins: 0, pads: 0, best: 0, buys: 0, lv0: profile.lv, rb0: profile.rebirths, hatch: 0,
                touch: false, fps: 0, fpsSum: 0, fpsN: 0, fpsMin: 0, q: '', gpu: '', load: 0, dev: null, errs: [], firstPadAt: 0,
            },
        };
        this.sessions.set(client.sessionId, s);
        this.syncPublic(s);
        client.send('hello', { now, bloxity: uid.startsWith('legion_') });
        // your keyboards kept typing while you were away
        const away = profile.lastSeen ? (now - profile.lastSeen) / 1000 : 0;
        if (away > 300 && profile.presses > 20) {
            const secs = Math.min(away, CFG.offlineHours * 3600), got = Math.round(secs * CFG.offlineRate * perClick(profile, profile.world, this.bestBoard(profile)));
            if (got > 0) { profile.kb += got; profile.totalKb += got; client.send('offline', { got, mins: Math.round(secs / 60) }); }
        }
        profile.lastSeen = now;
        this.sendProfile(s, true);
        this.broadcastBoards(client);
        this.fillBots();
    }
    freePid() {
        const used = new Set([...this.state.players.values()].map((p) => p.pid));
        for (let i = 1; i < 255; i++) if (!used.has(i)) return i;
        return 255;
    }
    // Older saves / hand-edited data: keep every field the right shape
    fixProfile(p) {
        for (const k of ['kb', 'totalKb', 'presses', 'wins', 'totalWins', 'gems', 'xp', 'rebirths', 'bestBridge', 'spins', 'spinsUsed', 'pads', 'hatched', 'upgrades', 'playtime', 'lastSeen', 'qi', 'tut', 'x2Until', 'w2Until', 'world']) if (!finite(p[k]) || p[k] < 0) p[k] = 0;
        p.gems = Math.floor(p.gems);
        p.lv = clamp(Math.floor(num(p.lv, 1)), 1, 9999);
        p.qi = clamp(Math.floor(p.qi), 0, QUESTS.length);
        p.world = clamp(Math.floor(p.world), 0, WORLDS.length - 1);
        if (p.rebirths < WORLDS[p.world].reb) p.world = 0;
        for (const k of ['daily', 'codes', 'seen', 'jq', 'spans', 'claimed', 'boards', 'ups', 'pals', 'index']) p[k] = obj(p[k]);
        for (const id of Object.keys(p.ups)) { const u = upgradeById[id]; if (!u) delete p.ups[id]; else p.ups[id] = clamp(num(p.ups[id], 0) | 0, 0, u.max); }
        for (const id of Object.keys(p.pals)) if (!palById[id]) delete p.pals[id];
        p.team = arr(p.team).filter((id) => palById[id] && p.pals[id] > 0).slice(0, teamSize(p));
        p.jq = { day: String(p.jq.day || ''), list: arr(p.jq.list).slice(0, 3).map((q) => ({ k: String(q.k), p: Math.max(0, num(q.p, 0)), c: !!q.c })).filter((q) => TASKS[q.k]) };
        if (!finite(p.firstPlay)) p.firstPlay = Date.now();
    }

    onDrop(client) { this.allowReconnection(client, 30).catch(() => {}); }
    onReconnect(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        s.client = client;
        client.send('hello', { now: Date.now(), bloxity: s.profile.uid.startsWith('legion_') });
        this.sendProfile(s, true);
        this.broadcastBoards(client);
    }
    onLeave(client) {
        const s = this.sessions.get(client.sessionId);
        this.state.players.delete(client.sessionId);
        this.sessions.delete(client.sessionId);
        markDirty();
        this.fillBots();
        if (!s) return;
        const p = s.profile, st = s.stats;
        p.lastSeen = Date.now();
        recordSession({
            at: new Date(), secs: Math.round((Date.now() - s.joinedAt) / 1000), fresh: st.fresh, touch: st.touch,
            fps: st.fpsN ? Math.round(st.fpsSum / st.fpsN) : st.fps, fpsMin: st.fpsMin, q: st.q, gpu: st.gpu, load: st.load, dev: st.dev, errs: st.errs,
            presses: st.presses, wins: st.wins, pads: st.pads, best: st.best, buys: st.buys, lv0: st.lv0, lv: p.lv, rb0: st.rb0, rb: p.rebirths, hatch: st.hatch,
            firstPad: st.firstPadAt ? Math.round((st.firstPadAt - s.joinedAt) / 1000) : -1, qi: p.qi,
        }).catch((e) => console.warn('[stats]', e.message));
        if (!isOnline(p.uid)) releaseProfile(p.uid, isOnline);
    }
    onDispose() {
        liveRooms.delete(this);
        for (const s of this.sessions.values()) s.profile.lastSeen = Date.now();
        markDirty();
        return saveProfiles();
    }

    // ----- helpers -----
    sendTo(s, type, msg) { try { if (s) s.client.send(type, msg); } catch (e) { /* gone */ } }
    spanOf(p, w) { const k = w ?? p.world; let o = p.spans[k]; if (!o) { o = { n: 0, part: 0 }; p.spans[k] = o; } return o; }
    nextCost(p) { const o = this.spanOf(p), n = WORLDS[p.world].bridges; return o.n >= n ? 0 : bridgeCost(p.world, o.n + 1) - o.part; }
    syncPublic(s) {
        const p = s.profile, pl = s.player, left = this.nextCost(p);
        pl.name = p.name; pl.lv = p.lv; pl.wins = p.totalWins; pl.world = p.world;
        // the little keyboards stacked on your back: full when you have enough for the next bridge
        pl.stack = left > 0 ? clamp(Math.ceil(p.kb / left * 10), 0, 10) : clamp(Math.ceil(Math.log10(p.kb + 1) * 1.2), 0, 10);
        pl.bt = this.bestBoard(p);
        const team = p.team.join(',');
        if (pl.team !== team) pl.team = team;
    }
    x2On(p, now) { return (p.x2Until || 0) > (now || Date.now()); }
    w2On(p, now) { return (p.w2Until || 0) > (now || Date.now()); }
    hasBoard(p, w, b) { const B = BOARDS[b]; if (!B) return false; if (B.reb > p.rebirths) return false; return B.wins === 0 || !!((p.boards[w] || 0) & (1 << b)); }
    bestBoard(p) { let best = 0; for (let b = 0; b < BOARDS.length; b++) if (this.hasBoard(p, p.world, b)) best = b; return best; }
    // The player's private progress: straight away for anything they clicked on; while pressing or filling, four times
    // a second, only what changes then (the rest of it isn't sent over and over)
    sendProfile(s, seal) {
        const p = s.profile, now = Date.now();
        s.dirtyAt = 0;
        this.jqOf(p, now);
        this.checkQuests(s);
        const m = {
            kb: r1(p.kb), totalKb: r1(p.totalKb), presses: p.presses, wins: Math.floor(p.wins), totalWins: Math.floor(p.totalWins), gems: p.gems, xp: r1(p.xp), lv: p.lv, need: xpNeed(p.lv), ack: s.ack,
            rebirths: p.rebirths, bestBridge: p.bestBridge, spans: p.spans, claimed: p.claimed, boardsOpen: p.boards, ups: p.ups, pals: p.pals, team: p.team, hatched: p.hatched, upgrades: p.upgrades, index: p.index,
            spins: p.spins, spinIn: Math.max(0, CFG.spinMins * 60 - s.spinSecs), spinsUsed: p.spinsUsed, pads: p.pads, world: p.world,
            x2Until: p.x2Until, w2Until: p.w2Until,
            qi: p.qi, qv: p.qi < QUESTS.length ? this.questValue(p, QUESTS[p.qi].kind) : 0, jq: p.jq, daily: p.daily, codes: p.codes,
            gifts: s.gifts, sessionSecs: s.playSecs, playtime: p.playtime, tut: p.tut, seen: p.seen, firstPlay: p.firstPlay, now,
        };
        if (!USE_DB && (seal || now - s.sealAt > 10000)) { s.sealAt = now; m.save = sealProfile(p); }
        this.sendTo(s, 'profile', m);
    }
    sendLite(s) {
        const p = s.profile, o = this.spanOf(p);
        s.dirtyAt = 0;
        this.checkQuests(s);
        const m = { kb: r1(p.kb), totalKb: r1(p.totalKb), xp: r1(p.xp), lv: p.lv, need: xpNeed(p.lv), ack: s.ack, presses: p.presses, part: r1(o.part), n: o.n, wins: Math.floor(p.wins) };
        if (p.qi < QUESTS.length) m.qv = this.questValue(p, QUESTS[p.qi].kind);
        this.sendTo(s, 'lite', m);
    }
    dirty(s) { if (!s.dirtyAt) s.dirtyAt = Date.now(); markDirty(); }
    changed(s) { this.syncPublic(s); this.sendProfile(s); saveSoon(); }
    toast(s, text, color) { this.sendTo(s, 'toast', { text, color: color || '#ffffff' }); }
    broke(s, need, name, cur) { this.sendTo(s, 'broke', { need: Math.ceil(need), name, cur }); }
    payWins(s, n, name) { const p = s.profile; if (p.wins < n) { this.broke(s, n - p.wins, name, 'wins'); return false; } p.wins -= n; s.stats.buys++; return true; }
    payGems(s, n, name) { const p = s.profile; if (p.gems < n) { this.broke(s, n - p.gems, name, 'gems'); return false; } p.gems -= n; s.stats.buys++; return true; }
    giveReward(s, r, why) {
        const p = s.profile, kb = rewardKb(r, p);
        if (kb) { p.kb += kb; p.totalKb += kb; }
        if (r.wins) this.addWins(s, r.wins);
        if (r.gems) p.gems += r.gems;
        if (r.spins) p.spins += r.spins;
        if (r.x2) p.x2Until = Math.max(Date.now(), p.x2Until || 0) + r.x2 * 60000;
        const shown = { ...r, kb };
        delete shown.clicks;
        if (why) this.sendTo(s, 'reward', { text: rewardText(shown), why, gems: r.gems || 0 });
        return shown;
    }
    addWins(s, n) {
        const p = s.profile;
        p.wins += n; p.totalWins += n; s.stats.wins += n;
        this.task(s, 'wins', n);
    }
    addXp(s, n) {
        const p = s.profile;
        p.xp += n;
        let ups = 0;
        while (p.xp >= xpNeed(p.lv)) { p.xp -= xpNeed(p.lv); p.lv++; ups++; }
        if (ups) { this.task(s, 'levels', ups); this.sendTo(s, 'levelup', { lv: p.lv }); s.player.lv = p.lv; }
    }

    // ----- daily tasks, quests -----
    jqOf(p, now) {
        const d = dayKey(now);
        if (p.jq.day !== d) p.jq = { day: d, list: tasksFor(d).map((k) => ({ k, p: 0, c: false })) };
        return p.jq;
    }
    task(s, k, n) {
        const jq = this.jqOf(s.profile, Date.now());
        for (const q of jq.list) {
            if (q.k !== k || q.c) continue;
            const was = q.p;
            q.p = Math.min(TASKS[k].n, q.p + n);
            if (was < TASKS[k].n && q.p >= TASKS[k].n) { this.sendTo(s, 'taskdone', { k }); s.jqDirty = true; }
        }
        this.dirty(s);
    }
    questValue(p, kind) {
        if (kind === 'auto') return (p.ups.auto || 0) > 0 ? 1 : 0;
        if (kind === 'spins') return p.spinsUsed;
        if (kind === 'boards') { let n = 0; for (let b = 0; b < BOARDS.length; b++) if (this.hasBoard(p, 0, b)) n++; return n; }
        return Math.floor(p[kind] || 0);
    }
    checkQuests(s) {
        const p = s.profile;
        if (p.qi >= QUESTS.length) return;
        const Q = QUESTS[p.qi];
        if (this.questValue(p, Q.kind) >= Q.n && s.questAnnounced !== p.qi) { s.questAnnounced = p.qi; this.sendTo(s, 'questdone', { qi: p.qi }); }
    }
    onQuestClaim(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        if (p.qi >= QUESTS.length) return;
        const Q = QUESTS[p.qi];
        if (this.questValue(p, Q.kind) < Q.n) return;
        p.qi++;
        this.giveReward(s, Q, 'Quest complete!');
        this.changed(s);
    }
    onTaskClaim(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const q = this.jqOf(s.profile, Date.now()).list[m.i | 0];
        if (!q || q.c || q.p < TASKS[q.k].n) return;
        q.c = true;
        this.giveReward(s, TASKS[q.k], 'Daily task done!');
        this.changed(s);
    }

    // ----- 20 times a second: bridges filling, the bots; every second: playtime, free spins -----
    update() {
        const now = Date.now(), dt = Math.min(0.1, (now - this.lastTick) / 1000);
        this.lastTick = now;
        this.state.now = now;
        for (const b of this.bots) this.driveBot(b, now, dt);
        for (const s of this.sessions.values()) this.fillBridge(s, dt);
        this.secAcc += dt;
        if (this.secAcc >= 1) { this.secAcc -= 1; this.tick(now); }
        for (const s of this.sessions.values()) if (s.dirtyAt && now - s.dirtyAt > 250) { this.syncPublic(s); if (s.jqDirty) { s.jqDirty = false; this.sendProfile(s); } else this.sendLite(s); }
    }
    tick(now) {
        for (const s of this.sessions.values()) {
            const p = s.profile;
            p.playtime = (p.playtime || 0) + 1;
            p.lastSeen = now;
            s.playSecs++;
            if (p.spins < CFG.spinMax) { s.spinSecs++; if (s.spinSecs >= CFG.spinMins * 60) { s.spinSecs = 0; p.spins++; this.toast(s, '🎡 A free spin is ready!', GOLD); this.changed(s); } } else s.spinSecs = 0;
            const g = GIFTS.findIndex((x, i) => !s.gifts[i] && s.playSecs >= x.min * 60 && s.playSecs < x.min * 60 + 1);
            if (g >= 0) this.toast(s, '🎁 A FREE gift is ready!', GOLD);
        }
        markDirty();
    }

    // ----- moving -----
    // where a player says they are: checked against how far they could have moved, how high they can jump, and
    // whether the ground there exists for them (the bridges they've built)
    onMove(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !finite(m.x) || !finite(m.y) || !finite(m.z)) return;
        const now = Date.now(), p = s.profile, L = s.last;
        const dt = (now - s.lastAt) / 1000;
        s.lastAt = now;
        // just sent somewhere (a warp, a rebirth, a world): the moves still on their way from where they were are dropped
        // (no snap) until they arrive
        if (s.homeAt) {
            if (now - s.homeAt < 30000 && Math.hypot(m.x - L.x, m.z - L.z) > 6) return;
            s.homeAt = 0;
        }
        const maxY = jumpH(CFG.power) + 4;
        let bad = !moveBudget(s, Math.hypot(m.x - L.x, m.z - L.z), walkOf(p) * 1.25 + 4, dt) || m.y > maxY || m.y < -10;
        // past the last bridge built: there's nothing there
        const o = this.spanOf(p), n = WORLDS[p.world].bridges, stop = o.n >= n ? isleMid(n) - W.isleLen / 2 : spanStart(o.n + 1);
        if (m.z < stop - 2.5) bad = true;
        if (bad) {
            if (now - s.snapAt > 300) { s.snapAt = now; this.sendTo(s, 'snap', { x: L.x, y: L.y, z: L.z }); if (process.env.QA === '1') console.log('[snap]', p.name, 'from', [L.x, L.y, L.z].map((v) => +v.toFixed(1)), 'to', [m.x, m.y, m.z].map((v) => +v.toFixed(1)), 'dt', +dt.toFixed(2), 'n', o.n); }
            return;
        }
        L.x = m.x; L.y = m.y; L.z = m.z;
        this.setPublicMove(s, m, now);
    }
    setPublicMove(s, m, now) {
        const pl = s.player;
        pl.x = m.x; pl.y = m.y; pl.z = m.z; pl.ry = finite(m.ry) ? m.ry : 0; pl.anim = finite(m.a) ? clamp(m.a | 0, 0, 3) : 0;
        pl.t = finite(m.ts) ? clamp(m.ts, now - 1500, now + 50) : now;
    }
    // a key pressed under your feet (or a tap on it): Keyboards and XP. On a keyboard you own, near where you are, not too fast
    onPress(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const now = Date.now(), p = s.profile, b = m.b | 0, k = m.k | 0, sp = BOARD_SPOTS[b], key = BOARD_KEYS[k];
        if (finite(m.s)) s.ack = Math.max(s.ack, m.s | 0);
        if (!sp || !key) return;
        if (!this.hasBoard(p, p.world, b)) return;
        const L = s.last, dx = L.x - (sp.x + key.x), dz = L.z - (sp.z + key.z), slack = walkOf(p) * 0.5 + 6 + key.w * KEYP / 2;
        if (Math.hypot(dx, dz) > slack) return;
        if (!takeToken(s, now)) return;
        let got = perClick(p, p.world, b, this.x2On(p, now));
        if (Math.random() < luckOf(p)) { got = r1(got * LUCK_MULT); this.sendTo(s, 'lucky', { got }); }
        p.kb += got; p.totalKb += got; p.presses++; s.stats.presses++;
        this.addXp(s, xpOf(p));
        this.task(s, 'press', 1);
        this.dirty(s);
    }
    // standing in front of the next bridge: your Keyboards go in
    fillBridge(s, dt) {
        const p = s.profile, o = this.spanOf(p), n = WORLDS[p.world].bridges, k = o.n + 1;
        if (k > n || p.kb <= 0 || !headOf(k, s.last.x, s.last.z)) return;
        const cost = bridgeCost(p.world, k), take = Math.min(p.kb, cost - o.part, Math.max(fillRate(p, cost), p.kb * 0.8) * dt);
        o.part += take; p.kb -= take;
        if (cost - o.part < 0.01) {
            o.part = 0; o.n = k;
            if (k > p.bestBridge) { p.bestBridge = k; s.stats.best = Math.max(s.stats.best, k); }
            this.task(s, 'bridge', 1);
            this.sendTo(s, 'bridge', { w: p.world, k, cost });
            this.changed(s);
            return;
        }
        this.dirty(s);
    }
    // a Win Pad on the far side of a bridge: its Wins (x3 the first time this run), then it needs a while
    onPadTouch(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, k = m.k | 0, o = this.spanOf(p), L = s.last, key = p.world + ':' + k, now = Date.now();
        if (k < 1 || k > o.n || !onPad(k, L.x, L.z) || L.y > jumpH(CFG.power) + 2) return;
        const c = p.claimed[key] || (p.claimed[key] = { first: false, next: 0 });
        if (c.next > now) return;
        const first = !c.first;
        c.first = true; c.next = now + CFG.padSecs * 1000;
        const n = Math.round(padWins(p.world, k) * (first ? FIRST_CROSS : 1) * (this.w2On(p, now) ? 2 : 1));
        this.addWins(s, n);
        p.pads++; s.stats.pads++;
        if (!s.stats.firstPadAt) s.stats.firstPadAt = now;
        this.task(s, 'pads', 1);
        // out of Keyboards for the next bridge: back to your best keyboard
        const home = this.nextCost(p) > p.kb ? this.boardSpot(p) : null;
        if (home) { s.last = { x: home.x, y: 0, z: home.z }; s.homeAt = now; }
        this.sendTo(s, 'padok', { k, n, first, home });
        this.changed(s);
    }
    boardSpot(p) { const sp = BOARD_SPOTS[this.bestBoard(p)]; return { x: sp.x + rnd(-6, 6), z: sp.z + W.spanRows }; }
    // the quick ways round: back to your best keyboard, to the next bridge, to the spawn
    onWarp(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const now = Date.now(), p = s.profile;
        if (now - s.warpAt < 700) return;
        s.warpAt = now;
        let to;
        if (m.to === 'board') to = this.boardSpot(p);
        else if (m.to === 'bridge') { const o = this.spanOf(p), k = Math.min(o.n + 1, WORLDS[p.world].bridges); to = o.n >= WORLDS[p.world].bridges ? { x: 0, z: isleMid(k) + 8 } : { x: rnd(-6, 6), z: spanStart(k) + 3 }; } else to = { x: W.spawn.x + rnd(-4, 4), z: W.spawn.z };
        s.last = { x: to.x, y: 0, z: to.z }; s.homeAt = now;
        this.sendTo(s, 'warped', to);
    }

    // ----- spending Wins: keyboards, the Workshop, capsules, rebirths, worlds -----
    onUnlock(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, b = m.b | 0, B = BOARDS[b];
        if (!B || !B.wins || this.hasBoard(p, p.world, b)) return;
        const cost = B.wins * WORLDS[p.world].wins;
        if (!this.payWins(s, cost, 'the ' + B.name + ' keyboard')) return;
        p.boards[p.world] = (p.boards[p.world] || 0) | (1 << b);
        this.sendTo(s, 'bought', { what: 'board', b });
        this.changed(s);
    }
    onUpgrade(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, u = upgradeById[m.id];
        if (!u) return;
        const n = p.ups[u.id] || 0;
        if (n >= u.max) return;
        if (!this.payWins(s, upgradeCost(u, n), u.name)) return;
        p.ups[u.id] = n + 1; p.upgrades++;
        this.sendTo(s, 'bought', { what: 'upgrade', id: u.id, n: n + 1 });
        this.changed(s);
    }
    // a capsule machine: you have to be at it, and it has to be in your world
    onHatch(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, c = capsuleById[m.c], n = m.n === 3 ? 3 : 1;
        if (!c) return;
        const at = capsulesOf(p.world).find((o) => o.c === c);
        if (!at || Math.hypot(s.last.x - at.x, s.last.z - at.z) > at.r + 8) { this.toast(s, 'Walk up to the capsule machine', RED); return; }
        if (!this.payWins(s, c.wins * n, c.name)) return;
        const out = [];
        for (let i = 0; i < n; i++) {
            let r = Math.random() * c.pals.reduce((a, x) => a + x.w, 0), id = c.pals[0].id;
            for (const x of c.pals) { r -= x.w; if (r < 0) { id = x.id; break; } }
            p.pals[id] = (p.pals[id] || 0) + 1;
            p.hatched++; s.stats.hatch++;
            this.task(s, 'hatch', 1);
            const isNew = p.pals[id] === 1;
            out.push({ id, isNew });
            this.autoEquip(p, id);
        }
        // every Keypal of a capsule seen: Gems, once
        const ci = CAPSULES.indexOf(c);
        if (!p.index[c.id] && c.pals.every((x) => p.pals[x.id] > 0)) { p.index[c.id] = 1; p.gems += INDEX_GEMS[ci] || 10; this.sendTo(s, 'toastreward', { text: 'Collection complete: ' + c.name + '! +' + (INDEX_GEMS[ci] || 10) + ' 💎' }); }
        this.sendTo(s, 'hatched', { c: c.id, out });
        this.changed(s);
    }
    autoEquip(p, id) {
        const max = teamSize(p), inTeam = p.team.filter((x) => x === id).length;
        if (inTeam >= p.pals[id]) return;
        if (p.team.length < max) { p.team.push(id); return; }
        let worst = 0;
        p.team.forEach((x, i) => { if (palById[x].mult < palById[p.team[worst]].mult) worst = i; });
        if (palById[id].mult > palById[p.team[worst]].mult) p.team[worst] = id;
    }
    onEquip(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, id = String(m.id || '');
        if (!palById[id] || !(p.pals[id] > 0)) return;
        const inTeam = p.team.filter((x) => x === id).length;
        if (m.off) { const i = p.team.indexOf(id); if (i >= 0) p.team.splice(i, 1); } else if (inTeam < p.pals[id] && p.team.length < teamSize(p)) p.team.push(id);
        else if (p.team.length >= teamSize(p)) this.toast(s, 'Your team is full: take one off first', RED);
        this.changed(s);
    }
    onEquipBest(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, all = [];
        for (const k of PALS) for (let i = 0; i < Math.min(p.pals[k.id] || 0, 6); i++) all.push(k);
        all.sort((a, b) => b.mult - a.mult);
        p.team = all.slice(0, teamSize(p)).map((k) => k.id);
        this.changed(s);
    }
    onRebirth(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, cost = rebirthCost(p.rebirths);
        if (!this.payWins(s, cost, 'Rebirth')) return;
        p.rebirths++; p.lv = 1; p.xp = 0; p.kb = 0;
        p.spans = {}; p.claimed = {};
        const sx = W.spawn.x + rnd(-4, 4);
        s.last = { x: sx, y: 0, z: W.spawn.z }; s.homeAt = Date.now();
        this.sendTo(s, 'reborn', { r: p.rebirths, x: sx, z: W.spawn.z });
        this.changed(s);
    }
    onWorld(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, w = clamp(m.w | 0, 0, WORLDS.length - 1);
        if (p.rebirths < WORLDS[w].reb) { this.toast(s, '🔒 ' + WORLDS[w].name + ' opens at ' + WORLDS[w].reb + ' rebirths', RED); return; }
        p.world = w;
        const sx = W.spawn.x + rnd(-4, 4);
        s.last = { x: sx, y: 0, z: W.spawn.z }; s.homeAt = Date.now();
        this.sendTo(s, 'warp', { w, x: sx, z: W.spawn.z });
        this.changed(s);
    }
    onSpin(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        if (p.spins < 1) return;
        p.spins--; p.spinsUsed++;
        let r = Math.random() * SPIN.reduce((a, x) => a + x.w, 0), i = 0;
        for (; i < SPIN.length - 1; i++) { r -= SPIN[i].w; if (r < 0) break; }
        const prize = spinPrize(SPIN[i], p);
        this.giveReward(s, prize);
        this.task(s, 'spins', 1);
        this.sendTo(s, 'spun', { i, text: rewardText(prize) });
        this.changed(s);
    }
    onPack(client, m) {
        const s = this.sessions.get(client.sessionId), k = s && PACKS.find((x) => x.id === m.id);
        if (!k || !this.payGems(s, k.gems, k.wins + ' Wins')) return;
        const n = Math.round(k.wins * WORLDS[s.profile.world].wins);
        this.addWins(s, n);
        this.toast(s, '+' + n + ' Wins!', GOLD);
        this.changed(s);
    }
    onX2(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !this.payGems(s, CFG.boostX2Gems, 'x2 Keyboards')) return;
        const p = s.profile;
        p.x2Until = Math.max(Date.now(), p.x2Until || 0) + CFG.boostX2Mins * 60000;
        this.toast(s, 'x2 Keyboards for ' + CFG.boostX2Mins + ' minutes!', GOLD);
        this.changed(s);
    }
    onW2(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !this.payGems(s, CFG.boostW2Gems, 'x2 Wins')) return;
        const p = s.profile;
        p.w2Until = Math.max(Date.now(), p.w2Until || 0) + CFG.boostW2Mins * 60000;
        this.toast(s, 'x2 Wins for ' + CFG.boostW2Mins + ' minutes!', GOLD);
        this.changed(s);
    }

    // ----- rewards -----
    onDaily(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, now = Date.now(), st = dailyStatus(p.daily, now);
        if (!st.can) return;
        p.daily = { last: dayKey(now), streak: st.streak + 1 };
        this.giveReward(s, DAILY[st.day], 'Daily reward: day ' + (st.day + 1) + '!');
        this.changed(s);
    }
    onGift(client, m) {
        const s = this.sessions.get(client.sessionId), i = m.i | 0, g = GIFTS[i];
        if (!s || !g || s.gifts[i] || s.playSecs < g.min * 60 - 2) return;
        s.gifts[i] = true;
        this.giveReward(s, g, 'FREE gift!');
        this.changed(s);
    }
    onCode(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const code = String(m.code || '').trim().toUpperCase().slice(0, 20), r = CODES[code];
        if (!r) { this.sendTo(s, 'code', { ok: false, text: 'That code doesn\'t work' }); return; }
        if (s.profile.codes[code]) { this.sendTo(s, 'code', { ok: false, text: 'You already used that code' }); return; }
        s.profile.codes[code] = true;
        const shown = this.giveReward(s, r);
        this.sendTo(s, 'code', { ok: true, text: 'Code redeemed: ' + rewardText(shown, true) });
        this.changed(s);
    }
    onTut(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        if (finite(m.tut)) s.profile.tut = clamp(Math.max(s.profile.tut, m.tut | 0), 0, 99);
        if (typeof m.seen === 'string' && m.seen.length < 24) s.profile.seen[m.seen] = 1;
        markDirty();
    }
    onMeta(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const st = s.stats;
        if (typeof m.touch === 'boolean') st.touch = m.touch;
        if (finite(m.fps)) { const f = clamp(Math.round(m.fps), 0, 240); st.fps = f; st.fpsSum += f; st.fpsN++; st.fpsMin = st.fpsN === 1 ? f : Math.min(st.fpsMin, f); }
        if (typeof m.q === 'string') st.q = m.q.slice(0, 8);
        if (typeof m.gpu === 'string' && !st.gpu) st.gpu = m.gpu.slice(0, 90);
        if (finite(m.load) && !st.load) st.load = clamp(Math.round(m.load * 10) / 10, 0, 600);
        if (!st.dev && finite(m.w)) st.dev = { w: clamp(m.w | 0, 0, 9999), h: clamp(m.h | 0, 0, 9999), dpr: clamp(num(m.dpr, 1), 0, 8), cores: clamp(m.cores | 0, 0, 256), mem: clamp(num(m.mem, 0), 0, 1024) };
        for (const e of arr(m.errs).slice(0, 5)) if (typeof e === 'string' && st.errs.length < 8) st.errs.push(e.slice(0, 220));
    }
    broadcastBoards(client) {
        const row = (key, v) => topProfiles(key).filter((p) => v(p) > 0).map((p) => ({ n: p.name, v: v(p) }));
        const m = { wins: row('totalWins', (p) => Math.floor(p.totalWins || 0)), kb: row('totalKb', (p) => Math.floor(p.totalKb || 0)) };
        if (client) client.send('boards', m); else this.broadcast('boards', m);
    }

    onQa(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        if (finite(m.kb)) { p.kb += m.kb; p.totalKb += Math.max(0, m.kb); }
        if (finite(m.wins)) { p.wins += m.wins; p.totalWins += Math.max(0, m.wins); }
        if (finite(m.gems)) p.gems += m.gems;
        if (finite(m.lv)) { p.lv = clamp(m.lv | 0, 1, 999); p.xp = 0; }
        if (finite(m.xp)) this.addXp(s, m.xp);
        if (finite(m.rebirths)) p.rebirths = clamp(m.rebirths | 0, 0, 99);
        if (finite(m.spins)) p.spins = clamp(m.spins | 0, 0, 99);
        if (finite(m.qi)) p.qi = clamp(m.qi | 0, 0, QUESTS.length);
        if (finite(m.playSecs)) s.playSecs = m.playSecs | 0;
        if (m.tasks) { const jq = this.jqOf(p, Date.now()); for (const q of jq.list) q.p = TASKS[q.k].n; }
        if (finite(m.bridges)) { const o = this.spanOf(p); o.n = clamp(m.bridges | 0, 0, WORLDS[p.world].bridges); o.part = 0; }
        if (finite(m.padReset)) p.claimed = {};
        // a QA teleport: where the next move is checked from
        if (Array.isArray(m.tp) && m.tp.every(finite)) { s.last = { x: m.tp[0], y: m.tp[1], z: m.tp[2] }; s.lastAt = Date.now(); }
        this.changed(s);
    }

    // ----- the bots: a few typists about the island when it's quiet (each real player sends one home) -----
    fillBots() {
        const want = Math.max(0, CFG.bots - this.sessions.size);
        while (this.bots.length > want) { const b = this.bots.pop(); this.state.players.delete(b.id); }
        const used = new Set([...this.state.players.values()].map((p) => p.name));
        while (this.bots.length < want) {
            const id = 'bot' + Math.floor(Math.random() * 1e9);
            let name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
            for (let i = 0; used.has(name) && i < 20; i++) name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + (i > 10 ? i : '');
            used.add(name);
            const lv = Math.floor(rnd(4, 24)), pl = new PlayerState(), sp = BOARD_SPOTS[Math.floor(Math.random() * 3)];
            Object.assign(pl, { name, bot: true, pid: this.freePid(), lv, wins: Math.floor(rnd(5, 600)), x: sp.x + rnd(-12, 12), y: 0, z: sp.z + rnd(-8, 8), t: Date.now(), world: 0, stack: Math.floor(rnd(1, 8)), bt: 0 });
            pl.team = Math.random() < 0.6 ? PALS[Math.floor(Math.random() * 8)].id : '';
            pl.av = botAvatar();
            this.state.players.set(id, pl);
            this.bots.push({ id, pl, body: newBody(pl.x, 0, pl.z), goal: null, until: 0, next: 0, sp });
        }
    }
    // back and forth over the keys, with a hop now and then; it moves on to another keyboard after a while
    driveBot(b, now, dt) {
        const T = hubFor(0), body = b.body, pl = b.pl;
        const inp = { mx: 0, mz: 0, jump: false, hold: true, power: CFG.power, double: false, speed: 0.85 };
        if (!b.goal || now > b.until) {
            if (Math.random() < 0.15) b.sp = BOARD_SPOTS[Math.floor(Math.random() * 3)];
            b.goal = { x: b.sp.x + rnd(-20, 20), z: b.sp.z + rnd(-10, 10) };
            b.until = now + rnd(1200, 3500);
        }
        const dx = b.goal.x - body.x, dz = b.goal.z - body.z, d = Math.hypot(dx, dz);
        if (d > 1.2) { inp.mx = dx / d; inp.mz = dz / d; } else b.goal = null;
        if (body.onGround && now >= b.next) { if (Math.random() < 0.3) inp.jump = true; b.next = now + rnd(700, 2200); }
        stepBody(body, inp, dt, T.world);
        pl.x = body.x; pl.y = body.y; pl.z = body.z; pl.t = now;
        if (Math.abs(body.vx) + Math.abs(body.vz) > 1) pl.ry = Math.atan2(body.vx, body.vz);
        pl.anim = !body.onGround ? 2 : Math.abs(body.vx) + Math.abs(body.vz) > 2 ? 1 : 0;
    }

    // ----- Bloxity -----
    async onBloxityLogin(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || s.authing) return;
        s.authing = true;
        const legion = await verifyBloxityToken(m.token);
        s.authing = false;
        if (!legion || !this.sessions.has(client.sessionId)) return;
        const uid = 'legion_' + legion.id;
        if (s.profile.uid === uid) return;
        const name = cleanName(legion.name) || s.profile.name;
        const guestProfile = s.profile;
        guestProfile.lastSeen = Date.now();
        await adoptGuestProgress(uid, guestProfile.uid, name);
        await loadProfile(uid);
        if (!this.sessions.has(client.sessionId)) return;
        kickOthers(uid, s);
        s.profile = getProfile(uid, name, randomName());
        this.fixProfile(s.profile);
        s.profile.lastSeen = Date.now();
        if (!isOnline(guestProfile.uid)) releaseProfile(guestProfile.uid, isOnline);
        s.player.name = s.profile.name;
        this.changed(s);
        client.send('authed', { name: s.profile.name });
        this.toast(s, 'Logged in as ' + s.profile.name, GREEN);
        this.broadcastBoards();
    }
    onAvatar(client, m) { const s = this.sessions.get(client.sessionId); if (s && m) s.player.av = cleanAvatar(m.av); }
    onEmote(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || typeof m.id !== 'string' || m.id.length > 40) return;
        this.broadcast('emote', { s: client.sessionId, id: m.id }, { except: client });
    }
    onChat(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || typeof m.text !== 'string') return;
        const now = Date.now();
        if (now - s.lastChat < 800) return;
        s.lastChat = now;
        const text = m.text.replace(/\s+/g, ' ').trim().slice(0, 120);
        if (text) this.broadcast('chat', { s: client.sessionId, name: s.profile.name, text });
    }
}

const botAvatar = () => JSON.stringify({ e: { skinId: String(Math.floor(Math.random() * 21)) }, p: { height: Math.round(rnd(0.92, 1.08) * 100) / 100 } });
// the same player somewhere else (another tab, another server): they leave there
function kickOthers(uid, keep) {
    for (const room of liveRooms) for (const o of room.sessions.values()) if (o.profile.uid === uid && o !== keep) { try { o.client.leave(4000); } catch (e) { /* gone */ } }
}
function isOnline(uid) {
    for (const room of liveRooms) for (const s of room.sessions.values()) if (s.profile.uid === uid) return true;
    return false;
}
