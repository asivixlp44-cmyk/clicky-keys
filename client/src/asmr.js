// The key sounds, synthesised sample by sample (no files) into short buffers once while the game loads: every keyboard
// has its own switch (a soft membrane, bubbly pops, a deep mechanical thock, a typewriter's clack, a clicky blue, a real
// piano note, a golden chime), a few variations of each, plus the stomp of a landing, a bridge's keys snapping in and the
// little bell that climbs with every press in a row. Playing one is a buffer source and a gain (and a pan for someone
// else's); nothing is built note by note while playing.
const SR = 44100;
const rnd = (a, b) => a + Math.random() * (b - a);
let seed = 12345;
const noiseV = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };

// ----- little DSP kit (in place on Float32Arrays) -----
const buf = (secs) => new Float32Array(Math.max(1, Math.round(secs * SR)));
function biquad(x, type, f, q) {
    const w = 2 * Math.PI * Math.min(f, SR * 0.45) / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * (q || 0.707));
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; } else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; } else { b0 = al; b1 = 0; b2 = -al; }
    a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = x[i], y = (b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; }
    return x;
}
// a band-pass whose centre moves (f(t) in Hz), for squelches
function sweepBP(x, fOf, q) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
        const w = 2 * Math.PI * Math.min(fOf(i / SR), SR * 0.45) / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
        const v = x[i], y = (al * v - al * x2 + 2 * cs * y1 - (1 - al) * y2) / a0;
        x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y;
    }
    return x;
}
function addNoise(x, at, len, amp, env, filt) {
    const n = buf(len);
    for (let i = 0; i < n.length; i++) n[i] = noiseV();
    if (filt) for (const f of filt) biquad(n, f[0], f[1], f[2]);
    const i0 = Math.round(at * SR);
    for (let i = 0; i < n.length && i0 + i < x.length; i++) x[i0 + i] += n[i] * amp * env(i / SR, len);
}
// a sine whose frequency follows f(t), amplitude env(t)
function addTone(x, at, len, f, amp, env) {
    const i0 = Math.round(at * SR);
    let ph = 0;
    for (let i = 0; i < len * SR && i0 + i < x.length; i++) { const t = i / SR; ph += 2 * Math.PI * f(t) / SR; x[i0 + i] += Math.sin(ph) * amp * env(t, len); }
}
const dec = (k, a) => (t) => (a && t < a ? t / a : 1) * Math.exp(-(t - (a && t > a ? a : 0)) * k);
function norm(x, peak) {
    let m = 0;
    for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
    const k = m > 0 ? peak / m : 0;
    // a short fade at the end (no click)
    const f = Math.min(x.length, 220);
    for (let i = 0; i < x.length; i++) x[i] *= k * (i > x.length - f ? (x.length - i) / f : 1);
    return x;
}

