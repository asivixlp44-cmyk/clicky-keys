import { Client } from '@colyseus/sdk';
import {
    T, V3, $, canvas, scene, camera, sun, renderer, updateSky, SUN_DIRECTION, GPU_NAME, setMood, setFogScale, updateEffects, floatText, billboard, prompts,
} from './engine.js';
import { S, actions, net, prof } from './state.js';
import { CU, setEpoch, rel } from './clock.js';
import { initAudio, resumeAudio, audioDebug, startMusic, sfx, setVolume, audioSuspended, setMusicMode, toggleMusic, playAsmr, prerenderMusic, allowLiveMusic } from './audio.js';
import { buildAsmr } from './asmr.js';
import * as BX from './bloxity.js';
import { createAvatar, loadBase, packAvatar } from './avatar.js';
import { pad, pollGamepad } from './gamepad.js';
import * as FX from './fx.js';
import { render, updateFx, setQuality, getQuality, autoQualityAllowed, shadowDue, setResScale, getResScale, fxWarmGroup, fxShowAll, updateAmbient, setSpeedLines, confetti, screenConfetti } from './fx.js';
import { buildHub } from './world.js';
import { installIcons } from './icons.js';
import * as SH from './shadows.js';
import { PRESS, tickKeys, impact, keyWarmGroup, keyDetail } from './keys.js';
import { beginCrowd, endCrowd, flyKeyboard, crowdWarm, addSurf } from './crowd.js';
import { Char, pumpAvatars, avatarsPending } from './chars.js';
import { Track, pingSend, onPong, pingEvery, updateDelay } from './smooth.js';
import {
    toast, bigText, popup, notEnough, animateCounters, bump, updateHud, openPanel, panelIs, refreshPanels, closeTop, anyPopup, codeResult, warmPanels,
    levelUp, winPop, measureHud, onSpun, askConfirm, flyWins, pressTick, hasBoard, bestBoard, spanNow, showHatch, hatchOpen, closeHatch,
} from './ui.js';
import { CFG, WORLDS, BOARDS, QUESTS, TASKS, CAPSULES, capsuleById, palById, UPGRADES, upgradeCost, dailyStatus, fmt, fmtComma, clamp, jumpH, perClick, walkOf, xpOf, xpNeed, bridgeCost } from '../../shared/config.js';
import { newBody, stepBody } from '../../shared/physics.js';
import { W, BOARD_SPOTS, BOARD_KEYS, keyAt, boardAt, spanStart, stretchAt, isleMid, onPad, headOf, hubFor, worldsPortal, capsulesOf } from '../../shared/world.js';

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pause = () => new Promise((r) => setTimeout(r, 0));
const RND = Math.random;
const SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];
const PIANO = [0, 2, 4, 5, 7, 9, 11, 12, 14];

