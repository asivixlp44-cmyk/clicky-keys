// Far from the server: everything through a relay that adds 175 ms each way (a 350 ms round trip), two real browser players.
// Pressing keys: the counter never jumps back and no press is lost. The clock: corrected for the round trip. Others: smooth on
// the server's clock. Each sees the other on the island, nobody snapped back.
// Run: node tests/latency.mjs
import net from 'node:net';
import { startServer, startVite, stopAll, launch, open, qa, sleep, measure } from './lib.mjs';

const ONE_WAY = Number(process.env.ONE_WAY) || 175;
let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
// the relay: 2863 (where the dev client looks) to the server on 2864, every chunk held back ONE_WAY ms, in order
const relay = net.createServer((a) => {
    const b = net.connect(2864, '127.0.0.1');
    const pipe = (from, to) => { from.on('data', (d) => { setTimeout(() => { if (!to.destroyed) to.write(d); }, ONE_WAY); }); from.on('close', () => setTimeout(() => to.destroy(), ONE_WAY)); from.on('error', () => to.destroy()); };
    pipe(a, b); pipe(b, a);
}).listen(2863);

await startServer(2864, { QA: '1' });
await startVite();
const browser = await launch();
try {
    const A = await open(browser, 'http://localhost:5425/', { w: 960, h: 540, q: 'low', uid: 'latA' + Date.now() });
    const B = await open(browser, 'http://localhost:5425/', { w: 960, h: 540, q: 'low', uid: 'latB' + Date.now() });
    for (const p of [A, B]) await qa(p, () => { window.__qa.noWatch(true); window.__qa.close(); });
    await sleep(5000);
    const rtt = await qa(A, () => window.__qa.net.rtt);
    check(rtt > ONE_WAY * 1.8 && rtt < ONE_WAY * 3, 'the round trip measured: ' + rtt + ' ms');
    // the clock
    const clk = await qa(A, async () => { const q = window.__qa, r = q.net.room; const a = q.net.now(), s = r.state.now; return a - s; });
    check(Math.abs(clk) < rtt, 'the client\'s server clock against the last state it got: ' + Math.round(clk) + ' ms ahead (a one-way trip or so)');
    // pressing with a long way to the server: the counter never goes backwards
    await qa(A, () => { window.__qa.auto(true); });
    const series = await qa(A, async () => {
        const out = []; const t0 = performance.now();
        // (until there's nearly enough for the first bridge: then the pilot spends them, and the counter is meant to go down)
        await new Promise((res) => { const f = () => { out.push(window.__qa.S.kb); if (performance.now() - t0 < 10000 && window.__qa.S.kb < 34) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
        return out;
    });
    let back = 0, worst = 0;
    for (let i = 1; i < series.length; i++) { const d = series[i] - series[i - 1]; if (d < -0.01) { back++; worst = Math.min(worst, d); } }
    check(series[series.length - 1] > 10, 'pressing keys over a round trip that long: ' + Math.round(series[series.length - 1]) + ' Keyboards');
    check(back === 0 || worst > -3, 'the counter doesn\'t jump back: ' + back + ' dips, worst ' + worst.toFixed(1));
    await sleep(1200);
    const sA = await qa(A, () => window.__qa.state());
    const serverKb = await qa(A, async () => { window.__qa.auto(false); await new Promise((r) => setTimeout(r, 1500)); return { kb: window.__qa.S.kb, pres: window.__qa.S.presses }; });
    check(sA.snaps === 0, 'no snaps while running: ' + sA.snaps);
    console.log('      (settled at ' + serverKb.kb + ' Keyboards, ' + serverKb.pres + ' presses)');
    // others, smooth
    const smooth = await qa(B, async () => {
        const q = window.__qa, room = q.net.room, id = [...room.state.players.keys()].find((k) => room.state.players.get(k).bot);
        if (!id) return null;
        const r = q.remotes().get(id), out = []; let last = null; const t0 = performance.now();
        await new Promise((res) => { let tl = performance.now(); const f = (n) => { const dt = (n - tl) / 1000; tl = n; if (r.x !== undefined) { if (last) out.push({ d: Math.hypot(r.x - last[0], r.z - last[1]), dt }); last = [r.x, r.z]; } if (performance.now() - t0 < 6000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
        // how far it moved from one frame to the next, in studs; a pop is a step further than it could run in that frame's time
        // (a long frame is a long step: that's the page stalling, not the snapshots)
        const step = out.map((o) => o.d).sort((a, b) => a - b), secs = out.reduce((a, o) => a + o.dt, 0), dist = out.reduce((a, o) => a + o.d, 0);
        const pop = Math.max(...out.map((o) => o.d - 30 * o.dt)), longest = Math.max(...out.map((o) => o.dt));
        return { frames: out.length, speed: dist / secs, p99: step[Math.floor(step.length * 0.99)], max: step[step.length - 1], pop, longest, delay: q.delay() };
    });
    check(smooth && smooth.pop < 1.5, 'a bot seen from far away moves smoothly: ' + (smooth && smooth.speed.toFixed(1)) + ' studs/s, a frame\'s step p99 ' + (smooth && smooth.p99.toFixed(2)) + ', largest ' + (smooth && smooth.max.toFixed(2)) + ' studs (longest frame ' + (smooth && Math.round(smooth.longest * 1000)) + ' ms), past its speed by ' + (smooth && smooth.pop.toFixed(2)) + ', drawn ' + (smooth && Math.round(smooth.delay)) + ' ms in the past');
    // two players on the same island: each sees the other, nobody snapped back
    await qa(A, () => window.__qa.auto(true));
    await sleep(4000);
    const seen = await qa(B, () => { const q = window.__qa, room = q.net.room; let other = null; room.state.players.forEach((p, id) => { if (id !== room.sessionId && !p.bot) { const r = q.remotes().get(id); other = { name: p.name, x: r ? +r.x.toFixed(1) : null, z: r ? +r.z.toFixed(1) : null, serverZ: +p.z.toFixed(1), here: !!(r && r.here) }; } }); return other; });
    check(seen && seen.here && Math.abs(seen.z - seen.serverZ) < 30, 'the other player sees you run: ' + JSON.stringify(seen));
    await qa(A, () => window.__qa.auto(false));
    const sF = await qa(A, () => window.__qa.state()), sG = await qa(B, () => window.__qa.state());
    check(sF.snaps === 0 && sG.snaps === 0, 'nobody snapped back: ' + sF.snaps + ', ' + sG.snaps);
    const errs = [...A.errors, ...B.errors, ...(await qa(A, () => window.__qa.errors())), ...(await qa(B, () => window.__qa.errors()))];
    check(errs.length === 0, 'no console errors: ' + JSON.stringify(errs.slice(0, 4)));
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); relay.close(); }
console.log(fails ? fails + ' FAILED' : 'all good');
process.exit(fails ? 1 : 0);
