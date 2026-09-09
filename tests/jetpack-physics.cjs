const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('./vendor/three.test.js');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function fn(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return '';
  const end = source.slice(start).search(/\n\}/);
  assert.ok(end >= 0, `Cannot extract ${name}`);
  return source.slice(start, start + end + 2);
}
function game() {
  const marks = [];
  const context = vm.createContext({
    THREE, console, atob,
    PHOENIX_SKINNED_ASSET: JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'phoenix_skinned_asset.json'), 'utf8')),
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    player: { velocity: new THREE.Vector3() }, world: { gravity: new THREE.Vector3(0, -19, 0) },
    state: { time: 0, alertLevel: 0, alertUntil: 0, weapon: 0 },
    cfg: { blood: true }, cheats: { predictLead: true }, weapons: [{ speed: 340, gravity: 2.2 }],
    SPAWN: new THREE.Vector3(0, 40, 0),
    bloodMark: e => marks.push({ x: e.pos.x, y: e.groundY, z: e.pos.z }),
    sound: { ready: () => false },
    clamp: (x, lo, hi) => Math.max(lo, Math.min(hi, x)),
    mix: (a, b, t) => a + (b - a) * t,
    smoothstep: t => t * t * (3 - 2 * t),
    random: () => 0.47, rnd: (a, b) => a + (b - a) * 0.47,
    blocked: () => true,
  });
  const geometryStart = source.indexOf('const enemyRifleGeo=');
  const geometryEnd = source.indexOf('function createPhoenixSkeleton()', geometryStart);
  const jetStart = source.indexOf('// --- Jetpack flight physics');
  const jetEnd = source.indexOf('// --- Placement', jetStart);
  vm.runInContext(`
    const enemies=[], squads=[], solids=[];
    const CELL=72,GRID_SPAN=1<<12,solidGrid=new Map(),queryResult=[];
    let queryStamp=0;
    const slab={enter:0,exit:1},BODY_RADIUS=.55,freePoint={x:0,z:0};
    const VIEW_RANGE=92,VIEW_COS=Math.cos(1.0);
    const phoenixMaterial=new THREE.MeshPhongMaterial();
    ${source.slice(geometryStart, geometryEnd)}
    ${['cellKey','registerSolid','collectSolids','collectAlongSegment','segmentBox','createPhoenixSkeleton','addEnemy','roofFree','pushOutOfProps','roofSpot','pickGoal','stepEnemies','poseEnemy','resetEnemies','getCompensatedTarget'].map(fn).join('\n')}
    ${jetStart < 0 ? '' : source.slice(jetStart, jetEnd)}
    globalThis.api={enemies,squads,addEnemy,registerSolid,stepEnemies,poseEnemy,resetEnemies,getCompensatedTarget,
      equipJetpackPatrols:typeof equipJetpackPatrols==='function'?equipJetpackPatrols:null,
      stepJetpack:typeof stepJetpack==='function'?stepJetpack:null,
      startJetpackDeath:typeof startJetpackDeath==='function'?startJetpackDeath:null,
      updateAirborneHitboxes:typeof updateAirborneHitboxes==='function'?updateAirborneHitboxes:null};
  `, context);
  const api = context.api;
  api.context = context;
  api.marks = marks;
  context.camera.position.set(10000, 10000, 10000);
  api.solid = (min, max) => api.registerSolid({ userData: {
    bounds: new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)), surface: 'concrete', stamp: -1,
  } });
  api.guard = (x = 0, z = 0, hvt = false, hero = true) => {
    const roof = { x, z, w: 40, d: 40, h: 10, hero, obstacles: [] };
    const squad = { id: api.squads.length, roof, members: [], alert: 0, alertUntil: 0, called: false };
    api.squads.push(squad);
    return api.addEnemy(squad, x, 10, z, hvt, api.enemies.length + 1);
  };
  api.flyer = () => {
    for (let i = 0; i < 4; i++) api.guard(i * 70, -60);
    assert.equal(typeof api.equipJetpackPatrols, 'function', 'Jetpack escorts have not been implemented');
    api.equipJetpackPatrols();
    return api.enemies.find(e => e.jetpack);
  };
  api.advance = (e, seconds, moveX = 0, moveZ = 0) => {
    for (let i = 0; i < Math.round(seconds * 120); i++) {
      context.state.time += 1 / 120;
      api.stepJetpack(e, 1 / 120, moveX, moveZ);
    }
  };
  return api;
}

test('equips exactly four existing escorts without converting contract targets', () => {
  const g = game();
  const target = g.guard(0, -20, true);
  for (let i = 0; i < 7; i++) g.guard(i * 50, -70);
  assert.equal(typeof g.equipJetpackPatrols, 'function', 'Jetpack selection is missing');
  g.equipJetpackPatrols();
  assert.equal(g.enemies.length, 8);
  assert.equal(g.enemies.filter(e => e.jetpack).length, 4);
  assert.ok(!target.jetpack);
});

