// What everyone carries about: the Keypals hopping after them, the little keyboards stacked on their backs, the keyboards
// flying off into a bridge. Each is one instanced mesh for the whole scene, its list rewritten once a frame (only the
// nearest characters get them), so a crowd costs three draws.
import { T, scene, selfLit } from './engine.js';
import { Kit } from './geo.js';
import { keyMaterial, palGeo, legendCell } from './keys.js';
import { palById, BOARDS } from '../../shared/config.js';

const MAX_PALS = 48, MAX_MINI = 90, MAX_FLY = 30;
const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), vP = new T.Vector3(), vS = new T.Vector3(), tc = new T.Color();
let pals = null, minis = null, built = false;
let palState = null, palKey = null, palInk = null, nPal = 0, nMini = 0;
const flyers = [];
function build() {
    if (built) return;
    built = true;
    // a Keypal: a keycap with a face on its front and a legend on its head
    const g = palGeo().clone();
    pals = new T.InstancedMesh(g, keyMaterial(), MAX_PALS);
    palState = new Float32Array(MAX_PALS).fill(-1000);
    palKey = new T.InstancedBufferAttribute(new Float32Array(MAX_PALS * 3), 3).setUsage(T.DynamicDrawUsage);
    palInk = new T.InstancedBufferAttribute(new Float32Array(MAX_PALS * 3).fill(0.1), 3);
    g.setAttribute('aKey', palKey);
    g.setAttribute('aInk', palInk);
    g.setAttribute('aBorn', new T.InstancedBufferAttribute(palState, 1));
    pals.setColorAt(0, tc.set(0xffffff));
    pals.instanceColor.setUsage(T.DynamicDrawUsage);
    pals.frustumCulled = false; pals.castShadow = false; pals.receiveShadow = false; pals.count = 0;
    scene.add(pals);
    // a little keyboard: a dark case and three rows of keys (tinted per instance)
    const k = new Kit({ noShade: true });
    k.box(0, 0.11, 0, 2.3, 0.22, 1.12, 0x30324a);
    for (let r = 0; r < 3; r++) k.box(0, 0.26, -0.33 + r * 0.33, 2.06, 0.1, 0.25, 0xffffff);
    const mg = k.geometry();
    minis = new T.InstancedMesh(mg, selfLit(new T.MeshLambertMaterial({ vertexColors: true })), MAX_MINI + MAX_FLY);
    minis.setColorAt(0, tc.set(0xffffff));
    minis.instanceColor.setUsage(T.DynamicDrawUsage);
    minis.frustumCulled = false; minis.castShadow = false; minis.receiveShadow = false; minis.count = 0;
    scene.add(minis);
}
export function beginCrowd() { build(); nPal = 0; nMini = 0; }
export function addStack(x, y, z, ry, n, bt, t) {
    if (!n) return;
    const B = BOARDS[bt] || BOARDS[0], col = B.cap[0];
    // on the back: a little behind the body, low down, so it doesn't hide your head; the stack sways as you run
    const bx = -Math.sin(ry) * 1.2, bz = -Math.cos(ry) * 1.2;
    for (let i = 0; i < n && nMini < MAX_MINI; i++) {
        const sway = Math.sin(t * 7 + i * 0.5) * 0.015 * i;
        e.set(sway, ry, sway * 0.6, 'YXZ');
        q.setFromEuler(e);
        minis.setMatrixAt(nMini, m4.compose(vP.set(x + bx - Math.cos(ry) * sway * 4, y + 1.5 + i * 0.3, z + bz), q, vS.setScalar(0.72)));
        minis.setColorAt(nMini, tc.set(i % 2 ? col : B.cap[1] ?? col));
        nMini++;
    }
}
// someone on a bridge you haven't built: on your screen they're surfing a keyboard
export function addSurf(x, y, z, ry, bt) {
    if (nMini >= MAX_MINI) return;
    q.setFromAxisAngle(vP.set(0, 1, 0), ry);
    minis.setMatrixAt(nMini, m4.compose(vP.set(x, y - 0.35, z), q, vS.set(3, 1.6, 4.6)));
    minis.setColorAt(nMini, tc.set((BOARDS[bt] || BOARDS[0]).cap[0]));
    nMini++;
}
// a Keypal at (x, y, z), facing ry, squashed s (1 is round)
export function addPal(id, x, y, z, ry, s) {
    const k = palById[id];
    if (!k || nPal >= MAX_PALS) return;
    q.setFromAxisAngle(vP.set(0, 1, 0), ry);
    pals.setMatrixAt(nPal, m4.compose(vP.set(x, y, z), q, vS.set(2.2 * (2 - s) * 0.5 + 1.1, 2 * s, 2.2)));
    pals.setColorAt(nPal, tc.set(k.color));
    palKey.array[nPal * 3] = legendCell(k.key); palKey.array[nPal * 3 + 1] = 0; palKey.array[nPal * 3 + 2] = k.rarity === 'mythic' ? 1 : 0;
    nPal++;
}
// keyboards flying from a to b (over about half a second)
export function flyKeyboard(ax, ay, az, bx, by, bz, bt, delay) {
    if (flyers.length >= MAX_FLY) flyers.shift();
    flyers.push({ ax, ay, az, bx, by, bz, t: -(delay || 0), bt, spin: Math.random() * 6 });
}
function drawFlyers(dt) {
    let n = 0;
    for (let i = flyers.length - 1; i >= 0; i--) {
        const f = flyers[i];
        f.t += dt * 2.2;
        if (f.t >= 1) { flyers.splice(i, 1); continue; }
        if (f.t < 0) continue;
        const k = f.t, u = k * k * (3 - 2 * k), arc = Math.sin(k * Math.PI) * 7;
        e.set(k * 4 + f.spin, k * 5, 0);
        q.setFromEuler(e);
        minis.setMatrixAt(nMini + n, m4.compose(vP.set(f.ax + (f.bx - f.ax) * u, f.ay + (f.by - f.ay) * u + arc, f.az + (f.bz - f.az) * u), q, vS.setScalar(1 - k * 0.3)));
        minis.setColorAt(nMini + n, tc.set((BOARDS[f.bt] || BOARDS[0]).cap[0]));
        n++;
    }
    return n;
}
export function endCrowd(dt) {
    const nf = drawFlyers(dt);
    minis.count = nMini + nf; minis.visible = minis.count > 0;
    if (minis.count) { minis.instanceMatrix.needsUpdate = true; minis.instanceColor.needsUpdate = true; }
    pals.count = nPal; pals.visible = nPal > 0;
    if (nPal) { pals.instanceMatrix.needsUpdate = true; pals.instanceColor.needsUpdate = true; palKey.needsUpdate = true; }
}
// for the loading warm-up: one of each, drawn behind the loading screen
export function crowdWarm() { build(); pals.count = 1; minis.count = 1; pals.setMatrixAt(0, m4.makeTranslation(0, -80, 0)); minis.setMatrixAt(0, m4.makeTranslation(3, -80, 0)); pals.visible = minis.visible = true; pals.instanceMatrix.needsUpdate = true; minis.instanceMatrix.needsUpdate = true; }

