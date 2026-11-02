// What each thing costs the graphics chip at the spawn on Low: FPS with one thing turned off at a time.
import { startServer, startVite, stopAll, launch, open, qa, sleep, measure } from './lib.mjs';
await startServer(2863, { QA: '1' });
await startVite();
const browser = await launch();
try {
    const page = await open(browser, 'http://localhost:5425/', { w: 1366, h: 768, q: 'low', uid: 'lab' + Date.now() });
    await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); window.__qa.look(0, 0.32, 18); });
    await sleep(6000);
    const m = async (name) => { await qa(page, () => window.__qa.close()); await sleep(600); const r = await measure(page, 3); console.log(name.padEnd(26), r.fps + ' FPS  p50 ' + r.p50 + '  p95 ' + r.p95 + '  ' + r.calls + ' calls ' + Math.round(r.tris / 1000) + 'k'); return r; };
    await m('baseline');
    await m('baseline again');
    await qa(page, () => { window.__qa.view().sea.visible = false; });
    await m('no sea');
    await qa(page, () => { window.__qa.view().sea.visible = true; for (const s of window.__qa.view().sets) s.lod = () => {}; for (const s of window.__qa.view().sets) s.mesh.visible = false; });
    await m('no keys');
    await qa(page, () => { for (const s of window.__qa.view().sets) s.mesh.visible = true; window.__qa.scene.traverse((o) => { if (o.isMesh && o.material && o.material.normalMap) { o.material.normalMap = null; o.material.needsUpdate = true; } }); });
    await sleep(1500);
    await m('no stud normal map');
    await qa(page, () => { window.__qa.scene.traverse((o) => { if (o.isBatchedMesh || (o.isMesh && o.material && o.material.vertexColors)) o.visible = false; }); });
    await m('no batched scenery');
    await qa(page, () => { window.__qa.scene.traverse((o) => { o.visible = true; }); window.__qa.hud(false); });
    await m('no HUD');
    await qa(page, () => { window.__qa.hud(true); document.body.style.setProperty('display', ''); });
    await m('all back');
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
process.exit(0);
