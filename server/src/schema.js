import { schema, t } from '@colyseus/schema';

// Public, synced to every client: the server's clock and everyone on the islands (players and the bots). Private progress (Keyboards, Wins, Gems, bridges, quests...) goes only to its owner in "profile".
// Positions carry a server-time stamp (t): other clients smooth them on that timeline.
export const PlayerState = schema({
    name: t.string().default(''),
    pid: t.uint8().default(0),
    bot: t.boolean().default(false),
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    ry: t.float32().default(0),
    t: t.float64().default(0),       // when they were there (server ms)
    anim: t.uint8().default(0),      // 0 idle, 1 run, 2 air
    lv: t.uint16().default(1),
    wins: t.float64().default(0),    // Wins collected
    world: t.uint8().default(0),
    stack: t.uint8().default(0),     // the little keyboards on their back
    bt: t.uint8().default(0),        // their best keyboard (the stack's colour)
    team: t.string().default(''),    // their Keypals
    av: t.string().default(''),      // packed Bloxity avatar (equipped ids + proportions)
}, 'PlayerState');

export const GameState = schema({
    now: t.float64().default(0),     // the server's clock, every patch
    players: t.map(PlayerState),
}, 'GameState');
