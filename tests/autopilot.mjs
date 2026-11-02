// Browser runs with the autopilot, on the dev client (it has the QA hooks): the whole loop on every world (keys, bridges, Win
// Pads). Prints what happened; screenshots go to OUT_DIR.
// Run: node tests/autopilot.mjs [quick]
import { startServer, startVite, stopAll, launch, open, qa, shot, sleep, measure, OUT } from './lib.mjs';

const quick = process.argv[2] === 'quick';
let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
const st = (page) => qa(page, () => window.__qa.state());
async function until(page, fn, secs, arg) {
    const t0 = Date.now();
    while (Date.now() - t0 < secs * 1000) {
        const v = await page.evaluate(fn, arg);
        if (v) return v;
        // (a pop-up offering the daily reward would stop the pilot's feet: it says no thanks)
        await page.evaluate(() => { window.__qa.close(); });
        await sleep(250);
    }
    return null;
}

await startServer(2863, { QA: '1' });
await startVite();
const browser = await launch();
try {
    const page = await open(browser, 'http://localhost:5425/', { w: 1280, h: 720, q: 'medium', uid: 'pilot' + Date.now() });
    console.log('load', page.loadSecs, 's;', await qa(page, () => window.__qa.gpu()));
    await qa(page, () => { window.__qa.noWatch(true); window.__qa.auto(true); });
    // ----- one press, one jump -----
    {
        await qa(page, () => { window.__qa.auto(false); window.__qa.close(); });
        await sleep(1200);
        await qa(page, () => window.__qa.close());
        const jumps = async () => page.evaluate(async () => {
            let n = 0, was = window.__qa.state().onGround, t0 = performance.now();
            while (performance.now() - t0 < 3000) {
                const g = window.__qa.state().onGround;
                if (was && !g) n++;
                was = g;
                await new Promise((r) => requestAnimationFrame(r));
            }
            return n;
        });
        const run = jumps();
        await page.keyboard.press('Space');
        const one = await run;
        check(one === 1, 'one press of SPACE, one jump: ' + one + ' in 3 s');
        const run2 = jumps();
        await page.keyboard.down('Space'); await sleep(1500); await page.keyboard.up('Space');
        const held = await run2;
        check(held >= 2 && held <= 6, 'holding it keeps jumping, and it stops when let go: ' + held + ' in 3 s (held 1.5 s)');
        await qa(page, () => window.__qa.auto(true));
    }
    // ----- the hub -----
    console.log('\n--- the hub on the autopilot: keys, a bridge, a Win Pad');
    const lv = await until(page, () => window.__qa.state().lv >= 3 && window.__qa.state(), 40);
    check(!!lv && lv.presses > 10, 'walking on the keys: ' + (lv && lv.presses) + ' presses, level ' + (lv && lv.lv));
    await shot(page, 'pilot-keys');
    const b1 = await until(page, () => window.__qa.state().bridges >= 1 && window.__qa.state(), 60);
    check(!!b1, 'bridge 1 built');
    const pd = await until(page, () => window.__qa.state().pads >= 1 && window.__qa.state(), 30);
    check(!!pd && pd.wins > 0, 'its Win Pad touched: ' + (pd && pd.wins) + ' Wins');
    await shot(page, 'pilot-pad');
    if (!quick) {
        const b2 = await until(page, () => window.__qa.state().bridges >= 3 && window.__qa.state(), 120);
        check(!!b2, 'on to bridge 3, level ' + (b2 && b2.lv) + ', ' + (b2 && b2.wins) + ' Wins');
    }
    const s1 = await st(page);
    check(s1.snaps === 0, 'no snaps on the hub run: ' + s1.snaps);
    // ----- each world -----
    for (const w of [1, 2, 3, 4]) {
        console.log('\n--- world ' + w);
        await qa(page, (ww) => { window.__qa.auto(false); window.__qa.give({ rebirths: 31 }); window.__qa.send('world', { w: ww }); }, w);
        await until(page, (ww) => window.__qa.state().world === ww, 15, w);
        await sleep(1800);
        await qa(page, () => window.__qa.auto(true));
        await shot(page, 'world' + w + '-a');
        const s = await until(page, () => window.__qa.state().presses > 0 && window.__qa.state(), 10);
        await qa(page, () => window.__qa.give({ kb: 3e10 }));
        const b = await until(page, () => window.__qa.state().bridges >= 2 && window.__qa.state(), 60);
        check(!!b, 'world ' + w + ': presses and bridges work: ' + JSON.stringify(s && s.presses));
        await shot(page, 'world' + w + '-b');
        await qa(page, () => { window.__qa.auto(false); window.__qa.look(0.6, 0.42, 60); window.__qa.send('warp', { to: 'spawn' }); });
        await sleep(1500);
        await shot(page, 'world' + w + '-c');
    }
    await qa(page, () => { window.__qa.send('world', { w: 0 }); });
    await until(page, () => window.__qa.state().world === 0, 15);
    await sleep(1500);
    await qa(page, () => window.__qa.auto(false));
    const e1 = await qa(page, () => window.__qa.errors());
    check(page.errors.length === 0 && e1.length === 0, 'no console errors: ' + JSON.stringify(page.errors.slice(0, 5)) + JSON.stringify(e1.slice(0, 5)));
    console.log('\nfinal', JSON.stringify(await st(page)));
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); }
console.log(fails ? fails + ' FAILED' : 'all good', '; shots in', OUT);
process.exit(fails ? 1 : 0);
