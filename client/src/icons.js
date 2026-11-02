// The HUD's icons, drawn: glossy cartoon art (SVG with gradients, a dark outline and a white shine), made once
// at load and set as CSS classes (.ic-spin, .ic-rebirth...). The menu never shows an emoji.
const O = '#1a1030';
const svg = (body, defs) => `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs>${defs || ''}</defs>${body}</svg>`;
const grad = (id, stops, x2, y2) => `<linearGradient id='${id}' x1='0' y1='0' x2='${x2 ?? 0}' y2='${y2 ?? 1}'>${stops.map((c, i) => `<stop offset='${i / (stops.length - 1)}' stop-color='${c}'/>`).join('')}</linearGradient>`;
const shine = (cx, cy, rx, ry, rot) => `<ellipse cx='${cx}' cy='${cy}' rx='${rx}' ry='${ry}' fill='#fff' opacity='.5'${rot ? ` transform='rotate(${rot} ${cx} ${cy})'` : ''}/>`;
const f = (n) => +n.toFixed(2);

function wheel() {
    const C = ['#ff4a6a', '#ffa82a', '#ffe02a', '#46ec50', '#3ab4ff', '#8a5aff', '#ff5ac0', '#2ae8d8'];
    let p = '';
    for (let i = 0; i < 8; i++) {
        const a0 = i / 8 * Math.PI * 2 - Math.PI / 2, a1 = (i + 1) / 8 * Math.PI * 2 - Math.PI / 2;
        p += `<path d='M32 34 L${f(32 + 25 * Math.cos(a0))} ${f(34 + 25 * Math.sin(a0))} A25 25 0 0 1 ${f(32 + 25 * Math.cos(a1))} ${f(34 + 25 * Math.sin(a1))} Z' fill='${C[i]}'/>`;
    }
    return svg(`<circle cx='32' cy='34' r='27' fill='${O}'/>${p}<circle cx='32' cy='34' r='25' fill='none' stroke='#fff' stroke-opacity='.35' stroke-width='2'/>
        ${shine(24, 22, 12, 6, -30)}<circle cx='32' cy='34' r='7' fill='url(#g)' stroke='${O}' stroke-width='3'/>
        <path d='M25 2 L39 2 L32 14 Z' fill='#ff3a4a' stroke='${O}' stroke-width='3' stroke-linejoin='round'/>`, grad('g', ['#fff6a0', '#ffb21e']));
}
const ICONS = {
    spin: wheel(),
    // rebirth: two arrows chasing each other round a gold star, on a blue orb
    rebirth: svg(`<circle cx='32' cy='32' r='27' fill='url(#b)' stroke='${O}' stroke-width='4'/>
        <path d='M17 30 A15 15 0 0 1 43 20' fill='none' stroke='#fff' stroke-width='6' stroke-linecap='round'/><path d='M38 13 L49 17 L42 27 Z' fill='#fff'/>
        <path d='M47 34 A15 15 0 0 1 21 44' fill='none' stroke='#fff' stroke-width='6' stroke-linecap='round'/><path d='M26 51 L15 47 L22 37 Z' fill='#fff'/>
        <path d='M32 24 L34.4 29.6 L40.4 30 L35.8 34 L37.2 40 L32 36.8 L26.8 40 L28.2 34 L23.6 30 L29.6 29.6 Z' fill='url(#y)' stroke='${O}' stroke-width='2' stroke-linejoin='round'/>
        ${shine(23, 16, 10, 5, -30)}`, grad('b', ['#8ae6ff', '#1f6fff']) + grad('y', ['#fff6a0', '#ffb21e'])),
    // a gift: a red box, a gold ribbon and bow
    gift: svg(`<path d='M20 16 C14 6 26 4 31 16 Z M44 16 C50 6 38 4 33 16 Z' fill='url(#y)' stroke='${O}' stroke-width='3.5' stroke-linejoin='round'/>
        <rect x='10' y='29' width='44' height='30' rx='3' fill='url(#r)' stroke='${O}' stroke-width='4'/>
        <rect x='6' y='17' width='52' height='14' rx='3' fill='url(#r2)' stroke='${O}' stroke-width='4'/>
        <rect x='27' y='17' width='10' height='42' fill='url(#y)' stroke='${O}' stroke-width='3'/>
        ${shine(17, 22, 7, 2.5)}`, grad('r', ['#ff6a7a', '#d81a3a']) + grad('r2', ['#ff8a9a', '#ff2a4a']) + grad('y', ['#fff6a0', '#ffb21e'])),
    // worlds: a little globe
    world: svg(`<circle cx='32' cy='32' r='27' fill='url(#s)' stroke='${O}' stroke-width='4'/>
        <path d='M14 22 C20 16 28 18 30 24 C32 30 24 32 22 38 C20 44 13 40 11 34 C10 29 11 25 14 22 Z' fill='url(#l)'/>
        <path d='M36 12 C44 12 52 18 54 26 C50 30 44 26 40 30 C36 34 40 42 36 48 C32 46 31 38 34 32 C36 26 32 22 34 16 Z' fill='url(#l)'/>
        <path d='M26 50 C30 48 36 50 38 55 C33 58 28 57 24 55 Z' fill='url(#l)'/>
        ${shine(22, 17, 10, 5, -30)}`, grad('s', ['#7ae0ff', '#1f7fe8']) + grad('l', ['#a8ff7a', '#22b83a'])),
    // quests: a clipboard with a tick
    quest: svg(`<rect x='10' y='8' width='44' height='52' rx='5' fill='url(#w)' stroke='${O}' stroke-width='4'/>
        <rect x='16' y='16' width='32' height='38' rx='2' fill='#fffdf4' stroke='${O}' stroke-width='2.5'/>
        <rect x='22' y='4' width='20' height='10' rx='3' fill='url(#m)' stroke='${O}' stroke-width='3.5'/>
        <path d='M21 33 L28 40 L43 24' fill='none' stroke='#22c73a' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'/>
        <path d='M22 47 L42 47' stroke='#c8c0d8' stroke-width='3' stroke-linecap='round'/>`, grad('w', ['#e8a868', '#a8602a']) + grad('m', ['#e0e4ee', '#8a90a8'])),
    // settings: a gear
    gear: svg(`<g fill='url(#m)' stroke='${O}' stroke-width='3.5' stroke-linejoin='round'>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x='26' y='3' width='12' height='16' rx='3' transform='rotate(${a} 32 32)'/>`).join('')}<circle cx='32' cy='32' r='20'/></g>
        <circle cx='32' cy='32' r='8' fill='#5a5070' stroke='${O}' stroke-width='3.5'/>${shine(25, 22, 7, 3.5, -30)}`, grad('m', ['#f0f2f8', '#8a90a8'])),
    // the shop: a pink shopping bag with a gold star
    shop: svg(`<path d='M22 22 C22 8 42 8 42 22' fill='none' stroke='${O}' stroke-width='5' stroke-linecap='round'/>
        <path d='M10 20 L54 20 L50 60 L14 60 Z' fill='url(#p)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/>
        <path d='M32 29 L35 36 L42.5 36.6 L36.8 41.4 L38.6 48.8 L32 44.8 L25.4 48.8 L27.2 41.4 L21.5 36.6 L29 36 Z' fill='url(#y)' stroke='${O}' stroke-width='2.5' stroke-linejoin='round'/>
        ${shine(19, 28, 4, 7)}`, grad('p', ['#ffa8e0', '#ff2a9a']) + grad('y', ['#fff6a0', '#ffb21e'])),
    // Keypals: a smiling keycap
    pals: svg(`<path d='M8 56 L14 14 Q15 8 21 8 L43 8 Q49 8 50 14 L56 56 Q56 60 52 60 L12 60 Q8 60 8 56 Z' fill='url(#p)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/>
        <ellipse cx='24' cy='30' rx='5' ry='7' fill='${O}'/><ellipse cx='40' cy='30' rx='5' ry='7' fill='${O}'/><circle cx='26' cy='27' r='2' fill='#fff'/><circle cx='42' cy='27' r='2' fill='#fff'/>
        <path d='M25 42 Q32 49 39 42' fill='none' stroke='${O}' stroke-width='3.5' stroke-linecap='round'/>${shine(24, 14, 10, 3)}`, grad('p', ['#a8f0ff', '#2a9aff'])),
    // the Workshop: a wrench and a key
    work: svg(`<path d='M44 6 C52 3 60 10 58 18 L51 13 L45 17 L46 25 L53 28 C47 34 38 31 36 25 L14 50 C10 55 3 49 7 44 L31 20 C28 14 36 6 44 6 Z' fill='url(#m)' stroke='${O}' stroke-width='3.5' stroke-linejoin='round'/>${shine(44, 11, 6, 2.5, -20)}`, grad('m', ['#fff0a8', '#ffa01e'])),
    // going home: a keyboard with an arrow
    kbd: svg(`<rect x='4' y='18' width='56' height='34' rx='6' fill='url(#c)' stroke='${O}' stroke-width='4'/>
        ${[0, 1, 2].map((j) => [0, 1, 2, 3, 4].map((i) => `<rect x='${10 + i * 9.4}' y='${23 + j * 8.4}' width='7.6' height='6.6' rx='1.6' fill='${['#ff5a7a', '#ffe02a', '#46ec50', '#3ad8ff'][(i + j) % 4]}'/>`).join('')).join('')}`, grad('c', ['#5a5c78', '#2a2c44'])),
    // the Index: a book with a Keypal's face on its cover
    index: svg(`<path d='M12 6 L52 6 Q56 6 56 10 L56 54 Q56 58 52 58 L12 58 Q8 58 8 54 L8 10 Q8 6 12 6 Z' fill='url(#b)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/>
        <rect x='13' y='6' width='5' height='52' fill='#fff' opacity='.35'/><ellipse cx='30' cy='28' rx='4' ry='6' fill='${O}'/><ellipse cx='44' cy='28' rx='4' ry='6' fill='${O}'/><path d='M31 40 Q37 46 43 40' fill='none' stroke='${O}' stroke-width='3' stroke-linecap='round'/>`, grad('b', ['#ffd08a', '#ff8a3a'])),
    // a bridge
    bridge: svg(`<path d='M4 40 Q32 10 60 40' fill='none' stroke='${O}' stroke-width='9' stroke-linecap='round'/><path d='M4 40 Q32 10 60 40' fill='none' stroke='#ffb02a' stroke-width='4.5' stroke-linecap='round'/>
        <rect x='3' y='38' width='58' height='11' rx='3' fill='url(#b)' stroke='${O}' stroke-width='3.5'/>
        <path d='M14 27 L14 38 M24 21 L24 38 M32 19 L32 38 M40 21 L40 38 M50 27 L50 38' stroke='${O}' stroke-width='3'/>`, grad('b', ['#a8ff7a', '#22c73a'])),
    // a Gem
    gem: svg(`<path d='M14 10 L50 10 L61 26 L32 58 L3 26 Z' fill='url(#g)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/>
        <path d='M3 26 L61 26 M14 10 L22 26 L32 58 L42 26 L50 10 M22 26 L32 10 L42 26' fill='none' stroke='#fff' stroke-opacity='.45' stroke-width='2'/>
        ${shine(20, 17, 6, 3, -20)}`, grad('g', ['#e8b8ff', '#9a4aff', '#6a1ad8'])),
};
// A Keypal's picture: its keycap in its colour with its face and legend (panels and the capsule's reveal)
export function palSvg(k) {
    const col = '#' + k.color.toString(16).padStart(6, '0'), d = k.color === 0x2a2438;
    const eye = d ? '#ffffff' : O, sh = d ? O : '#ffffff';
    return 'data:image/svg+xml,' + encodeURIComponent(svg(`<path d='M6 58 L12 22 Q13 16 19 16 L45 16 Q51 16 52 22 L58 58 Q58 62 54 62 L10 62 Q6 62 6 58 Z' fill='${col}' stroke='${O}' stroke-width='3.5' stroke-linejoin='round'/>
        <path d='M16 4 Q10 4 10 10 L10 16 Q10 22 16 22 L48 22 Q54 22 54 16 L54 10 Q54 4 48 4 Z' fill='${col}' stroke='${O}' stroke-width='3.5'/>
        <text x='32' y='18' font-family='Arial Black,sans-serif' font-size='14' font-weight='900' text-anchor='middle' fill='${eye}'>${k.key}</text>
        <ellipse cx='23' cy='38' rx='5' ry='7' fill='${eye}'/><ellipse cx='41' cy='38' rx='5' ry='7' fill='${eye}'/><circle cx='25' cy='35' r='2' fill='${sh}'/><circle cx='43' cy='35' r='2' fill='${sh}'/>
        <path d='M26 50 Q32 56 38 50' fill='none' stroke='${eye}' stroke-width='3' stroke-linecap='round'/>${shine(18, 10, 5, 2)}`));
}
export function installIcons() {
    const st = document.createElement('style');
    st.textContent = Object.entries(ICONS).map(([k, s]) => `.ic-${k}{background-image:url("data:image/svg+xml,${encodeURIComponent(s.replace(/\s*\n\s*/g, ''))}")}`).join('\n');
    document.head.appendChild(st);
}
