// A world's hub on screen (shared/world.js has where everything stands): the island with its seven giant keyboards, the
// Workshop, the capsule machines, the leaderboards and the worlds portal; north of it the chain of bridges, each one's keys
// popping in as your Keyboards go in, with a little island and a Win Pad after each. Static things are merged per
// stretch and batched (a stretch off screen isn't drawn), keys are instanced per keyboard and per bridge.
import { T, V3, scene, studVCMaterial, texFrom, fitFont, textPlane, prompts } from './engine.js';
import { Kit, glowVCMaterial, batchKits, rng } from './geo.js';
import { blob, buildBlobs, releaseBlobs } from './blobs.js';
import { KeySet, keysNow, legendCell, NEVER_BORN } from './keys.js';
import { Signs, big, GOLD, LIME, WHITE, RED, AQUA, GREY, PINK } from './signs.js';
import { CU } from './clock.js';
import { W, P, BOARD_SPOTS, BOARD_KEYS, BOARD_W, BOARD_D, workshop, worldsPortal, boards, spanStart, spanEnd, isleMid, capsulesOf, hubFor, gateX, gateZ } from '../../shared/world.js';
import { BOARDS, WORLDS, bridgeCost, padWins, FIRST_CROSS, fmt, fmtComma } from '../../shared/config.js';

const shade = (c, k) => new T.Color(c).multiplyScalar(k).getHex();
const mixC = (a, b, k) => new T.Color(a).lerp(new T.Color(b), k).getHex();
// each world's seven colours: its bridges' keys, its gates, the arcs in its sky, the giant keycaps floating about
const TONES = {
    cove: [0xff3a5a, 0xff8a1a, 0xffd21a, 0x3ae83a, 0x1ad8e8, 0x3a7aff, 0xb43aff],
    arcade: [0xff2ac8, 0xb43aff, 0x4a6aff, 0x1ae8e8, 0x3affb0, 0xffe02a, 0xff5a8a],
    cosmos: [0x4a5aff, 0x7a5aff, 0xb45aff, 0xe08aff, 0x8ae8ff, 0x4ac8ff, 0x2a8aff],
    candy: [0xff5ab0, 0xff9ad0, 0xffe88a, 0x8affb0, 0x6ae0ff, 0xb48aff, 0xff7a8a],
    lava: [0xff2a0a, 0xff5a0a, 0xff8a1a, 0xffb82a, 0xffe04a, 0xff8a1a, 0xff5a0a],
};
// a flat floor with its studs lined up with the world, whatever its size
function floorQuad(kit, x0, x1, z0, z1, y, c) { kit.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], c, { uv: [x0 / 8, z1 / 8, x1 / 8, z0 / 8] }); }

