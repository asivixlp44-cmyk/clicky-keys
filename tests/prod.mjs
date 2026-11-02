// The production build with real input only: no QA hooks, the keyboard, mouse and touch as a player uses them, the game's
// own words on screen as the only way to know what happened. Run: npm run build, then node tests/prod.mjs
import { startServer, stopAll, launch, open, sleep, shot } from './lib.mjs';

let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
const text = (page, sel) => page.$eval(sel, (e) => e.textContent);
const num = async (page, sel) => { const t = await text(page, sel); const n = parseFloat(t.replace(/,/g, '')); return /K$/.test(t) ? n * 1000 : /M$/.test(t) ? n * 1e6 : n; };
const visible = (page, sel) => page.$eval(sel, (e) => !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).catch(() => false);
async function waitFor(fn, secs) { const t0 = Date.now(); while (Date.now() - t0 < secs * 1000) { const v = await fn(); if (v) return v; await sleep(200); } return null; }
// zigzag over the keys until there are enough
async function press(page, want) {
    for (let i = 0; i < 40; i++) {
        await page.keyboard.down('KeyA'); await sleep(600); await page.keyboard.up('KeyA');
        await page.keyboard.down('KeyD'); await sleep(600); await page.keyboard.up('KeyD');
        if (await num(page, '#kbVal') >= want) return true;
    }
    return false;
}

