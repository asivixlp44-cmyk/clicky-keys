// The HUD (Wins and the menu on the left, your quest at the top, the FREE gift, Auto Click, x2 and the quick ways round on
// the right, your Keyboards and Level bar at the bottom), the capsule reveal and every panel: Keypals, the Workshop, a capsule
// machine, the wheel, rebirth, worlds, the shop (Gems for Wins, x2s, codes), quests, the daily reward, gifts, leaderboards,
// settings. Prices are Wins or Gems only.
import { $ } from './engine.js';
import { S, net, actions } from './state.js';
import { sfx, setMusicDuck, getVolumes, setVolume, playAsmr } from './audio.js';
import { setQuality, getQuality } from './fx.js';
import { palSvg } from './icons.js';
import {
    CFG, WORLDS, BOARDS, RARITIES, SPIN, UPGRADES, upgradeCost, PALS, palById, CAPSULES, capsuleById, rebirthCost, rebirthMult, levelMult, palMult, perClick, teamSize, xpNeed,
    bridgeCost, TASKS, QUESTS, DAILY, dailyStatus, dayLeft, GIFTS, PACKS, rewardText, clock, fmtComma, fmt,
} from '../../shared/config.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const rar = (r) => `<span class="rar" style="color:${RARITIES[r].color}">${RARITIES[r].name}</span>`;
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const WC = '<i class="wc"></i>', KC = '<i class="kc"></i>';
// a drawn icon (icons.js) for a panel's title
const IC = (k) => '<i class="ic ic-' + k + ' pic"></i>';
const sessionSecs = () => (S.sessionSecs || 0) + (Date.now() - S.profileAt) / 1000;
// is this keyboard open to you in your world?
export function hasBoard(b, w) {
    const B = BOARDS[b], k = w ?? S.world;
    if (!B || B.reb > (S.rebirths || 0)) return false;
    return !B.wins || !!(((S.boardsOpen && S.boardsOpen[k]) || 0) & (1 << b));
}
export function bestBoard() { let best = 0; for (let b = 0; b < BOARDS.length; b++) if (hasBoard(b)) best = b; return best; }
export const spanNow = () => (S.spans && S.spans[S.world]) || { n: 0, part: 0 };

// =====================================================================================
// Small things: toasts, big words, pop-ups, level ups, Wins
// =====================================================================================
// starts a CSS animation over without asking the page for its layout: the class comes back on the next frame
function replay(el) { el.classList.remove('go'); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('go'))); }
export function toast(text, color) {
    const box = $('#toasts'), el = document.createElement('div');
    el.className = 'toast o1'; el.textContent = text; el.style.color = color || '#fff';
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.remove(), 3300);
}
let stageShown = -1;
export function bigText(text, color) {
    const el = $('#bigText');
    el.textContent = text; el.style.color = color || '#ffe24a';
    el.hidden = false; replay(el);
    clearTimeout(bigText.t); bigText.t = setTimeout(() => { el.hidden = true; }, 2400);
}
// sub may hold the drawn icons (html)
export function popup(icon, title, sub, color, html) {
    const el = $('#popup');
    $('#popIc').textContent = icon; $('#popT').textContent = title; $('#popT').style.color = color || '#ffe24a';
    if (html) $('#popS').innerHTML = sub || ''; else $('#popS').textContent = sub || '';
    el.hidden = false; replay(el);
    clearTimeout(popup.t); popup.t = setTimeout(() => { el.hidden = true; }, 3000);
}
// "Level Up! (14 -> 15)" and what a press is worth now
export function levelUp(lv0, lv1) {
    const el = $('#lvlUp');
    $('#lu1').textContent = `Level Up! (${lv0} → ${lv1})`;
    $('#lu2').textContent = 'Click Power x' + levelMult(lv1).toFixed(2).replace(/\.?0+$/, '');
    el.hidden = false; replay(el);
    clearTimeout(levelUp.t); levelUp.t = setTimeout(() => { el.hidden = true; }, 2200);
    bump('#lvBar');
}
export function winPop(n) {
    const el = $('#winPop');
    $('#winPopV').textContent = '+' + fmtComma(n) + (n === 1 ? ' WIN' : ' WINS');
    el.hidden = false; replay(el);
    clearTimeout(winPop.t); winPop.t = setTimeout(() => { el.hidden = true; }, 2200);
}
export function notEnough(m) {
    sfx('denied');
    const gems = m.cur === 'gems';
    askConfirm(gems ? '💎' : '👑', 'Not enough ' + (gems ? 'Gems' : 'Wins'), `You need ${fmtComma(m.need)} more ${gems ? 'Gems' : 'Wins'} for ${esc(m.name)}.` + (gems ? '<br><small>Gems come from quests, daily tasks, gifts, the wheel and the daily reward.</small>' : '<br><small>Build the next bridge and touch its Win Pad.</small>'),
        gems ? 'Quests' : 'OK', () => { if (gems) openPanel('quests'); });
}
export function codeResult(m) { toast(m.ok ? '🎟️ ' + m.text : m.text, m.ok ? '#7dff6b' : '#ff7a8a'); if (m.ok) sfx('reward'); else sfx('denied'); }