// =====================================================================================
// The hub on screen (one world at a time: a world switch throws the last one away)
// =====================================================================================
let view = null;
const worldOpts = {
    workshop: () => openPanel('work'),
    capsule: (id) => openPanel('capsule', id),
    worlds: () => openPanel('worlds'),
    boardLabel: (b) => { const B = BOARDS[b]; return B.reb ? 'Needs ' + B.reb + (B.reb > 1 ? ' Rebirths' : ' Rebirth') : 'Open: ' + fmtComma(B.wins * WORLDS[S.world].wins) + ' Wins'; },
    unlockBoard: (b) => unlockBoard(b),
};
function unlockBoard(b) {
    const B = BOARDS[b], cost = B.wins * WORLDS[S.world].wins;
    if (B.reb) { toast('🔒 The ' + B.name + ' keyboard opens at ' + B.reb + (B.reb > 1 ? ' rebirths' : ' rebirth'), '#ff9a8a'); sfx('denied'); return; }
    if (S.wins < cost) { notEnough({ cur: 'wins', need: cost - S.wins, name: 'the ' + B.name + ' keyboard' }); return; }
    askConfirm('⌨️', B.name, 'Every press on it gives x' + fmt(B.mult * WORLDS[S.world].kb) + '.', fmtComma(cost) + ' <i class="wc"></i>', () => net.send('unlock', { b }));
}
function buildView(w) {
    if (view && view.w === w) return view;
    if (view) { view.dispose(); view = null; }
    keyDetail(getQuality() === 'low');
    worldOpts.low = getQuality() === 'low';
    fillShown = -1;
    view = buildHub(w, worldOpts);
    P.hub = view.T.world; P.world = P.hub;
    syncLimit();
    setMood(WORLDS[w].mood, true);
    setFogScale(1);
    view.setProgress(S, net.now(), (b) => hasBoard(b, w));
    view.setBoards(boards);
    return view;
}
function syncLimit() { if (P.hub) P.hub.limit = spanNow().n; }
function setProgress() { if (view) { syncLimit(); view.setProgress(S, net.now(), (b) => hasBoard(b, view.w)); } }
// a world switch: behind the fade, built, drawn once with nothing culled (its shaders and textures on the
// graphics card before you see it)
async function drawHidden(group) {
    const culled = [];
    group.traverse((o) => { if ((o.isMesh || o.isPoints) && o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    try { await Promise.race([renderer.compileAsync(scene, camera), sleep(1200)]); } catch (e) { /* compiles when drawn */ }
    render();
    for (const o of culled) o.frustumCulled = true;
}
async function switchWorld(w, x, z) {
    switching = true;
    holdFpsWatch(6);
    closeTop(); closeTop();
    await fadeOut();
    try { buildView(w); await drawHidden(view.group); } catch (e) { console.error('[world]', e); noteError('[world] ' + (e && e.message)); }
    for (const r of remotes.values()) r.char.setVisible(false);
    switching = false;
    teleport(x, 0, z, Math.PI);
    fadeIn();
    bigText(WORLDS[w].icon + ' ' + WORLDS[w].name.toUpperCase(), '#ffe24a');
}

// =====================================================================================
// You: the shared physics (shared/physics.js) on your screen, every frame
// =====================================================================================
const P = {
    b: newBody(W.spawn.x, 0, W.spawn.z), facing: Math.PI, moving: false, world: null, hub: null,
    jumpPress: -9, lastJump: -9, lastPress: -9, combo: 0, comboT: -9, minVy: 0, stride: 0, lastStride: 0, auto: null,
    padAt: -9, lockToast: -9, portalAt: -9, tapToast: -9, bumpAt: -9, frozen: false, snaps: 0, groundY: 0, lastKey: -1, lastBoard: -1, autoT: 0, floatT: -9, onKeys: false,
};
let me = null, localAvatarReq = 0;
function buildMe() {
    if (me) me.dispose();
    me = new Char({ name: S.name, lv: S.lv, tr: S.totalWins });
    setupLocalAvatar();
}
async function setupLocalAvatar() {
    const req = ++localAvatarReq;
    const a = await createAvatar(BX.currentAvatar(), BX.getSkinTextureUrl());
    if (!a) return;
    if (req !== localAvatarReq || !me) { a.dispose(); return; }
    me.wear(a);
}
function syncMyAvatar() {
    const av = BX.currentAvatar();
    if (me && me.blox && av) { me.blox.setProportions(av.proportions); me.blox.setEquipped(av, BX.getSkinTextureUrl()); }
    net.send('avatar', { av: packAvatar(av) });
}
function teleport(x, y, z, yaw) {
    const b = P.b;
    b.x = x; b.y = y; b.z = z; b.vx = b.vy = b.vz = 0; b.onGround = true; b.pound = false;
    P.lastKey = -1;
    camSnap = true;
    if (yaw !== undefined) { P.facing = yaw; cam.yaw = yaw + Math.PI; }
    sendMove(true);
}
const goTo = (to) => { net.send('warp', { to }); };
actions.respawn = () => goTo('spawn');
actions.go = goTo;

// ----- pressing keys -----
// what's been sent and not yet answered: the Keyboards it should give are shown already; each answer takes those it
// covers off the list (the counter never jumps back over a 400 ms round trip)
const pending = [];
let seq = 0;
function pressKey(b, k, stomp) {
    const t = clockT, B = BOARDS[b], key = BOARD_KEYS[k], sp = BOARD_SPOTS[b], got = perClick(S, S.world, b, S.x2), xp = xpOf(S);
    S.kb += got; S.totalKb += got; S.presses++;
    S.xp = Math.min(S.need - 0.01, S.xp + xp);
    pending.push({ s: ++seq, got, xp });
    net.send('press', { b, k, s: seq });
    // the key clacks; its own sound; the bell climbing with every press in a row
    impact(sp.x + key.x, 0, sp.z + key.z, stomp ? 1 : 0.85, 1.2);
    if (!stomp) {
        P.combo = t - P.comboT < 0.9 ? P.combo + 1 : 0; P.comboT = t;
        if (B.id === 'piano') playAsmr('piano', 0.42, Math.pow(2, PIANO[k % 9] / 12) * (k >= 18 ? 2 : 1));
        else playAsmr(B.sound, 0.5, 0.96 + RND() * 0.1);
        if (P.combo > 1 && P.combo % 3 === 0) playAsmr('tick', 0.05 + Math.min(0.05, P.combo * 0.002), Math.pow(2, SCALE[Math.min(14, Math.floor(P.combo / 3))] / 12));
        if (t - P.floatT > (getQuality() === 'low' ? 0.3 : 0.16) && !window.__noFloat) {
            P.floatT = t;
            const side = (RND() < 0.5 ? -1 : 1) * (1.2 + RND() * 2.2), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
            floatText('+' + fmtNum(got), '#ffffff', FX.tmpV.set(P.b.x + rx * side, P.b.y + 6.6 + RND() * 1.5, P.b.z + rz * side), 3.6, false, 'kb');
        }
    }
    pressTick();
}
const fmtNum = (v) => (v >= 1000 ? fmt(v) : String(Math.round(v * 10) / 10));
// a click: the key under you, walking or standing (a tap, the CLICK button, the Auto Clicker)
function clickNow(fromAuto) {
    const b = P.b, t = clockT;
    if (!fromAuto && t - P.lastPress < CFG.tapGap) return;
    const bi = boardAt(b.x, b.z);
    if (bi < 0 || b.y > 4) {
        if (!fromAuto && t - P.tapToast > 2.5) { P.tapToast = t; toast('⌨️ Walk onto a keyboard, then click!', '#ffe24a'); }
        return;
    }
    if (!hasBoard(bi)) { lockedToast(bi, t); return; }
    const sp = BOARD_SPOTS[bi], k = keyAt(sp.x, sp.z, b.x, b.z);
    if (k < 0) return;
    P.lastPress = t;
    pressKey(bi, k);
}
function lockedToast(bi, t) {
    if (t - P.lockToast < 4) return;
    P.lockToast = t;
    const B = BOARDS[bi];
    toast(B.reb ? '🔒 ' + B.name + ' opens at ' + B.reb + (B.reb > 1 ? ' rebirths' : ' rebirth') : '🔒 ' + B.name + ': open it with ' + fmtComma(B.wins * WORLDS[S.world].wins) + ' Wins', '#ff9a8a');
    sfx('denied');
}
// the keys round a landing go down too
function stompKeys(bi, x, z, k0) {
    const sp = BOARD_SPOTS[bi];
    let n = 0;
    for (let i = 0; i < BOARD_KEYS.length && n < 3; i++) {
        if (i === k0) continue;
        const key = BOARD_KEYS[i];
        if (Math.abs(sp.x + key.x - x) < 6 && Math.abs(sp.z + key.z - z) < 6) { pressKey(bi, i, true); n++; }
    }
    playAsmr('stomp', 0.5, 0.95 + RND() * 0.1);
    FX.squishFx(FX.tmpV.set(x, 0.3, z), 'keys', BOARDS[bi].cap[0], 0.8);
}
function panOf(x, z) {
    const dx = x - camera.position.x, dz = z - camera.position.z;
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    return clamp((dx * rx + dz * rz) / 40, -0.8, 0.8);
}

function updateMe(dt) {
    const t = clockT, b = P.b;
    let f = 0, r = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1;
    if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) r += 1;
    if (keys.KeyA || keys.ArrowLeft) r -= 1;
    f -= touchMove.y + pad.ly; r += touchMove.x + pad.lx;
    cam.yaw -= pad.rx * 2.6 * dt * camSens;
    cam.pitch = clamp(cam.pitch + pad.ry * 1.7 * dt * camSens, -0.5, 1.3);
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    let mx = fx * f + rx * r, mz = fz * f + rz * r;
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    let hold = !!(keys.Space || touchJump || (pad.held && pad.held.has('A')));
    let pressed = t - P.jumpPress < 0.15;
    // QA autopilot drives instead
    if (P.auto) { const a = P.auto(dt); mx = a.mx; mz = a.mz; hold = a.hold; pressed = a.jump; }
    P.frozen = anyPopup() || switching;
    if (P.frozen) { mx = 0; mz = 0; pressed = false; hold = false; }
    P.moving = mx * mx + mz * mz > 0.01;
    // holding JUMP keeps jumping
    if (hold && b.onGround && !pressed && t - P.lastJump > 0.12) pressed = true;
    const boost = walkOf(S) / CFG.walk;
    const inp = { mx, mz, jump: pressed, hold, power: CFG.power, double: false, speed: boost };
    if (!b.onGround) P.minVy = Math.min(P.minVy, b.vy);
    const hs0 = Math.hypot(b.vx, b.vz);
    const ev = stepBody(b, inp, dt, P.world);
    // running into a wall: a thud, a jolt
    if (P.moving && hs0 > 14 && Math.hypot(b.vx, b.vz) < hs0 * 0.25 && t - P.bumpAt > 0.5) { P.bumpAt = t; playAsmr('floor', 0.5, 0.7); shake = Math.max(shake, 0.1); me.squash(0.3); }
    if (ev === 1 || ev === 2) {
        // that press is used up: one press, one jump
        P.jumpPress = -9; P.lastJump = t;
        me.stretch(0.6);
        playAsmr('boing', 0.26, 1.05 + RND() * 0.1);
        P.minVy = 0;
        fovKick = 2.2;
    } else if (ev === 3 || ev === 4) {
        const k = clamp(-P.minVy / 60, 0.3, 1.4);
        me.squash(k);
        const bi = boardAt(b.x, b.z);
        if (bi >= 0 && hasBoard(bi)) stompKeys(bi, b.x, b.z, keyAt(BOARD_SPOTS[bi].x, BOARD_SPOTS[bi].z, b.x, b.z));
        else if (stretchAt(b.z) > 0) { impact(b.x, 0, b.z, 1, 5); playAsmr('stomp', 0.35, 1.05); } else playAsmr('floor', 0.5, 0.9);
        P.minVy = 0;
    }
    if (P.moving) P.facing = lerpA(P.facing, Math.atan2(mx, mz), 1 - Math.exp(-dt * 14));
    // footsteps
    if (b.onGround && P.moving) {
        P.stride += dt * CFG.walk * boost / 5.4;
        if (Math.floor(P.stride) !== P.lastStride) {
            P.lastStride = Math.floor(P.stride);
            if (P.onKeys && !P.stepKeyed) playAsmr('deck', 0.2, 0.95 + RND() * 0.15); else if (!P.onKeys) playAsmr('floor', 0.5, 1 + RND() * 0.2);
        }
    }
    P.stepKeyed = false;
    hubTouch(t, dt);
    if (b.y < -40) goTo('spawn');
    if (me) me.update(dt, t, { x: b.x, y: b.y - (P.onKeys && b.onGround ? 0.32 : 0), z: b.z, ry: P.facing, snapRy: true, air: !b.onGround, moving: P.moving && b.onGround, speed: Math.hypot(b.vx, b.vz), vy: b.vy, jump: ev === 1, airJump: ev === 2, ground: 0 });
    sendMove(false);
}
const lerpA = (a, b2, k) => { let d = (b2 - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
// ----- what you're standing on, on the islands: a key, a Win Pad, the portal, the head of a bridge -----
function hubTouch(t, dt) {
    const b = P.b;
    if (!view || switching) return;
    const bi = b.onGround ? boardAt(b.x, b.z) : -1, st = stretchAt(b.z);
    P.onKeys = bi >= 0 || st > 0;
    if (bi !== S.onBoard) { S.onBoard = bi; updateHud(); }
    if (bi >= 0) {
        if (!hasBoard(bi)) lockedToast(bi, t);
        else {
            const sp = BOARD_SPOTS[bi], k = keyAt(sp.x, sp.z, b.x, b.z);
            if (k >= 0 && (k !== P.lastKey || bi !== P.lastBoard)) { P.lastKey = k; P.lastBoard = bi; P.stepKeyed = true; P.lastPress = t; pressKey(bi, k); }
            // the Auto Clicker, and the CLICK button held down
            const rate = S.ups && S.ups.auto ? S.ups.auto : 0;
            if (rate && S.autoOn && !P.frozen) { P.autoT += dt; const gap = 1 / rate; if (P.autoT >= gap) { P.autoT -= gap; clickNow(true); } }
            if (touchClick && !P.frozen) clickNow(false);
        }
    } else { P.lastKey = -1; P.lastBoard = -1; if (touchClick && !P.frozen) clickNow(false); }
    // a Win Pad
    if (st < 0 && b.onGround) {
        const k = -st;
        if (onPad(k, b.x, b.z) && t - P.padAt > 1.4) {
            P.padAt = t;
            const c = S.claimed && S.claimed[S.world + ':' + k];
            if (c && c.next > net.now()) { if (t - P.lockToast > 3) { P.lockToast = t; toast('🏆 This Win Pad is ready again in ' + Math.ceil((c.next - net.now()) / 1000) + 's', '#ffe24a'); } } else { sendMove(true); net.send('pad', { k }); }
        }
    }
    // walking through the portal's arch
    if (st === 0 && t - P.portalAt > 3 && !anyPopup()) {
        if (Math.abs(b.x - worldsPortal.x) < 7 && Math.abs(b.z - worldsPortal.z) < 1.6) { P.portalAt = t; sfx('whoosh'); openPanel('worlds'); }
    }
    updateFilling(t);
}
// ----- at the head of the next bridge: the Keyboards go in, its keys pop up, a counter over it -----
let fillShown = -1, fillTagOn = false, fillDone = 0;
const fillV = new V3();
function updateFilling(t) {
    const o = spanNow(), wd = WORLDS[S.world], k = o.n + 1, b = P.b;
    if (k > wd.bridges) { hideFillTag(); return; }
    const sp = view.spans[o.n], cost = sp.cost, at = headOf(k, b.x, b.z);
    // what's gone in, gliding between the server's answers
    fillShown += (o.part - fillShown) * Math.min(1, 0.25);
    if (Math.abs(o.part - fillShown) < 0.5 || fillShown < 0) fillShown = o.part;
    const before = sp.shown;
    view.setBridges(o.n, fillShown);
    if (sp.shown > before) {
        for (let i = 0, n = Math.min(4, sp.shown - before); i < n; i++) {
            playAsmr('snap', 0.28, 0.85 + (sp.shown / sp.n) * 0.9 + RND() * 0.1, 0, i * 0.03);
            const j = sp.shown - i, row = Math.floor((j - 1) / W.spanCols), col = (j - 1) % W.spanCols;
            flyKeyboard(b.x, b.y + 4, b.z, (col - (W.spanCols - 1) / 2) * W.spanHalf * 0.28, 0.4, sp.z0 - (row + 0.5) * W.spanLen / W.spanRows, bestBoard(), i * 0.04);
        }
    }
    // the counter, close to the bridge and only then
    const near = Math.abs(b.x) < W.spanHalf + 20 && b.z - sp.z0 < 34 && b.z - sp.z0 > -2;
    if (!near || anyPopup()) { hideFillTag(); return; }
    fillV.set(0, 3.5, sp.z0 - 4).project(camera);
    if (fillV.z > 1) { hideFillTag(); return; }
    if (!fillTagOn) { fillTagOn = true; $('#fillTag').hidden = false; }
    const txt = fmt(Math.floor(fillShown)) + ' / ' + fmt(cost);
    if ($('#fillVal').textContent !== txt) $('#fillVal').textContent = txt;
    const fr = Math.min(1, fillShown / cost);
    if (Math.abs(fr - fillDone) > 0.004) { fillDone = fr; $('#fillI').style.transform = 'scaleX(' + fr.toFixed(3) + ')'; }
    $('#fillTag').style.transform = `translate(${((fillV.x + 1) / 2 * innerWidth).toFixed(0)}px, ${((1 - fillV.y) / 2 * innerHeight).toFixed(0)}px) translate(-50%, -100%)`;
    void at; void t;
}
function hideFillTag() { if (fillTagOn) { fillTagOn = false; $('#fillTag').hidden = true; } }
// ----- the guide: chevrons on the ground, flowing from you to what to do next -----
const GUIDE_N = 12;
let guide = null, guideOn = false;
const guideM = new T.Matrix4(), guideQ = new T.Quaternion(), guideV = new V3(), guideS = new V3(1, 1, 1), guideUp = new V3(0, 1, 0);
function guideMesh() {
    const s = new T.Shape();
    s.moveTo(-2.2, -1); s.lineTo(0, 0.8); s.lineTo(2.2, -1); s.lineTo(2.2, 0.2); s.lineTo(0, 2); s.lineTo(-2.2, 0.2); s.closePath();
    const g = new T.ShapeGeometry(s).rotateX(-Math.PI / 2);
    const m = new T.InstancedMesh(g, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, depthWrite: false }), GUIDE_N);
    m.frustumCulled = false; m.renderOrder = 2; m.count = 0;
    scene.add(m);
    return m;
}
function guideTarget() {
    const o = spanNow(), wd = WORLDS[S.world], k = o.n + 1, left = k <= wd.bridges ? bridgeCost(S.world, k) - o.part : 0, last = S.claimed && S.claimed[S.world + ':' + o.n];
    if (o.n > 0 && (!last || !last.first)) return { x: 0, z: isleMid(o.n) };
    if (k <= wd.bridges && S.kb >= left) return { x: 0, z: spanStart(k) + 2 };
    const caps = capsulesOf(S.world);
    if (!S.hatched && caps[0] && S.wins >= caps[0].c.wins) return { x: caps[0].x, z: caps[0].z + 7 };
    const sp = BOARD_SPOTS[bestBoard()];
    return { x: sp.x, z: sp.z };
}
function updateGuide(t) {
    if (!guide) guide = guideMesh();
    const b = P.b;
    const on = !switching && !anyPopup() && S.presses < 2000;
    const g = on ? guideTarget() : null;
    if (!g) { if (guideOn) { guideOn = false; guide.count = 0; guide.visible = false; } return; }
    const dx = g.x - b.x, dz = g.z - b.z, d = Math.hypot(dx, dz);
    if (d < 7 || (boardAt(b.x, b.z) === boardAt(g.x, g.z) && boardAt(g.x, g.z) >= 0)) { guide.count = 0; guide.visible = false; guideOn = false; return; }
    guideOn = true; guide.visible = true;
    const ux = dx / d, uz = dz / d, gap = 6, off = (t * 11) % gap;
    guideQ.setFromAxisAngle(guideUp, Math.atan2(ux, uz) + Math.PI);
    let n = 0;
    for (let i = 0; i < GUIDE_N; i++) {
        const s = 3 + i * gap + off;
        if (s > d - 2) break;
        const fade = Math.min(1, (d - 2 - s) / 3) * Math.min(1, (s - 1) / 2);
        guide.setMatrixAt(n++, guideM.compose(guideV.set(b.x + ux * s, 0.42, b.z + uz * s), guideQ, guideS.setScalar(Math.max(0.05, fade))));
    }
    guide.count = n;
    guide.instanceMatrix.needsUpdate = true;
}

// =====================================================================================
// The camera: close behind you (drag to turn, wheel / pinch to zoom)
// =====================================================================================
const cam = { yaw: 0, pitch: 0.36, dist: isTouch ? 21 : 18 };
let camD = 18, camSens = 1, camSnap = true, shake = 0, fovKick = 0;
const dirV = new V3(), pivotV = new V3(), backV = new V3(), camPos = new V3(), lookV = new V3();
let pivotY = 5;
function lookDir(out) { const p = cam.pitch, cp = Math.cos(p); return out.set(-Math.sin(cam.yaw) * cp, -Math.sin(p), -Math.cos(cam.yaw) * cp); }
const LZD = SUN_DIRECTION.clone().normalize(), LX = new V3(0, 1, 0).cross(LZD).normalize(), LY = LZD.clone().cross(LX), snapV = new V3();
function snapShadow(p) {
    const c = sun.shadow.camera, texel = (c.right - c.left) / sun.shadow.mapSize.x;
    const a = Math.round(p.dot(LX) / texel) * texel, b = Math.round(p.dot(LY) / texel) * texel;
    snapV.copy(LX).multiplyScalar(a).addScaledVector(LY, b).addScaledVector(LZD, p.dot(LZD));
    sun.target.position.copy(snapV);
    sun.position.copy(snapV).addScaledVector(LZD, 200);
}
const AX = [0, 1, 2], oA = [0, 0, 0], dA = [0, 0, 0];
function rayHit(o, d, maxT) {
    let best = maxT;
    oA[0] = o.x; oA[1] = o.y; oA[2] = o.z; dA[0] = d.x; dA[1] = d.y; dA[2] = d.z;
    for (const c of P.world.solids) {
        if (c.max[1] - c.min[1] < 3 || c.max[0] - c.min[0] < 2.5) continue;
        let t0 = 0, t1 = best, miss = false;
        for (const a of AX) {
            if (Math.abs(dA[a]) < 1e-9) { if (oA[a] < c.min[a] || oA[a] > c.max[a]) { miss = true; break; } continue; }
            let ta = (c.min[a] - oA[a]) / dA[a], tb = (c.max[a] - oA[a]) / dA[a];
            if (ta > tb) { const q = ta; ta = tb; tb = q; }
            t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
            if (t0 > t1) { miss = true; break; }
        }
        if (!miss && t0 > 0 && t0 < best) best = t0;
    }
    return best;
}
function updateCamera(dt) {
    const b = P.b, portrait = innerWidth < innerHeight;
    lookDir(dirV);
    const gy = b.y + 5.2;
    if (camSnap || (pivotV.x - b.x) ** 2 + (pivotV.z - b.z) ** 2 > 900) { pivotV.set(b.x, gy, b.z); pivotY = gy; camSnap = false; }
    else {
        const kx = 1 - Math.exp(-dt * 16);
        pivotV.x += (b.x - pivotV.x) * kx; pivotV.z += (b.z - pivotV.z) * kx;
        pivotY += (gy - pivotY) * (1 - Math.exp(-dt * (b.onGround ? 10 : 6)));
        pivotV.y = pivotY;
    }
    backV.copy(dirV).negate();
    if (b.onGround) P.groundY = b.y;
    let lim = cam.dist + (portrait ? 7 : 0) + Math.min(10, Math.max(0, b.y - P.groundY) * 0.08);
    lim = Math.min(lim, rayHit(pivotV, backV, lim + 1) - 0.8);
    lim = Math.max(2, lim);
    camD = lim < camD ? lim : camD + (lim - camD) * (1 - Math.exp(-dt * 4));
    camPos.copy(pivotV).addScaledVector(backV, camD);
    if (camPos.y < 0.8) camPos.y = 0.8;
    camera.position.copy(camPos);
    camera.lookAt(lookV.copy(camPos).addScaledVector(dirV, 30));
    if (shake > 0.001) { const s = shake * shake * 0.8; camera.position.x += (RND() * 2 - 1) * s; camera.position.y += (RND() * 2 - 1) * s; shake = Math.max(0, shake - dt * 2.4); }
    // every takeoff widens the view a touch, easing back
    fovKick = Math.max(0, fovKick - dt * 9);
    const want = (portrait ? 84 : 70) + fovKick;
    if (Math.abs(camera.fov - want) > 0.01) { camera.fov += (want - camera.fov) * Math.min(1, dt * 10); camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    if (me) me.root.visible = camD > 2.2;
}

// =====================================================================================
// Input
// =====================================================================================
const keys = {};
const touchMove = { x: 0, y: 0 };
let running = false, touchJump = false, touchClick = false;
actions.onPanel = () => { for (const k in keys) keys[k] = false; touchJump = false; touchClick = false; };
addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) { if (e.key === 'Enter') e.target.blur(); return; }
    if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
    if (!running) return;
    if (e.code === 'Escape' && !e.repeat) { if (closeTop()) return; if (BX.isEmbedded()) BX.showPortalMenu(); else openPanel('settings'); return; }
    keys[e.code] = true;
    if (e.repeat || anyPopup()) return;
    if (e.code === 'Space') P.jumpPress = clockT;
    if (e.code === 'KeyE' && activePrompt) usePrompt();
    if (e.code === 'KeyR') goTo('board');
    if (e.code === 'KeyB') goTo('bridge');
    if (e.code === 'KeyQ') openPanel('quests');
    if (e.code === 'KeyF') openPanel('spin');
    if (e.code === 'KeyG') openPanel('shop');
    if (e.code === 'KeyP') openPanel('pals');
    if (e.code === 'KeyU') openPanel('work');
    if (e.code === 'Enter') clickNow(false);
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; touchJump = false; touchClick = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
const drags = new Map();
let pinchD = 0;
canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    if (!running || anyPopup()) return;
    canvas.setPointerCapture(e.pointerId);
    drags.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false, at: performance.now() });
    if (drags.size === 2) { const [a, b] = [...drags.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); }
});
canvas.addEventListener('pointermove', (e) => {
    const d = drags.get(e.pointerId);
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) d.moved = true;
    if (drags.size === 2) {
        const [a, b] = [...drags.values()], nd = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD) cam.dist = clamp(cam.dist * pinchD / Math.max(20, nd), 8, 44);
        pinchD = nd;
    } else if (d.moved) {
        const k = (e.pointerType === 'touch' ? 0.0068 : 0.0045) * camSens;
        cam.yaw -= (e.clientX - d.x) * k;
        cam.pitch = clamp(cam.pitch + (e.clientY - d.y) * k, -0.5, 1.3);
    }
    d.x = e.clientX; d.y = e.clientY;
});
// a click or tap on the world that wasn't a drag: a click on the key under you
const endDrag = (e) => { const d = drags.get(e.pointerId); drags.delete(e.pointerId); if (drags.size < 2) pinchD = 0; if (d && e.type === 'pointerup' && !d.moved && performance.now() - d.at < 400 && running && !anyPopup()) clickNow(false); };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + Math.sign(e.deltaY) * 2, 8, 44); e.preventDefault(); }, { passive: false });
(function touchControls() {
    const stick = $('#stick'), knob = $('#knob');
    let id = null, rect = null;
    const set = (e) => {
        const r = rect;
        let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const max = r.width / 2, l = Math.hypot(dx, dy);
        if (l > max) { dx *= max / l; dy *= max / l; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        touchMove.x = dx / max; touchMove.y = dy / max;
    };
    stick.addEventListener('pointerdown', (e) => { id = e.pointerId; rect = stick.getBoundingClientRect(); stick.setPointerCapture(id); set(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; touchMove.x = touchMove.y = 0; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    const jb = $('#jumpBtn'), cb = $('#clickBtn');
    jb.addEventListener('pointerdown', (e) => { e.preventDefault(); jb.setPointerCapture(e.pointerId); P.jumpPress = clockT; touchJump = true; jb.classList.add('on'); });
    const jEnd = () => { touchJump = false; jb.classList.remove('on'); };
    jb.addEventListener('pointerup', jEnd); jb.addEventListener('pointercancel', jEnd);
    cb.addEventListener('pointerdown', (e) => { e.preventDefault(); cb.setPointerCapture(e.pointerId); touchClick = true; cb.classList.add('on'); clickNow(false); });
    const cEnd = () => { touchClick = false; cb.classList.remove('on'); };
    cb.addEventListener('pointerup', cEnd); cb.addEventListener('pointercancel', cEnd);
})();

// ----- proximity prompts (the Workshop, the machines, the portals, a locked keyboard) -----
let activePrompt = null;
const pv = new V3();
function updatePrompt() {
    let best = null, bd = 1e9;
    const b = P.b;
    if (!anyPopup() && b.y < 6) for (const p of prompts) { if (p.on && !p.on()) continue; const d = Math.hypot(p.pos.x - b.x, p.pos.z - b.z); if (d < p.r && d < bd) { bd = d; best = p; } }
    activePrompt = best;
    const el = $('#promptBtn');
    if (!best) { if (!el.hidden) el.hidden = true; return; }
    pv.copy(best.pos).setY(best.pos.y + 6).project(camera);
    if (pv.z > 1) { el.hidden = true; return; }
    el.hidden = false;
    const lbl = best.label();
    if ($('#promptTxt').textContent !== lbl) $('#promptTxt').textContent = lbl;
    el.style.transform = `translate(${((pv.x + 1) / 2 * innerWidth).toFixed(0)}px, ${((1 - pv.y) / 2 * innerHeight).toFixed(0)}px) translate(-50%, -110%)`;
}
function usePrompt() { if (activePrompt) { sfx('click'); activePrompt.act(); } }
$('#promptBtn').addEventListener('click', usePrompt);

// ----- controller -----
function padButtons() {
    if (!pad.connected || !running) return;
    if (pad.pressed.has('BACK') || pad.pressed.has('START')) { if (!closeTop()) openPanel('settings'); return; }
    if (anyPopup()) { if (pad.pressed.has('B')) closeTop(); return; }
    if (pad.pressed.has('A')) P.jumpPress = clockT;
    if (pad.pressed.has('X')) { if (activePrompt) usePrompt(); else clickNow(false); }
    if (pad.pressed.has('Y')) openPanel('quests');
    if (pad.pressed.has('LB')) openPanel('spin');
    if (pad.pressed.has('RB')) openPanel('shop');
}

// =====================================================================================
// Everyone else in your world (smoothed on the server's clock)
// =====================================================================================
const remotes = new Map();
const smp = { x: 0, y: 0, z: 0, ry: 0, a: 0, speed: 0 };
class Remote {
    constructor(p, id) {
        this.id = id;
        this.char = new Char({ name: p.name, lv: p.lv, tr: p.wins });
        this.char.setAvatar(p.av);
        this.av = p.av; this.track = new Track(); this.air = false; this.prevY = p.y; this.vy = 0; this.minVy = 0; this.here = false;
    }
    update(p, dt, t, rt) {
        this.track.push(p.t, p.x, p.y, p.z, p.ry, p.anim);
        this.here = p.world === S.world;
        if (!this.here || switching) { this.char.setVisible(false); this.onGround = false; return; }
        if (!this.track.sample(rt, smp)) { smp.x = p.x; smp.y = p.y; smp.z = p.z; smp.ry = p.ry; smp.a = p.anim; smp.speed = 0; }
        const air = smp.a >= 2, vy = dt > 0 ? (smp.y - this.prevY) / dt : 0;
        this.vy += (vy - this.vy) * Math.min(1, dt * 12);
        if (air) this.minVy = Math.min(this.minVy, this.vy);
        if (this.air && !air) { landAt(smp.x, smp.y, smp.z, clamp(-this.minVy / 60, 0.3, 1.3)); this.char.squash(0.6); this.minVy = 0; }
        if (!this.air && air && this.vy > 3) this.char.stretch(0.5);
        this.air = air; this.prevY = smp.y;
        if (p.av !== this.av) { this.av = p.av; this.char.setAvatar(p.av); }
        this.char.setLabel(p.name, p.lv, p.wins);
        this.char.setStack(p.stack, p.bt);
        this.char.setTeam(p.team);
        const d2 = camera.position.distanceToSquared(FX.tmpV.set(smp.x, smp.y, smp.z)), near = d2 < 240 * 240;
        this.char.setVisible(near);
        if (near) {
            this.char.update(dt, t, { x: smp.x, y: smp.y, z: smp.z, ry: smp.ry, air, moving: smp.a === 1 || smp.speed > 2, speed: smp.speed, vy: this.vy, far: d2 > 110 * 110, ground: 0 });
            // further along than you: their bridge isn't here on your screen, so they ride a keyboard across
            if (d2 < 110 * 110 && stretchAt(smp.z) > spanNow().n && smp.y < 3) addSurf(smp.x, Math.max(0, smp.y), smp.z, smp.ry, p.bt);
        }
        this.x = smp.x; this.y = smp.y; this.z = smp.z; this.onGround = !air;
    }
    dispose() { this.char.dispose(); }
}
// someone else's landing: the keys under them clack, quietly
function landAt(x, y, z, k) {
    const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
    if (d > 120) return;
    impact(x, 0, z, Math.min(1, k), 4);
    const near = boardAt(x, z) >= 0 || stretchAt(z) > 0;
    if (near) playAsmr('stomp', 0.3 * (1 - d / 120), 1, panOf(x, z)); else playAsmr('floor', 0.3 * (1 - d / 120), 0.9, panOf(x, z));
}
const seenIds = new Set();
function syncRemotes(dt, t) {
    const room = net.room;
    if (!room || !room.state || !room.state.players) return;
    seenIds.clear();
    const rt = net.now() - updateDelay();
    room.state.players.forEach((p, id) => {
        if (id === room.sessionId) { if (S.name !== p.name) { S.name = p.name; if (me) me.setLabel(S.name, S.lv, S.totalWins); } if (me) me.setStack(p.stack, p.bt); return; }
        seenIds.add(id);
        let r = remotes.get(id);
        if (!r) { r = new Remote(p, id); remotes.set(id, r); }
        r.update(p, dt, t, rt);
    });
    for (const [id, r] of remotes) if (!seenIds.has(id)) { r.dispose(); remotes.delete(id); }
}
// where everyone stands (the keys they hold down): the nearest 8
const pressList = [], pressPool = [];
const pressOf = (i, x, y, z, d) => { const p = pressPool[i] || (pressPool[i] = [0, 0, 0, 0]); p[0] = x; p[1] = y; p[2] = z; p[3] = d; return p; };
function updatePresses() {
    pressList.length = 0;
    const b = P.b;
    if (b.onGround) pressList.push(pressOf(0, b.x, b.y, b.z, 0));
    for (const o of remotes.values()) if (o.here && o.onGround && o.x !== undefined && pressList.length < 24) pressList.push(pressOf(pressList.length, o.x, o.y, o.z, (o.x - b.x) ** 2 + (o.z - b.z) ** 2));
    if (pressList.length > 8) pressList.sort((a, c) => a[3] - c[3]);
    for (let i = 0; i < 8; i++) { const p = pressList[i]; if (p) PRESS.value[i].set(p[0], p[1], p[2], 1); else PRESS.value[i].w = 0; }
}

// =====================================================================================
// HUD buttons
// =====================================================================================
let switching = false;
// (the button lets go of the keyboard: SPACE jumps, it never presses the last button clicked again)
const bind = (sel, fn) => $(sel).addEventListener('click', (e) => { sfx('click'); e.currentTarget.blur(); fn(); });
bind('#bPals', () => openPanel('pals'));
bind('#bWork', () => openPanel('work'));
bind('#bRebirth', () => openPanel('rebirth'));
bind('#bSpin', () => openPanel('spin'));
bind('#bQuests', () => openPanel('quests'));
bind('#bDaily', () => openPanel('daily'));
bind('#bIndex', () => openPanel('pals', 'index'));
bind('#bWorlds', () => openPanel('worlds'));
bind('#bSettings', () => openPanel('settings'));
bind('#bShop', () => openPanel('shop'));
bind('#bGift', () => openPanel('gifts'));
bind('#questLine', () => openPanel('quests'));
bind('#winsBox', () => openPanel('boards'));
bind('#gemsBox', () => openPanel('shop'));
bind('#bX2', () => openPanel('shop'));
bind('#bGoBridge', () => goTo('bridge'));
bind('#bGoBoard', () => goTo('board'));
bind('#bAuto', () => {
    const n = (S.ups && S.ups.auto) || 0;
    if (!n) {
        const u = UPGRADES.find((x) => x.id === 'auto'), cost = upgradeCost(u, 0);
        askConfirm('🖱️', 'Auto Clicker', 'It clicks for you while you stand on a keyboard. More speed at the Workshop.', fmtComma(cost) + ' <i class="wc"></i>', () => { S.autoOn = true; storageSet('kb1_auto', '1'); net.send('upgrade', { id: 'auto' }); });
        return;
    }
    S.autoOn = !S.autoOn;
    storageSet('kb1_auto', S.autoOn ? '1' : '0');
    toast(S.autoOn ? '🖱️ Auto Click on: stand on a keyboard' : '🖱️ Auto Click off', S.autoOn ? '#7dff6b' : '#ffffff');
    updateHud();
});
S.autoOn = storageGet('kb1_auto') !== '0';
function fadeOut() { $('#fade').style.opacity = 1; return sleep(260); }
function fadeIn() { $('#fade').style.opacity = 0; }
let showFps = false;
actions.fpsOn = () => showFps;
actions.toggleFps = () => { showFps = !showFps; $('#fps').hidden = !showFps; };
let boards = { wins: [], kb: [] };
actions.boards = () => boards;
actions.world = (w) => { if (w === S.world) { closeTop(); goTo('spawn'); return; } net.send('world', { w }); };
actions.toggleMusic = () => toggleMusic();
let hatchWant = null, hatchAuto = false;
actions.hatch = (c, n) => { hatchWant = { c, n }; net.send('hatch', { c, n }); };
actions.onHatched = (out) => {
    screenConfetti(40);
    const best = out.slice().sort((a, b) => palById[b.id].mult - palById[a.id].mult)[0], k = palById[best.id];
    if (k.rarity === 'legendary' || k.rarity === 'mythic') { sfx('rankup'); screenConfetti(90); }
    if (me) FX.sparkleColumn(P.b, k.color);
};
actions.afterHatch = () => { if (hatchAuto && hatchWant) net.send('hatch', hatchWant); };
addEventListener('resize', () => measureHud());

// =====================================================================================
// Networking
// =====================================================================================
const BLOXITY_GAME_ID = import.meta.env.VITE_BLOXITY_GAME_ID || '';
const ON_BLOXITY_HOST = /\.play\.bloxity\.io$/.test(location.hostname);
const DEV_CHANNEL = /\.dev\.play\.bloxity\.io$/.test(location.hostname);
const SERVER_URL = import.meta.env.VITE_SERVER_URL
    || (ON_BLOXITY_HOST ? `https://${location.hostname.replace(/\.play\.bloxity\.io$/, '.host.bloxity.io')}`
        : BLOXITY_GAME_ID ? `https://${BLOXITY_GAME_ID}.host.bloxity.io`
        : import.meta.env.DEV ? `${location.protocol}//${location.hostname}:2863` : location.origin);
async function serverEndpoint() {
    let url = SERVER_URL;
    if (BLOXITY_GAME_ID) {
        const r = await BX.resolveEndpoint(BLOXITY_GAME_ID, DEV_CHANNEL ? 'preview' : undefined);
        if (r && r.cold) loadingText('Waking up a server…');
        url = (r && r.endpoint) || SERVER_URL;
    }
    if (!/^https?:/i.test(url)) return url;
    if (!(await serverUp(url))) {
        loadingText('Waking up a server…');
        const until = Date.now() + 60000;
        while (Date.now() < until) { await sleep(2000); if (await serverUp(url)) break; }
    }
    return url;
}
async function serverUp(url) {
    try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 4000);
        const r = await fetch(url.replace(/\/$/, '') + '/health', { signal: ctl.signal, cache: 'no-store' });
        clearTimeout(t);
        return r.ok;
    } catch (e) { return false; }
}
let lastMoveSent = 0, lastMoveKey = '';
function sendMove(force) {
    if (switching) return;
    const now = performance.now();
    if (!force && now - lastMoveSent < 66) return;
    const b = P.b;
    const a = !b.onGround ? 2 : P.moving ? 1 : 0;
    const m = { x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2), ry: +P.facing.toFixed(3), a };
    const key = m.x + ',' + m.y + ',' + m.z + ',' + m.ry + ',' + a;
    if (!force && key === lastMoveKey && now - lastMoveSent < 500) return;
    lastMoveKey = key; lastMoveSent = now;
    m.ts = Math.round(net.now());
    net.send('move', m);
}
function playerUid() {
    let uid = storageGet('kb1_uid');
    if (!uid) { uid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); storageSet('kb1_uid', uid); }
    return uid;
}
// an answer from the server: its numbers, plus what's been pressed since that it hasn't seen yet
function reconcile(m) {
    if (m.ack !== undefined) while (pending.length && pending[0].s <= m.ack) pending.shift();
    let g = 0, x = 0;
    for (const p of pending) { g += p.got; x += p.xp; }
    if (m.kb !== undefined) S.kb = m.kb + g;
    if (m.xp !== undefined) S.xp = Math.min((m.need || S.need) - 0.01, m.xp + x);
    delete m.kb; delete m.xp; delete m.ack;
}
let gotProfile = false, lastGems = 0, lastWins = 0, lastReb = -1;
async function connect(name, endpoint) {
    const url = endpoint || await serverEndpoint();
    const client = new Client(url);
    const id = BX.identity();
    const room = await client.joinOrCreate('keys', { uid: playerUid(), name: name || id.name, token: id.token, av: packAvatar(BX.currentAvatar()), save: storageGet('kb1_save') || '' });
    net.room = room;
    net.bloxity = false;
    BX.updateRoom(room.roomId);
    room.onMessage('hello', (m) => { net.offset = m.now - Date.now(); setEpoch(m.now); net.bloxity = !!m.bloxity; pingSend(); });
    room.onMessage('pong', onPong);
    room.onMessage('profile', (m) => {
        const first = !gotProfile;
        if (m.save) storageSet('kb1_save', m.save);
        delete m.now;
        const prevWorld = S.world;
        reconcile(m);
        Object.assign(S, m);
        S.x2 = (S.x2Until || 0) > net.now();
        S.profileAt = Date.now();
        gotProfile = true;
        if (!first && m.gems > lastGems) { bump('#gemsBox'); sfx('gem'); }
        if (!first && m.wins > lastWins + 0.5) bump('#winsBox');
        lastGems = m.gems; lastWins = m.wins;
        if (me) { me.setLabel(S.name, S.lv, S.totalWins); me.setTeam((S.team || []).join(',')); }
        setProgress();
        if (lastReb !== S.rebirths) { lastReb = S.rebirths; document.body.classList.toggle('reborn', S.rebirths > 0); }
        // a world switch made elsewhere (another tab) shows up here
        if (!first && running && !switching && prevWorld !== S.world && view && view.w !== S.world) switchWorld(S.world, W.spawn.x, W.spawn.z);
        refreshPanels();
        updateHud();
    });
    // while pressing and filling: only what changes then, four times a second
    room.onMessage('lite', (m) => {
        reconcile(m);
        S.totalKb = m.totalKb; S.lv = m.lv; S.need = m.need; S.presses = m.presses; S.wins = m.wins;
        if (m.qv !== undefined) S.qv = m.qv;
        const o = S.spans[S.world] || (S.spans[S.world] = { n: 0, part: 0 });
        o.n = m.n; o.part = m.part;
        syncLimit();
        S.profileAt = S.profileAt || Date.now();
        updateHud();
    });
    room.onMessage('toast', (m) => toast(m.text, m.color));
    room.onMessage('toastreward', (m) => { toast(m.text, '#7dff6b'); sfx('gem'); });
    room.onMessage('broke', (m) => notEnough(m));
    room.onMessage('code', (m) => codeResult(m));
    room.onMessage('boards', (m) => { boards = m; if (view) view.setBoards(m); if (panelIs('boards')) refreshPanels(); });
    room.onMessage('reward', (m) => { popup(m.gems && !/kc|wc/.test(m.text) ? '💎' : '🎁', m.why || 'Reward!', m.text, '#ffe24a', true); sfx('reward'); confetti(P.b); if (/wc/.test(m.text)) flyWins(8); });
    room.onMessage('levelup', (m) => {
        const was = S.lv;
        S.lv = m.lv; S.need = xpNeed(m.lv); S.xp = 0;
        sfx('levelup');
        levelUp(was, m.lv);
        if (me) { FX.sparkleColumn(P.b, 0xffe24a); me.setLabel(S.name, S.lv, S.totalWins); }
        updateHud();
    });
    room.onMessage('lucky', (m) => { sfx('lucky'); S.kb += m.got * 0.9; floatText('LUCKY +' + fmtNum(m.got), '#ffe24a', FX.tmpV.set(P.b.x, P.b.y + 8, P.b.z), 8, true, 'kb'); FX.powerFx(P.b, 0xffe24a, 12); });
    room.onMessage('bridge', (m) => {
        const o = S.spans[S.world] || (S.spans[S.world] = { n: 0, part: 0 });
        o.n = m.k; o.part = 0; fillShown = 0; fillDone = 0;
        syncLimit();
        if (view) view.setBridges(m.k, 0);
        sfx('bridge');
        screenConfetti(m.k >= WORLDS[S.world].bridges ? 120 : 50);
        bigText(m.k >= WORLDS[S.world].bridges ? 'WORLD CLEARED!' : 'STAGE ' + m.k + ' CLEARED!', '#7dff6b');
        shake = Math.max(shake, 0.2);
        // fireworks over the island you've just opened
        {
            const pd = view && view.pads[m.k - 1];
            if (pd) FX.fireworks(FX.tmpV.set(0, 6, pd.zi), getQuality() === 'low' ? 3 : 6);
        }
        if (m.k === 1 && !S.pads) setTimeout(() => toast('🏆 Run across and touch the WIN PAD!', '#ffe24a'), 800);
    });
    room.onMessage('padok', (m) => onPadOk(m));
    room.onMessage('warped', (m) => warpTo(m.x, m.z));
    room.onMessage('reborn', (m) => {
        sfx('rankup');
        popup('🔄', 'REBIRTH ' + m.r + '!', 'Every press now gives x' + (1 + 0.5 * m.r), '#e0a8ff');
        screenConfetti(90);
        pending.length = 0;
        fillShown = 0;
        teleport(m.x, 0, m.z, Math.PI);
    });
    room.onMessage('warp', (m) => { S.world = m.w; pending.length = 0; switchWorld(m.w, m.x, m.z); });
    room.onMessage('spun', (m) => onSpun(m));
    room.onMessage('offline', (m) => setTimeout(() => { popup('⌨️', 'WELCOME BACK!', 'Your keyboards kept typing for ' + m.mins + ' min: +' + fmt(m.got) + ' <i class="kc"></i>', '#7dff6b', true); sfx('reward'); }, 1500));
    room.onMessage('bought', (m) => {
        sfx('buy');
        screenConfetti(60);
        if (m.what === 'board') { popup('⌨️', BOARDS[m.b].name.toUpperCase() + '!', 'Every press on it gives x' + fmt(BOARDS[m.b].mult * WORLDS[S.world].kb), '#7dff6b'); }
        else if (m.what === 'upgrade') { const u = UPGRADES.find((x) => x.id === m.id); toast(u.icon + ' ' + u.name + ' ' + u.stat(m.n) + '!', '#7dff6b'); }
    });
    room.onMessage('hatched', (m) => showHatch(m.c, m.out));
    room.onMessage('taskdone', (m) => { sfx('task'); toast('✅ Daily task done: ' + TASKS[m.k].text + '! Claim it in Quests', '#7dff6b'); });
    room.onMessage('questdone', () => { sfx('task'); toast('🎯 Quest complete! Tap the quest to claim', '#7dff6b'); });
    room.onMessage('authed', (m) => { S.name = m.name; });
    room.onMessage('snap', (m) => { P.snaps++; teleport(m.x, m.y, m.z); });
    room.onMessage('emote', (m) => { const r = remotes.get(m.s); if (r && r.char.blox) playEmoteOn(r.char.blox, m.id); });
    room.onMessage('chat', (m) => { const r = remotes.get(m.s); if (r) chatBubble(r.char.root, m.text); else if (m.s === room.sessionId && me) chatBubble(me.root, m.text); });
    room.onLeave((code) => {
        if (code === 4000) { $('#connectErr').textContent = 'You joined from somewhere else.'; }
        else $('#connectErr').textContent = 'Lost the connection to the server.';
        $('#start').hidden = false; $('#connectErr').hidden = false; $('#retryBtn').hidden = false; $('#loading').textContent = '';
        running = false;
    });
    return room;
}
// a quick way round: behind a short fade
async function warpTo(x, z) {
    switching = true;
    await fadeOut();
    switching = false;
    teleport(x, 0, z, Math.PI);
    fadeIn();
    FX.sparkleColumn(P.b, 0x7dff6b);
}
// a Win Pad: Wins; out of Keyboards for the next bridge, it's back to the keys
async function onPadOk(m) {
    sfx('win');
    winPop(m.n);
    flyWins(m.n);
    FX.coinBurst(FX.tmpV.set(P.b.x, P.b.y + 3, P.b.z));
    confetti(P.b);
    screenConfetti(m.first ? 60 : 30);
    S.wins += m.n; S.totalWins += m.n;
    updateHud();
    if (m.home) {
        await sleep(650);
        switching = true;
        await fadeOut();
        switching = false;
        teleport(m.home.x, 0, m.home.z, Math.PI);
        fadeIn();
        FX.sparkleColumn(P.b, 0xffd028);
    }
    if (S.pads <= 1) {
        const cap = CAPSULES[0];
        if (!S.hatched && S.wins >= cap.wins) setTimeout(() => toast('🥚 Open a capsule by the bridge: Keypals multiply every press!', '#7dff6b'), 1200);
    }
    setTimeout(offerDaily, 2500);
}
// the daily reward pops up only on the island, on the ground
function offerDaily() {
    if (!running || !P.b.onGround || anyPopup() || offerDaily.done) return;
    if (!dailyStatus(S.daily, net.now()).can) return;
    offerDaily.done = true;
    openPanel('daily');
}
async function playEmoteOn(avatar, id) {
    if (!avatar) return;
    const cat = await BX.loadEmotes();
    const e = cat.get(id);
    if (e && e.clip) avatar.playEmote(e.clip);
}
function chatBubble(group, text) {
    if (!group) return;
    if (group.userData.bubbleLbl) { group.remove(group.userData.bubbleLbl); group.userData.bubbleLbl.material.map.dispose(); }
    const lb = billboard([{ t: '💬 ' + text, c: '#ffffff', s: '#10203a', px: 44 }], 9, 1024, new V3(0, 11, 0), group);
    group.userData.bubbleLbl = lb;
    setTimeout(() => { if (group.userData.bubbleLbl === lb) { group.remove(lb); lb.material.map.dispose(); group.userData.bubbleLbl = null; } }, 5000);
}

