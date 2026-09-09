const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const THREE = require('./vendor/three.test.js');

// Run the shipped loaders, hand rigs and animation against their embedded meshes.
// Only the browser renderer/audio are absent; transforms and projection are real.
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const section = (start, end) => {
  const from = html.indexOf(start), to = html.indexOf(end, from);
  assert(from >= 0 && to > from, `Missing view-model section: ${start}`);
  return html.slice(from, to);
};
const asset = name => JSON.parse(html.match(new RegExp(`^const ${name}=JSON.parse\\('(.+)'\\);`, 'm'))[1]);
const production = section('function weaponMesh(', 'const SNIPER_ASSET=') +
  section('const sniperMaterial=', '// Grapple.');
const create = new Function('THREE', 'ARM_ASSET', 'BERETTA_ASSET', 'SNIPER_ASSET', `
  const atob=s=>Buffer.from(s,'base64').toString('binary');
  const cfg={weaponFov:72,reducedMotion:true};
  const state={weapon:1,aim:false,reload:0,recoil:0,time:10,yaw:0,pitch:0,ground:true};
  const player={velocity:new THREE.Vector3()}, cheats={noRecoil:true};
  const weapons=[{ammo:8},{ammo:30}],sound={},weaponEnvironment=null,weaponArt={};
  const weaponRoot=new THREE.Group(),models=[],scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(76,16/9,.02,8);
  const weaponCamera=new THREE.PerspectiveCamera(cfg.weaponFov,16/9,.02,8);
  const dir=new THREE.Vector3(),v=new THREE.Vector3();
  const mix=(a,b,t)=>a+(b-a)*t,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const smoothstep=t=>(t=clamp(t,0,1),t*t*(3-2*t));
  const smootherstep=t=>(t=clamp(t,0,1),t*t*t*(t*(t*6-15)+10));
  const ramp=(x,a,b)=>smoothstep((x-a)/(b-a||1e-6)),rnd=(a,b)=>(a+b)/2;
  ${production}
  return {cfg,state,weapons,weaponRoot,weaponCamera,models,armGeometries,
    updateViewModel,beginReloadAnimation};
`);
const assets = ['ARM_ASSET', 'BERETTA_ASSET', 'SNIPER_ASSET'].map(asset);
const setup = () => create(THREE, ...assets);
const advance = (game, frames=120) => {
  for(let i=0;i<frames;i++){game.state.time+=1/60;game.updateViewModel(1/60);}
  game.weaponRoot.updateMatrixWorld(true);
  game.weaponCamera.updateMatrixWorld(true);
};
const meshPoints = (mesh, predicate=()=>true) => {
  const attribute=mesh.geometry.attributes.position,points=[];
  for(let i=0;i<attribute.count;i++){
    const local=new THREE.Vector3().fromBufferAttribute(attribute,i);
    if(predicate(local))points.push(local.applyMatrix4(mesh.matrixWorld));
  }
  return points;
};
const groupPoints = group => {
  const points=[];
  group.traverseVisible(node=>{if(node.isMesh)points.push(...meshPoints(node));});
  return points;
};
const projected = (game,points) => points.map(point=>point.clone().project(game.weaponCamera));
const screenBox = (game,points) => {
  const box=new THREE.Box3().setFromPoints(projected(game,points));
  return {left:(1+box.min.x)/2,right:(1+box.max.x)/2,top:(1-box.max.y)/2,bottom:(1-box.min.y)/2};
};
const assertWristConnected = hand => {
  const cuff=meshPoints(hand.sleeve,p=>p.z<-.20);
  const glove=meshPoints(hand.glove,p=>p.z>-.50);
  const distances=cuff.map(p=>Math.sqrt(Math.min(...glove.map(q=>p.distanceToSquared(q))))).sort((a,b)=>a-b);
  assert(distances.length>0 && glove.length>0,'Both real wrist seams exist');
  assert(distances[Math.floor(distances.length*.5)]<.012,'Median sleeve-to-glove seam gap stays under 12 mm');
  assert(distances[Math.floor(distances.length*.95)]<.022,'The cuff remains around the wrist');
};

test('pistol ADS shows the whole grip below centered iron sights at wide and tall aspects',()=>{
  const game=setup();game.state.aim=true;
  for(const aspect of [16/9,21/9,9/16])for(const fov of [68,72,90]){
    game.cfg.weaponFov=fov;game.weaponCamera.aspect=aspect;advance(game);
    const gun=game.models[1].userData.rig.slide.parent;
    const bounds=screenBox(game,groupPoints(gun));
    assert(bounds.top>.45 && bounds.top<.51,`Sights remain centered: ${JSON.stringify(bounds)}`);
    assert(bounds.bottom<.87,`Pistol grip stays inside the frame: ${JSON.stringify(bounds)}`);
    assert(bounds.bottom-bounds.top>.16,'Pistol remains large enough to read');
    assert(bounds.left>.25 && bounds.right<.75,'Pistol fits horizontally');
  }
});