// =====================================================================================
// The HUD (written only when a value changes; the bars move with transforms)
// =====================================================================================
const shown = { k: 0, w: 0, g: 0 }, shownTxt = { k: '', w: '', g: '' };
export function animateCounters(dt) {
    // Keyboards and Gems count up quickly; Wins roll up over a second or so, as the crowns fly in
    const kf = Math.min(1, dt * 12), ks = Math.min(1, dt * 2.6);
    for (const [key, v, sel, f] of [['k', S.kb, '#kbVal', fmt], ['w', S.wins, '#winsVal', fmt], ['g', S.gems, '#gemVal', fmtComma]]) {
        const target = v || 0;
        shown[key] += (target - shown[key]) * (key === 'w' && target > shown[key] ? ks : kf);
        if (Math.abs(target - shown[key]) < 0.05) shown[key] = target;
        const txt = f(Math.round(shown[key]));
        if (txt !== shownTxt[key]) { shownTxt[key] = txt; $(sel).textContent = txt; }
    }
    // the level bar fills as you press (predicted between the server's updates)
    const f = Math.min(1, (S.xp || 0) / (S.need || xpNeed(S.lv)));
    if (Math.abs(f - lvFillShown) > 0.002) { lvFillShown = f; $('#lvFill').style.transform = 'scaleX(' + f.toFixed(3) + ')'; put('#lvNum', fmt(Math.floor(S.xp || 0)) + '/' + fmt(S.need || xpNeed(S.lv))); }
}
let lvFillShown = -1;
// a springy pop (an animation of its own: no class toggling, so no layout read)
const POP = [{ transform: 'scale(1)' }, { transform: 'scale(1.22)', offset: 0.35 }, { transform: 'scale(1)' }];
export function bump(sel) { const el = $(sel); if (el && el.animate) el.animate(POP, { duration: 420, easing: 'cubic-bezier(0.34, 1.6, 0.5, 1)' }); }
// every press: the Keyboards counter ticks
const TICK = [{ transform: 'scale(1)' }, { transform: 'scale(1.08)', offset: 0.4 }, { transform: 'scale(1)' }];
let tickAt = 0;
export function pressTick() { const now = performance.now(); if (now - tickAt < 110) return; tickAt = now; const el = $('#kbTxt'); if (el.animate) el.animate(TICK, { duration: 160, easing: 'ease-out' }); }
// Wins: little crowns burst out of the middle of the screen and stream into the Wins counter, each one a chime
let winsAt = null, flying = 0;
export function flyWins(n) {
    if (!winsAt || flying > 24) return;
    const box = $('#flyLayer'), k = Math.min(10, Math.max(3, Math.round(Math.sqrt(n) * 2.5)));
    const fx = innerWidth / 2, fy = innerHeight * 0.42;
    for (let i = 0; i < k; i++) {
        const el = document.createElement('i');
        el.className = 'wc';
        box.appendChild(el);
        flying++;
        const a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 80, sx = fx + Math.cos(a) * r, sy = fy + Math.sin(a) * r * 0.7;
        const at = (x, y, sc) => 'translate(' + x.toFixed(0) + 'px,' + y.toFixed(0) + 'px) translate(-50%,-50%) scale(' + sc + ')';
        const anim = el.animate([
            { transform: at(fx, fy, 0.2), opacity: 0 },
            { transform: at(sx, sy, 1.3), opacity: 1, offset: 0.3 },
            { transform: at(winsAt.x, winsAt.y, 0.75), opacity: 1 },
        ], { duration: 820 + i * 60, delay: i * 50, easing: 'cubic-bezier(0.45, 0, 0.65, 1)', fill: 'both' });
        anim.onfinish = () => { el.remove(); flying--; bump('#winsBox'); playAsmr('tick', 0.14, 1.5 + i * 0.06); };
    }
}
const put = (sel, v, html) => { const el = $(sel); if (html) { if (el.innerHTML !== v) el.innerHTML = v; } else if (el.textContent !== v) el.textContent = v; };
export function updateHud() {
    put('#lvTxt', 'Level ' + S.lv);
    put('#lvNum', fmt(Math.floor(S.xp || 0)) + '/' + fmt(S.need || xpNeed(S.lv)));
    // the quest
    const Q = QUESTS[S.qi];
    if (Q) {
        const p = Math.min(Q.n, S.qv || 0), ready = p >= Q.n;
        put('#questLine', ready ? '✅ ' + Q.text + ' · Claim!' : Q.text + ' ' + fmt(p) + '/' + fmt(Q.n));
        $('#questLine').classList.toggle('ready', ready);
        $('#questLine').hidden = false;
    } else $('#questLine').hidden = true;
    // FOR FREE: the next playtime gift
    const secs = sessionSecs(), gi = GIFTS.findIndex((g, i) => !S.gifts[i]);
    const gb = $('#bGift');
    if (gi < 0) gb.hidden = true;
    else {
        gb.hidden = false;
        const left = GIFTS[gi].min * 60 - secs;
        gb.classList.toggle('ready', left <= 0);
        put('#giftTxt', left <= 0 ? 'CLAIM!' : clock(left));
        put('#giftWhat', rewardText(GIFTS[gi]), true);
    }
    // x2, Auto Click
    put('#x2Txt', S.x2 ? clock(((S.x2Until || 0) - net.now()) / 1000) + ' left' : '💎 ' + CFG.boostX2Gems + ' for ' + CFG.boostX2Mins + ' min');
    $('#bX2').classList.toggle('on', !!S.x2);
    const auto = (S.ups && S.ups.auto) || 0, ab = $('#bAuto');
    ab.classList.toggle('buy', !auto);
    ab.classList.toggle('on', !!auto && !!S.autoOn);
    put('#autoTxt', !auto ? upgradeCost(UPGRADES.find((u) => u.id === 'auto'), 0) + ' Wins' : S.autoOn ? 'ON · ' + auto + ' a second' : 'OFF · tap to start');
    // what a press gives
    const b = bestBoard(), got = perClick(S, S.world, S.onBoard >= 0 ? S.onBoard : b, S.x2);
    put('#mClick', '+' + fmt1(got) + ' a press');
    put('#mReb', S.rebirths ? 'x' + rebirthMult(S.rebirths) + ' Rebirth' : '');
    const pm = palMult(S);
    put('#mPals', pm > 1 ? 'x' + (Math.round(pm * 100) / 100) + ' Keypals' : '');
    put('#mX2', S.x2 ? 'x2!' : '');
    // the quick ways round
    const o = spanNow(), W = WORLDS[S.world], next = o.n < W.bridges ? bridgeCost(S.world, o.n + 1) : 0, left2 = Math.max(0, next - o.part);
    put('#goBridgeTxt', next ? 'Bridge ' + (o.n + 1) + ': ' + fmt(S.kb) + '/' + fmt(left2) : 'All ' + W.bridges + ' built!');
    $('#bGoBridge').classList.toggle('go', !!next && S.kb >= left2 && left2 > 0);
    // the stage bar: how far along this world
    put('#stageTxt', 'STAGE ' + Math.min(o.n + 1, W.bridges) + ' / ' + W.bridges);
    const stageF = Math.round(Math.min(1, (o.n + (next ? o.part / next : 0)) / W.bridges) * 200) / 200;
    if (stageF !== stageShown) { stageShown = stageF; $('#stageFill').style.transform = 'scaleX(' + stageF + ')'; }
    put('#goBoardTxt', BOARDS[b].name + ' x' + fmt(BOARDS[b].mult * W.kb));
    // badges: something to do
    const ds = dailyStatus(S.daily, net.now());
    setBadge('#bDaily', ds.can ? '!' : '');
    const list = (S.jq && S.jq.list) || [];
    setBadge('#bQuests', (list.some((q) => !q.c && TASKS[q.k] && q.p >= TASKS[q.k].n) || (Q && (S.qv || 0) >= Q.n)) ? '!' : '');
    setBadge('#bSpin', S.spins > 0 ? String(S.spins) : '');
    setBadge('#bRebirth', S.wins >= rebirthCost(S.rebirths) ? '!' : '');
    const nx = WORLDS.findIndex((w, i) => i > S.world && S.rebirths >= w.reb);
    setBadge('#bWorlds', nx > 0 && !(S.seen && S.seen['w' + nx]) ? 'NEW' : '');
    const canUp = UPGRADES.some((u) => { const n = (S.ups && S.ups[u.id]) || 0; return n < u.max && S.wins >= upgradeCost(u, n); });
    setBadge('#bWork', canUp ? '!' : '');
    tickPanel();
}
// The open panel's timers, written once a second on their own: a panel rebuilt under a finger loses the tap, and a rebuild
// from the frame loop means a layout. It's rebuilt only when what it shows changes (a gift's time comes).
function tickPanel() {
    const m = $('#modal');
    if (m.hidden || !panelKind) return;
    const set = (sel, text) => { const el = m.querySelector(sel); if (el && el.textContent !== text) el.textContent = text; };
    if (panelKind === 'quests') set('[data-t="day"]', 'Resets in ' + clock(dayLeft(net.now())));
    else if (panelKind === 'daily') set('[data-t="daily"]', 'Next reward in ' + clock(dayLeft(net.now())));
    else if (panelKind === 'spin' && !spinning) {
        const left = Math.max(0, (S.spinIn || 0) - (Date.now() - S.profileAt) / 1000);
        set('[data-t="spin"]', S.spins >= CFG.spinMax ? 'Spins full: use one!' : 'Next free spin in ' + clock(left));
    } else if (panelKind === 'gifts') {
        const secs = sessionSecs();
        for (let i = 0; i < GIFTS.length; i++) {
            if (S.gifts[i]) continue;
            const left = GIFTS[i].min * 60 - secs, b = m.querySelector('[data-act="gift"][data-i="' + i + '"]');
            if (!b) continue;
            if (left <= 0 && b.disabled) { renderPanel(); return; }
            if (left > 0) set('[data-act="gift"][data-i="' + i + '"]', clock(left));
        }
    }
}
const fmt1 = (v) => (v >= 1000 ? fmt(v) : String(Math.round(v * 10) / 10));
function setBadge(sel, text) {
    const el = $(sel);
    let b = el.querySelector('.badge');
    if (!text) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'badge'; el.appendChild(b); }
    if (b.textContent !== text) b.textContent = text;
}
export function measureHud() {
    const w = $('#winsBox .wc').getBoundingClientRect(); if (w.width > 0) winsAt = { x: w.left + w.width / 2, y: w.top + w.height / 2 };
}
// =====================================================================================
// A capsule opening: they shake, they burst, your Keypals
// =====================================================================================
let hatchT = 0;
export function showHatch(capId, out, auto) {
    const c = capsuleById[capId], box = $('#hatchCaps'), H = $('#hatch');
    clearTimeout(hatchT);
    box.innerHTML = out.map(() => `<div class="hc"><div class="cap" style="--cc:${hex(c.color)}"></div></div>`).join('');
    $('#hatchOk').hidden = true;
    H.hidden = false;
    sfx('shake');
    hatchT = setTimeout(() => {
        sfx('crack');
        box.innerHTML = out.map((o) => { const k = palById[o.id]; return `<div class="hc">${o.isNew ? '<span class="newb o1">NEW!</span>' : ''}<img src="${palSvg(k)}" alt=""><b class="o">${esc(k.name)}</b><small class="o1">${rar(k.rarity)} · x${k.mult}</small></div>`; }).join('');
        $('#hatchOk').hidden = false;
        if (actions.onHatched) actions.onHatched(out);
        if (auto) hatchT = setTimeout(closeHatch, 1300);
    }, 720);
}
export function closeHatch() { clearTimeout(hatchT); $('#hatch').hidden = true; if (actions.afterHatch) actions.afterHatch(); }
export const hatchOpen = () => !$('#hatch').hidden;
$('#hatchOk').addEventListener('click', () => { sfx('click'); closeHatch(); });

