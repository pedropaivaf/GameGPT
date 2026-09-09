// Run: node --test tests/mission-regression.cjs
// Regression: completing the three contracts must not end combat with living guards.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function implementation(name) {
  return source.match(new RegExp('^function ' + name + '\\([^]*?^}', 'm'))?.[0] || '';
}
function fixture() {
  const makeEnemy = (id, hvt) => ({id, hvt, alive: true, hp: 100, yaw: 0,
    pos: {x: 0, y: 100, z: 0}, deathPush: {set() {}}});
  const hvts = [1, 2, 3].map(id => makeEnemy(id, true));
  const enemies = [...hvts, makeEnemy(4, false), makeEnemy(5, false)];
  const context = {
    hvts, enemies, state: {phase: 'playing', won: false, contractsComplete: false,
      time: 42, elapsed: 42, winAt: 0, hits: 0, playerHp: 100},
    cfg: {blood: false}, v: {copy() {return this;}, normalize() {return this;}, x: 0, z: 1},
    camera: {position: {x: 0, y: 100, z: 0, distanceTo() {return 50;}}},
    sound: {impact() {}}, noticeDeath() {}, logEvent() {}, notify() {},
    startJetpackDeath() {return false;}, killfeed: []
  };
  vm.createContext(context);
  vm.runInContext(implementation('updateMissionProgress') + '\n' + implementation('eliminate'), context);
  const kill = enemy => context.eliminate(enemy, 'head', {}, {velocity: {}, layers: 0, kind: 'sniper'});
  return {context, kill, enemies, hvts};
}
test('three dead HVTs leave the mission running while guards remain alive', () => {
  const {context, kill, hvts} = fixture();
  hvts.forEach(kill);
  assert.equal(context.state.won, false, 'Contracts are an intermediate objective, not full victory');
  assert.equal(context.state.winAt, 0, 'Do not schedule a forced pause');
  assert.equal(context.state.phase, 'playing');
});
test('the last guard can complete the mission after the contracts', () => {
  const {context, kill, hvts, enemies} = fixture();
  hvts.forEach(kill);
  kill(enemies[3]);
  assert.equal(context.state.won, false);
  kill(enemies[4]);
  assert.equal(context.state.won, true);
  assert.equal(context.state.winAt, 44);
});
test('the last HVT completes a mission when the guards were eliminated first', () => {
  const {context, kill, enemies} = fixture();
  [enemies[3], enemies[4], enemies[0], enemies[1]].forEach(kill);
  assert.equal(context.state.won, false);
  kill(enemies[2]);
  assert.equal(context.state.won, true);
});
test('a repeated hit on a corpse cannot count twice or delay victory', () => {
  const {context, kill, enemies} = fixture();
  enemies.forEach(kill);
  context.state.time = 43;
  kill(enemies[4]);
  assert.equal(context.state.hits, 5);
  assert.equal(context.state.winAt, 44);
});
