// The keys: every keycap in the game is an instance of one bevelled, dished block with its legend on top. Everything a
// key does is in the vertex shader, from a few uniforms and one number per key, so a press costs no geometry upload:
//   press: it sinks under anyone standing on it, and clacks back with a spring after a tap or a stomp near it;
//   pop-in: a key of a bridge scales up out of nothing with an overshoot (aBorn: when it was born);
//   RGB: the Gamer keyboard's legends and rims run through the rainbow.
// Lambert (matte) material only, lit by the game's rig; legends are a mask mixed in on top of the key's colour.
import { T, selfLit } from './engine.js';

export const SQ_NOW = { value: 0 };
const T0 = performance.now();
export function tickKeys() { SQ_NOW.value = (performance.now() - T0) / 1000; }
export const keysNow = () => SQ_NOW.value;

// where up to 8 characters stand (x, y of their feet, z, 1 when standing): the keys under them are down
export const PRESS = { value: Array.from({ length: 8 }, () => new T.Vector4(0, -9999, 0, 0)) };
const MAXI = 8;
const IMP = { value: Array.from({ length: MAXI }, () => new T.Vector4(0, -9999, 0, -99)) }, IMPK = { value: Array.from({ length: MAXI }, () => new T.Vector4(0, 1, 0, 0)) };
let impN = 0;
// a tap or stomp at (x, y, z): the keys within radius clack down and spring back. strength 0..1.5
export function impact(x, y, z, strength, radius) {
    const i = impN++ % MAXI;
    IMP.value[i].set(x, y, z, SQ_NOW.value);
    IMPK.value[i].set(strength, radius || 3, 0, 0);
}