// =====================================================================================
// Panels
// =====================================================================================
let panelKind = null, panelTab = null, panelArg = null, spinning = false, wheelAngle = 0;
export function openPanel(kind, tab) {
    panelKind = kind; panelTab = tab || null;
    if (kind === 'capsule') { panelArg = tab; panelTab = null; }
    $('#modal').hidden = false;
    renderPanel();
    sfx('open');
    setMusicDuck(true);
    if (actions.onPanel) actions.onPanel(true);
    if (kind === 'worlds') { const nx = WORLDS.findIndex((w, i) => i > 0 && S.rebirths >= w.reb && !(S.seen && S.seen['w' + i])); if (nx > 0) { S.seen = { ...S.seen, ['w' + nx]: 1 }; net.send('tut', { seen: 'w' + nx }); } }
}
export function closePanel() {
    if ($('#modal').hidden) return false;
    $('#modal').hidden = true; panelKind = null; renderedKind = null;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    setMusicDuck(false);
    if (actions.onPanel) actions.onPanel(false);
    sfx('close');
    return true;
}
export const panelIs = (k) => !$('#modal').hidden && panelKind === k;
export function refreshPanels() { if (!$('#modal').hidden && !(panelKind === 'spin' && spinning)) renderPanel(); }
function frame(title, icon, body, opts) {
    opts = opts || {};
    return `<div class="panel ${opts.cls || ''}"${opts.w ? ` style="width:min(${opts.w}rem,94vw)"` : ''}>
        <header><h2 class="o">${icon} ${title}</h2><div class="hx">${opts.hx || ''}<button class="btn g-red o x" data-close>✕</button></div></header>
        ${opts.tabs ? `<div class="tabs">${opts.tabs.map(([k, l]) => `<button class="tab o1${k === opts.tab ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>` : '<div></div>'}
        <div class="body">${body}</div>${opts.foot ? `<div class="foot">${opts.foot}</div>` : '<div></div>'}</div>`;
}
let renderedKind = null, renderedHtml = '';
function renderPanel() {
    const m = $('#modal');
    const again = renderedKind === panelKind && !m.hidden && m.firstElementChild;
    const html = PANELS[panelKind] ? PANELS[panelKind]() : '';
    if (again && html === renderedHtml) return;
    renderedHtml = html;
    const scroller = again && m.querySelector('.body'), keep = scroller ? scroller.scrollTop : 0;
    m.innerHTML = html;
    renderedKind = panelKind;
    // a refresh of the open panel (a timer, a new value): no pop-in again, the scroll stays where it was
    if (again && m.firstElementChild) { m.firstElementChild.classList.add('still'); const b2 = m.querySelector('.body'); if (b2 && keep) b2.scrollTop = keep; }
    const x = m.querySelector('[data-close]');
    if (x) x.onclick = () => closePanel();
    m.onclick = (e) => { if (e.target === m) closePanel(); };
    for (const b of m.querySelectorAll('[data-tab]')) b.onclick = () => { panelTab = b.dataset.tab; sfx('click'); renderPanel(); };
    for (const b of m.querySelectorAll('[data-act]')) b.onclick = (e) => { e.stopPropagation(); doAct(b.dataset.act, b.dataset); };
    const code = m.querySelector('#codeIn');
    if (code) code.onkeydown = (e) => { if (e.key === 'Enter') doAct('code', {}); };
    for (const r of m.querySelectorAll('input[type=range]')) r.oninput = () => setVolume(r.dataset.vol, r.value / 100);
}
// a wheel prize's label
const spinLabel = (s) => (s.kb ? KC + ' Keys' : s.wins ? WC + ' Wins' : s.gems ? '💎 ' + s.gems : s.x2 ? 'x2 ' + s.x2 + 'm' : '');
const palCard = (k, inTeam, count) => `<div class="card${inTeam ? ' on' : ''}">${count > 1 ? `<span class="palN o1">x${count}</span>` : ''}<div class="ci"><img src="${palSvg(k)}" alt=""></div><b class="o1">${esc(k.name)}</b><small>${rar(k.rarity)}</small><span class="palX o1">x${k.mult}</span>
    ${inTeam ? `<button class="btn g-red o1" data-act="unequip" data-id="${k.id}">Take off</button>` : `<button class="btn g-green o1" data-act="equip" data-id="${k.id}">Equip</button>`}</div>`;
const PANELS = {
    pals() {
        const tab = panelTab || 'team', team = S.team || [], mult = Math.round(palMult(S) * 100) / 100;
        let body = '';
        if (tab === 'team') {
            const owned = PALS.filter((k) => (S.pals || {})[k.id] > 0).sort((a, b) => b.mult - a.mult);
            body = `<p class="o1" style="margin:0 0 .6rem;font-weight:700">Team: ${team.length} / ${teamSize(S)} · every press x${mult} <button class="btn g-blue o1" data-act="equipbest" style="margin-left:.5rem;padding:.15rem .7rem;font-size:.95rem">Equip best</button></p>`;
            body += owned.length ? '<div class="grid">' + owned.map((k) => palCard(k, team.includes(k.id), S.pals[k.id])).join('') + '</div>' : '<p class="o1" style="font-weight:700">No Keypals yet. Walk up to a capsule machine and open a capsule!</p>';
        } else {
            body = CAPSULES.map((c) => {
                const seen = c.pals.filter((x) => (S.pals || {})[x.id] > 0).length;
                return `<div class="row"><div class="rt"><b class="o1">${esc(c.name)} ${seen === c.pals.length ? '✅' : ''}</b><small>${seen} / ${c.pals.length} found${S.index && S.index[c.id] ? ' · collection reward claimed' : ' · finish it for Gems'}</small></div><div class="rb">${c.pals.map((x) => { const k = palById[x.id], got = (S.pals || {})[k.id] > 0; return `<img src="${palSvg(k)}" alt="" class="${got ? '' : 'dim'}" style="width:3rem;height:3rem" title="${esc(got ? k.name : '???')}">`; }).join('')}</div></div>`;
            }).join('');
        }
        return frame('Keypals', IC('pals'), body, { tabs: [['team', 'My Team'], ['index', 'Index']], tab, foot: 'Keypals multiply every press. Find them in the capsule machines.' });
    },
    capsule() {
        const c = capsuleById[panelArg];
        if (!c) return '';
        const total = c.pals.reduce((a, x) => a + x.w, 0);
        const odds = c.pals.map((x) => { const k = palById[x.id], got = (S.pals || {})[k.id] > 0; return `<div class="card"><div class="ci"><img src="${palSvg(k)}" alt="" class="${got ? '' : 'dim'}"></div><b class="o1">${got ? esc(k.name) : '???'}</b><small>${rar(k.rarity)}</small><span class="palX o1">x${k.mult} · ${Math.round(x.w / total * 1000) / 10}%</span></div>`; }).join('');
        const can1 = S.wins >= c.wins, can3 = S.wins >= c.wins * 3;
        const body = `<div class="capOdds">${odds}</div><div class="capBtns"><button class="btn ${can1 ? 'g-green' : 'g-grey'} o" data-act="hatch" data-n="1">Open 1 · ${WC} ${fmtComma(c.wins)}</button><button class="btn ${can3 ? 'g-yellow' : 'g-grey'} o" data-act="hatch" data-n="3">Open 3 · ${WC} ${fmtComma(c.wins * 3)}</button></div>
            <p class="o1" style="margin:.6rem 0 0;text-align:center;font-weight:700">You have ${WC} ${fmtComma(S.wins)}</p>`;
        return frame(esc(c.name), IC('pals'), body, { w: 38 });
    },
    work() {
        const body = UPGRADES.map((u) => {
            const n = (S.ups && S.ups[u.id]) || 0, max = n >= u.max, cost = upgradeCost(u, n), can = !max && S.wins >= cost;
            return `<div class="row"><div class="ri"><span class="ci" style="font-size:2.4rem">${u.icon}</span></div><div class="rt"><b class="o1">${esc(u.name)} <small style="display:inline;font-weight:700;color:#7dff6b">${u.stat(n)}</small></b><small>${esc(u.text)}</small><div class="prog"><i style="width:${(n / u.max * 100).toFixed(0)}%"></i></div></div><div class="rb"><button class="btn ${max ? 'g-grey' : can ? 'g-green' : 'g-grey'} o1" data-act="upgrade" data-id="${u.id}" ${max ? 'disabled' : ''}>${max ? 'MAX' : WC + ' ' + fmtComma(cost)}</button></div></div>`;
        }).join('');
        return frame('Workshop', IC('work'), body, { hx: `<span class="o1">${WC} ${fmtComma(S.wins)}</span>`, foot: 'Upgrades stay when you rebirth.' });
    },
    spin() {
        const n = SPIN.length, seg = 360 / n;
        const grad = SPIN.map((s, i) => `${s.color} ${(i * seg).toFixed(2)}deg ${((i + 1) * seg).toFixed(2)}deg`).join(',');
        const labels = SPIN.map((s, i) => `<span class="wl" style="transform:rotate(${((i + 0.5) * seg).toFixed(2)}deg)"><b class="o1">${spinLabel(s)}</b></span>`).join('');
        const left = Math.max(0, (S.spinIn || 0) - (Date.now() - S.profileAt) / 1000);
        const body = `<div class="wheelWrap"><div class="wptr"></div><div class="wheel" id="wheel" style="background:conic-gradient(${grad});transform:rotate(${wheelAngle}deg)">${labels}</div><div class="whub o">SPIN</div></div>
            <div style="text-align:center;margin-top:.8rem"><button class="btn ${S.spins > 0 ? 'g-green' : 'g-grey'} o" data-act="spin" ${S.spins > 0 && !spinning ? '' : 'disabled'} style="min-width:12rem;height:3.2rem;font-size:1.5rem">${S.spins > 0 ? 'Spin! (' + S.spins + ')' : 'No spins left'}</button>
            <p class="o1" data-t="spin" style="margin:.5rem 0 0;font-weight:700">${S.spins >= CFG.spinMax ? 'Spins full: use one!' : 'Next free spin in ' + clock(left)}</p></div>`;
        return frame('Lucky Wheel', IC('spin'), body, { w: 30, foot: 'A free spin every ' + CFG.spinMins + ' minutes of play (up to ' + CFG.spinMax + ' saved). Prizes grow with you.' });
    },
    rebirth() {
        const r = S.rebirths || 0, cost = rebirthCost(r), can = S.wins >= cost;
        const bd = BOARDS.find((b) => b.reb === r + 1), wd = WORLDS.find((w) => w.reb === r + 1);
        const unlock = [bd ? 'the ' + bd.name + ' keyboard (x' + bd.mult + ')' : '', wd ? 'the world ' + wd.icon + ' ' + wd.name : ''].filter(Boolean).join(' and ');
        const body = `<div class="rebBox"><div class="rebRow"><span>Rebirths</span><b>${r}</b><i>→</i><b class="g">${r + 1}</b></div>
            <div class="rebRow"><span>Every press</span><b>x${rebirthMult(r)}</b><i>→</i><b class="g">x${rebirthMult(r + 1)}</b></div>
            ${unlock ? `<div class="rebNew o1">🔓 Unlocks ${unlock}!</div>` : ''}
            <p class="rebWarn">Your Level goes back to 1, your Keyboards to 0, and every bridge comes down. You keep your Wins, upgrades, keyboards, Keypals and Gems.</p>
            <button class="btn ${can ? 'g-pink' : 'g-grey'} o" data-act="rebirth" style="min-width:14rem;height:3.4rem;font-size:1.5rem">Rebirth · ${WC} ${fmtComma(cost)}</button>
            ${can ? '' : `<small class="o1" style="font-weight:700">You have ${fmtComma(S.wins)} Wins</small>`}</div>`;
        return frame('Rebirth', IC('rebirth'), body, { w: 32 });
    },
    worlds() {
        const body = '<div class="grid wgrid">' + WORLDS.map((w, i) => {
            const open = S.rebirths >= w.reb, here = S.world === i;
            const btn = here ? '<button class="btn g-blue o" data-act="world" data-w="' + i + '">Back to spawn</button>' : open ? `<button class="btn g-green o" data-act="world" data-w="${i}">Teleport</button>` : `<button class="btn g-grey o" disabled>🔒 ${w.reb} Rebirths</button>`;
            return `<div class="card wcard${here ? ' on' : ''}" style="--wc:${hex(w.sea)}"><div class="ci">${w.icon}</div><b class="o1">${esc(w.name)}</b><small class="o1">${w.bridges} stages · Keyboards x${fmt(w.kb)} · Wins x${fmt(w.wins)}</small>${btn}</div>`;
        }).join('') + '</div>';
        return frame('Worlds', IC('world'), body, { w: 40, foot: 'Bigger keyboards, longer bridges, bigger Wins. Rebirth to open the next world.' });
    },
    shop() {
        const tab = panelTab || 'gems';
        let body = '';
        if (tab === 'gems') {
            const packs = PACKS.map((p, i) => `<div class="card"><div class="ci">${['👑', '👑👑', '🏆'][i]}</div><b class="o1">${fmtComma(Math.round(p.wins * WORLDS[S.world].wins))} ${WC}</b><button class="btn g-gem o" data-act="pack" data-id="${p.id}">💎 ${p.gems}</button></div>`).join('');
            body = `<div class="grid">${packs}<div class="card"><div class="ci">⌨️</div><b class="o1">x2 Keyboards · ${CFG.boostX2Mins} min</b><small>${S.x2 ? 'Active: ' + clock(((S.x2Until || 0) - net.now()) / 1000) + ' left' : 'Double every press'}</small><button class="btn g-gem o" data-act="x2">💎 ${CFG.boostX2Gems}</button></div>
                <div class="card"><div class="ci">👑</div><b class="o1">x2 Wins · ${CFG.boostW2Mins} min</b><small>${(S.w2Until || 0) > net.now() ? 'Active: ' + clock(((S.w2Until || 0) - net.now()) / 1000) + ' left' : 'Double your Win Pads'}</small><button class="btn g-gem o" data-act="w2">💎 ${CFG.boostW2Gems}</button></div></div>
                <p style="margin:.8rem 0 0;font-weight:600;opacity:.85">💎 Gems come from quests, daily tasks, gifts, the wheel and the daily reward. Everything here is bought with Wins or Gems.</p>`;
        } else {
            body = `<h3 style="margin:.2rem 0 .5rem">🎟️ Codes</h3><div style="display:flex;gap:.5rem"><input class="code" id="codeIn" maxlength="20" placeholder="Enter a code"><button class="btn g-green o" data-act="code" style="min-width:6rem">Redeem</button></div>
                <p style="margin:.8rem 0 0;font-weight:600;opacity:.85">Codes give free Keyboards, Wins, Gems and spins. Try CLICK!</p>`;
        }
        return frame('Shop', IC('shop'), body, { tabs: [['gems', '💎 Gems'], ['codes', '🎟️ Codes']], tab });
    },
    quests() {
        const Q = QUESTS[S.qi];
        let body = '';
        if (Q) {
            const p = Math.min(Q.n, S.qv || 0), ready = p >= Q.n;
            body += `<div class="row${ready ? ' feat' : ''}"><div class="ri"><span class="ci" style="font-size:2.4rem">🎯</span></div><div class="rt"><small style="color:#7af4ff;font-weight:700">QUEST ${S.qi + 1} / ${QUESTS.length}</small><b class="o1">${esc(Q.text)}</b><div class="prog"><i style="width:${(p / Q.n * 100).toFixed(0)}%"></i></div><em>${fmt(p)} / ${fmt(Q.n)} · Reward: ${rewardText(Q)}</em></div><div class="rb"><button class="btn ${ready ? 'g-green' : 'g-grey'} o" data-act="qclaim" ${ready ? '' : 'disabled'}>Claim</button></div></div>`;
        } else body += '<div class="row"><div class="rt"><b>🏆 Every quest done! Nobody types like you.</b></div></div>';
        body += `<h3 style="margin:.9rem 0 .4rem">🔥 Daily Tasks <small data-t="day" style="opacity:.75;font-size:.85rem">Resets in ${clock(dayLeft(net.now()))}</small></h3>`;
        body += ((S.jq && S.jq.list) || []).map((q, i) => {
            const T = TASKS[q.k], done = q.p >= T.n;
            return `<div class="row"><div class="ri"><span class="ci" style="font-size:2.2rem">${T.icon}</span></div><div class="rt"><b class="o1">${esc(T.text)}</b><div class="prog"><i style="width:${Math.min(100, q.p / T.n * 100).toFixed(0)}%"></i></div><em>${fmt(q.p)} / ${fmt(T.n)} · ${rewardText(T)}</em></div><div class="rb"><button class="btn ${done && !q.c ? 'g-green' : 'g-grey'} o" data-act="tclaim" data-i="${i}" ${done && !q.c ? '' : 'disabled'}>${q.c ? 'Done ✓' : 'Claim'}</button></div></div>`;
        }).join('');
        return frame('Quests', IC('quest'), body);
    },
    daily() {
        const st = dailyStatus(S.daily, net.now());
        const ic = (r) => (r.gems && !r.wins ? '💎' : r.wins ? WC : r.spins ? '<i class="spinIc"></i>' : r.x2 ? '✨' : KC);
        const days = DAILY.map((r, i) => `<div class="day${i === 6 ? ' big' : ''}${i < st.day ? ' got' : ''}${i === st.day && st.can ? ' now' : ''}"><span class="o1">DAY ${i + 1}</span><span class="di">${i < st.day ? '✅' : ic(r)}</span><span class="o1">${rewardText(r)}</span></div>`).join('');
        const body = `<div class="days">${days}</div><div style="text-align:center;margin-top:1rem"><button class="btn ${st.can ? 'g-green' : 'g-grey'} o" data-act="daily" ${st.can ? '' : 'disabled'} ${st.can ? '' : 'data-t="daily"'} style="min-width:12rem;height:3rem;font-size:1.4rem">${st.can ? 'Claim Day ' + (st.day + 1) : 'Next reward in ' + clock(dayLeft(net.now()))}</button></div>`;
        return frame('Daily Rewards', IC('gift'), body, { w: 44, foot: 'Come back every day: the rewards grow for 7 days in a row.' });
    },
    gifts() {
        const secs = sessionSecs();
        const body = GIFTS.map((g, i) => {
            const left = g.min * 60 - secs, got = S.gifts[i];
            return `<div class="row"><div class="ri"><span class="ci" style="font-size:2.4rem">${got ? '✅' : '🎁'}</span></div><div class="rt"><b class="o1">${rewardText(g)}</b><small>After ${g.min} minutes of play</small></div><div class="rb"><button class="btn ${!got && left <= 0 ? 'g-green' : 'g-grey'} o" data-act="gift" data-i="${i}" ${!got && left <= 0 ? '' : 'disabled'}>${got ? 'Claimed' : left <= 0 ? 'Claim!' : clock(left)}</button></div></div>`;
        }).join('');
        return frame('FREE Gifts', IC('gift'), body, { w: 34, foot: 'Gifts unlock the longer you play this session.' });
    },
    boards() {
        const b = actions.boards ? actions.boards() : { wins: [], kb: [] };
        const col = (title, rows) => `<div><h3 style="margin:.2rem 0 .5rem">${title}</h3>${(rows || []).map((r, i) => `<div class="row" style="padding:.35rem .6rem;margin-bottom:.3rem"><b style="width:2rem">${['🥇', '🥈', '🥉'][i] || i + 1}</b><div class="rt"><b style="font-size:1rem">${esc(r.n)}</b></div><b>${fmt(r.v)}</b></div>`).join('') || '<p>Be the first!</p>'}</div>`;
        const body = `<p class="o1" style="margin:0 0 .6rem;font-weight:700">You: ${fmtComma(S.totalWins)} Wins, ${fmt(S.totalKb)} Keyboards</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:1rem">${col('👑 Most Wins', b.wins)}${col('⌨️ Most Keyboards', b.kb)}</div>`;
        return frame('Leaderboards', '🏆', body);
    },
    settings() {
        const v = getVolumes(), q = getQuality();
        const body = `<div class="vol"><span>Graphics</span><div class="qbtns">${['low', 'medium', 'high'].map((k) => `<button class="btn g-blue o${q === k ? ' on' : ''}" data-act="quality" data-q="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div></div>
            <div class="vol"><span>Music</span><input type="range" min="0" max="100" value="${Math.round(v.music * 100)}" data-vol="music"></div>
            <div class="vol"><span>Key sounds</span><input type="range" min="0" max="100" value="${Math.round((v.asmr ?? 0.9) * 100)}" data-vol="asmr"></div>
            <div class="vol"><span>Effects</span><input type="range" min="0" max="100" value="${Math.round(v.sfx * 100)}" data-vol="sfx"></div>
            <div class="vol"><span>Show FPS</span><div class="qbtns"><button class="btn g-grey o" data-act="fps">${actions.fpsOn && actions.fpsOn() ? 'On' : 'Off'}</button></div></div>
            <div class="vol"><span>Stuck?</span><div class="qbtns"><button class="btn g-blue o" data-act="home">Back to spawn</button></div></div>
            <p style="margin:1rem 0 0;font-weight:600;opacity:.8">${isTouch ? 'Walk over keys, or tap CLICK. Drag to look around.' : 'WASD move · walk over keys or click anywhere · SPACE jump (stomps keys) · E use · B to the bridge · R to your keys · drag to look'}</p>`;
        return frame('Settings', IC('gear'), body, { w: 36 });
    },
};

// =====================================================================================
// What the buttons do
// =====================================================================================
function doAct(act, d) {
    sfx('click');
    switch (act) {
        case 'spin':
            if (S.spins > 0 && !spinning) {
                spinning = true; net.send('spin', {}); renderSpinButton();
                // no answer (no spin left after all): the button comes back
                clearTimeout(spinWait); spinWait = setTimeout(() => { if (spinning) { spinning = false; refreshPanels(); } }, 4000);
            }
            break;
        case 'rebirth': {
            const cost = rebirthCost(S.rebirths);
            if (S.wins < cost) { notEnough({ cur: 'wins', need: cost - S.wins, name: 'a rebirth' }); break; }
            askConfirm('🔄', 'Rebirth?', 'Your Level and Keyboards go back to the start and the bridges come down. Every press gives x' + rebirthMult(S.rebirths + 1) + ' from now on.', 'Rebirth!', () => { closePanel(); net.send('rebirth', {}); });
            break;
        }
        case 'world': closePanel(); if (actions.world) actions.world(+d.w); break;
        case 'pack': net.send('pack', { id: d.id }); break;
        case 'x2': net.send('x2', {}); break;
        case 'w2': net.send('w2', {}); break;
        case 'code': { const v = ($('#codeIn') || {}).value || ''; if (v.trim()) net.send('code', { code: v.trim() }); break; }
        case 'qclaim': net.send('qclaim', {}); break;
        case 'tclaim': net.send('tclaim', { i: +d.i }); break;
        case 'daily': net.send('daily', {}); break;
        case 'gift': net.send('gift', { i: +d.i }); break;
        case 'quality': setQuality(d.q); renderPanel(); break;
        case 'fps': if (actions.toggleFps) actions.toggleFps(); renderPanel(); break;
        case 'home': closePanel(); if (actions.respawn) actions.respawn(); break;
        case 'upgrade': net.send('upgrade', { id: d.id }); break;
        case 'equip': net.send('equip', { id: d.id }); sfx('equip'); break;
        case 'unequip': net.send('equip', { id: d.id, off: 1 }); break;
        case 'equipbest': net.send('equipbest', {}); sfx('equip'); break;
        case 'hatch': if (actions.hatch) actions.hatch(panelArg, +d.n); break;
    }
}
function renderSpinButton() { const b = $('#modal').querySelector('[data-act="spin"]'); if (b) b.disabled = true; }
// the wheel's answer: turn to the prize, then show it
let spinWait = 0;
export function onSpun(m) {
    clearTimeout(spinWait);
    const seg = 360 / SPIN.length, target = -((m.i + 0.5) * seg) + (Math.random() - 0.5) * seg * 0.6;
    const base = wheelAngle + 360 * 5;
    wheelAngle = base + ((((target - base) % 360) + 360) % 360);
    const el = $('#wheel');
    spinning = true;
    if (el) { el.style.transition = 'transform 3.4s cubic-bezier(0.15, 0.85, 0.25, 1)'; el.style.transform = 'rotate(' + wheelAngle.toFixed(1) + 'deg)'; }
    let ticks = 0;
    const tick = () => { if (ticks++ < 22) { sfx('click'); setTimeout(tick, 40 + ticks * ticks * 0.35); } };
    tick();
    setTimeout(() => {
        spinning = false;
        sfx('reward');
        popup('🎡', 'YOU WON!', m.text, '#ffe24a', true);
        if (panelKind === 'spin') renderPanel();
    }, el ? 3500 : 50);
}
// a yes / no question (yes may hold html: the drawn icons)
export function askConfirm(icon, title, text, yes, act) {
    const c = $('#confirm');
    c.innerHTML = `<div class="panel"><header><h2 class="o">${title}</h2><div class="hx"><button class="btn g-red o x" data-no>✕</button></div></header><div></div><div class="cbody"><span class="bi">${icon}</span><p>${text}</p><div class="btns"><button class="btn g-green o" data-yes>${yes}</button><button class="btn g-grey o" data-no>Cancel</button></div></div><div></div></div>`;
    c.hidden = false;
    for (const b of c.querySelectorAll('[data-no]')) b.onclick = () => { c.hidden = true; sfx('close'); };
    c.querySelector('[data-yes]').onclick = () => { c.hidden = true; act(); };
    c.onclick = (e) => { if (e.target === c) c.hidden = true; };
}
export function closeTop() {
    if (!$('#hatch').hidden) { closeHatch(); return true; }
    if (!$('#confirm').hidden) { $('#confirm').hidden = true; return true; }
    if (closePanel()) return true;
    return false;
}
// the panels with their real content, for the loading warm-up; returns the clean-up
export function warmPanels() {
    const m = $('#modal');
    panelKind = 'spin'; panelArg = 'c1';
    m.innerHTML = PANELS.spin() + PANELS.rebirth() + PANELS.daily() + PANELS.quests() + PANELS.shop() + PANELS.worlds() + PANELS.work() + PANELS.pals() + PANELS.capsule() + PANELS.gifts() + PANELS.boards() + PANELS.settings();
    m.hidden = false; m.classList.add('warmui');
    $('#confirm').innerHTML = '<div class="panel"><header><h2 class="o">Buy?</h2></header><div></div><div class="cbody"><span class="bi">👑</span><p>Sample</p><div class="btns"><button class="btn g-green o">Yes</button></div></div><div></div></div>';
    $('#confirm').hidden = false; $('#confirm').classList.add('warmui');
    popup('⭐', 'UNLOCKED!', 'Sample', '#ffe24a'); $('#popup').classList.add('warmui');
    levelUp(1, 2); $('#lvlUp').classList.add('warmui');
    winPop(12); $('#winPop').classList.add('warmui');
    toast('Sample', '#ffffff');
    const H = $('#hatch'), C = $('#hatchCaps');
    C.innerHTML = '<div class="hc"><div class="cap" style="--cc:#3ab4ff"></div></div><div class="hc"><img src="' + palSvg(PALS[0]) + '" alt=""><b class="o">Tappy</b><small class="o1">Common</small></div>';
    H.hidden = false; H.classList.add('warmui');
    $('#fillTag').hidden = false; $('#fillTag').classList.add('warmui');
    return () => {
        for (const s of ['#modal', '#confirm', '#popup', '#lvlUp', '#winPop', '#hatch', '#fillTag']) { $(s).classList.remove('warmui'); $(s).hidden = true; }
        m.innerHTML = ''; $('#confirm').innerHTML = ''; panelKind = null; $('#toasts').innerHTML = ''; C.innerHTML = '';
    };
}
export const anyPopup = () => !$('#confirm').hidden || !$('#modal').hidden || !$('#hatch').hidden;