// =====================================================================================
// Every frame
// =====================================================================================
let clockT = 0, slowT = 0, pingT = 0, metaT = 20, songOut = false;
function update(dt) {
    clockT += dt;
    const t = clockT;
    CU.uNow.value = rel(net.now());
    tickKeys();
    pumpAvatars();
    beginCrowd();
    updateMe(dt);
    updatePrompt();
    syncRemotes(dt, t);
    updatePresses();
    updateGuide(t);
    contactShadows();
    endCrowd(dt);
    updateEffects(dt);
    updateFx(dt);
    animateCounters(dt);
    slowT -= dt;
    if (slowT <= 0) { slowT = 1; S.x2 = (S.x2Until || 0) > net.now(); updateHud(); }
    // the easy song on the island, the driving one out on the bridges
    const out = stretchAt(P.b.z) !== 0;
    if (out !== songOut) { songOut = out; setMusicMode(out ? 'climb' : 'plaza'); }
    pingT -= dt;
    if (pingT <= 0) { pingT = pingEvery(); pingSend(); }
    metaT -= dt;
    if (metaT <= 0) { metaT = 30; sendMeta(); }
}
// the contact shadows (Low quality)
function contactShadows() {
    if (window.__noPhysics) return;
    SH.shadowsOn(getQuality() === 'low');
    SH.begin();
    const b = P.b;
    SH.add(b.x, 0, b.z, b.y, 3);
    for (const r of remotes.values()) if (r.here && r.x !== undefined) SH.add(r.x, 0, r.z, r.y, 3);
    SH.end();
}
const AMB = { cove: { color: 0xc8f0ff, dir: 0.3, snow: false }, arcade: { color: 0xff8ae0, dir: 0.4, snow: false }, cosmos: { color: 0xa8c8ff, dir: 0.5, snow: false }, rainbow: { color: 0xffc8e8, dir: 0.3, snow: false }, lava: { color: 0xffa85a, dir: 0.3, snow: false } };
function updateCameraAll(dt) {
    updateCamera(dt);
    const t = clockT;
    if (view) view.update(dt, t, camera);
    if (shadowDue()) snapShadow(FX.tmpV.set(P.b.x, P.b.y, P.b.z));
    updateSky(camera.position, t, dt);
    updateAmbient(camera.position, t, AMB[WORLDS[S.world].mood] || AMB.cove);
    setSpeedLines(0, dt);
}