// ----- the legends: one mask texture (white on black), 8 x 8 cells -----
const LEGENDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '.', 'Ctrl', 'Alt', 'SHIFT', 'BACK', 'ENTER', 'STAR', ''];
const cellOf = new Map(LEGENDS.map((t, i) => [t, i]));
export const legendCell = (t) => cellOf.get(t) ?? cellOf.get('');
const FACE_CELL = 63;
let atlas = null;
function legendAtlas() {
    if (atlas) return atlas;
    const N = 1024, S = N / 8, c = document.createElement('canvas');
    c.width = c.height = N;
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, N, N);
    x.fillStyle = '#fff'; x.strokeStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineCap = 'round'; x.lineJoin = 'round';
    LEGENDS.forEach((t, i) => {
        const cx = (i % 8 + 0.5) * S, cy = (Math.floor(i / 8) + 0.5) * S;
        if (t === 'SHIFT') { x.beginPath(); x.moveTo(cx, cy - S * 0.3); x.lineTo(cx + S * 0.28, cy); x.lineTo(cx + S * 0.13, cy); x.lineTo(cx + S * 0.13, cy + S * 0.28); x.lineTo(cx - S * 0.13, cy + S * 0.28); x.lineTo(cx - S * 0.13, cy); x.lineTo(cx - S * 0.28, cy); x.closePath(); x.fill(); return; }
        if (t === 'BACK') { x.lineWidth = S * 0.09; x.beginPath(); x.moveTo(cx + S * 0.3, cy); x.lineTo(cx - S * 0.26, cy); x.stroke(); x.beginPath(); x.moveTo(cx - S * 0.08, cy - S * 0.2); x.lineTo(cx - S * 0.28, cy); x.lineTo(cx - S * 0.08, cy + S * 0.2); x.stroke(); return; }
        if (t === 'ENTER') { x.lineWidth = S * 0.09; x.beginPath(); x.moveTo(cx + S * 0.26, cy - S * 0.24); x.lineTo(cx + S * 0.26, cy + S * 0.12); x.lineTo(cx - S * 0.24, cy + S * 0.12); x.stroke(); x.beginPath(); x.moveTo(cx - S * 0.06, cy - S * 0.08); x.lineTo(cx - S * 0.26, cy + S * 0.12); x.lineTo(cx - S * 0.06, cy + S * 0.32); x.stroke(); return; }
        if (t === 'STAR') { x.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 - Math.PI / 2, r = k % 2 ? S * 0.14 : S * 0.32; x[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.closePath(); x.fill(); return; }
        const small = t.length > 1;
        x.font = '700 ' + (small ? S * 0.32 : S * 0.56) + 'px Fredoka, "Arial Rounded MT Bold", sans-serif';
        x.fillText(t, cx, cy + S * 0.03);
    });
    // a Keypal's face: two big eyes with a shine, a little smile (the mask leaves the shine and the rest key-coloured)
    {
        const cx = (FACE_CELL % 8 + 0.5) * S, cy = (Math.floor(FACE_CELL / 8) + 0.5) * S;
        for (const sx of [-1, 1]) { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(cx + sx * S * 0.2, cy - S * 0.02, S * 0.1, S * 0.15, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = '#000'; x.beginPath(); x.arc(cx + sx * S * 0.2 + S * 0.03, cy - S * 0.08, S * 0.04, 0, Math.PI * 2); x.fill(); }
        x.strokeStyle = '#fff'; x.lineWidth = S * 0.045; x.beginPath(); x.arc(cx, cy + S * 0.14, S * 0.09, 0.2, Math.PI - 0.2); x.stroke();
    }
    atlas = new T.CanvasTexture(c);
    atlas.colorSpace = T.NoColorSpace;
    atlas.anisotropy = 4;
    return atlas;
}
const UATLAS = { value: null };

// ----- the material -----
const KEY_GLSL = /* glsl */`
uniform float uSq; uniform vec4 uImp[${MAXI}]; uniform vec4 uImpK[${MAXI}]; uniform vec4 uPress[8];
attribute vec3 aKey; attribute vec3 aInk; attribute float aBorn;
varying vec2 vKuv; varying vec3 vInk; varying float vRgb; varying float vTop;
float keyPress(vec3 c, float hw, float hd) {
    float p = 0.0;
    for (int i = 0; i < 8; i++) {
        vec4 q = uPress[i];
        if (q.w < 0.5 || abs(q.y - c.y) > 3.0) continue;
        vec2 d = abs(q.xz - c.xz) - vec2(hw, hd);
        p = max(p, 1.0 - smoothstep(-0.3, 0.7, max(d.x, d.y)));
    }
    for (int i = 0; i < ${MAXI}; i++) {
        vec4 im = uImp[i];
        float age = uSq - im.w;
        if (age < 0.0 || age > 1.2 || abs(im.y - c.y) > 3.0) continue;
        vec2 dv = max(abs(c.xz - im.xz) - vec2(hw, hd) * 0.8, vec2(0.0));
        float r = length(dv), R = uImpK[i].y;
        if (r > R) continue;
        float a = age - r * 0.014;
        if (a < 0.0) continue;
        float k = a < 0.03 ? a / 0.03 : exp(-(a - 0.03) * 11.0) * cos((a - 0.03) * 24.0) * 1.1;
        p = max(p, k * (1.0 - r / R * 0.7) * uImpK[i].x);
    }
    return clamp(p, -0.18, 1.0);
}
`;
let matC = null;
export function keyMaterial() {
    if (matC) return matC;
    UATLAS.value = legendAtlas();
    const m = new T.MeshLambertMaterial({ color: 0xffffff });
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, { uSq: SQ_NOW, uImp: IMP, uImpK: IMPK, uPress: PRESS, uLeg: UATLAS });
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + KEY_GLSL)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
vec3 kc = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
float khw = 0.5 * length(instanceMatrix[0].xyz), khd = 0.5 * length(instanceMatrix[2].xyz);
float kba = uSq - aBorn;
float kbx = kba / 0.24 - 1.0;
float kbs = kba < 0.0 ? 0.0 : kba < 0.24 ? 1.0 + 2.7 * kbx * kbx * kbx + 1.7 * kbx * kbx : 1.0;
transformed *= kbs;
transformed.y -= keyPress(kc, khw, khd) * 0.42;
vRgb = aKey.z; vInk = aInk;
vTop = smoothstep(0.7, 0.98, position.y);
{ float g = aKey.x; vec2 kuv = uv; if (uv.x > 1.5) { g = ${FACE_CELL}.0; kuv = uv - vec2(2.0); } vec2 cell = vec2(mod(g, 8.0), floor(g / 8.0)); vKuv = vec2((cell.x + kuv.x) / 8.0, 1.0 - (cell.y + 1.0 - kuv.y) / 8.0); }`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D uLeg; uniform float uSq;
varying vec2 vKuv; varying vec3 vInk; varying float vRgb; varying float vTop;
vec3 hue(float h) { return clamp(abs(fract(h + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }`)
            .replace('#include <color_fragment>', `#include <color_fragment>
float kLeg = texture2D(uLeg, vKuv).r;
vec3 kInk = vInk;
if (vRgb > 0.5) kInk = hue(uSq * 0.16 + vKuv.x * 2.0 + vKuv.y);
diffuseColor.rgb = mix(diffuseColor.rgb, kInk, kLeg);
// a soft darkening down the sides, the top a touch brighter: reads as a sculpted cap
diffuseColor.rgb *= 0.82 + 0.2 * vTop;`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (vRgb > 0.5) totalEmissiveRadiance += kInk * (kLeg * 1.1 + (1.0 - vTop) * 0.35);`);
    };
    m.customProgramCacheKey = () => 'kb-key';
    matC = selfLit(m);
    return matC;
}

// ----- geometry: a tapered block with a dished top, 1 x 1 base, 1 tall, centred on x/z, base at 0 -----
function fixWinding(g) {
    const p = g.attributes.position.array, n = g.attributes.normal.array, ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) {
        const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
        const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        if (cx * (n[a] + n[b] + n[c]) + cy * (n[a + 1] + n[b + 1] + n[c + 1]) + cz * (n[a + 2] + n[b + 2] + n[c + 2]) < 0) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    }
}
function buildKeyGeo(detail, face) {
    const pos = [], nor = [], uv = [], idx = [];
    const b = 0.5, t = 0.38, tt = 0.42, H = 1, HC = 0.92;
    const v = (x, y, z, nx, ny, nz, u, w) => { pos.push(x, y, z); nor.push(nx, ny, nz); uv.push(u, w); return pos.length / 3 - 1; };
    for (const [sx, sz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const ax = sz !== 0 ? 1 : 0, az = sx !== 0 ? 1 : 0, front = face && sz === 1;
        const n = new T.Vector3(sx * H, b - tt, sz * H).normalize();
        const p = (s, half, y) => [sx * half + ax * s * half, y, sz * half + az * s * half];
        const q = detail ? [p(-1, b, 0), p(1, b, 0), p(1, tt, HC), p(-1, tt, HC)] : [p(-1, b, 0), p(1, b, 0), p(1, t, H), p(-1, t, H)];
        const fu = [[2, 2], [3, 2], [3, 3], [2, 3]];
        const k = q.map((c, i) => (front ? v(c[0], c[1], c[2], n.x, n.y, n.z, fu[i][0], fu[i][1]) : v(c[0], c[1], c[2], n.x, n.y, n.z, 0.98, 0.02)));
        idx.push(k[0], k[1], k[2], k[0], k[2], k[3]);
        if (detail) {
            const n2 = new T.Vector3(sx, 1.4, sz).normalize();
            const r = [p(-1, tt, HC), p(1, tt, HC), p(1, t, H), p(-1, t, H)];
            const k2 = r.map((c) => v(c[0], c[1], c[2], n2.x, n2.y, n2.z, 0.98, 0.02));
            idx.push(k2[0], k2[1], k2[2], k2[0], k2[2], k2[3]);
        }
    }
    const N = detail ? 3 : 1, G = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
        const u = i / N, w = j / N, x = -t + u * 2 * t, z = -t + w * 2 * t, mid = N > 1 && (i === 1 || i === 2) && (j === 1 || j === 2);
        G.push(v(x, H - (mid ? 0.05 : 0), z, 0, 1, 0, u, 1 - w));
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = G[j * (N + 1) + i], bb = G[j * (N + 1) + i + 1], c = G[(j + 1) * (N + 1) + i], d = G[(j + 1) * (N + 1) + i + 1]; idx.push(a, c, bb, bb, c, d); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    fixWinding(g);
    return g;
}
let hiC = null, loC = null, palC = null;
// 34 triangles near (a chamfer, a dished top), 10 on Low
export const keyGeo = (low) => (low ? (loC || (loC = buildKeyGeo(false))) : (hiC || (hiC = buildKeyGeo(true))));
export const palGeo = () => palC || (palC = buildKeyGeo(true, true));

// ----- a set of keys, one draw -----
const m4 = new T.Matrix4(), qI = new T.Quaternion(), vP = new T.Vector3(), vS = new T.Vector3(), tc = new T.Color();
const NEVER = 1e7, LONG_AGO = -1000;
let lowDetail = false;
export function keyDetail(low) { lowDetail = !!low; }
export class KeySet {
    // list: [{ x, y (base), z, w, d, h, color, ink ([r, g, b] or hex), cell, rgb, born }]
    constructor(list, o) {
        o = o || {};
        const n = list.length, geo = keyGeo(lowDetail).clone();
        this.list = list;
        this.state = new Float32Array(n);
        const key = new Float32Array(n * 3), ink = new Float32Array(n * 3);
        const im = new T.InstancedMesh(geo, keyMaterial(), n);
        list.forEach((k, i) => {
            im.setMatrixAt(i, m4.compose(vP.set(k.x, k.y, k.z), qI, vS.set(k.w, k.h, k.d)));
            im.setColorAt(i, tc.set(k.color));
            key[i * 3] = k.cell ?? 44; key[i * 3 + 1] = i * 0.37 % 1; key[i * 3 + 2] = k.rgb ? 1 : 0;
            tc.set(k.ink ?? 0x1a1030); ink[i * 3] = tc.r; ink[i * 3 + 1] = tc.g; ink[i * 3 + 2] = tc.b;
            this.state[i] = k.born ?? LONG_AGO;
        });
        geo.setAttribute('aKey', new T.InstancedBufferAttribute(key, 3));
        geo.setAttribute('aInk', new T.InstancedBufferAttribute(ink, 3));
        this.attr = new T.InstancedBufferAttribute(this.state, 1).setUsage(T.DynamicDrawUsage);
        geo.setAttribute('aBorn', this.attr);
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        // the keys throw no shadow (it would fall on the keys; the shadow pass is spared them), and they're drawn before
        // what's under them: those pixels are then skipped
        im.castShadow = false; im.receiveShadow = true;
        im.renderOrder = -1;
        im.matrixAutoUpdate = false; im.updateMatrix();
        im.visible = o.visible !== false;
        this.mesh = im;
        this.cx = im.boundingSphere.center.x; this.cz = im.boundingSphere.center.z; this.r = im.boundingSphere.radius;
        this.lo = 1e9; this.hi = -1;
    }
    // the keys from i on come up now (t: when, default now); hide: none of them yet
    born(i, t) { this.state[i] = t ?? SQ_NOW.value; this.touch(i); }
    hide(i) { this.state[i] = NEVER; this.touch(i); }
    touch(i) { this.lo = Math.min(this.lo, i); this.hi = Math.max(this.hi, i); this.dirty = true; }
    flush() {
        if (!this.dirty) return;
        this.dirty = false;
        this.attr.clearUpdateRanges(); this.attr.addUpdateRange(this.lo, this.hi - this.lo + 1); this.attr.needsUpdate = true;
        this.lo = 1e9; this.hi = -1;
    }
    setColor(i, c) { this.mesh.setColorAt(i, tc.set(c)); this.mesh.instanceColor.needsUpdate = true; }
    // far from the camera the keys aren't drawn (the deck under them is coloured)
    lod(cam, far) { const on = (cam.x - this.cx) ** 2 + (cam.z - this.cz) ** 2 < (far + this.r) ** 2; if (on !== this.mesh.visible) this.mesh.visible = on; }
    dispose() { this.mesh.geometry.dispose(); this.mesh.dispose(); if (this.mesh.parent) this.mesh.parent.remove(this.mesh); }
}
export const NEVER_BORN = NEVER;

// a key, for the loading warm-up
export function keyWarmGroup() {
    const g = new T.Group(), a = new KeySet([{ x: 0, y: 0, z: 0, w: 2, h: 1, d: 2, color: 0xffffff, cell: 1 }]);
    g.add(a.mesh);
    return g;
}