// A team's Keypals following their owner: a state per pal, hopping along behind in a line
export class Team {
    constructor() { this.ids = []; this.key = ''; this.st = []; }
    set(csv) {
        if (csv === this.key) return;
        this.key = csv;
        this.ids = csv ? csv.split(',').filter((id) => palById[id]).slice(0, 6) : [];
        while (this.st.length < this.ids.length) this.st.push({ x: 1e9, z: 0, h: 0, vy: 0, ry: 0, s: 1, sv: 0, p: Math.random() * 6 });
    }
    update(dt, t, x, y, z, ry) {
        const ids = this.ids;
        for (let i = 0; i < ids.length; i++) {
            const S = this.st[i], side = i % 2 ? 1 : -1, back = 4.2 + Math.floor(i / 2) * 2.8;
            const tx = x - Math.sin(ry) * back + Math.cos(ry) * side * 2.4, tz = z - Math.cos(ry) * back - Math.sin(ry) * side * 2.4;
            if (S.x > 1e8 || (S.x - tx) ** 2 + (S.z - tz) ** 2 > 3600) { S.x = tx; S.z = tz; S.h = 0; S.vy = 0; }
            const dx = tx - S.x, dz = tz - S.z, d = Math.hypot(dx, dz), moving = d > 1.2;
            const sp = Math.min(46, d * 7);
            if (moving) { S.x += dx / d * sp * dt; S.z += dz / d * sp * dt; S.ry = Math.atan2(dx, dz); }
            // hopping along when there's ground to cover, a little bounce on the spot now and then
            S.vy -= 70 * dt; S.h += S.vy * dt;
            if (S.h <= 0) { if (S.vy < -3) S.sv = -3.4; S.h = 0; S.vy = moving ? 15 : (Math.sin(t * 0.8 + S.p) > 0.985 ? 9 : 0); }
            S.sv += (((1 - S.s) * 120) - S.sv * 11) * dt; S.s = Math.max(0.65, Math.min(1.3, S.s + S.sv * dt));
            addPal(ids[i], S.x, y + S.h + 0.1, S.z, S.ry, S.s);
        }
    }
}