// ----- play stats: how the game runs on this device and any error it hit -----
const fpsWin = { sum: 0, n: 0 }, errSeen = new Set(), errQueue = [];
let metaFirst = true, loadSecs = 0, lastFps = 60;
function noteError(msg, src, line, col) {
    const file = src ? String(src).split('/').pop().split('?')[0] : '';
    const k = String(msg || '?').slice(0, 150) + (file ? ' @' + file + ':' + (line || 0) + ':' + (col || 0) : '');
    if (errSeen.has(k) || errSeen.size >= 20) return;
    errSeen.add(k); errQueue.push(k);
}
window.addEventListener('error', (e) => noteError(e.message, e.filename, e.lineno, e.colno));
window.addEventListener('unhandledrejection', (e) => noteError('promise: ' + ((e.reason && e.reason.message) || e.reason)));
addEventListener('pagehide', () => { if (running) sendMeta(); });
let gpuNameCache = null;
function gpuName() {
    if (gpuNameCache !== null) return gpuNameCache;
    gpuNameCache = GPU_NAME.slice(0, 90) + (renderer.getContext().getContextAttributes().antialias ? '' : ' (no AA)');
    return gpuNameCache;
}
function sendMeta() {
    const m = { touch: isTouch, fps: fpsWin.n ? Math.round(fpsWin.sum / fpsWin.n) : lastFps, q: getQuality(), errs: errQueue.splice(0, 5) };
    fpsWin.sum = 0; fpsWin.n = 0;
    if (metaFirst) { metaFirst = false; Object.assign(m, { gpu: gpuName(), load: loadSecs, dpr: Math.round(devicePixelRatio * 100) / 100, w: innerWidth, h: innerHeight, cores: navigator.hardwareConcurrency || 0, mem: navigator.deviceMemory || 0 }); }
    net.send('meta', m);
}

