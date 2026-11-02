// Local mirror of this player's progress. The server owns the real values: everyone's position arrives
// through the room state, private progress in "profile" and "lite" messages.
export const S = {
    kb: 0, totalKb: 0, presses: 0, wins: 0, totalWins: 0, gems: 0, xp: 0, lv: 1, need: 14, rebirths: 0, bestBridge: 0,
    spans: {}, claimed: {}, boardsOpen: {}, ups: {}, pals: {}, team: [], hatched: 0, upgrades: 0, index: {},
    spins: 0, spinIn: 0, spinsUsed: 0, pads: 0, world: 0,
    x2Until: 0, x2: false, w2Until: 0,
    qi: 0, qv: 0, jq: { day: '', list: [] }, daily: {}, codes: {}, gifts: {}, seen: {}, tut: 0,
    sessionSecs: 0, playtime: 0, firstPlay: Date.now(),
    joinedAt: Date.now(), profileAt: Date.now(), name: '',
    // this device only: the keyboard under you (-1: none), Auto Click on or off
    onBoard: -1, autoOn: false,
};

// Game actions that world objects and panels trigger; filled in by main.js / ui.js
export const actions = {};

export const net = {
    room: null,
    offset: 0,
    rtt: 0,
    send(type, msg) { if (this.room) this.room.send(type, msg || {}); },
    // Server clock in ms (corrected for the round trip, smooth.js), so timers line up for everyone
    fixedNow: null,
    now() { return this.fixedNow ?? Date.now() + this.offset; },
};

// QA: where a slow frame's time went (sections marked as the frame runs)
export const prof = { t: 0, parts: [], on: true, mark(name) { const n = performance.now(); this.parts.push(name, n - this.t); this.t = n; }, start() { this.parts.length = 0; this.t = performance.now(); } };
