// The hub: a world's island with its seven keyboards, and the chain of bridges and little islands going out to sea
// (north, -z). Both sides build from these numbers: the client draws it and moves you on it, the server checks where
// you say you are, which key you pressed and whether the bridge under you exists.
import { BOARDS, WORLDS, CAPSULES } from './config.js';

export const P = 5.4;              // a key's pitch
export const W = {
    spawn: { x: 0, z: 66 },
    island: { x0: -146, x1: 146, z0: -14, z1: 90 },
    head: 7,                       // how deep the zone before a bridge is where your Keyboards go in
    spanRows: 6, spanCols: 7,      // a bridge's keys
    spanHalf: 7 * P / 2 + 0.6,     // half a bridge's width
    spanLen: 6 * P,                // a bridge's length
    isleLen: 32, isleHalf: 34,     // the little islands between bridges
    padR: 6,                       // a Win Pad's half size
};
W.period = W.spanLen + W.isleLen;
// where each keyboard lies on a world's island (its middle): the first straight ahead of the spawn
export const BOARD_SPOTS = [{ x: 0, z: 30 }, { x: -58, z: 30 }, { x: 58, z: 30 }, { x: -58, z: 66 }, { x: 58, z: 66 }, { x: -116, z: 30 }, { x: 116, z: 30 }];
// a keyboard's keys: 5 rows of a QWERTY layout, the last with a wide spacebar. x, z from its middle, w wide, a legend
const R1 = '123456789', R2 = 'QWERTYUIO', R3 = 'ASDFGHJKL', R4 = 'ZXCVBNM,.';
export const BOARD_KEYS = (() => {
    const keys = [], cols = 9, rows = 5, ox = -(cols - 1) / 2 * P, oz = -(rows - 1) / 2 * P;
    [R1, R2, R3, R4].forEach((s, j) => { for (let i = 0; i < cols; i++) keys.push({ x: ox + i * P, z: oz + j * P, w: 1, t: s[i] }); });
    const z = oz + 4 * P;
    keys.push({ x: ox, z, w: 1, t: 'Ctrl' }, { x: ox + P, z, w: 1, t: 'Alt' }, { x: 0, z, w: 5, t: '' }, { x: -ox - P, z, w: 1, t: 'Alt' }, { x: -ox, z, w: 1, t: 'Ctrl' });
    return keys;
})();
export const BOARD_W = 9 * P + 3.2, BOARD_D = 5 * P + 3.2;
// the key under (x, z) on the keyboard around (cx, cz), or -1
export function keyAt(cx, cz, x, z) {
    const dx = x - cx, dz = z - cz;
    if (Math.abs(dx) > BOARD_W / 2 || Math.abs(dz) > BOARD_D / 2) return -1;
    const row = Math.floor((dz + 2.5 * P) / P);
    if (row < 0 || row > 4) return -1;
    if (row < 4) { const c = Math.floor((dx + 4.5 * P) / P); return c < 0 || c > 8 ? -1 : row * 9 + c; }
    for (let i = 36; i < BOARD_KEYS.length; i++) { const k = BOARD_KEYS[i]; if (Math.abs(dx - k.x) <= k.w * P / 2) return i; }
    return -1;
}
// the keyboard under (x, z), or -1
export function boardAt(x, z) {
    for (let b = 0; b < BOARD_SPOTS.length; b++) { const s = BOARD_SPOTS[b]; if (Math.abs(x - s.x) <= BOARD_W / 2 && Math.abs(z - s.z) <= BOARD_D / 2) return b; }
    return -1;
}
// the island's other things
export const workshop = { x: -44, z: -2, r: 11 };
export const worldsPortal = { x: 96, z: 0, r: 8 };
// (the leaderboards: either side, clear of the camera behind someone at the spawn)
export const boards = [{ x: -44, z: 88 }, { x: 44, z: 88 }];
// a bridge's near end, and its far end (k from 1); the island after it
export const spanStart = (k) => W.island.z0 - (k - 1) * W.period;
export const spanEnd = (k) => spanStart(k) - W.spanLen;
export const isleMid = (k) => spanEnd(k) - W.isleLen / 2;
// the Win Pad on the island after bridge k
export const padAt = (k) => ({ x: 0, z: isleMid(k) });
export const onPad = (k, x, z) => Math.abs(x) < W.padR + 0.5 && Math.abs(z - isleMid(k)) < W.padR + 0.5;
// a stage's gate, at the far end of its bridge: its two posts stand on the island beyond, either side
export const gateX = W.spanHalf + 2.6;
export const gateZ = (k) => spanEnd(k) - 1.6;
// a world's capsule machines: where each stands (the first on the main island, the others out along the bridges)
const CAP_ISLES = [0, 3, 7];
export function capsulesOf(w) {
    return CAPSULES.map((c, i) => ({ c, i })).filter((o) => o.c.world === w).map((o, n) => {
        const isle = CAP_ISLES[n] ?? 0;
        return { ...o, isle, x: isle ? W.isleHalf - 9 : 44, z: isle ? isleMid(isle) : -2, r: 10 };
    });
}
// the bridge you can stand in front of, in the zone where your Keyboards go in: k, or 0
export const headOf = (k, x, z) => (z <= spanStart(k) + W.head && z >= spanStart(k) - 1.2 && Math.abs(x) <= W.spanHalf + 1);

