// Every screen, at every size: three portrait phones, a landscape phone, a desktop. Measures the HUD's boxes and the touch
// controls for overlaps and things cut off, and saves a screenshot of each. Run: node tests/screens.mjs [one]
import { startServer, startVite, stopAll, launch, open, qa, shot, sleep, OUT } from './lib.mjs';

const ALL = [
    { name: '390x844', w: 390, h: 844, dpr: 2, touch: true },
    { name: '360x800', w: 360, h: 800, dpr: 2, touch: true },
    { name: '375x667', w: 375, h: 667, dpr: 2, touch: true },
    { name: '844x390', w: 844, h: 390, dpr: 2, touch: true },
    { name: '1280x720', w: 1280, h: 720, dpr: 1, touch: false },
];
const SIZES = process.argv[2] ? ALL.filter((s) => s.name === process.argv[2]) : ALL;
const HUD = ['#winsBox', '#gemsBox', '#menuGrid', '#leftBot', '#questLine', '#stageBar', '#bGift', '#bAuto', '#bX2', '#bGoBridge', '#bGoBoard', '#kbTxt', '#multis', '#lvBar', '#stick', '#clickBtn', '#jumpBtn'];
// the boxes on screen: which overlap, and what's cut off
const audit = (page, sels) => page.evaluate((list) => {
    const out = { off: [], over: [], corner: [] }, boxes = [], W = innerWidth, H = innerHeight;
    for (const s of list) {
        const e = document.querySelector(s);
        if (!e || e.hidden) continue;
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = e.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        boxes.push({ s, l: r.left, t: r.top, r: r.right, b: r.bottom });
        if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) out.off.push(s + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
        // the Bloxity overlay's corner: top-left stays free
        if (r.left < 100 && r.top < 60) out.corner.push(s);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j], ox = Math.min(a.r, b.r) - Math.max(a.l, b.l), oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (ox > 1.5 && oy > 1.5) out.over.push(a.s + ' x ' + b.s + ' (' + Math.round(ox) + 'x' + Math.round(oy) + ')');
    }
    return out;
}, sels);
let bad = 0;
await startServer(2863, { QA: '1' });
await startVite();
const browser = await launch();
try {
    for (const S of SIZES) {
        console.log('\n=== ' + S.name);
        const page = await open(browser, 'http://localhost:5425/', { ...S, q: 'low', uid: 'scr' + S.name + Date.now() });
        await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); });
        await sleep(600);
        const report = async (tag, sels) => {
            await sleep(450);
            await shot(page, S.name + '-' + tag);
            if (!sels) return;
            const a = await audit(page, sels);
            const msg = [...a.off.map((x) => 'CUT ' + x), ...a.over.map((x) => 'OVER ' + x), ...a.corner.map((x) => 'CORNER ' + x)];
            if (msg.length) { bad += msg.length; console.log('  ' + tag + ': ' + msg.join(' · ')); } else console.log('  ' + tag + ': clean');
        };
        await report('hud', HUD);
        await qa(page, () => { window.__qa.give({ wins: 3000, gems: 200, kb: 500, playSecs: 200, bridges: 2, spins: 2 }); });
        await sleep(300);
        await report('hud2', HUD);
        for (const [k, t] of [['pals'], ['pals', 'index'], ['work'], ['spin'], ['rebirth'], ['worlds'], ['shop'], ['shop', 'codes'], ['quests'], ['daily'], ['gifts'], ['boards'], ['settings'], ['capsule', 'c1']]) {
            await qa(page, (a) => { window.__qa.close(); window.__qa.panel(a.k, a.t); }, { k, t });
            await sleep(120);
            await shot(page, S.name + '-panel-' + k + (t ? '-' + t : ''));
            const fit = await page.evaluate(() => { const p = document.querySelector('#modal .panel'); if (!p) return 'none'; const r = p.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 ? '' : 'panel cut: ' + [r.left, r.top, r.right, r.bottom].map(Math.round); });
            if (fit) { bad++; console.log('  ' + k + ': ' + fit); }
        }
        await qa(page, () => window.__qa.close());
        // a capsule opening
        await qa(page, () => { window.__qa.teleport(44, 0, 6); });
        await sleep(300);
        await qa(page, () => window.__qa.hatch('c1', 3));
        await sleep(350);
        await shot(page, S.name + '-hatch-a');
        await sleep(900);
        await shot(page, S.name + '-hatch-b');
        await qa(page, () => window.__qa.close());
        await sleep(600);
        await shot(page, S.name + '-keypals');
        const errs = [...page.errors, ...(await qa(page, () => window.__qa.errors()))];
        if (errs.length) { bad += errs.length; console.log('  errors:', errs.slice(0, 4)); }
        await page.close();
    }
} catch (e) { console.error(e); bad++; } finally { await browser.close(); stopAll(); }
console.log('\n' + (bad ? bad + ' problems' : 'all clean') + '; shots in', OUT);
process.exit(bad ? 1 : 0);