test('thrust raises an escort under gravity and patrol stays above its roof', () => {
  const g = game(), e = g.flyer();
  e.pos.y = 10.02;
  g.solid([-25, 0, -85], [25, 10, -35]);
  g.advance(e, 6);
  assert.ok(e.pos.y >= 20 && e.pos.y <= 28.2, `Expected controlled flight, got y=${e.pos.y}`);
  const start = e.pos.clone();
  for (let i = 0; i < 120 * 30; i++) {
    g.context.state.time += 1 / 120;
    g.stepEnemies(1 / 120);
    assert.ok(e.pos.y >= 19.5 && e.pos.y <= 28.5);
    assert.ok(Math.abs(e.pos.x) < 19 && Math.abs(e.pos.z + 60) < 19);
  }
  assert.ok(e.pos.distanceTo(start) > 1, 'The flyer must actually patrol');
});

test('swept body collision stops a fast flyer at a thin wall', () => {
  const g = game(), e = g.flyer();
  g.solid([4, 0, -85], [4.1, 60, -35]);
  e.jetpack.velocity.x = 1200;
  g.advance(e, 1 / 120);
  assert.ok(e.pos.x <= 3.49 && e.pos.x >= 0, `Flyer crossed wall: x=${e.pos.x}`);
  assert.equal(e.jetpack.velocity.x, 0);
});

test('vertical sweep prevents thrust from carrying the body through a ceiling', () => {
  const g = game(), e = g.flyer();
  e.pos.y = 20;
  e.goal.y = 28;
  g.solid([-25, 23, -85], [25, 23.1, -35]);
  g.advance(e, 4);
  assert.ok(e.pos.y + 1.82 <= 23.001, `Flyer crossed ceiling: feet=${e.pos.y}`);
});

test('destroyed jetpack cuts thrust and the body accelerates under world gravity', () => {
  const g = game(), e = g.flyer();
  e.pos.y = 50;
  e.alive = false;
  assert.equal(g.startJetpackDeath(e, { velocity: new THREE.Vector3(0, 0, -100) }), true);
  g.advance(e, 0.5);
  assert.ok(Math.abs(e.jetpack.velocity.y + 9.5) < 0.01);
  assert.ok(e.pos.y > 47.5 && e.pos.y < 47.7);
  assert.equal(g.marks.length, 0, 'Airborne deaths must not paint the old rooftop');
});

test('dead flyer contacts the actual roof and leaves exactly one blood mark there', () => {
  const g = game(), e = g.flyer();
  g.solid([-25, 0, -85], [25, 10, -35]);
  e.pos.y = 80;
  e.alive = false;
  g.startJetpackDeath(e, { velocity: new THREE.Vector3(0, 0, -100) });
  for (let i = 0; i < 120 * 6; i++) {
    g.context.state.time += 1 / 120;
    g.stepEnemies(1 / 120);
    g.updateAirborneHitboxes();
  }
  assert.equal(e.jetpack.landed, true);
  assert.ok(Math.abs(e.pos.y - 10) < 0.01);
  assert.ok(Math.abs(e.groundY - 10) < 0.01);
  assert.equal(g.marks.length, 1);
  assert.ok(Math.abs(g.marks[0].y - 10) < 0.01);
  assert.ok(Math.abs(e.mesh.position.y - e.pos.y) < 0.001);
});

test('restart restores aerial spawn and clears velocity, damage, and falling state', () => {
  const g = game(), e = g.flyer(), spawn = e.pos.clone();
  e.alive = false;
  e.hp = 0;
  g.startJetpackDeath(e, { velocity: new THREE.Vector3(100, 0, 0) });
  g.advance(e, 1);
  g.resetEnemies();
  assert.ok(e.alive);
  assert.equal(e.hp, 100);
  assert.ok(e.pos.distanceTo(spawn) < 0.001);
  assert.equal(e.jetpack.velocity.length(), 0);
  assert.equal(e.jetpack.falling, false);
  assert.equal(e.jetpack.bloodOnLanding, false);
});

test('airborne hitbox refresh follows physical translation and prediction includes vertical speed', () => {
  const g = game(), e = g.flyer();
  g.updateAirborneHitboxes();
  const before = e.head.clone();
  e.pos.y += 7;
  g.updateAirborneHitboxes();
  assert.ok(Math.abs(e.head.y - before.y - 7) < 0.001);
  e.vy = 3;
  g.context.camera.position.set(0, e.head.y, 0);
  const target = g.getCompensatedTarget(e, { speed: 340, gravity: 2.2 });
  assert.ok(target.hitPos.y > e.head.y + 0.4, 'Prediction ignores vertical target velocity');
});