const cache = new Map();
// A world's physics (the same object for everyone on the client; the server makes its own for its bots). limit is the
// number of bridges built: you can't go past the last one (there's nothing there yet).
export function hubFor(w) {
    const key = w;
    if (cache.has(key)) return cache.get(key);
    const Wd = WORLDS[w] || WORLDS[0], solids = [];
    const postBox = (x, z, sx, sz, h) => solids.push({ min: [x - sx / 2, 0, z - sz / 2], max: [x + sx / 2, h, z + sz / 2] });
    postBox(workshop.x, workshop.z - 4, 16, 2, 8);
    for (const b of boards) postBox(b.x, b.z, 22, 1.6, 14);
    for (const sx of [-1, 1]) postBox(worldsPortal.x + sx * 8, worldsPortal.z, 2.4, 2.4, 18);
    for (const c of capsulesOf(w)) postBox(c.x, c.z, 7, 7, 9);
    for (let k = 1; k <= Wd.bridges; k++) for (const sx of [-1, 1]) postBox(sx * gateX, gateZ(k), 3, 3, 20);
    const T = { w, Wd, n: Wd.bridges, solids };
    T.make = () => {
        const world = {
            solids, floor: 0, limit: 0,
            clamp(b) { clampHub(b, world.limit, Wd.bridges); },
        };
        return world;
    };
    T.world = T.make();
    cache.set(key, T);
    return T;
}
// which stretch z lies on: 0 the island, k > 0 bridge k, -k the island after bridge k
export function stretchAt(z) {
    if (z >= W.island.z0) return 0;
    const d = W.island.z0 - z, n = Math.floor(d / W.period), o = d - n * W.period;
    return o < W.spanLen ? n + 1 : -(n + 1);
}
function clampHub(b, limit, n) {
    const I = W.island, s = stretchAt(b.z);
    if (s === 0) {
        if (b.x < I.x0 + 1) { b.x = I.x0 + 1; if (b.vx < 0) b.vx = 0; } else if (b.x > I.x1 - 1) { b.x = I.x1 - 1; if (b.vx > 0) b.vx = 0; }
        if (b.z > I.z1 - 1) { b.z = I.z1 - 1; if (b.vz > 0) b.vz = 0; }
    }
    // you can't go past the last bridge built (nor walk on the first if it isn't there)
    const stop = limit >= n ? isleMid(n) - W.isleLen / 2 + 1 : spanStart(limit + 1);
    if (b.z < stop) { b.z = stop; if (b.vz < 0) b.vz = 0; }
    const s2 = stretchAt(b.z);
    if (s2 > 0) {
        // on a bridge: between its rails; coming at it from the island beside its end: you stop at the edge
        const hw = W.spanHalf - 0.8;
        if (Math.abs(b.x) > hw + 3) {
            const near = spanStart(s2), far = spanEnd(s2);
            b.z = b.z - far < near - b.z ? far - 0.01 : near + 0.01;
            if (near + 0.01 === b.z ? b.vz < 0 : b.vz > 0) b.vz = 0;
        } else if (Math.abs(b.x) > hw) { b.x = Math.sign(b.x) * hw; b.vx = 0; }
    } else if (s2 < 0) {
        const hw = W.isleHalf - 1;
        if (b.x > hw) { b.x = hw; if (b.vx > 0) b.vx = 0; } else if (b.x < -hw) { b.x = -hw; if (b.vx < 0) b.vx = 0; }
    } else if (b.z < I.z0 + 0.8 && Math.abs(b.x) > W.spanHalf - 0.8) {
        // the island's north edge, either side of the bridge
        b.z = I.z0 + 0.8; if (b.vz < 0) b.vz = 0;
    }
}
export { BOARDS };
