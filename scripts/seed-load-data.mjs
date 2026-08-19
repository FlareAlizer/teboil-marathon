// Наполняем базу объёмом заведомо больше реального мероприятия и смотрим,
// не деградируют ли запросы, от которых зависит экран на площадке.
import Database from 'better-sqlite3';
const db = new Database('data/teboil.db');
db.pragma('journal_mode = WAL');

const PLAYERS = 5000;
const EVENTS_PER = 8;
const acts = ['quiz_roulette_v1','quiz_roulette_v2','sport_keepups','sport_obstacle','sport_goal','sport_darts','manual'];
const day = new Date().toISOString().slice(0,10);

const insP = db.prepare('INSERT OR IGNORE INTO players (nickname, nickname_key, created_at, event_day) VALUES (?,?,?,?)');
const insV = db.prepare('INSERT OR IGNORE INTO visits (player_id, event_day, created_at) VALUES (?,?,?)');
const insE = db.prepare('INSERT INTO score_events (player_id, activity, points, raw_result, meta, created_at, created_by) VALUES (?,?,?,?,?,?,?)');

const t = Date.now();
db.transaction(() => {
  for (let i = 0; i < PLAYERS; i++) {
    const n = `load_user_${i}`;
    const r = insP.run(n, n, `${day} 10:00:00`, day);
    const id = Number(r.lastInsertRowid) || i + 1;
    insV.run(id, day, `${day} 10:00:00`);
    for (let e = 0; e < EVENTS_PER; e++) {
      const a = acts[e % acts.length];
      insE.run(id, a, 5 + (e * 7) % 40, null,
        JSON.stringify({kind:'answer',correct:e%2===0,level:(e%3)+1}),
        `${day} 1${e%9}:0${e%6}:00`, 'auto');
    }
  }
})();
console.log(`наполнено за ${((Date.now()-t)/1000).toFixed(1)}с`);
const c = db.prepare('SELECT (SELECT COUNT(*) FROM players) p, (SELECT COUNT(*) FROM score_events) e').get();
console.log(`участников: ${c.p}, начислений: ${c.e}`);
db.close();