// ----- the switches: every keyboard has its own -----
// a key going down and coming back: p pitch, hard how hard, click (the bright snap), body (the plastic), thock (the bottom-out)
function keyHit(x, at, p, hard, click, body, thock, back) {
    addNoise(x, at, 0.004, click * hard, dec(1100), [['hp', 2600 * p, 0.8]]);
    addNoise(x, at, 0.03, body * hard, dec(160), [['bp', 1500 * p, 3.5]]);
    addTone(x, at + 0.002, 0.07, (t) => 210 * p * (1 - t * 0.6), thock * hard, dec(70, 0.001));
    addTone(x, at + 0.002, 0.04, () => 420 * p, 0.12 * hard, dec(120, 0.001));
    // the key coming back up: a lighter clack
    addNoise(x, at + rnd(0.045, 0.07), 0.004, back * hard, dec(1200), [['hp', 3200 * p, 0.8]]);
}
const MAKE = {
    // Office: a soft rubber dome, a dull little thud
    membrane() { const x = buf(0.11), p = rnd(0.9, 1.1); keyHit(x, 0.002, p * 0.8, 0.8, 0.18, 0.35, 0.5, 0.08); addNoise(x, 0.002, 0.05, 0.3, dec(70), [['lp', 900, 0.7]]); return norm(x, 0.5); },
    // Bubblegum: a round, bubbly pop on the way down, a tiny one on the way up
    pop() { const x = buf(0.13), p = rnd(0.9, 1.15); addTone(x, 0, 0.09, (t) => 480 * p * (1 + t * 10), 0.8, dec(38, 0.002)); addNoise(x, 0, 0.005, 0.5, dec(900), [['hp', 1800, 0.7]]); addTone(x, 0.06, 0.04, (t) => 720 * p * (1 + t * 18), 0.3, dec(70, 0.002)); return norm(x, 0.55); },
    // Mechanical: the deep, satisfying thock of a good custom board
    thock() { const x = buf(0.13), p = rnd(0.88, 1.08); keyHit(x, 0.002, p * 0.72, 1, 0.3, 0.55, 0.85, 0.2); addTone(x, 0.003, 0.05, () => 150 * p, 0.4, dec(60, 0.001)); return norm(x, 0.68); },
    // Typewriter: a sharp metal clack, the type bar hitting the platen
    clack() { const x = buf(0.16), p = rnd(0.9, 1.15); addNoise(x, 0, 0.006, 1, dec(620), [['hp', 2200 * p, 0.9]]); addNoise(x, 0.002, 0.04, 0.6, dec(120), [['bp', 2600 * p, 6]]); addTone(x, 0.001, 0.06, () => 340 * p, 0.45, dec(70, 0.001)); addNoise(x, rnd(0.07, 0.09), 0.005, 0.32, dec(900), [['hp', 3000, 0.8]]); return norm(x, 0.68); },
    // Gamer RGB: a bright, clicky blue switch (two clicks close together)
    clicky() { const x = buf(0.1), p = rnd(0.94, 1.12); addNoise(x, 0, 0.003, 1, dec(1500), [['hp', 3600 * p, 0.9]]); addNoise(x, 0.008, 0.003, 0.9, dec(1500), [['hp', 4200 * p, 0.9]]); keyHit(x, 0.012, p, 0.7, 0.3, 0.3, 0.45, 0.3); return norm(x, 0.6); },
    // Grand Piano: a note (played higher and lower by its rate, up a scale)
    piano() {
        const x = buf(0.9), f = 261.63;
        addNoise(x, 0, 0.012, 0.25, dec(300), [['bp', 2200, 1]]);
        for (const [k, g, d] of [[1, 1, 4.5], [2.003, 0.5, 6], [3.01, 0.26, 8], [4.02, 0.14, 11], [5.03, 0.07, 14]]) addTone(x, 0, 0.9, () => f * k, g, dec(d, 0.003));
        return norm(x, 0.5);
    },
    // Solid Gold: a little ingot chime on top of the click
    gold() { const x = buf(0.32), p = rnd(0.95, 1.1); keyHit(x, 0.002, p, 0.6, 0.3, 0.3, 0.4, 0.1); for (const [f, g, d] of [[1760, 0.5, 13], [2637, 0.35, 16], [3951, 0.2, 22]]) addTone(x, 0.002, 0.3, () => f * p, g, dec(d, 0.001)); return norm(x, 0.55); },
    // keys of a bridge under your feet
    deck() { const x = buf(0.1), p = rnd(0.95, 1.2); keyHit(x, 0.002, p * 0.85, 0.75, 0.2, 0.42, 0.5, 0.12); return norm(x, 0.5); },
    // a footstep on the floor
    floor() { const x = buf(0.09), p = rnd(0.9, 1.15); addNoise(x, 0, 0.05, 0.6, dec(60, 0.002), [['lp', 700 * p, 0.8]]); addTone(x, 0, 0.05, (t) => 110 * p * (1 - t * 3), 0.5, dec(60, 0.002)); return norm(x, 0.3); },
};
// a stomp: a handful of keys at once
function makeStomp() { const x = buf(0.24); for (let k = 0, n = 6; k < n; k++) keyHit(x, k === 0 ? 0.002 : rnd(0.004, 0.08), rnd(0.75, 1.2), k === 0 ? 1 : rnd(0.35, 0.7), 0.3, 0.45, 0.6, 0.15); return norm(x, 0.8); }
// a key of a bridge popping into place
function makeSnap() { const x = buf(0.07), p = rnd(0.9, 1.3); addNoise(x, 0, 0.004, 0.8, dec(1000), [['hp', 2400 * p, 0.8]]); addTone(x, 0, 0.05, (t) => 640 * p * (1 + t * 6), 0.6, dec(70, 0.001)); return norm(x, 0.5); }
// the jump: a soft spring
function makeBoing(big) {
    const L = big ? 0.75 : 0.22, x = buf(L);
    addTone(x, 0, L, (t) => (big ? 160 : 260) * (1 + (big ? 1.4 : 0.9) * (1 - Math.exp(-t * (big ? 10 : 28)))) * (1 + (big ? 0.08 : 0.05) * Math.sin(t * 2 * Math.PI * (big ? 15 : 22)) * Math.exp(-t * 4)), 0.6, dec(big ? 5 : 16, 0.004));
    addTone(x, 0, L * 0.7, (t) => (big ? 320 : 520) * (1 + 0.9 * (1 - Math.exp(-t * 24))), 0.12, dec(big ? 8 : 26, 0.004));
    addNoise(x, 0, 0.04, 0.12, dec(80), [['bp', 1800, 1.5]]);
    return norm(x, big ? 0.7 : 0.5);
}
// the power bell (played at higher pitches as the combo climbs)
function makeTick() {
    const x = buf(0.32);
    addTone(x, 0, 0.32, () => 1318.5, 0.6, dec(14, 0.002));
    addTone(x, 0, 0.18, () => 2637, 0.2, dec(26, 0.002));
    addTone(x, 0, 0.12, () => 3956, 0.08, dec(40, 0.002));
    return norm(x, 0.5);
}
// a gummy: a bloop up and a sparkle
function makeGum() {
    const x = buf(0.35);
    addTone(x, 0, 0.16, (t) => 420 * (1 + t * 9), 0.5, dec(12, 0.004));
    for (let k = 0; k < 4; k++) addTone(x, 0.08 + k * 0.045, 0.14, () => [1568, 2093, 2637, 3136][k], 0.2, dec(28, 0.002));
    return norm(x, 0.6);
}

// ----- the bank: made while loading (a few at a time, so the page stays responsive) -----
const VARIANTS = 4;
const bank = {};
export async function buildAsmr(pause) {
    const out = (k, f, n) => { bank[k] = []; for (let i = 0; i < n; i++) bank[k].push(f()); };
    for (const kind of Object.keys(MAKE)) {
        out(kind, () => MAKE[kind](), kind === 'piano' ? 1 : VARIANTS);
        if (pause) await pause();
    }
    out('stomp', makeStomp, 3); out('snap', makeSnap, 4);
    out('boing', () => makeBoing(false), 2); out('tramp', () => makeBoing(true), 2);
    out('tick', makeTick, 1); out('gum', makeGum, 1);
}
// the AudioBuffers (made once the audio context exists)
const ready = {};
export function asmrBuffer(ctx, key) {
    let list = ready[key];
    if (!list) {
        const raw = bank[key];
        if (!raw) return null;
        list = ready[key] = raw.map((a) => { const b = ctx.createBuffer(1, a.length, SR); b.copyToChannel(a, 0); return b; });
    }
    return list[Math.floor(Math.random() * list.length)];
}
export const asmrKinds = () => Object.keys(MAKE);