// ----- the smoothness watch (every half second): the resolution adapts first, then the quality -----
const fpsWatch = { t: 0, avg: 60, low: 0, good: 0, trial: null, cpuUntil: 0, fails: 0, upAt: -99, upFrom: 1, ceil: 1, ceilUntil: 0, holdUntil: 0, lows: 0 };
// a world switch builds things for a moment: the watcher looks away for a few seconds
function holdFpsWatch(secs) { fpsWatch.holdUntil = fpsWatch.t + (secs || 4); fpsWatch.avg = Math.max(fpsWatch.avg, 58); }
let watchOff = false;
function watchFps(fps) {
    if (!running || document.hidden || watchOff) return;
    const w = fpsWatch;
    w.t += 0.5;
    // a single stall (one slow half-second) doesn't count: only two in a row do
    w.lows = fps < 45 ? w.lows + 1 : 0;
    if (w.lows === 1 && fps < 45) return;
    w.avg += (fps - w.avg) * 0.35;
    if (w.t < 3 || w.t < w.holdUntil) return;
    if (w.t > w.ceilUntil) w.ceil = 1;
    if (w.trial) {
        if (w.t - w.trial.at < 2) return;
        if (w.avg < w.trial.fps * 1.06) { setResScale(w.trial.prev); w.fails++; w.cpuUntil = w.t + Math.min(240, 30 * w.fails); } else w.fails = 0;
        w.trial = null;
        return;
    }
    const scale = getResScale();
    // high frame rates first: below 54 a 60 Hz screen is already missing frames
    if (w.avg < 54 && w.t > w.cpuUntil && scale > 0.56) {
        if (w.t - w.upAt < 6) { w.ceil = w.upFrom; w.ceilUntil = w.t + 60; }
        w.trial = { at: w.t, fps: w.avg, prev: scale };
        setResScale(scale * 0.85);
        w.good = 0;
        return;
    }
    if (w.avg >= 57) {
        w.good += 0.5;
        if (w.good >= 6 && scale < w.ceil - 0.01) { w.good = 0; w.upAt = w.t; w.upFrom = scale; setResScale(Math.min(w.ceil, scale / 0.88)); }
    } else w.good = 0;
    if (!autoQualityAllowed()) return;
    w.low = w.avg < 45 && (scale <= 0.56 || w.t < w.cpuUntil) ? w.low + 0.5 : 0;
    if (w.low < 3) return;
    w.low = 0;
    const next = { high: 'medium', medium: 'low' }[getQuality()];
    if (!next) return;
    setQuality(next, true, w.t < 45);
    toast('⚙️ Graphics set to ' + (next === 'medium' ? 'Medium' : 'Low') + ' for smoother play', '#7de8ff');
}
// Even frame pacing: on a fast screen (120 Hz and up) a frame that misses the refresh waits for the next one, so
// a game running between half and full rate shows frames of uneven length (a stutter, though the FPS is high).
// When most frames miss and some don't, it draws every other refresh instead: an even 72 on a 144 Hz screen.
const ivs = [];
let refreshMs = 0, paceN = 0, strikes = 0, pacedAt = 0, paced = false, trial = false;
function noteInterval(ms) { if (ms > 2 && ms < 60 && ivs.length < 400) ivs.push(ms); }
function paceFrames() {
    if (!running || document.hidden || isTouch) return;
    const now = performance.now();
    if (paced) { if (now - pacedAt > 30000) { paced = false; skipOdd = false; trial = true; ivs.length = 0; } return; }
    if (ivs.length < 200) return;
    paceN++;
    const s = ivs.slice().sort((a, b) => a - b), p10 = s[Math.floor(s.length * 0.1)];
    refreshMs = refreshMs ? Math.min(refreshMs, p10) : p10;
    const late = s.filter((v) => v > refreshMs * 1.5).length / s.length;
    ivs.length = 0;
    const uneven = refreshMs < 9 && late > 0.25 && late < 0.9;
    strikes = uneven ? strikes + 1 : 0;
    if ((trial && uneven) || (paceN > 3 && strikes >= 2 && fpsWatch.t >= fpsWatch.holdUntil)) {
        paced = true; skipOdd = true; pacedAt = now; strikes = 0;
        console.info('[pace] every other refresh (' + Math.round(500 / refreshMs) + ' FPS), ' + Math.round(late * 100) + '% of frames were late');
    }
    trial = false;
}
const perf = { n: 0, sum: 0, max: 0, last: 0 };
const spikes = [], slowParts = [];
let secAvg = {};
let frameErrors = 0, lastFrame = 0, loadingSignaled = false, fpsAcc = 0, fpsFrames = 0, skipOdd = false, oddFrame = false;
let rafN = 0;
function frame(now) {
    requestAnimationFrame(frame);
    rafN++;
    if (skipOdd) { oddFrame = !oddFrame; if (oddFrame) return; }
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
    if (lastFrame && !skipOdd) noteInterval(now - lastFrame);
    fpsAcc += (now - (lastFrame || now)) / 1000; fpsFrames++;
    if (fpsAcc >= 0.5) {
        const fps = fpsFrames / fpsAcc;
        lastFps = Math.round(fps);
        if (running && !document.hidden) { fpsWin.sum += fps; fpsWin.n++; }
        if (showFps) $('#fps').textContent = lastFps + ' FPS';
        if (isTouch && !skipOdd && fps > 100) skipOdd = true;
        // drawing every other refresh only makes sense on a fast screen keeping up: if the refreshes themselves are slow, draw them all
        if (skipOdd && rafN / fpsAcc < 95) { skipOdd = false; paced = false; pacedAt = 0; }
        rafN = 0;
        paceFrames();
        watchFps(fps); fpsAcc = 0; fpsFrames = 0;
    }
    if (lastFrame && now - lastFrame > 45 && spikes.length < 60) spikes.push({ at: Math.round(now), ms: Math.round(now - lastFrame), work: +perf.last.toFixed(1), res: getResScale() });
    lastFrame = now;
    if (!loadingSignaled) { loadingSignaled = true; BX.triggerAllSettings(); }
    pollGamepad();
    padButtons();
    if (running) {
        const w0 = performance.now();
        try {
            prof.start();
            update(dt);
            prof.mark('update');
            updateCameraAll(dt);
            prof.mark('camera+sky');
            render();
            prof.mark('render');
        } catch (e) {
            if (frameErrors++ < 5) console.error('[frame]', e);
            const at = String((e && e.stack) || '').split('\n').find((l) => /:\d+:\d+/.test(l)) || '';
            noteError('[frame] ' + ((e && e.message) || e), '', 0, 0);
            if (at) noteError('[frame at] ' + at.trim().slice(-120));
        }
        const w = performance.now() - w0;
        perf.n++; perf.sum += w; perf.max = Math.max(perf.max, w); perf.last = w;
        for (let i = 0; i < prof.parts.length; i += 2) secAvg[prof.parts[i]] = (secAvg[prof.parts[i]] || 0) + prof.parts[i + 1];
        secAvg.n = (secAvg.n || 0) + 1;
        if (w > 50 && slowParts.length < 20) { const o = {}; for (let i = 0; i < prof.parts.length; i += 2) o[prof.parts[i]] = +(o[prof.parts[i]] || 0) + +prof.parts[i + 1].toFixed(1); slowParts.push({ at: Math.round(now), ms: Math.round(w), calls: renderer.info.render.calls, prog: renderer.info.programs.length, ...o }); }
    }
}