// ----- the sea: unlit, waves and glints in the shader; Neon Arcade's has a grid, Cosmic Desk's is space, Sugar Switch's is
// swirled milkshake with sprinkles, Molten Core's is lava -----
function seaMaterial(Wd, opts) {
    const m = new T.MeshBasicMaterial({ color: Wd.sea });
    const mode = Wd.id === 'arcade' ? 1 : Wd.id === 'cosmos' ? 2 : Wd.id === 'candy' ? 3 : Wd.id === 'lava' ? 4 : 0;
    const I = W.island;
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, { uNow: CU.uNow, uLow: { value: opts.low ? 1 : 0 }, uSea2: { value: new T.Color(Wd.sea2) }, uMode: { value: mode }, uC: { value: new T.Vector2((I.x0 + I.x1) / 2, (I.z0 + I.z1) / 2) }, uH: { value: new T.Vector2((I.x1 - I.x0) / 2 + 12, (I.z1 - I.z0) / 2 + 12) } });
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWxz;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWxz = (modelMatrix * vec4(position, 1.0)).xz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNow; uniform float uLow; uniform vec3 uSea2; uniform float uMode; uniform vec2 uC; uniform vec2 uH; varying vec2 vWxz;')
            .replace('#include <color_fragment>', `#include <color_fragment>
{
    vec2 p = vWxz; float t = uNow;
    float w = sin(p.x * 0.05 + t * 0.6) * sin(p.y * 0.043 - t * 0.45) + 0.5 * sin((p.x + p.y) * 0.11 + t * 0.9);
    vec2 d = abs(p - uC) - uH; float sd = length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);
    if (uMode < 0.5) {
        diffuseColor.rgb = mix(diffuseColor.rgb, uSea2, clamp(0.28 + w * 0.2 + smoothstep(90.0, 6.0, sd) * 0.6, 0.0, 1.0));
        if (uLow < 0.5) { float g = sin(p.x * 0.62 + t * 1.2 + sin(p.y * 0.3)) * sin(p.y * 0.8 - t); diffuseColor.rgb += vec3(smoothstep(0.86, 1.0, g) * 0.3); }
        float foam = smoothstep(9.0 + sin(p.x * 0.09 + t) * 2.5 + sin(p.y * 0.11 - t * 0.7) * 2.5, 2.0, sd);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), foam * 0.85);
    } else if (uMode < 1.5) {
        vec2 q = abs(fract(p * 0.03) - 0.5);
        float line = smoothstep(0.46, 0.5, max(q.x, q.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, uSea2, line * (0.55 + 0.25 * sin(t * 1.4 + (p.x + p.y) * 0.01)));
        diffuseColor.rgb += uSea2 * smoothstep(60.0, 4.0, sd) * 0.3;
    } else if (uMode > 3.5) {
        float n = sin(p.x * 0.07 + t * 0.35 + 2.0 * sin(p.y * 0.05 - t * 0.2)) * sin(p.y * 0.06 - t * 0.3 + 2.0 * sin(p.x * 0.04 + t * 0.15));
        float crack = smoothstep(0.35, 0.0, abs(n));
        diffuseColor.rgb = mix(vec3(0.16, 0.05, 0.04), mix(diffuseColor.rgb, uSea2, crack * crack), crack);
        diffuseColor.rgb += uSea2 * smoothstep(40.0, 3.0, sd) * 0.5;
    } else if (uMode > 2.5) {
        float sw = sin(p.x * 0.045 + sin(p.y * 0.03 + t * 0.25) * 2.5 + t * 0.2);
        diffuseColor.rgb = mix(diffuseColor.rgb, uSea2, smoothstep(-0.2, 0.6, sw) * 0.75);
        if (uLow < 0.5) {
            vec2 c = floor(p * 0.12);
            float st = step(0.975, fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453));
            diffuseColor.rgb = mix(diffuseColor.rgb, 0.6 + 0.4 * cos(6.283 * (fract(c.x * 0.37 + c.y * 0.11) + vec3(0.0, 0.33, 0.67))), st * 0.9);
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), smoothstep(9.0 + sin(p.x * 0.09 + t) * 2.5, 2.0, sd) * 0.85);
    } else {
        vec2 c = floor(p * 0.16);
        float st = step(0.985, fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453));
        diffuseColor.rgb += st * vec3(0.9, 0.95, 1.0) * (0.5 + 0.5 * sin(t * 2.0 + c.x));
        diffuseColor.rgb += uSea2 * (0.09 + w * 0.05);
        diffuseColor.rgb += uSea2 * smoothstep(50.0, 4.0, sd) * 0.3;
    }
}`);
    };
    m.customProgramCacheKey = () => 'kb-sea';
    return m;
}
// a portal's swirl
function portalMesh(w, h, c1, c2) {
    const m = new T.ShaderMaterial({
        uniforms: { uNow: CU.uNow, uA: { value: new T.Color(c1) }, uB: { value: new T.Color(c2) } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uNow; uniform vec3 uA; uniform vec3 uB; varying vec2 vUv;
            void main() {
                vec2 p = (vUv - 0.5) * vec2(1.0, 1.25);
                float r = length(p), a = atan(p.y, p.x);
                float sw = sin(a * 4.0 + r * 14.0 - uNow * 3.5) * 0.5 + 0.5;
                vec3 c = mix(uA, uB, sw);
                c = mix(c, vec3(1.0), smoothstep(0.32, 0.0, r) * 0.7);
                gl_FragColor = vec4(c * 1.1, smoothstep(0.62, 0.5, r) * 0.92);
                #include <colorspace_fragment>
            }`,
        transparent: true, depthWrite: false, side: T.DoubleSide,
    });
    const mesh = new T.Mesh(new T.PlaneGeometry(w, h), m);
    mesh.renderOrder = 3;
    return mesh;
}
function boardTexture(title) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 600;
    return { c, t: texFrom(c), title, key: '' };
}
// drawn at 768 x 900, stored at 2/3 of that; only when the rows changed
function drawBoard(B, rows) {
    const key = JSON.stringify(rows || []);
    if (key === B.key) return;
    B.key = key;
    const x = B.c.getContext('2d'), Wd = 768, H = 900;
    x.setTransform(B.c.width / Wd, 0, 0, B.c.height / H, 0, 0);
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a3a6a'); g.addColorStop(1, '#1a2448');
    x.fillStyle = g; x.fillRect(0, 0, Wd, H);
    x.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 9; i++) for (let j = 0; j < 11; j++) { x.beginPath(); x.roundRect(10 + i * 84, 10 + j * 84, 70, 70, 12); x.fill(); }
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    fitFont(x, B.title, Wd - 40, 74, 400, '"Luckiest Guy", Fredoka, sans-serif', 0.2);
    x.lineWidth = 14; x.strokeStyle = '#0a1030'; x.strokeText(B.title, Wd / 2, 70); x.fillStyle = '#ffe24a'; x.fillText(B.title, Wd / 2, 70);
    (rows || []).slice(0, 9).forEach((r, i) => {
        const y = 170 + i * 80;
        x.textAlign = 'left'; x.lineWidth = 8; x.strokeStyle = '#0a1030';
        const name = '#' + (i + 1) + ' ' + r.n;
        fitFont(x, name, Wd - 300, 44, 700, 'Fredoka, sans-serif', 0);
        x.strokeText(name, 40, y); x.fillStyle = '#ffffff'; x.fillText(name, 40, y);
        x.textAlign = 'right'; x.font = '700 44px Fredoka, sans-serif'; x.strokeText(fmtComma(r.v), Wd - 40, y); x.fillStyle = '#7dff6b'; x.fillText(fmtComma(r.v), Wd - 40, y);
    });
    if (!rows || !rows.length) { x.textAlign = 'center'; x.font = '700 46px Fredoka, sans-serif'; x.fillStyle = '#c8d4ff'; x.fillText('Be the first!', Wd / 2, 200); }
    B.t.needsUpdate = true;
}

// ----- trees and other things that fill a world -----
function palm(kit, x, z, h, R) {
    const lean = R() * 6.283;
    let px = x, pz = z;
    for (let i = 0; i < 5; i++) {
        const k = i / 5, y = i * h / 5 + h / 10;
        px = x + Math.cos(lean) * k * k * 2.6; pz = z + Math.sin(lean) * k * k * 2.6;
        kit.box(px, y, pz, 1.7 - k * 0.6, h / 5 + 0.3, 1.7 - k * 0.6, i % 2 ? 0xa8743c : 0x8f5f30, { soft: true });
    }
    for (let a = 0; a < 7; a++) {
        const t = a / 7 * 6.283 + R() * 0.5, c = a % 2 ? 0x2ee070 : 0x20c860;
        blob(px + Math.cos(t) * 3.7, h + 0.7, pz + Math.sin(t) * 3.7, 7.6, 0.8, 2.4, c, { ry: -t, rz: -0.34, sway: 1 });
    }
    blob(px, h - 0.2, pz, 2.2, 1.6, 2.2, 0x7a4a26, { sway: 0 });
}
function neonTree(kit, x, z, h, R) {
    kit.box(x, h / 2, z, 1.4, h, 1.4, 0x1a1438);
    const C = [0xff3ac8, 0x3affd8, 0xffe02a, 0x8a5aff][Math.floor(R() * 4)];
    for (let i = 0; i < 3; i++) kit.box(x, h + 1.2 + i * 3, z, 8 - i * 2.2, 2.6, 8 - i * 2.2, C, { soft: true, glow: 1 });
    kit.box(x, h - 0.3, z, 2.2, 0.3, 2.2, C, { glow: 1 });
}
function crystal(x, z, h, R) {
    const C = [0x8ae8ff, 0xb48aff, 0xffb8e8, 0x8affd8][Math.floor(R() * 4)];
    for (let i = 0; i < 3; i++) {
        const a = R() * 6.283, k = i === 0 ? 1 : 0.55 + R() * 0.25;
        blob(x + Math.cos(a) * i * 1.6, h * k * 0.5, z + Math.sin(a) * i * 1.6, 2.8 * k, h * k, 2.8 * k, C, { ry: a, rx: (R() - 0.5) * 0.3, rz: (R() - 0.5) * 0.3, sway: 0 });
    }
}
function lolly(kit, x, z, h, R) {
    kit.box(x, h / 2, z, 0.9, h, 0.9, 0xffffff, { soft: true });
    const C = [0xff5ac0, 0x5ad8ff, 0xffe02a, 0x8aff7a][Math.floor(R() * 4)], ry = R() * 6.283;
    blob(x, h + 3, z, 7.6, 7.6, 2.6, C, { sway: 0, ry });
    blob(x, h + 3, z, 4.4, 4.4, 2.9, 0xffffff, { sway: 0, ry });
}
function rockSpire(kit, x, z, h, R) {
    kit.box(x, h * 0.3, z, 5, h * 0.6, 5, 0x3a2a30, { soft: true, ry: R() * 3 });
    kit.box(x, h * 0.75, z, 3, h * 0.4, 3, 0x2e2028, { soft: true, ry: R() * 3 });
    kit.box(x, h * 0.97, z, 2, 1, 2, 0xffa01a, { glow: 1 });
}
function umbrella(kit, x, z, c, R) {
    kit.box(x, 3.4, z, 0.4, 6.8, 0.4, 0xf4f4f8);
    const a0 = R() * 6.283;
    for (let i = 0; i < 8; i++) { const a = a0 + i / 8 * 6.283; kit.box(x + Math.cos(a) * 2.3, 6.7, z + Math.sin(a) * 2.3, 3.4, 0.4, 1.8, i % 2 ? c : 0xffffff, { ry: -a, rz: -0.28 }); }
    kit.box(x + 2.6, 0.3, z + 2.4, 2.6, 0.5, 5, mixC(c, 0xffffff, 0.35));
}
function cabinet(kit, x, z, ry, c) {
    const s = Math.sin(ry), co = Math.cos(ry), at = (dx, dz) => [x + co * dx + s * dz, z - s * dx + co * dz];
    let p = at(0, 0); kit.box(p[0], 3.4, p[1], 4.4, 6.8, 3.4, 0x20183c, { ry });
    p = at(0, 1.72); kit.box(p[0], 4.6, p[1], 3.2, 2.5, 0.1, c, { ry, glow: 1 });
    p = at(0, 1.3); kit.box(p[0], 2.9, p[1], 3.8, 0.4, 1.6, 0x34285a, { ry });
    p = at(-0.8, 1.9); kit.box(p[0], 3.25, p[1], 0.5, 0.5, 0.5, 0xff3a5a, { ry, glow: 1 });
    p = at(0.6, 1.9); kit.box(p[0], 3.25, p[1], 0.4, 0.4, 0.4, 0x3affd8, { ry, glow: 1 });
    p = at(0, 0); kit.box(p[0], 7, p[1], 4.6, 0.8, 3.6, c, { ry, glow: 1 });
}

// a capsule machine: a stand, a clear dome of capsules, a crank
function capsuleMachine(kit, domes, x, z, c) {
    kit.box(x, 1.8, z, 6.8, 3.6, 6.8, shade(c, 0.85), { soft: true });
    kit.box(x, 3.8, z, 7.3, 0.5, 7.3, 0xffffff, { soft: true });
    kit.box(x, 2, z + 3.45, 2.2, 2.2, 0.2, 0x20183c);
    kit.box(x, 2, z + 3.65, 0.9, 0.9, 0.5, 0xffe24a, { soft: true });
    const R = rng(Math.abs(x * 7 + z * 13) + 3), C = [0xff4a6a, 0xffe02a, 0x46ec50, 0x3ab4ff, 0xff8ad8, 0xffffff];
    for (let i = 0; i < 16; i++) { const a = R() * 6.283, r = 2.8 * Math.sqrt(R()); kit.box(x + Math.cos(a) * r, 4.6 + R() * 2.6, z + Math.sin(a) * r, 1.45, 1.45, 1.45, C[i % C.length], { soft: true }); }
    kit.box(x, 9.7, z, 3, 0.8, 3, shade(c, 0.85), { soft: true });
    domes.push({ x, y: 4, z });
}

export function buildHub(wi, opts) {
    const Tw = hubFor(wi), Wd = WORLDS[wi] || WORLDS[0], N = Wd.bridges, R = rng(wi * 97 + 11), Tones = TONES[Wd.id] || TONES.cove;
    const group = new T.Group(), signs = new Signs(4, 448, 152), sets = [];
    // a kit per stretch: the island, then each bridge with the island after it
    const S0 = new Kit(), P0 = new Kit({ glow: true }), stretchS = [S0], stretchP = [P0], treeAt = [];
    // ----- the sea -----
    const sea = new T.Mesh(new T.PlaneGeometry(7000, 7000).rotateX(-Math.PI / 2), seaMaterial(Wd, opts));
    sea.position.set(0, -7, -200); sea.renderOrder = 1; sea.frustumCulled = false;
    group.add(sea);
    // ----- the island's floor: tiles round the holes the keyboards sit in -----
    const I = W.island, edgesX = [I.x0, I.x1], edgesZ = [I.z0, I.z1];
    for (let x = I.x0 + 26; x < I.x1; x += 26) edgesX.push(x);
    for (let z = I.z0 + 26; z < I.z1; z += 26) edgesZ.push(z);
    for (const s of BOARD_SPOTS) { edgesX.push(s.x - BOARD_W / 2, s.x + BOARD_W / 2); edgesZ.push(s.z - BOARD_D / 2, s.z + BOARD_D / 2); }
    edgesX.sort((a, b) => a - b); edgesZ.sort((a, b) => a - b);
    for (let i = 0; i < edgesX.length - 1; i++) for (let j = 0; j < edgesZ.length - 1; j++) {
        const x0 = edgesX[i], x1 = edgesX[i + 1], z0 = edgesZ[j], z1 = edgesZ[j + 1], cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        if (x1 - x0 < 0.01 || z1 - z0 < 0.01) continue;
        if (BOARD_SPOTS.some((s) => Math.abs(cx - s.x) < BOARD_W / 2 && Math.abs(cz - s.z) < BOARD_D / 2)) continue;
        const tile = (Math.floor(cx / 26) + Math.floor(cz / 26)) & 1;
        // the path from the spawn up the middle to the first bridge
        const c = Math.abs(cx) < 13 && cz < 86 ? Wd.path : tile ? Wd.floor : Wd.floor2;
        floorQuad(S0, x0, x1, z0, z1, 0, c);
    }
    // the island's edge: a rim, then its sides down to the sea
    const rimC = Wd.rim, W2 = I.x1 - I.x0, D2 = I.z1 - I.z0, mx = (I.x0 + I.x1) / 2, mz = (I.z0 + I.z1) / 2;
    const edge = (x, z, sx, sz) => { S0.box(x, -0.2, z, sx, 1, sz, rimC, { tile: 8 }); S0.box(x, -4.5, z, sx, 8, sz, shade(Wd.floor, 0.7), { tile: 8 }); };
    edge(mx, I.z1 + 1.5, W2 + 6, 3); edge(I.x0 - 1.5, mz, 3, D2); edge(I.x1 + 1.5, mz, 3, D2);
    const gapL = W.spanHalf + 1;
    edge((I.x0 - 3 - gapL) / 2, I.z0 - 1.5, (-I.x0 + 3) - gapL, 3); edge((I.x1 + 3 + gapL) / 2, I.z0 - 1.5, (I.x1 + 3) - gapL, 3);
    // the middle of the north edge under the bridge's first keys
    S0.box(0, -4.5, I.z0 - 1, gapL * 2, 8, 2, shade(Wd.floor, 0.7), { tile: 8 });
    // the spawn plate with a key-shaped star
    S0.box(W.spawn.x, 0.1, W.spawn.z, 16, 0.2, 16, Wd.path, { tile: 8 });
    for (let k = 0; k < 4; k++) P0.box(W.spawn.x, 0.26, W.spawn.z, k % 2 ? 7 : 11, 0.1, 1.1, Tones[k * 2], { ry: k * Math.PI / 4, glow: 1 });
    // ----- the keyboards (all their keys one draw) -----
    const boardKeys = [];
    const boardsV = BOARD_SPOTS.map((sp, b) => {
        const B = BOARDS[b], fw = BOARD_W / 2, fd = BOARD_D / 2;
        // the case round the keys, and the plate they sit on
        P0.box(sp.x, 0.25, sp.z - fd + 0.7, BOARD_W, 0.5, 1.4, B.edge);
        P0.box(sp.x, 0.25, sp.z + fd - 0.7, BOARD_W, 0.5, 1.4, B.edge);
        P0.box(sp.x - fw + 0.7, 0.25, sp.z, 1.4, 0.5, BOARD_D, B.edge);
        P0.box(sp.x + fw - 0.7, 0.25, sp.z, 1.4, 0.5, BOARD_D, B.edge);
        P0.box(sp.x, -2.2, sp.z, BOARD_W, 0.4, BOARD_D, shade(B.edge, 0.5));
        // its lit rim
        for (const sz of [-1, 1]) P0.box(sp.x, 0.56, sp.z + sz * (fd - 0.7), BOARD_W - 1.4, 0.1, 0.5, B.acc, { glow: 1 });
        for (const sx of [-1, 1]) P0.box(sp.x + sx * (fw - 0.7), 0.56, sp.z, 0.5, 0.1, BOARD_D - 1.4, B.acc, { glow: 1 });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) P0.box(sp.x + sx * (fw - 0.7), 0.6, sp.z + sz * (fd - 0.7), 1.1, 0.5, 1.1, B.acc, { glow: B.rgb ? 1 : 0 });
        BOARD_KEYS.forEach((k, i) => {
            const c = i % 9, row = Math.floor(i / 9);
            let color = B.cap[(row + c) % 2 ? 0 : 1];
            if (B.id === 'piano') color = i > 35 ? 0xffffff : ((c === 1 || c === 2 || c === 4 || c === 5 || c === 7) && row % 2 === 0) ? B.cap[1] : B.cap[0];
            if (B.id === 'bubble' && i % 7 === 0) color = 0xfff0fa;
            if (B.id === 'mech' && row === 4) color = B.acc;
            if (B.id === 'gold' && i % 5 === 0) color = 0xfff4b8;
            boardKeys.push({ x: sp.x + k.x, y: -1.9, z: sp.z + k.z, w: k.w * P - 0.32, h: 2.1, d: P - 0.32, color, ink: new T.Color(B.ink).getHex(), cell: B.blank ? legendCell('') : legendCell(k.t), rgb: !!B.rgb });
        });
        const name = signs.add([big('x' + fmt(B.mult * Wd.kb), GOLD, 118), { t: B.name, c: '#ffffff', s: '#1a1030', px: 50 }], 24, new V3(sp.x, 12.5, sp.z - fd - 1));
        const lock = signs.add([big('🔒 ' + (B.reb ? B.reb + (B.reb > 1 ? ' REBIRTHS' : ' REBIRTH') : fmtComma(B.wins * Wd.wins) + ' WINS'), RED, 70)], 20, new V3(sp.x, 4.6, sp.z - fd - 1));
        return { b: B, i: b, sp, name, lock, open: null };
    });
    {
        const set = new KeySet(boardKeys);
        sets.push(set); group.add(set.mesh);
    }
    // a locked keyboard wears a veil: one instanced quad each
    const veil = new T.InstancedMesh(new T.PlaneGeometry(BOARD_W, BOARD_D).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x20183c, transparent: true, opacity: 0.45, depthWrite: false }), BOARD_SPOTS.length);
    const m4 = new T.Matrix4();
    BOARD_SPOTS.forEach((sp, i) => veil.setMatrixAt(i, m4.makeTranslation(sp.x, 0.45, sp.z)));
    veil.computeBoundingSphere();
    veil.renderOrder = 1;
    group.add(veil);
    const placeVeil = (i, open) => { veil.setMatrixAt(i, m4.makeTranslation(BOARD_SPOTS[i].x, open ? -500 : 0.45, BOARD_SPOTS[i].z)); veil.instanceMatrix.needsUpdate = true; };
    // ----- the bridges and the little islands -----
    const spans = [], pads = [], domes = [];
    // the bridges' keys: four bridges to a draw
    let groupKeys = [], groupSpans = [];
    for (let k = 1; k <= N; k++) {
        const Sk = new Kit(), Pk = new Kit({ glow: true });
        stretchS.push(Sk); stretchP.push(Pk);
        const z0 = spanStart(k), z1 = spanEnd(k), hw = W.spanHalf, cost = bridgeCost(wi, k), zm = (z0 + z1) / 2, base = Tones[(k - 1) % Tones.length];
        // rails and piers: there before the keys are
        for (const sx of [-1, 1]) {
            Pk.box(sx * (hw + 0.5), 0.5, zm, 1, 1, W.spanLen + 1, shade(base, 0.72));
            Pk.box(sx * (hw + 0.5), 1.2, zm, 0.5, 0.4, W.spanLen + 1, 0xffffff, { glow: 1 });
            for (const q of [0.15, 0.85]) Pk.box(sx * (hw - 2), -4, z0 - W.spanLen * q, 2.2, 8, 2.2, shade(base, 0.55), { soft: true });
        }
        // the keys: row by row from the near end; a plate under them comes first
        const offset = groupKeys.length, list = groupKeys;
        list.push({ x: 0, y: -2.5, z: zm, w: hw * 2, h: 0.5, d: W.spanLen, color: shade(base, 0.5), cell: legendCell(''), born: NEVER_BORN });
        for (let j = 0; j < W.spanRows; j++) for (let c = 0; c < W.spanCols; c++) {
            const ch = 'QWERTYUIOPASDFGHJKLZXCVBNM'[Math.floor(R() * 26)], t0 = Tones[(c + j + k) % Tones.length], tone = j % 2 ? t0 : mixC(t0, 0xffffff, 0.16);
            list.push({ x: (c - (W.spanCols - 1) / 2) * P, y: -1.9, z: z0 - (j + 0.5) * P, w: P - 0.32, h: 2.1, d: P - 0.32, color: tone, ink: 0x1a1030, cell: legendCell(ch), born: NEVER_BORN });
        }
        // the stage's gate: two towers of keycaps, a lit bar, its number
        const zg = gateZ(k);
        for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) Pk.box(sx * gateX, 1.5 + i * 3, zg, 3.6 - i * 0.14, 2.6, 3.6 - i * 0.14, Tones[(i + k) % Tones.length], { soft: true });
        Pk.box(0, 19.6, zg, gateX * 2 + 5, 2.6, 3.6, shade(base, 0.7), { soft: true });
        Pk.box(0, 19.6, zg + 1.9, gateX * 2 + 4, 1.2, 0.3, 0xffffff, { glow: 2 });
        for (const sx of [-1, 1]) Pk.box(sx * gateX, 21.6, zg, 2.4, 1.4, 2.4, 0xffe24a, { glow: 2, soft: true });
        signs.add([big('STAGE ' + k, k === N ? GOLD : WHITE, 118)], 18, new V3(0, 25, zg));
        const sign = signs.add([big(fmt(cost), LIME, 110, '#0a2a10', 'kb')], 13, new V3(0, 8.5, zm));
        const span = { k, z0, z1, cost, set: null, o: offset, sign, shown: 0, n: list.length - 1 - offset };
        spans.push(span);
        groupSpans.push(span);
        if (k % 4 === 0 || k === N) {
            const set = new KeySet(groupKeys);
            sets.push(set); group.add(set.mesh);
            for (const s of groupSpans) s.set = set;
            groupKeys = []; groupSpans = [];
        }
        // the island after it
        const zi = isleMid(k), hx = W.isleHalf, hz = W.isleLen / 2, tone = (k & 1) ? Wd.floor : Wd.floor2;
        floorQuad(Sk, -hx, hx, zi - hz, zi + hz, 0, tone);
        for (const [x, z, sx, sz] of [[0, zi + hz - 0.2, hx * 2 + 2, 1.2], [0, zi - hz + 0.2, hx * 2 + 2, 1.2], [-hx, zi, 1.2, hz * 2], [hx, zi, 1.2, hz * 2]]) Sk.box(x, 0.05, z, sx, 0.5, sz, base, { tile: 8 });
        Sk.box(0, -3.6, zi, hx * 2, 7, hz * 2, shade(Wd.floor, 0.7), { tile: 8 });
        // the Win Pad: a rim, gold inside, a frame bobbing over it
        const pr = W.padR * 2;
        Pk.box(0, 0.15, zi, pr + 1, 0.3, pr + 1, 0x46ec50, { glow: 1 });
        Pk.box(0, 0.25, zi, pr - 0.6, 0.3, pr - 0.6, 0xffd028, { glow: 1 });
        Pk.box(0, 0.32, zi, pr - 3.4, 0.3, pr - 3.4, 0xfff4b0, { glow: 1 });
        for (const [dx, dz, sx, sz] of [[0, -1, 1, 0], [0, 1, 1, 0], [-1, 0, 0, 1], [1, 0, 0, 1]]) Pk.box(dx * (pr / 2 + 0.5), 1.6, zi + dz * (pr / 2 + 0.5), sx ? pr + 1 : 0.4, 0.4, sz ? pr + 1 : 0.4, 0xffe24a, { glow: 2 });
        const padSign = signs.add([big('+' + fmt(padWins(wi, k)) + ' WINS', GOLD, 104, '#3a1a00', 'crown')], 13, new V3(0, 7, zi - 1), true);
        pads.push({ k, sign: padSign, zi, state: '' });
        for (const [tx, tz] of [[-hx + 4, zi - hz + 4], [hx - 4, zi - hz + 4], [hx - 5, zi + hz - 5]]) treeAt.push([tx, tz, Pk]);
    }
    // one sign says x3 FIRST TIME: it moves to the next pad not touched yet
    const bonus = signs.add([big('x' + FIRST_CROSS + ' FIRST TIME!', LIME, 76, '#0a2a10')], 11, new V3(0, 10.4, isleMid(1) - 1), true);
    const moveSign = (s, x, y, z) => {
        s.pos.set(x, y, z);
        for (let k = 0; k < 4; k++) signs.pos.set([x, y, z], s.i * 12 + k * 3);
        signs.mesh.geometry.attributes.position.needsUpdate = true;
    };
    // a beam of light over every Win Pad, far along the chain too: one draw
    const beamG = new T.CylinderGeometry(W.padR + 0.6, W.padR + 0.6, 54, 12, 1, true).translate(0, 27, 0);
    const beamMat = new T.ShaderMaterial({
        uniforms: { uNow: CU.uNow },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uNow; varying vec2 vUv;
            void main() {
                float a = pow(1.0 - vUv.y, 1.6) * (0.34 + 0.12 * sin(uNow * 3.0 + vUv.y * 16.0));
                gl_FragColor = vec4(mix(vec3(1.0, 0.82, 0.2), vec3(1.0, 1.0, 0.8), vUv.y), a);
                #include <colorspace_fragment>
            }`,
        transparent: true, depthWrite: false, side: T.DoubleSide,
    });
    const beams = new T.InstancedMesh(beamG, beamMat, N);
    {
        const m = new T.Matrix4();
        pads.forEach((q, i) => beams.setMatrixAt(i, m.makeTranslation(0, 0, q.zi)));
    }
    beams.frustumCulled = false; beams.renderOrder = 2;
    group.add(beams);
    // giant keycaps floating about over the sea and along the chain, turning and bobbing in the shader: one draw
    const floatG = new T.BoxGeometry(1, 0.7, 1);
    {
        const pa = floatG.attributes.position;
        for (let i = 0; i < pa.count; i++) if (pa.getY(i) > 0) { pa.setX(i, pa.getX(i) * 0.72); pa.setZ(i, pa.getZ(i) * 0.72); }
        floatG.computeVertexNormals();
    }
    const floatMat = new T.MeshLambertMaterial();
    floatMat.onBeforeCompile = (sh) => {
        sh.uniforms.uNow = CU.uNow;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uNow;')
            .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
float fPh = instanceMatrix[3][0] * 0.11 + instanceMatrix[3][2] * 0.07, fA = uNow * 0.35 + fPh;
mat2 fR = mat2(cos(fA), -sin(fA), sin(fA), cos(fA));
objectNormal.xz = fR * objectNormal.xz;`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed.xz = fR * transformed.xz; transformed.y += sin(uNow * 0.8 + fPh) * 0.14;`);
    };
    floatMat.customProgramCacheKey = () => 'kb-float';
    const floatN = opts.low ? 40 : 96, floats = new T.InstancedMesh(floatG, floatMat, floatN), zEnd = isleMid(N) - 60;
    {
        const m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new V3(), sc = new V3(), c = new T.Color();
        for (let i = 0; i < floatN; i++) {
            const k = i / floatN, z = 150 + (zEnd - 150) * k + (R() - 0.5) * 30, side = i % 2 ? 1 : -1;
            const x = side * (z > -20 ? 180 + R() * 220 : 58 + R() * 220), s = 9 + R() * 18;
            e.set((R() - 0.5) * 0.7, 0, (R() - 0.5) * 0.7);
            floats.setMatrixAt(i, m.compose(v.set(x, 10 + R() * 60, z), q.setFromEuler(e), sc.set(s, s, s)));
            floats.setColorAt(i, c.setHex(Tones[i % Tones.length]));
        }
    }
    floats.frustumCulled = false;
    group.add(floats);
    // two great arcs of the world's colours over the chain: you run under them
    const arcG = new T.TorusGeometry(1, 0.028, 4, 36, Math.PI);
    const arcMat = new T.MeshBasicMaterial({ transparent: true, opacity: 0.82, depthWrite: false, fog: false });
    const arcs = new T.InstancedMesh(arcG, arcMat, Tones.length * 2);
    {
        const m = new T.Matrix4(), c = new T.Color(), v = new V3(), q = new T.Quaternion(), sc = new V3();
        [[-420, 380], [zEnd * 0.72, 430]].forEach(([z, r], a) => Tones.forEach((tone, i) => {
            const rr = r * (1 - i * 0.052), n = a * Tones.length + i;
            arcs.setMatrixAt(n, m.compose(v.set(0, -8, z), q, sc.set(rr, rr, rr)));
            arcs.setColorAt(n, c.setHex(tone));
        }));
    }
    arcs.frustumCulled = false;
    group.add(arcs);
    // ----- the head of the next bridge: a glowing strip where your Keyboards go in -----
    const headMat = new T.ShaderMaterial({
        uniforms: { uNow: CU.uNow, uA: { value: new T.Color(0x46ec50) } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uNow; uniform vec3 uA; varying vec2 vUv;
            void main() {
                float c = fract(vUv.y * 2.0 + abs(vUv.x - 0.5) * 1.6 - uNow * 0.9);
                float chev = smoothstep(0.0, 0.08, c) * (1.0 - smoothstep(0.4, 0.48, c));
                float edge = smoothstep(0.5, 0.42, abs(vUv.x - 0.5));
                gl_FragColor = vec4(mix(uA, vec3(1.0), chev * 0.75), (0.3 + chev * 0.6) * edge);
                #include <colorspace_fragment>
            }`,
        transparent: true, depthWrite: false,
    });
    const head = new T.Mesh(new T.PlaneGeometry(W.spanHalf * 2, W.head).rotateX(-Math.PI / 2), headMat);
    head.renderOrder = 2; head.matrixAutoUpdate = true;
    group.add(head);
    const headSign = signs.add([big('STAND HERE', LIME, 96, '#0a2a10'), { t: 'your Keyboards build the bridge', c: '#ffffff', s: '#0a2a10', px: 38 }], 13, new V3(0, 6.6, I.z0 + 4));
    // ----- the Workshop -----
    {
        const x = workshop.x, z = workshop.z;
        S0.box(x, 0.2, z, 22, 0.4, 14, 0x9a6a3a, { tile: 8 });
        for (const dx of [-9.5, 9.5]) for (const dz of [-5.5, 4]) P0.box(x + dx, 5, z + dz, 1.3, 10, 1.3, 0x8a5a30, { soft: true });
        P0.box(x, 2, z + 3.4, 17, 4, 3.4, 0xa8743c, { soft: true });
        P0.box(x, 4.2, z + 3.4, 18, 0.5, 4.4, 0xd8a868);
        P0.box(x, 4, z - 5.2, 20, 8, 1.2, 0x7a4a26);
        // the awning: stripes
        for (let i = 0; i < 9; i++) P0.box(x - 10 + i * 2.5, 10.8 - 0.2, z - 0.4, 2.5, 0.5, 15, i % 2 ? 0xff5a5a : 0xffffff, { rx: 0.14 });
        // on the counter: a keyboard being repaired
        P0.box(x - 4, 4.8, z + 3.4, 5, 0.6, 2.4, 0x3a3c50);
        for (let i = 0; i < 4; i++) P0.box(x - 5.6 + i * 1.08, 5.25, z + 3.4, 0.9, 0.35, 1.8, i % 2 ? 0xffe24a : 0x3ad8ff);
        P0.box(x + 4, 4.9, z + 3.4, 3, 0.8, 1.6, 0x4a8aff, { soft: true });
        signs.add([big('WORKSHOP', AQUA, 118, '#0a2050'), { t: 'upgrades for Wins', c: '#ffffff', s: '#0a2050', px: 40 }], 22, new V3(x, 15.5, z));
    }
    // ----- the capsule machines -----
    const caps = capsulesOf(wi).map((o) => {
        const kit = o.isle ? stretchP[o.isle] : P0;
        capsuleMachine(kit, domes, o.x, o.z, o.c.color);
        signs.add([big(o.c.name, WHITE, 66), big(fmtComma(o.c.wins) + ' Wins', GOLD, 72, '#3a1a00', 'crown')], 20, new V3(o.x, 15, o.z));
        return o;
    });
    // the capsule domes: clear, unlit, one draw
    const domeG = new T.SphereGeometry(4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2 + 0.06);
    const domeM = new T.InstancedMesh(domeG, new T.MeshBasicMaterial({ color: 0xd8f4ff, transparent: true, opacity: 0.26, depthWrite: false }), Math.max(1, domes.length));
    domes.forEach((d, i) => domeM.setMatrixAt(i, m4.makeTranslation(d.x, d.y, d.z)));
    domeM.computeBoundingSphere();
    domeM.renderOrder = 2;
    group.add(domeM);
    // ----- the worlds portal -----
    const arch = (p, c, wide) => {
        for (const sx of [-1, 1]) for (let k = 0; k < 9; k++) P0.box(p.x + sx * wide, 1 + k * 2, p.z, 2.2, 2, 2.2, k % 2 ? 0xffffff : c, { soft: true });
        P0.box(p.x, 18.4, p.z, wide * 2 + 2.2, 2, 2.2, c, { soft: true });
    };
    arch(worldsPortal, 0x3ab4ff, 8);
    const pw = portalMesh(14.6, 17, 0x4ac8ff, 0x8aff8a); pw.position.set(worldsPortal.x, 8.6, worldsPortal.z); group.add(pw);
    signs.add([big('WORLDS', AQUA, 118, '#0a2050')], 14, new V3(worldsPortal.x, 22.5, worldsPortal.z));
    // ----- the leaderboards -----
    const BT = [boardTexture('MOST WINS'), boardTexture('MOST KEYBOARDS')];
    boards.forEach((bd, i) => {
        S0.box(bd.x, 7.5, bd.z, 24, 15, 1.6, [0xff8a1a, 0x3a7aff][i], { tile: 8 });
        const pl = new T.Mesh(new T.PlaneGeometry(21, 13), new T.MeshBasicMaterial({ map: BT[i].t, toneMapped: false }));
        pl.position.set(bd.x, 7.6, bd.z - 0.85); pl.rotation.y = Math.PI;
        group.add(pl);
        drawBoard(BT[i], []);
    });
    // chevrons on the floor, from the spawn to the first keyboard
    for (let k = 0; k < 2; k++) {
        const z = 54 - k * 5;
        P0.box(-3.2, 0.2, z, 8, 0.25, 2.2, 0x46ec50, { glow: 2, ry: 0.85 });
        P0.box(3.2, 0.2, z, 8, 0.25, 2.2, 0x46ec50, { glow: 2, ry: -0.85 });
    }
    // ----- what fills the world -----
    const firstBuild = !Tw.grown;
    Tw.grown = true;
    const taken = (x, z, r) => BOARD_SPOTS.some((s) => Math.abs(x - s.x) < BOARD_W / 2 + r && Math.abs(z - s.z) < BOARD_D / 2 + r);
    const grow = (kit, x, z) => {
        const h = 11 + R() * 7;
        if (Wd.tree === 'palm') palm(kit, x, z, h, R);
        else if (Wd.tree === 'neon') neonTree(kit, x, z, h, R);
        else if (Wd.tree === 'lolly') lolly(kit, x, z, h, R);
        else if (Wd.tree === 'rock') rockSpire(kit, x, z, h, R);
        else crystal(x, z, h + 2, R);
        if (firstBuild) Tw.solids.push({ min: [x - 0.8, 0, z - 0.8], max: [x + 0.8, h, z + 0.8] });
    };
    const spots = [];
    for (const x of [-138, -112, -84, -30, 28, 86, 114, 139]) spots.push([x, I.z1 - 7 - ((x * 7) & 7)]);
    for (const z of [-4, 22, 48, 76]) { spots.push([I.x0 + 6, z]); spots.push([I.x1 - 6, z]); }
    for (const [x, z] of [[-82, 8], [84, 8], [-26, 72], [24, 74], [-22, 44], [22, 40], [-120, 72], [122, 74], [-90, 72], [90, 62], [-140, 90]]) spots.push([x, z]);
    for (const [x, z] of spots) if (!taken(x, z, 3) && Math.abs(x) > 7 + (z > 40 ? 0 : 6) && z <= I.z1 - 2) grow(P0, x, z);
    for (const [x, z, kit] of treeAt) grow(kit, x, z);
    if (Wd.tree === 'palm') {
        for (const [x, z, c] of [[-132, 58, 0xff5a7a], [134, 52, 0x3ab4ff], [-96, 82, 0xffb02a], [100, 82, 0x46ec50], [70, -8, 0xff8ad8]]) umbrella(P0, x, z, c, R);
        // clouds: a few round puffs bunched together
        for (let i = 0; i < 24; i++) {
            const a = i * 2.39996, r = 240 + (i * 37) % 420, cx = Math.cos(a) * r, cz = Math.sin(a) * r - 200 - (i * 71) % 900, cy = 62 + (i * 53) % 60, s = 22 + (i * 13) % 20;
            blob(cx, cy, cz, s * 1.5, s * 0.7, s * 1.1, 0xffffff, { far: true, sway: 0 });
            for (let k = 0; k < 4; k++) { const b = k * 1.6 + a; blob(cx + Math.cos(b) * s * 0.8, cy - s * 0.12 + (k % 2) * s * 0.12, cz + Math.sin(b) * s * 0.55, s * (0.8 + (k % 2) * 0.2), s * 0.52, s * 0.72, 0xffffff, { far: true, sway: 0 }); }
        }
        // distant hills over the water
        for (const [x, z, s] of [[-420, -260, 90], [460, -180, 110], [-380, 260, 70], [420, 320, 80]]) { blob(x, 12, z, s * 2.4, s * 0.8, s * 1.6, 0x2ec86a, { far: true, sway: 0 }); blob(x + s * 0.5, s * 0.5, z, s, s * 0.6, s, 0x38d878, { far: true, sway: 0 }); }
    } else if (Wd.tree === 'lolly') {
        // Sugar Switch: pink puffs of candyfloss, gumdrop hills over the milkshake
        for (let i = 0; i < 22; i++) {
            const a = i * 2.39996, r = 240 + (i * 37) % 420, cx = Math.cos(a) * r, cz = Math.sin(a) * r - 200 - (i * 71) % 900, cy = 62 + (i * 53) % 60, s = 22 + (i * 13) % 20;
            blob(cx, cy, cz, s * 1.5, s * 0.7, s * 1.1, i % 2 ? 0xffe0f2 : 0xfff4fa, { far: true, sway: 0 });
        }
        for (const [x, z, s, c] of [[-420, -260, 90, 0xff7ac0], [460, -180, 110, 0x6ae0ff], [-380, 260, 70, 0xffe88a], [420, 320, 80, 0xb48aff], [-480, -900, 120, 0x8affb0], [500, -1000, 100, 0xff9a6a]]) blob(x, s * 0.3, z, s * 2, s * 1.3, s * 2, c, { far: true, sway: 0 });
    } else if (Wd.tree === 'rock') {
        // Molten Core: black volcanoes, their tops alight
        for (const [x, z, s] of [[-420, -260, 110], [460, -180, 130], [-380, 260, 90], [420, 320, 100], [-500, -900, 150], [520, -1050, 130]]) {
            blob(x, s * 0.45, z, s * 2.2, s * 1.5, s * 2.2, 0x2a1a1e, { far: true, sway: 0 });
            blob(x, s * 1.12, z, s * 0.7, s * 0.26, s * 0.7, 0xff8a1a, { far: true, sway: 0 });
        }
        for (const [x, z] of [[-120, 62], [126, 70], [-88, 8], [80, 8], [-140, 40], [140, 30]]) rockSpire(P0, x, z, 14, R);
    } else if (Wd.tree === 'neon') {
        for (const [x, z, ry, c] of [[-130, 60, 1.5, 0xff3ac8], [-130, 74, 1.5, 0x3affd8], [132, 56, -1.5, 0xffe02a], [132, 72, -1.5, 0xff3ac8], [-88, 6, 0.5, 0x3affd8], [70, -7, -0.3, 0xff6a2a]]) cabinet(P0, x, z, ry, c);
        for (let i = 0; i < 18; i++) { const a = i * 2.39996, r = 320 + (i * 37) % 300, h = 60 + (i * 53) % 120; blob(Math.cos(a) * r, h / 2 - 6, Math.sin(a) * r - 200, 50 + (i * 13) % 40, h, 50, i % 3 ? 0x1a1248 : 0x2a1a6a, { far: true, sway: 0 }); }
    } else {
        // Cosmic Desk: planets in the dark
        const PL = [[-560, 240, -620, 190, 0xff9a6a], [640, 320, -420, 130, 0x8a9aff], [300, 180, 680, 100, 0x6affc8], [-300, 420, 520, 150, 0xc88aff]];
        for (const [x, y, z, s, c] of PL) { blob(x, y, z, s, s, s, c, { far: true, sway: 0, ry: x, rx: 0.3 }); blob(x, y, z, s * 1.9, s * 0.08, s * 1.9, 0xfff4d8, { far: true, sway: 0, rz: 0.3 }); }
        for (const [x, z] of [[-120, 62], [126, 70], [-88, 8], [80, 8]]) crystal(x, z, 11, R);
    }
    // giant keycaps lying about where they fell, half sunk, and each keyboard's cable running off into the ground
    {
        const keyTone = Tones;
        const fallen = [[-30, 28], [26, 12], [-92, 50], [90, 46], [-136, 12], [138, 8], [-70, 86], [72, 84], [-114, 62], [116, 58], [-54, 8], [36, 66], [-34, 62]];
        fallen.forEach(([x, z], i) => {
            if (taken(x, z, 4)) return;
            const c = keyTone[i % keyTone.length], rx = (i % 3 - 1) * 0.3, rz = ((i * 2) % 3 - 1) * 0.28, ry = i * 1.3, s = 3.6 + (i % 3) * 0.9;
            P0.box(x, s * 0.26, z, s, s * 0.7, s, shade(c, 0.86), { soft: true, rx, ry, rz });
            P0.box(x, s * 0.58, z, s * 0.76, s * 0.14, s * 0.76, c, { soft: true, rx, ry, rz });
            Tw.solids.length && firstBuild && s > 4.5 && Tw.solids.push({ min: [x - s / 2, 0, z - s / 2], max: [x + s / 2, 1, z + s / 2] });
        });
        BOARD_SPOTS.forEach((sp, b) => {
            const col = shade(BOARDS[b].edge, 0.8), side = b % 2 ? 1 : -1, z0 = sp.z - BOARD_D / 2 - 3.5, x1 = sp.x + side * 9;
            P0.box(sp.x, 0.42, z0, 1.1, 0.8, 7, col);
            P0.box((sp.x + x1) / 2, 0.42, z0 - 3, Math.abs(x1 - sp.x) + 1.1, 0.8, 1.1, col);
            P0.box(x1, 0.3, z0 - 5.4, 1.1, 0.6, 5, col);
            P0.box(x1, 0.18, z0 - 8, 2.6, 0.36, 2.6, shade(col, 0.7), { soft: true });
        });
    }
    // ----- build it -----
    buildBlobs(group, () => Math.random());
    const studMesh = batchKits(stretchS, studVCMaterial(), true);
    if (studMesh) group.add(studMesh);
    const propMesh = batchKits(stretchP, glowVCMaterial(CU.uNow), true);
    if (propMesh) group.add(propMesh);
    signs.build(group);
    // nothing here moves as a whole: its matrices are worked out once, not every frame
    group.traverse((o) => { if (o !== head) { o.matrixAutoUpdate = false; o.updateMatrix(); } });
    group.updateMatrixWorld(true);
    scene.add(group);
    // ----- prompts: the Workshop, the machines, the portal, a locked keyboard -----
    const PR = [];
    PR.push({ pos: new V3(workshop.x, 0, workshop.z + 8), r: 12, label: () => 'Workshop', act: () => opts.workshop(), zone: 'world' });
    for (const o of caps) PR.push({ pos: new V3(o.x, 0, o.z), r: o.r, label: () => o.c.name, act: () => opts.capsule(o.c.id), zone: 'world' });
    PR.push({ pos: new V3(worldsPortal.x, 0, worldsPortal.z), r: worldsPortal.r, label: () => 'Worlds', act: () => opts.worlds(), zone: 'world' });
    for (const v of boardsV) if (v.i > 0) PR.push({ pos: new V3(v.sp.x, 0, v.sp.z), r: 18, label: () => (v.open ? '' : opts.boardLabel(v.i)), act: () => opts.unlockBoard(v.i), zone: 'world', on: () => !v.open });
    prompts.length = 0; prompts.push(...PR);
    let builtN = -1, partShown = -1, bonusAt;
    const view = {
        T: Tw, w: wi, group, sets, sea,
        boardsV, spans, pads,
        setBoards(m) { drawBoard(BT[0], m.wins); drawBoard(BT[1], m.kb); },
        // what you've got: which keyboards are open, how much of the bridges stands
        setProgress(p, now, hasBoard) {
            for (const v of boardsV) {
                const open = hasBoard(v.i);
                if (open !== v.open) { v.open = open; placeVeil(v.i, open); signs.show(v.lock, !open); }
            }
            const o = (p.spans && p.spans[wi]) || { n: 0, part: 0 };
            view.setBridges(o.n, o.part, builtN < 0);
            for (const q of pads) {
                const c = p.claimed && p.claimed[wi + ':' + q.k], first = !c || !c.first, st = q.k > o.n ? 'hidden' : first ? 'first' : 'again';
                if (st === q.state) continue;
                q.state = st;
                signs.show(q.sign, st !== 'hidden');
            }
            const nextFirst = pads.find((q) => q.state === 'first');
            if (nextFirst !== bonusAt) { bonusAt = nextFirst || null; signs.show(bonus, !!bonusAt); if (bonusAt) moveSign(bonus, 0, 10.4, bonusAt.zi - 1); }
        },
        // n bridges standing, part Keyboards in the next: its keys come up as they go in (at once when loading)
        setBridges(n, part, instant) {
            const now = keysNow();
            for (const sp of spans) {
                const f = sp.k <= n ? 1 : sp.k === n + 1 ? Math.min(0.999, part / sp.cost) : 0;
                const want = f >= 1 ? sp.n : Math.floor(f * sp.n);
                if (want === sp.shown && !(instant && sp.init !== 1)) continue;
                sp.init = 1;
                const set = sp.set, o = sp.o;
                if (want < sp.shown || instant) {
                    for (let i = 0; i <= sp.n; i++) set.hide(o + i);
                    for (let i = 1; i <= want; i++) set.born(o + i, -1000);
                    if (want > 0) set.born(o, -1000);
                } else {
                    if (sp.shown === 0 && want > 0) set.born(o, now);
                    for (let i = sp.shown + 1; i <= want; i++) set.born(o + i, now + (i - sp.shown) * 0.012);
                }
                sp.shown = want;
                set.flush();
                signs.show(sp.sign, want < sp.n);
            }
            if (n !== builtN) {
                builtN = n;
                const next = spans[n];
                head.visible = !!next;
                signs.show(headSign, !!next);
                if (next) {
                    head.position.set(0, 0.32, next.z0 + W.head / 2);
                    headSign.pos.set(0, 7, next.z0 + W.head / 2 + 1);
                    signs.pos.set([headSign.pos.x, headSign.pos.y, headSign.pos.z], headSign.i * 12);
                    signs.pos.set([headSign.pos.x, headSign.pos.y, headSign.pos.z], headSign.i * 12 + 3);
                    signs.pos.set([headSign.pos.x, headSign.pos.y, headSign.pos.z], headSign.i * 12 + 6);
                    signs.pos.set([headSign.pos.x, headSign.pos.y, headSign.pos.z], headSign.i * 12 + 9);
                    signs.mesh.geometry.attributes.position.needsUpdate = true;
                }
            }
            partShown = part;
        },
        // a stretch's keys are drawn only near
        update(dt, t, cam) {
            const far = 300;
            for (const s of sets) s.lod(cam.position, far);
            void dt; void t;
        },
        dispose() {
            releaseBlobs(group);
            signs.dispose();
            for (const s of sets) s.dispose();
            veil.geometry.dispose(); veil.material.dispose(); veil.dispose();
            domeG.dispose(); domeM.material.dispose(); domeM.dispose();
            head.geometry.dispose(); headMat.dispose();
            beamG.dispose(); beamMat.dispose(); beams.dispose();
            floatG.dispose(); floatMat.dispose(); floats.dispose();
            arcG.dispose(); arcMat.dispose(); arcs.dispose();
            sea.geometry.dispose(); sea.material.dispose();
            if (studMesh) (studMesh.isBatchedMesh ? studMesh.dispose() : studMesh.geometry.dispose());
            if (propMesh) (propMesh.isBatchedMesh ? propMesh.dispose() : propMesh.geometry.dispose());
            for (const b of BT) b.t.dispose();
            pw.geometry.dispose(); pw.material.dispose();
            scene.remove(group);
        },
    };
    void GREY; void PINK; void LIME; void partShown;
    return view;
}