test('both extended forearms stay visible, attached and ahead of the near plane during ADS',()=>{
  const game=setup();game.state.aim=true;advance(game);
  const rig=game.models[1].userData.rig;
  for(const aspect of [16/9,21/9,9/16]){
    game.weaponCamera.aspect=aspect;game.weaponCamera.updateProjectionMatrix();
    for(const hand of [rig.trigger,rig.support]){
      assert(hand.sleeveGroup.visible,'ADS must retain the sleeve');
      assertWristConnected(hand);
      const points=meshPoints(hand.sleeve);
      // The forearms are allowed to run past the camera -- that is how they
      // leave the bottom of the frame -- but most of each one has to stay in
      // front of it, which is what would catch an arm posed backwards.
      const ahead=points.filter(p=>p.z < -game.weaponCamera.near-.02);
      assert(ahead.length>points.length*.6,'Most of each forearm stays ahead of the near plane');
      const visible=projected(game,points).filter(p=>Math.abs(p.x)<1 && Math.abs(p.y)<1 && Math.abs(p.z)<1);
      assert(visible.length>points.length*.15,'A substantial forearm area must be on screen');
      assert(visible.some(p=>p.y<-.75),'Each forearm extends toward the lower edge');
    }
  }
});

test('deformed glove and sleeve normals follow the final triangle surfaces',()=>{
  const game=setup();
  for(const part of ['glove','sleeve'])for(const side of ['R','L']){
    const geometry=game.armGeometries[part][side],position=geometry.attributes.position;
    const normal=geometry.attributes.normal,indices=geometry.index.array;
    const sums=Array.from({length:position.count},()=>new THREE.Vector3());
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
    for(let i=0;i<indices.length;i+=3){
      const [ia,ib,ic]=[indices[i],indices[i+1],indices[i+2]];
      a.fromBufferAttribute(position,ia);b.fromBufferAttribute(position,ib);c.fromBufferAttribute(position,ic);
      const face=b.sub(a).cross(c.sub(a));
      sums[ia].add(face);sums[ib].add(face);sums[ic].add(face);
    }
    let worst=1;
    for(let i=0;i<sums.length;i++)if(sums[i].lengthSq()>1e-16){
      const actual=new THREE.Vector3().fromBufferAttribute(normal,i);
      assert(Math.abs(actual.length()-1)<.001,'Lighting normals remain normalized');
      worst=Math.min(worst,actual.dot(sums[i].normalize()));
    }
    assert(worst>.995,`${part} ${side}: stale normals disagree with reshaped surface (${worst})`);
  }
});

test('aim release, reload and weapon switching retain their hand and magazine animations',()=>{
  const game=setup();game.state.aim=true;advance(game);
  const rig=game.models[1].userData.rig;
  game.state.aim=false;advance(game);
  assert(game.weaponRoot.position.x>.1,'Hip pose returns to the right side');
  assertWristConnected(rig.trigger);assertWristConnected(rig.support);
  assert(screenBox(game,groupPoints(rig.slide.parent)).bottom<1,'Hip-fire grip remains in frame');
  game.state.reloadTotal=game.beginReloadAnimation(1,true);
  game.weapons[1].ammo=0;
  let magazineLeaves=false,handLeaves=false;
  for(let elapsed=0;elapsed<game.state.reloadTotal;elapsed+=1/60){
    game.state.reload=game.state.reloadTotal-elapsed;advance(game,1);
    magazineLeaves ||= !rig.magazine.visible;
    handLeaves ||= rig.support.position.distanceTo(rig.supportHome)>.05;
    assertWristConnected(rig.trigger);assertWristConnected(rig.support);
    for(const hand of [rig.trigger,rig.support])assert(hand.sleeveGroup.visible,'Reload keeps arms connected and visible');
  }
  assert(magazineLeaves && handLeaves,'Reload removes the magazine and moves its support hand');
  game.state.reload=0;game.weapons[1].ammo=30;advance(game);
  assert(rig.magazine.visible && rig.magazine.position.distanceTo(rig.magazineHome)<1e-8,'Magazine returns home');
  assert(rig.support.position.distanceTo(rig.supportHome)<1e-8,'Support hand returns to its grip');
  game.state.weapon=0;game.state.aim=true;advance(game);
  assert(game.models[0].visible && !game.models[1].visible,'Sniper becomes the active model');
  assert(Math.abs(game.weaponCamera.fov-game.cfg.weaponFov)<.02,'Sniper view-model FOV remains independent of scope zoom');
  game.state.weapon=1;advance(game);
  assert(game.models[1].visible && !game.models[0].visible,'Pistol becomes the active model again');
  assert(screenBox(game,groupPoints(rig.slide.parent)).bottom<.84,'Returning to aimed pistol preserves its framing');
});