// =====================================================================================
// Boot: build everything behind the loading screen, join, play (no start menu)
// =====================================================================================
function loadingText(t) { $('#loading').textContent = t; }
let joining = false, joinTask = null, worldReady = null;
async function joinServer() {
    const endpointTask = serverEndpoint();
    endpointTask.catch(() => {});
    await waitForLogin(400);
    const saved = (storageGet('kb1_name') || '').slice(0, 20);
    for (let attempt = 0; ; attempt++) {
        try { return await connect(BX.identity().loggedIn ? '' : saved, attempt === 0 ? await endpointTask : null); } catch (e) {
            if (attempt >= 4) throw e;
            console.warn('[join] attempt', attempt + 1, 'failed:', e && e.message);
            loadingText('Waking up a server…');
            await sleep(2000 * (attempt + 1));
        }
    }
}
function waitForLogin(ms) {
    if (!BX.bloxity.ready || BX.identity().loggedIn) return Promise.resolve();
    return new Promise((res) => { const t0 = performance.now(); (function check() { if (BX.identity().loggedIn || performance.now() - t0 > ms) res(); else setTimeout(check, 100); })(); });
}
async function play() {
    if (joining || running) return;
    joining = true;
    $('#connectErr').hidden = true; $('#retryBtn').hidden = true;
    if (!joinTask) joinTask = joinServer();
    initAudio();
    try {
        await worldReady;
        loadingText('Joining a server…');
        $('#loadBar').style.width = '92%';
        BX.loadingStep('Joining a server…');
        await joinTask;
        const t0 = performance.now();
        while (!gotProfile && performance.now() - t0 < 6000) await sleep(50);
    } catch (e) {
        joinTask = null;
        console.error(e);
        joining = false;
        loadingText('');
        $('#connectErr').hidden = false;
        $('#connectErr').textContent = 'Could not reach the game server. Check your connection and try again.';
        $('#retryBtn').hidden = false;
        BX.loadingEnd();
        return;
    }
    joining = false;
    // your world (the one you were in last time)
    if (S.world !== view.w) buildView(S.world);
    setProgress();
    running = true;
    S.joinedAt = Date.now();
    if (!me) buildMe();
    me.setTeam((S.team || []).join(','));
    const p = net.room.state.players.get(net.room.sessionId);
    teleport(p ? p.x : W.spawn.x, 0, p ? p.z : W.spawn.z, Math.PI);
    cam.yaw = 0; cam.pitch = 0.36;
    loadingText('Almost there…');
    $('#loadBar').style.width = '100%';
    await primeFrames();
    // everyone's avatar made behind the loading screen too
    { const t0 = performance.now(); while (avatarsPending() && performance.now() - t0 < 2000) await sleep(30); }
    fpsAcc = 0; fpsFrames = 0;
    // until a song's first loop is rendered it plays note by note (~100 audio nodes a second): fine on a PC, not on
    // a phone or a weak laptop (Low), which waits for the loop in silence
    allowLiveMusic(getQuality() !== 'low');
    startMusic();
    setMusicMode('plaza');
    $('#start').hidden = true;
    $('#start').style.opacity = '';
    $('#hud').hidden = false;
    measureHud();
    updateHud();
    showTips();
    if (!S.pads) {
        setTimeout(() => bigText('WALK ON THE KEYS!', '#ffe24a'), 500);
        setTimeout(() => toast('⌨️ Every key you press gives you Keyboards. Follow the arrows!', '#ffffff'), 1600);
    } else toast('👋 Welcome back, ' + (S.name || 'typist') + '!', '#ffffff');
    setTimeout(() => { if (audioSuspended()) toast('🔊 Tap anywhere for the key sounds!', '#7de8ff'); }, 3500);
    // the daily reward: straight away for someone back, after the first Win Pad for someone new
    if (S.pads) setTimeout(offerDaily, 1500);
    canvas.focus();
    loadSecs = Math.round(performance.now() / 100) / 10;
    metaT = 8;
    BX.loadingEnd();
}
async function primeFrames() {
    $('#start').style.opacity = '0.985';
    $('#hud').hidden = false;
    try { await Promise.race([renderer.compileAsync(scene, camera), sleep(1500)]); } catch (e) { /* compiles on first use */ }
    for (let i = 0; i < 4; i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 120); });
    const gl = renderer.getContext();
    if (!gl.fenceSync) return;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const t0 = performance.now();
    while (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED && performance.now() - t0 < 1500) await sleep(15);
    gl.deleteSync(sync);
}
function showTips() {
    if (isTouch) return;
    const el = $('#tips');
    const k = (key, what) => `<span><kbd>${key}</kbd>${what}</span>`;
    el.innerHTML = k('WASD', 'Move') + k('Click', 'Press the key under you') + k('Space', 'Jump (stomps keys)') + k('Drag', 'Camera') + k('E', 'Use') + k('B', 'To the bridge') + k('R', 'To your keys');
    el.hidden = false; el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; }, 12000);
    setTimeout(() => { el.hidden = true; }, 12900);
}
function unlockAudioOnGesture() {
    const unlock = () => { resumeAudio(); if (!audioSuspended()) for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click']) removeEventListener(ev, unlock, true); };
    for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click']) addEventListener(ev, unlock, true);
}
function wirePortalSettings() {
    const embedded = (fn) => (v) => { if (BX.isEmbedded()) fn(v); };
    const pct = (v) => { const n = parseFloat(String(v)); if (!isFinite(n)) return undefined; return clamp(n > 1 ? n / 100 : n, 0, 1); };
    BX.listenSetting('master_volume', embedded((v) => { const p = pct(v); if (p !== undefined) setVolume('master', p); }));
    BX.listenSetting('music_volume', embedded((v) => { const p = pct(v); if (p !== undefined) setVolume('music', p); }));
    BX.listenSetting('graphics_quality', embedded((v) => setQuality(v === 'Low' ? 'low' : v === 'Medium' ? 'medium' : 'high', true)));
    BX.listenSetting('camera_sensitivity', embedded((v) => { camSens = clamp(parseFloat(v) || 1, 0.1, 5); }));
    BX.listenSetting('show_fps', (v) => { showFps = v === 'true'; $('#fps').hidden = !showFps; });
}
function wirePortalEvents() {
    BX.onPortalEvent((event, data) => {
        if (event === 'respawn_request') { if (running) goTo('spawn'); }
        else if (event === 'open_daily') openPanel('daily');
        else if (event === 'chat_message_sent' && data) net.send('chat', { text: String(data) });
        else if (event === 'play_emote' && data) { if (me) playEmoteOn(me.blox, String(data)); net.send('emote', { id: String(data) }); }
    });
    BX.onAvatarChanged(() => syncMyAvatar());
    BX.onProportionsChanged(() => syncMyAvatar());
}
// The HUD's words and emoji painted for a few frames behind the loading screen, in the fonts and sizes
// the game uses: the first time a glyph (an emoji above all, on Windows) is drawn costs a long pause.
async function warmHudText() {
    const lines = [['🛒📋🔄✨📅🌈🌍⚙️🎁💎🥚⌨️', 2.3], ['🔊🔇🏆🔥🎯✅⭐🎡🌉🏁👑🖱️', 1.8], ['🥉🥈🥇💠🔒🏝️🕹️🪐🖥️🏖️🌌⚡⏱💬👋🛍️', 1.4], ['👟📘🍀🐾🎟️🚫✓✕−+', 2.6]];
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:0;top:0;width:3000px;opacity:0.01;pointer-events:none;z-index:1';
    d.innerHTML = lines.map(([em, s]) => `<div style="font-size:${s}rem;white-space:nowrap">${em}</div>`).join('')
        + [['var(--chunky)', 3, 400, 'o'], ['var(--chunky)', 2, 400, 'o'], ['var(--font)', 2.3, 700, 'o'], ['var(--font)', 1.1, 700, 'o1']]
            .map(([f, s, w, c]) => `<div class="${c}" style="font-family:${f};font-size:${s}rem;font-weight:${w};white-space:nowrap">Level Up! Click Power (→) WINS KEYBOARDS FOR FREE! X2 0123456789 Keypals Bridge K M B</div>`).join('');
    document.body.appendChild(d);
    for (let i = 0; i < 3; i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 150); });
    d.remove();
    // and once in a canvas (name tags, chat bubbles and signs are drawn there)
    const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 140;
    const cx = cv.getContext('2d');
    for (const px of [40, 44, 52, 70, 76]) { cx.font = '700 ' + px + 'px Fredoka, "Arial Rounded MT Bold", sans-serif'; cx.fillText('💬🥉🥈🥇💠💎👑🔒🏆✓ Lv. 0123456789 Keyboards Wins', 4, 100); }
}
async function prepareWorld() {
    const step = (t, k) => { loadingText(t); BX.loadingStep(t); if (k) $('#loadBar').style.width = Math.round(k * 100) + '%'; };
    step('Loading fonts…', 0.08);
    try { await Promise.race([Promise.all([document.fonts.load('700 40px Fredoka'), document.fonts.load('400 40px "Luckiest Guy"')]), sleep(2500)]); } catch (e) { /* fallback font */ }
    await warmHudText();
    step('Polishing the keycaps…', 0.18);
    buildView(0);
    SH.initShadows();
    await pause();
    step('Recording the switches…', 0.36);
    await buildAsmr(pause);
    prerenderMusic();
    // every HUD screen and panel painted once, invisibly (the browser compiles how to draw them now)
    step('Laying the bridges…', 0.55);
    {
        const hud = $('#hud');
        hud.hidden = false; hud.classList.add('warmui');
        measureHud();
        const endPanels = warmPanels();
        for (let i = 0; i < 4; i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 120); });
        endPanels();
        hud.classList.remove('warmui'); hud.hidden = true;
    }
    // the warm-up: every shader the game uses (the keys, the crowd's, every effect) compiled and drawn once
    // now, not in play
    step('Warming up the keys…', 0.75);
    const extras = [fxWarmGroup(), keyWarmGroup()];
    for (const g of extras) { g.position.set(0, -60, 0); scene.add(g); }
    crowdWarm();
    try {
        const base = await Promise.race([loadBase(), sleep(4000)]);
        const a = base ? await createAvatar(null) : null;
        if (a) { a.root.position.set(0, -60, 10); a.update(1 / 60, { t: 0 }); scene.add(a.root); extras.push(a.root); }
    } catch (e) { /* the avatar's shaders compile when it first shows */ }
    fxShowAll(true);
    camera.position.set(0, 60, 130); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    gpuName();
    try { await Promise.race([renderer.compileAsync(scene, camera), sleep(1500)]); } catch (e) { /* later */ }
    const culled = [];
    scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isSprite || o.isLine) && o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    render();
    for (const o of culled) o.frustumCulled = true;
    await pause();
    fxShowAll(false);
    for (const g of extras) scene.remove(g);
    beginCrowd(); endCrowd(0);
    setMood(WORLDS[view.w].mood, true);
    console.info('[prewarm] ready,', renderer.info.programs.length, 'shaders');
}
async function boot() {
    installIcons();
    BX.initBloxity();
    joinTask = joinServer();
    joinTask.catch(() => {});
    loadBase().catch(() => {});
    worldReady = prepareWorld();
    wirePortalSettings();
    wirePortalEvents();
    BX.onIdentity((id) => {
        if (net.room && id.loggedIn && id.token && !net.bloxity) net.send('auth', { token: id.token });
        if (net.room) { setupLocalAvatar(); syncMyAvatar(); }
    });
    addEventListener('pagehide', () => { try { if (net.room) net.room.leave(true); } catch (e) { /* closing anyway */ } });
    $('#retryBtn').addEventListener('click', () => location.reload());
    unlockAudioOnGesture();
    requestAnimationFrame(frame);
    play();
}
boot();

