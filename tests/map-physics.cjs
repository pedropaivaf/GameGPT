const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const THREE = require('./vendor/three.test.js');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Production function ${name} must exist`);
  let depth = 0;
  const body = html.indexOf('{', start);
  for (let i = body; i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
    if (html[i] !== '}') continue;
  }
  throw new Error(`Unclosed function ${name}`);
}

function harness() {
  const context = vm.createContext({THREE, console});
  vm.runInContext(`
    const CELL=72,GRID_SPAN=1<<12,solids=[],solidGrid=new Map();
    let queryStamp=0;const queryResult=[],slab={enter:0,exit:1};
    const rayHit={point:new THREE.Vector3(),normal:new THREE.Vector3()};
    const activeBodies=new Set(),world={bodies:[],removeBody(body){this.bodies=this.bodies.filter(b=>b!==body);}};
    const grapple={mode:'idle',object:null};
    function detach(){grapple.mode='idle';grapple.object=null;}
    function surfaceEffect(){} function emitGlassShards(){} function notify(){}
    const sound={surface(){}};
  `, context);
  for (const name of ['cellKey','registerSolid','collectSolids','collectAlongSegment','segmentBox','addSolid','castCity','thicknessAt']) {
    vm.runInContext(functionSource(name), context);
  }
  if (html.includes('function breakGlass(')) vm.runInContext(functionSource('breakGlass'), context);
  vm.runInContext(functionSource('penetrate'), context);
  return context;
}

// Catches a broken pane still obstructing bullets, vision and grapple rays.
test('a disabled solid exposes the wall behind it to city raycasts', () => {
  const context = harness();
  const distance = vm.runInContext(`
    const pane=addSolid(4,3,.06,0,1,2,'glass',false);
    addSolid(4,3,.3,0,1,5,'concrete',false);
    pane.userData.disabled=true;
    castCity(0,1,0,0,0,1,10).distance;
  `, context);
  assert.equal(distance, 4.85);
});

// Catches penetration that makes noise but leaves the pane and grapple intact.
test('a shot through breakable glass removes the pane and its attached cable', () => {
  const context = harness();
  const result = vm.runInContext(`
    const pane=addSolid(4,3,.06,0,1,2,'glass',false);
    pane.userData.breakable=true;pane.userData.mesh=new THREE.Mesh();
    grapple.mode='attached';grapple.object=pane;
    const round={kind:'sniper',layers:0,velocity:new THREE.Vector3(0,0,340)};
    const passed=penetrate(round,pane,new THREE.Vector3(0,1,1.97),new THREE.Vector3(0,0,1));
    ({passed,disabled:!!pane.userData.disabled,visible:pane.userData.mesh.visible,attached:grapple.mode});
  `, context);
  assert.equal(result.passed, true);
  assert.equal(result.disabled, true);
  assert.equal(result.visible, false);
  assert.equal(result.attached, 'idle');
});

function mapHarness() {
  const context = harness();
  vm.runInContext(`
    const CANNON={Vec3:THREE.Vector3,Box:class{constructor(halfExtents){this.halfExtents=halfExtents;}},Body:class{constructor(options){Object.assign(this,options);}computeAABB(){}updateBoundingRadius(){}}};
    const scene=new THREE.Scene(),buckets=new Map();
    const concreteMat=new THREE.MeshStandardMaterial(),steel=new THREE.MeshStandardMaterial(),dark=new THREE.MeshStandardMaterial(),woodMat=new THREE.MeshStandardMaterial(),markerMat=new THREE.MeshStandardMaterial();
    const scaffoldStats={decks:[],stairs:[],routes:[],entrances:[]};
    const roofDefs=[{x:0,z:0,w:46,d:44,h:160},{x:-75,z:-75,w:42,d:38,h:133,target:1},{x:75,z:-150,w:46,d:44,h:119,target:2},{x:-75,z:-225,w:46,d:44,h:139,target:3},{x:75,z:-75,w:30,d:28,h:145},{x:0,z:-150,w:32,d:32,h:114}];
    const roofs=roofDefs.map(r=>({...r,h:r.h+.08,obstacles:[]}));
  `, context);
  for(const name of ['bucketFor','accQuad','accBox','staticBox','scaffoldFloor','scaffoldDeck','scaffoldStairs','buildScaffoldNetwork']) vm.runInContext(functionSource(name),context);
  vm.runInContext('buildScaffoldNetwork();',context);
  return context;
}

// Catches a disconnected stair landing or missing link to an objective roof.
test('all six roof access landings connect through walkable scaffold surfaces', () => {
  const context=mapHarness();
  const result=vm.runInContext(`({floors:scaffoldStats.decks.map(s=>({min:s.userData.bounds.min.toArray(),max:s.userData.bounds.max.toArray()})),entries:scaffoldStats.entrances.map(e=>({roof:e.roof,floor:scaffoldStats.decks.indexOf(e.solid)})),steps:scaffoldStats.stairs.map(s=>s.rise),solidCount:solids.length})`,context);
  const visited=new Set([result.entries[0].floor]),queue=[result.entries[0].floor];
  while(queue.length){
    const a=result.floors[queue.shift()];
    for(let i=0;i<result.floors.length;i++){
      if(visited.has(i))continue;const b=result.floors[i];
      if(Math.abs(a.max[1]-b.max[1])>.281)continue;
      if(a.max[0]<b.min[0]-.025||b.max[0]<a.min[0]-.025||a.max[2]<b.min[2]-.025||b.max[2]<a.min[2]-.025)continue;
      visited.add(i);queue.push(i);
    }
  }
  assert.equal(result.entries.length,6);
  for(const entry of result.entries)assert.ok(visited.has(entry.floor),`Unreachable roof ${entry.roof}`);
  assert.ok(result.steps.every(rise=>rise>0&&rise<=.28));
  assert.ok(result.solidCount<1000,`Unexpected scaffold collider growth: ${result.solidCount}`);
  console.log(`Scaffold: ${result.floors.length} floor solids, ${result.steps.length} steps, ${result.solidCount} total colliders`);
});
