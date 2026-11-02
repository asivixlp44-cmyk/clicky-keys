// The two store covers (1920x1080, 800x800), rendered from the game itself: a crowd on the keyboards at High, with the title
// over it in the game's own lettering. Run: node tests/covers.mjs
import fs from 'node:fs';
import path from 'node:path';
import { startServer, startVite, stopAll, launch, open, qa, sleep, ROOT } from './lib.mjs';

await startServer(2863, { QA: '1' });
await startVite();
const browser = await launch();
const dir = path.join(ROOT, 'covers');
fs.mkdirSync(dir, { recursive: true });
const TITLE = (big) => `<div id="ctitle" style="position:fixed;left:0;right:0;top:${big ? '3.5%' : '5%'};z-index:99;text-align:center;font-family:'Luckiest Guy',sans-serif;line-height:.92;color:#fff;letter-spacing:.02em;text-shadow:0 .09em 0 #0a2050,.05em 0 0 #0a2050,-.05em 0 0 #0a2050,0 -.05em 0 #0a2050,.05em .05em 0 #0a2050,-.05em .05em 0 #0a2050,.05em -.05em 0 #0a2050,-.05em -.05em 0 #0a2050,0 0 .5em rgba(58,216,255,.6);font-size:${big ? '190px' : '124px'}">CLICKY <span style="color:#ffe24a">KEYS</span></div>`;
try {
    for (const [w, h, name, yaw, pitch, dist, px, pz] of [[1920, 1080, 'cover-1920x1080.png', 0.5, 0.26, 19, -12, 34], [800, 800, 'cover-800x800.png', 0.34, 0.3, 17, -8, 36]]) {
        const page = await open(browser, 'http://localhost:5425/', { w, h, dpr: 1, q: 'high', uid: 'cover' + w });
        await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); window.__qa.give({ wins: 3000, gems: 500, bridges: 3, kb: 1e5 }); });
        await sleep(500);
        // a team of Keypals behind you, a stack on your back, the keyboard under you
        await qa(page, (a) => { window.__qa.teleport(44, 0, 8); window.__qa.hatch('c1', 3); }, {});
        await sleep(1600);
        await qa(page, () => { window.__qa.close(); window.__qa.send('equipbest', {}); });
        await sleep(300);
        await qa(page, (a) => { window.__qa.teleport(a.px, 0, a.pz, a.yaw + Math.PI); window.__qa.look(a.yaw, a.pitch, a.dist); window.__qa.hud(false); document.querySelector('#hud').style.display = 'none'; document.querySelector('#toasts').style.display = 'none'; document.querySelector('#bigText').style.display = 'none'; document.querySelector('#popup').style.display = 'none'; document.querySelector('#winPop').style.display = 'none'; document.querySelector('#lvlUp').style.display = 'none'; }, { px, pz, yaw, pitch, dist });
        await page.evaluate((html) => { const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d); }, TITLE(w > 1000));
        // keep moving for a moment so the Keypals catch up and the stack sways, then freeze a good frame
        await qa(page, () => { window.__qa.key('KeyD', true); });
        await sleep(1500);
        await qa(page, () => { window.__qa.key('KeyD', false); window.__qa.jump(); });
        await sleep(330);
        await page.screenshot({ path: path.join(dir, name), type: 'png' });
        console.log('wrote', name, page.errors);
        await page.close();
    }
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
process.exit(0);