// =====================================================================================
// QA: the autopilot: run back and forth over the keys, build the next bridge when there's enough, cross, touch the Win Pad.
// =====================================================================================
// the autopilot speaks in world directions; the camera turns them, so undo that
function mapInput(o) {
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    const f = o.mx * fx + o.mz * fz, r = o.mx * rx + o.mz * rz;
    return { mx: fx * f + rx * r, mz: fz * f + rz * r, jump: o.jump, hold: o.hold };
}
function hubPilot() {
    let dir = 1, warpAt = 0;
    return () => {
        const b = P.b, out = { mx: 0, mz: 0, jump: false, hold: false };
        if (!view || switching) return out;
        const o = spanNow(), n = WORLDS[S.world].bridges, k = o.n + 1, left = k <= n ? bridgeCost(S.world, k) - o.part : 0, c = S.claimed && S.claimed[S.world + ':' + o.n];
        let tgt;
        if (o.n > 0 && (!c || !c.first)) tgt = { x: 0, z: isleMid(o.n) };
        else if (k <= n && S.kb >= left) {
            tgt = { x: 0, z: spanStart(k) + 2 };
            if (Math.abs(b.z - tgt.z) > 90 && clockT > warpAt) { warpAt = clockT + 2; goTo('bridge'); }
        } else {
            const sp = BOARD_SPOTS[bestBoard()];
            if (Math.abs(b.z - sp.z) > 90 && clockT > warpAt) { warpAt = clockT + 2; goTo('board'); }
            tgt = { x: sp.x + dir * 20, z: sp.z + Math.sin(clockT) * 8 };
            if (Math.abs(b.x - tgt.x) < 2) dir = -dir;
        }
        const dx = tgt.x - b.x, dz = tgt.z - b.z, d = Math.hypot(dx, dz);
        if (d > 1) { out.mx = dx / d; out.mz = dz / d; }
        cam.yaw = 0;
        return mapInput(out);
    };
}
if (import.meta.env.DEV || import.meta.env.VITE_QA) {
    window.__qa = {
        P, S, cam, net, scene, camera, renderer: () => renderer, audio: () => audioDebug(), actions, view: () => view,
        state: () => {
            const o = spanNow();
            return { world: S.world, x: +P.b.x.toFixed(2), y: +P.b.y.toFixed(2), z: +P.b.z.toFixed(2), onGround: P.b.onGround, kb: S.kb, wins: S.wins, gems: S.gems, lv: S.lv, xp: S.xp, rebirths: S.rebirths, bridges: o.n, part: o.part, pads: S.pads, presses: S.presses, hatched: S.hatched, snaps: P.snaps, programs: renderer.info.programs.length, prompt: activePrompt && activePrompt.label(), q: getQuality(), others: remotes.size, qi: S.qi };
        },
        auto: (on) => { P.auto = on === false ? null : hubPilot(); },
        key: (code, down) => { keys[code] = !!down; if (down && code === 'Space') P.jumpPress = clockT; },
        jump: () => { P.jumpPress = clockT; },
        click: () => clickNow(false),
        teleport: (x, y, z, yaw) => { net.send('qa', { tp: [x, y, z] }); teleport(x, y, z, yaw); },
        look: (yaw, pitch, dist) => { cam.yaw = yaw; cam.pitch = pitch; if (dist !== undefined) cam.dist = dist; },
        quality: (q) => setQuality(q),
        give: (o) => net.send('qa', o),
        send: (type, m) => net.send(type, m || {}),
        panel: (k, tab) => openPanel(k, tab),
        close: () => { let n = 0; while (closeTop() && n < 9) n++; return n; },
        world: (w) => switchWorld(w, W.spawn.x, W.spawn.z),
        perf: (reset) => { const r = { frames: perf.n, avgMs: +(perf.sum / Math.max(1, perf.n)).toFixed(2), maxMs: +perf.max.toFixed(1), fps: lastFps, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, paced: skipOdd }; if (reset) { perf.n = 0; perf.sum = 0; perf.max = 0; } return r; },
        diag: () => { renderer.info.reset(); renderer.info.autoReset = false; render(); const r = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, ratio: renderer.getPixelRatio(), programs: renderer.info.programs.length }; renderer.info.autoReset = true; return r; },
        errors: () => [...errSeen],
        noWatch: (on) => { watchOff = on === undefined ? true : !!on; },
        hud: (on) => { $('#hud').style.display = on ? '' : 'none'; $('#touch').style.display = on ? '' : 'none'; },
        mood: (m) => setMood(m, true),
        res: (k) => setResScale(k),
        gpu: () => gpuName(),
        spikes: () => spikes.splice(0),
        slow: () => slowParts.splice(0),
        sections: () => { const n = secAvg.n || 1, o = {}; for (const k in secAvg) if (k !== 'n') o[k] = +(secAvg[k] / n).toFixed(2); secAvg = {}; return o; },
        avatars: () => avatarsPending(),
        hatch: (c, n) => net.send('hatch', { c, n: n || 1 }),
        hatchAuto: (on) => { hatchAuto = !!on; },
        remotes: () => remotes,
        delay: () => updateDelay(),
    };
}
void QUESTS; void capsuleById; void jumpH; void panelIs; void refreshPanels; void hatchAuto;
