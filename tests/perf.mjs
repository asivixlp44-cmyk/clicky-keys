// Measured frame rates: desktop, a simulated weak laptop (CPU throttled 4x, 1366x768, Low), a simulated phone (touch, 844x390
// and 390x844 at 2x, Low, CPU 4x), each on the keys, on the bridges and at the spawn; and a CPU profile of the dev build.
// Run with Chrome on the integrated chip: LOW_GPU=1 node tests/perf.mjs [profile]
import fs from 'node:fs';
import path from 'node:path';
import { startServer, startVite, stopAll, launch, open, qa, sleep, measure, OUT } from './lib.mjs';

const PROFILE = process.argv[2] === 'profile';
const DEV = [
    { name: 'Desktop 1600x900 Medium', w: 1600, h: 900, q: 'medium' },
    { name: 'Weak laptop 1366x768 Low, CPU 4x', w: 1366, h: 768, q: 'low', cpu: 4 },
    { name: 'Phone 844x390 @2x, Low, CPU 4x', w: 844, h: 390, dpr: 2, q: 'low', cpu: 4, touch: true },
    { name: 'Phone 390x844 @2x, Low, CPU 4x', w: 390, h: 844, dpr: 2, q: 'low', cpu: 4, touch: true },
];
await startServer(2863, { QA: '1' });
await startVite();
const browser = await launch();
const results = [];
const fmtM = (m) => `${m.fps} FPS${m.paced ? ' (every other refresh of ' + m.refresh + ')' : ''}, p50 ${m.p50} p95 ${m.p95} worst ${m.max} ms, ${m.over50} over 50 ms, work ${m.avgMs} ms (worst ${m.maxMs}), ${m.calls} calls, ${Math.round(m.tris / 1000)}k tris`;
try {
    for (const D of (PROFILE ? [DEV[1]] : DEV)) {
        console.log('\n=== ' + D.name);
        const page = await open(browser, 'http://localhost:5425/', { ...D, uid: 'perf' + Date.now() });
        console.log('  load + join: ' + page.loadSecs + ' s; ' + await qa(page, () => window.__qa.gpu()));
        await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); window.__qa.give({ wins: 200 }); });
        await sleep(1500);
        const row = { name: D.name, load: page.loadSecs };
        // pressing keys with the autopilot on the first keyboard
        await qa(page, () => { window.__qa.perf(true); window.__qa.auto(true); });
        await sleep(2500);
        if (PROFILE) {
            const c = await page.createCDPSession();
            await c.send('Profiler.enable');
            await c.send('Profiler.setSamplingInterval', { interval: 500 });
            await c.send('Profiler.start');
            await sleep(12000);
            const { profile } = await c.send('Profiler.stop');
            const self = new Map(), total = profile.samples.length;
            const byId = new Map(profile.nodes.map((n) => [n.id, n]));
            for (const s of profile.samples) { const n = byId.get(s).callFrame; const k = n.functionName + ' ' + n.url.split('/').pop().split('?')[0] + ':' + n.lineNumber; self.set(k, (self.get(k) || 0) + 1); }
            const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 26);
            console.log('  CPU profile (self time):');
            for (const [k, v] of top) console.log('   ' + (v / total * 100).toFixed(1).padStart(5) + '%  ' + k);
            fs.writeFileSync(path.join(OUT, 'cpu.cpuprofile'), JSON.stringify(profile));
            console.log('  sections:', JSON.stringify(await qa(page, () => window.__qa.sections())));
        }
        row.keys = await measure(page, 6);
        console.log('  on the keys:   ' + fmtM(row.keys));
        await qa(page, () => { window.__qa.auto(false); window.__qa.give({ bridges: 6, kb: 900 }); window.__qa.send('warp', { to: 'bridge' }); });
        await sleep(1500);
        await qa(page, () => { window.__qa.key('KeyS', true); });
        await sleep(1000);
        await qa(page, () => { window.__qa.key('KeyS', false); window.__qa.perf(true); });
        row.bridge = await measure(page, 5);
        console.log('  out on the bridges: ' + fmtM(row.bridge));
        await qa(page, () => window.__qa.send('warp', { to: 'spawn' }));
        await sleep(1200);
        await qa(page, () => { window.__qa.look(0, 0.32, 18); window.__qa.perf(true); });
        row.spawn = await measure(page, 5);
        console.log('  at the spawn:  ' + fmtM(row.spawn));
        row.spikes = await qa(page, () => window.__qa.spikes());
        row.slow = await qa(page, () => window.__qa.slow());
        console.log('  spikes:', JSON.stringify(row.spikes.slice(-6)), 'slow:', JSON.stringify(row.slow.slice(-3)));
        const errs = [...page.errors, ...(await qa(page, () => window.__qa.errors()))];
        if (errs.length) console.log('  errors:', errs.slice(0, 4));
        results.push(row);
        await page.close();
    }
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
fs.writeFileSync(path.join(OUT, 'perf.json'), JSON.stringify(results, null, 1));
process.exit(0);