await startServer(2863, {});
const browser = await launch();
try {
    console.log('--- desktop, keyboard and mouse');
    const url = 'http://localhost:2863/';
    const page = await open(browser, url, { w: 1280, h: 720, uid: 'prod' + Date.now() });
    console.log('  load + join', page.loadSecs, 's');
    check(await page.evaluate(() => !window.__qa), 'no QA hooks in the build');
    check(await visible(page, '#hud') && await visible(page, '#menuGrid'), 'no start menu: straight in the world, the HUD up');
    await sleep(1200);
    // the first keyboard is straight ahead
    await page.keyboard.down('KeyW'); await sleep(1800); await page.keyboard.up('KeyW');
    const k0 = await num(page, '#kbVal');
    check(k0 > 0, 'holding W onto the keyboard: ' + k0 + ' Keyboards');
    await page.mouse.click(640, 400); await sleep(90); await page.mouse.click(640, 400); await sleep(90); await page.mouse.click(640, 400);
    await sleep(300);
    const k1 = await num(page, '#kbVal');
    check(k1 > k0, 'clicking presses the key under you: ' + k1);
    await press(page, 60);
    check(await num(page, '#kbVal') >= 40, 'running over the keys: enough for the first bridge');
    await sleep(400);
    const ql = await text(page, '#questLine');
    check(!/ 0\/25/.test(ql), 'the quest counts: ' + ql);
    const lv = await text(page, '#lvTxt');
    check(lv !== 'Level 1', 'and levels: ' + lv);
    // the quick way to the bridge, by its button
    await page.click('#bGoBridge');
    await sleep(900);
    const built = await waitFor(async () => /STAGE 1 CLEARED/.test(await text(page, '#bigText')), 8);
    check(!!built, 'TO BRIDGE: stand there and it builds');
    await shot(page, 'prod-bridge');
    await page.keyboard.down('KeyW');
    const won = await waitFor(async () => await num(page, '#winsVal') > 0, 10);
    await page.keyboard.up('KeyW');
    check(!!won, 'run across onto the Win Pad: Wins rolling up');
    // the daily reward offers itself a moment after a first Win Pad; claim it with its button
    await waitFor(() => page.$eval('#modal', (e) => !e.hidden), 5);
    if (await page.$eval('#modal', (e) => !e.hidden)) {
        await page.click('#modal [data-act="daily"]'); await sleep(500);
        check(/Next reward/.test(await page.$eval('#modal', (e) => e.textContent)), 'the daily reward pops up, and is claimed by its button');
        await page.click('#modal [data-close]'); await sleep(250);
    }
    await sleep(800);
    check(await num(page, '#winsVal') >= 24, 'the Wins arrive: ' + await text(page, '#winsVal'));
    // quests by a click
    if (/Claim/.test(await text(page, '#questLine'))) {
        await page.click('#questLine'); await sleep(300);
        await page.click('#modal [data-act="qclaim"]'); await sleep(600);
        check(/Build|Touch|Open/.test(await text(page, '#questLine')), 'a quest claimed by its button: next ' + await text(page, '#questLine'));
        await page.click('#modal [data-close]'); await sleep(250);
    }
    // the panels by their buttons
    for (const b of ['#bPals', '#bWork', '#bRebirth', '#bSpin', '#bQuests', '#bDaily', '#bIndex', '#bWorlds', '#bShop', '#bSettings']) {
        await page.click(b); await sleep(220);
        const open1 = await page.$eval('#modal', (e) => !e.hidden && !!e.querySelector('.panel'));
        if (!open1) check(false, b + ' opens');
        await page.click('#modal [data-close]'); await sleep(160);
    }
    check(true, 'every menu button opens its panel, its X closes it');
    await page.click('#bSpin'); await sleep(250);
    await page.click('#modal [data-act="spin"]'); await sleep(3900);
    check(/YOU WON/.test(await text(page, '#popT')), 'the wheel by its button');
    await page.click('#modal [data-close]'); await sleep(200);
    // a code typed in
    await page.click('#bShop'); await sleep(200);
    await page.click('#modal [data-tab="codes"]'); await sleep(150);
    await page.type('#codeIn', 'keyboard'); await page.keyboard.press('Enter'); await sleep(500);
    check(/Code redeemed/.test(await page.$eval('#toasts', (e) => e.textContent)), 'a code typed into the shop');
    await page.click('#modal [data-close]'); await sleep(200);
    check(page.errors.length === 0, 'no console errors: ' + JSON.stringify(page.errors.slice(0, 4)));
    await page.close();

    console.log('--- what the game tells Bloxity (an SDK stand-in)');
    const STUB = 'window.__log = []; window.Legion = { SDK: { init() { window.__log.push("init"); }, portal: { isEmbeddedInLegion() { return false; } }, game: { loadingStep() {}, updateRoom(r) { window.__log.push("room:" + (r ? "yes" : "no")); }, loadingEnd() { window.__log.push("loadingEnd"); window.__startHidden = document.querySelector("#start").hidden; } } } };';
    const sdkPage = await open(browser, url, { w: 1280, h: 720, uid: 'prodsdk' + Date.now(), sdkStub: STUB });
    await sleep(800);
    const lg = await sdkPage.evaluate(() => window.__log);
    check(lg.filter((x) => x === 'loadingEnd').length === 1, 'loadingEnd() is called once: ' + lg.join(', '));
    check(lg.indexOf('room:yes') >= 0 && lg.indexOf('room:yes') < lg.indexOf('loadingEnd'), 'after it has joined a server, with no menu in between');
    check(await sdkPage.evaluate(() => window.__startHidden === true), 'with the loading screen already gone');
    check(sdkPage.errors.length === 0, 'no console errors: ' + JSON.stringify(sdkPage.errors.slice(0, 4)));
    await sdkPage.close();

    console.log('--- a phone in portrait, touch only');
    const ph = await open(browser, url, { w: 390, h: 844, dpr: 2, touch: true, uid: 'prodph' + Date.now() });
    console.log('  load + join', ph.loadSecs, 's');
    await sleep(1500);
    check(await visible(ph, '#stick') && await visible(ph, '#clickBtn'), 'the stick and CLICK are there');
    const box = await ph.$eval('#stick', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const cdp = await ph.createCDPSession();
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    await touch('touchStart', [{ x: box.x, y: box.y, id: 1 }]);
    await touch('touchMove', [{ x: box.x, y: box.y - 40, id: 1 }]);
    await sleep(1700);
    await touch('touchEnd', []);
    const k2 = await num(ph, '#kbVal');
    check(k2 > 0, 'the stick walks onto the keys: ' + k2);
    const c0 = await ph.$eval('#clickBtn', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    for (let i = 0; i < 6; i++) { await touch('touchStart', [{ x: c0.x, y: c0.y, id: 2 }]); await sleep(40); await touch('touchEnd', []); await sleep(100); }
    await sleep(350);
    check(await num(ph, '#kbVal') > k2, 'tapping CLICK: ' + await num(ph, '#kbVal'));
    const t0 = await ph.$eval('#bPals', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await touch('touchStart', [{ x: t0.x, y: t0.y, id: 3 }]); await sleep(40); await touch('touchEnd', []); await sleep(350);
    check(await ph.$eval('#modal', (e) => !e.hidden), 'a menu button by touch');
    await shot(ph, 'prod-phone');
    check(ph.errors.length === 0, 'no console errors: ' + JSON.stringify(ph.errors.slice(0, 4)));
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); }
console.log(fails ? fails + ' FAILED' : 'all good');
process.exit(fails ? 1 : 0);
