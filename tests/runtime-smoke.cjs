// Integration tests against the real HTML, shaders, models, physics and local textures.
// Requires the development server at GAME_URL (default http://127.0.0.1:8765).
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let chromium;
// Playwright is not a project dependency; point PLAYWRIGHT_PATH at an install
// if it is not resolvable from here.
try { ({chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright')); }
catch (error) {
  console.error('Playwright nao encontrado. Instale com "npm i -D playwright"
' +
                'ou aponte PLAYWRIGHT_PATH para uma instalacao existente.');
  process.exit(1);
}
const root = path.join(__dirname, '..');
const url = (process.env.GAME_URL || 'http://127.0.0.1:8765') + '/index.html';
const output = path.join(__dirname, 'artifacts');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const marker = 'requestAnimationFrame(animate);\n}catch(error){';
assert(source.includes(marker), 'Test exposure point is present');
const exposed = source.replace(marker, `
window.__game={state,cfg,scene,camera,renderer,player,world,keys,enemies,hvts,solids,roofs,
  models,weaponRoot,weaponScene,weaponCamera,weaponMotion,weapons,
  updateCamera,updateViewModel,updateHUD,draw,simulateFrame,eliminate,restart,resetEnemies,respawn,
  stepEnemies,stepPlayer,poseAllEnemies,refreshColliders,collectSolids,castCity,penetrate,
  findGrappleSurface,fireHook,detach,damagePlayer,
  get flyerCount(){return typeof jetpackEnemies==='undefined'?0:jetpackEnemies.length;},
  get flyers(){return typeof jetpackEnemies==='undefined'?[]:jetpackEnemies;},
  get panes(){return typeof breakableGlass==='undefined'?[]:breakableGlass;}
};
${marker}`);
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 800}});
    const errors = [], badResources = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {if(response.status() >= 400) badResources.push(response.url());});
    await page.addInitScript(() => {window.requestAnimationFrame = () => 0;});
    await page.route('**/index.html', route => route.fulfill({contentType: 'text/html', body: exposed}));
    await page.route('**/log', route => route.fulfill({status: 204}));
    await page.goto(url, {waitUntil: 'networkidle', timeout: 60000});
    await page.waitForFunction(() => !!window.__game || !document.querySelector('#fatal').hidden, {}, {timeout: 60000});
    assert.equal(await page.locator('#fatal').isVisible(), false, await page.locator('#fatalMessage').textContent());
    const boot = await page.evaluate(() => ({enemies: __game.enemies.length, solids: __game.solids.length,
      flyers: __game.flyers.length, roofs: __game.roofs.length}));
    console.log('BOOT', JSON.stringify(boot));
    const mission = await page.evaluate(() => {
      const g=__game;g.state.phase='playing';g.cfg.blood=false;
      const b={velocity:new THREE.Vector3(0,0,-340),layers:0,kind:'sniper'};
      g.hvts.forEach(e=>g.eliminate(e,'head',e.head.clone(),b));
      for(let i=0;i<360;i++)g.simulateFrame(1/120);
      const milestone={won:g.state.won,phase:g.state.phase,hostiles:g.enemies.filter(e=>e.alive).length};
      const hp=g.state.playerHp;g.damagePlayer(10);
      const damageAfterContracts=g.state.playerHp<hp;
      g.enemies.filter(e=>e.alive).forEach(e=>g.eliminate(e,'head',e.head.clone(),b));
      return {milestone,damageAfterContracts,finalWon:g.state.won};
    });
    assert.equal(mission.milestone.won, false);
    assert.equal(mission.milestone.phase, 'playing');
    assert(mission.milestone.hostiles > 0);
    assert(mission.damageAfterContracts, 'Contracts must not accidentally enable invulnerability');
    assert(mission.finalWon);
    console.log('MISSION', JSON.stringify(mission));
    await page.evaluate(() => {
      const g=__game;g.resetEnemies();g.respawn();g.state.won=false;g.state.winAt=0;
      g.state.contractsComplete=false;g.state.playerHp=100;g.state.phase='playing';
      document.querySelector('#titleScreen').hidden=true;document.querySelector('#pauseScreen').hidden=true;
      document.querySelector('#hud').hidden=false;g.state.weapon=1;g.state.aim=true;
      g.state.ground=true;g.state.time=100;g.cfg.reducedMotion=true;
      for(let i=0;i<120;i++){g.updateCamera(1/120);g.updateViewModel(1/120);}
      g.draw(1/120);
    });
    fs.mkdirSync(output, {recursive: true});
    await page.screenshot({path: path.join(output, 'pistol-ads-wide.png')});
    const pose=await page.evaluate(()=>({fov:__game.weaponCamera.fov,root:__game.weaponRoot.position.toArray(),
      drawCalls:__game.renderer.info.render.calls,triangles:__game.renderer.info.render.triangles}));
    console.log('VIEWMODEL', JSON.stringify(pose));
    await page.setViewportSize({width: 555, height: 600});
    await page.evaluate(()=>{__game.updateViewModel(.05);__game.draw(.016);});
    await page.screenshot({path:path.join(output,'pistol-ads-tall.png')});
    assert.deepEqual(errors, [], 'No runtime exceptions');
    assert.deepEqual(badResources, [], 'All models, textures and libraries loaded');
    console.log('RUNTIME PASS');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
