import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ========= 基礎場景 ========= */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x02030a, 0.0009);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100000);
camera.position.set(0, 8, 36);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxDistance = 8000;
controls.minDistance = 2;

const hemi = new THREE.HemisphereLight(0xa0c9ff, 0x0b0d20, 0.25);
scene.add(hemi);

const ANIMATORS = []; // 每幀更新的函式們

/* ========= 工具：隨機數（種子化） ========= */
function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1^h2^h3^h4)>>>0, (h2^h1)>>>0, (h3^h1)>>>0, (h4^h1)>>>0];
}
function sfc32(a, b, c, d) {
  return function() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; 
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21 | c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
}
function makeRNG(seedStr){
  const s = cyrb128(seedStr);
  return sfc32(s[0], s[1], s[2], s[3]);
}
function pick(rng, arr){ return arr[Math.floor(rng()*arr.length)]; }

function getSeedFromURL(){
  const u = new URL(window.location.href);
  const s = u.searchParams.get('seed');
  if (s) return s;
  const auto = Math.floor((Date.now()%1e10) + Math.random()*1e6).toString(36);
  u.searchParams.set('seed', auto);
  history.replaceState({}, '', u);
  return auto;
}
let seed = getSeedFromURL();
let rng = makeRNG(seed);
document.getElementById('seedDisplay').textContent = `(seed=${seed})`;

/* ========= 背景：星場與遠方星雲 ========= */
function createStarField(count=90000, spread=8000){
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i=0;i<count;i++){
    positions[i*3+0] = (rng()-0.5) * spread;
    positions[i*3+1] = (rng()-0.5) * spread * 0.65;
    positions[i*3+2] = (rng()-0.5) * spread;
    // 些許色溫差異
    const tint = 0.85 + rng()*0.15;
    colors[i*3+0] = 0.75 * tint;
    colors[i*3+1] = 0.82 * tint;
    colors[i*3+2] = 1.00 * tint;
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 1.1, sizeAttenuation: true, vertexColors:true, transparent: true, opacity: 0.85, depthWrite: false });
  const points = new THREE.Points(geom, mat);
  points.frustumCulled = false;
  scene.add(points);
}

function createDistantNebula(){
  const tex = makeRadialTex('#7ae1ff', 0.0, 0.10);
  const mat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite:false, transparent:true, opacity: 0.15 });
  for(let i=0;i<60;i++){
    const s = 1200 + rng()*2400;
    const sp = new THREE.Sprite(mat.clone());
    sp.position.set((rng()-0.5)*5000, (rng()-0.5)*3000, (rng()-0.5)*5000);
    sp.scale.set(s, s, 1);
    scene.add(sp);
  }
}

createStarField();
createDistantNebula();

/* ========= 素材：簡易漸層貼圖 ========= */
function makeRadialTex(hex='#ffffff', inner=0.0, outer=1.0){
  const size = 256;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = size;
  const ctx = cvs.getContext('2d');
  const g = ctx.createRadialGradient(size/2,size/2, size*inner, size/2,size/2, size*outer);
  g.addColorStop(0, hex);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,size,size);
  const tex = new THREE.CanvasTexture(cvs);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ========= POI 資料 ========= */
let POIS = [];
async function loadData(){
  const res = await fetch('./data/galaxies.json');
  POIS = await res.json();
}
await loadData();

/* ========= 3D 擬真代理模型工廠 ========= */
function createSpiralGalaxy({radius=160, thickness=10, arms=2, starCount=12000, rot=0.0004}){
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(starCount*3);
  const colors = new Float32Array(starCount*3);
  for (let i=0;i<starCount;i++){
    const r = Math.pow(rng(), 0.35) * radius;
    const arm = Math.floor(rng()*arms);
    const angle = (r * 0.13) + arm*(Math.PI*2/arms) + rng()*0.2;
    const x = Math.cos(angle) * r;
    const y = (rng()-0.5) * thickness * (1 - r/radius);
    const z = Math.sin(angle) * r;
    positions.set([x,y,z], i*3);
    const cold = rng()<0.6;
    const c = cold ? [0.75,0.82,1.0] : [1.0,0.95,0.85];
    colors.set(c, i*3);
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions,3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors,3));
  const mat = new THREE.PointsMaterial({ size: 0.9, sizeAttenuation: true, vertexColors:true, transparent:true, opacity:0.95, depthWrite:false });
  const pts = new THREE.Points(geom, mat);
  // 中央核球
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeRadialTex('#ffffff',0.0,0.9), opacity:0.6, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending }));
  core.scale.set(70,70,1); pts.add(core);
  ANIMATORS.push((dt)=>{ pts.rotation.y += rot*dt; });
  return pts;
}

function createBinarySystem(){
  const grp = new THREE.Group();
  const r1 = 8 + rng()*5;
  const r2 = 6 + rng()*5;
  const colorA = new THREE.Color().setHSL(0.08 + rng()*0.05, 0.5, 0.6); // 黃白
  const colorB = new THREE.Color().setHSL(0.6 + rng()*0.05, 0.5, 0.65); // 淡藍
  const glowTex = makeRadialTex('#ffffff',0.0,0.9);
  function makeStar(radius, color){
    const g = new THREE.SphereGeometry(radius, 24, 24);
    const m = new THREE.MeshBasicMaterial({ color: color, transparent:true, opacity:0.95 });
    const s = new THREE.Mesh(g,m);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: color, blending:THREE.AdditiveBlending, transparent:true, opacity:0.5 }));
    glow.scale.set(radius*5, radius*5, 1); s.add(glow);
    return s;
  }
  const A = makeStar(r1, colorA), B = makeStar(r2, colorB);
  grp.add(A); grp.add(B);
  const sep = 60 + rng()*40;
  const w = 0.002 + rng()*0.0012;
  ANIMATORS.push((dt)=>{
    const t = performance.now()*w*0.06;
    A.position.set(Math.cos(t)*sep*0.5, 0, Math.sin(t)*sep*0.5);
    B.position.set(Math.cos(t+Math.PI)*sep*0.5, 0, Math.sin(t+Math.PI)*sep*0.5);
  });
  return grp;
}

function createTripleSystem(){
  const grp = new THREE.Group();
  const inner = createBinarySystem();
  grp.add(inner);
  // 外層第三星
  const r3 = 7 + rng()*4;
  const colorC = new THREE.Color().setHSL(0.02 + rng()*0.03, 0.6, 0.55); // 橙
  const g = new THREE.SphereGeometry(r3, 24,24);
  const m = new THREE.MeshBasicMaterial({ color: colorC });
  const C = new THREE.Mesh(g,m);
  const glowTex = makeRadialTex('#ffffff', 0.0, 0.9);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: colorC, blending:THREE.AdditiveBlending, transparent:true, opacity:0.5 }));
  glow.scale.set(r3*5, r3*5, 1); C.add(glow);
  grp.add(C);
  const R = 120 + rng()*80;
  const w = 0.0007 + rng()*0.0005;
  ANIMATORS.push((dt)=>{
    const t = performance.now()*w*0.06;
    C.position.set(Math.cos(t)*R, 0, Math.sin(t)*R);
  });
  return grp;
}

function createExoPlanet(){
  const grp = new THREE.Group();
  // 恆星
  const star = new THREE.Mesh(new THREE.SphereGeometry(10, 24,24), new THREE.MeshBasicMaterial({ color: 0xfff0c9 }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeRadialTex('#fff0c9',0.0,0.9), blending:THREE.AdditiveBlending, transparent:true, opacity:0.6 }));
  glow.scale.set(50,50,1); star.add(glow);
  grp.add(star);
  // 行星
  const planet = new THREE.Mesh(new THREE.SphereGeometry(4.7, 32,32), new THREE.MeshStandardMaterial({ color: 0x6da0ff, roughness:0.6, metalness:0.0 }));
  // 雲層
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(4.78, 24,24), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent:true, opacity:0.25, roughness:1, metalness:0 }));
  planet.add(clouds);
  grp.add(planet);
  const a = 60 + rng()*30; // 軌道半徑
  const w = 0.001 + rng()*0.0009;
  ANIMATORS.push((dt)=>{
    const t = performance.now()*w*0.06;
    planet.position.set(Math.cos(t)*a, 0, Math.sin(t)*a);
    clouds.rotation.y += 0.003*dt;
  });
  return grp;
}

function createBlackHole(){
  const grp = new THREE.Group();
  // 事件視界（黑色球）
  const hole = new THREE.Mesh(new THREE.SphereGeometry(12, 32,32), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  grp.add(hole);
  // 吸積盤（薄盤）
  const diskGeo = new THREE.RingGeometry(16, 70, 96, 1);
  // 製作放射性透明度與色彩的貼圖（簡化）
  const tex = makeAccretionTex();
  const diskMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent:true, opacity:0.9, depthWrite:false, blending:THREE.AdditiveBlending });
  const disk = new THREE.Mesh(diskGeo, diskMat);
  disk.rotation.x = Math.PI/2;
  grp.add(disk);
  // 對向噴流
  const jetGeom = new THREE.CylinderGeometry(1.2, 0.3, 240, 16, 1, true);
  const jetMat = new THREE.MeshBasicMaterial({ color: 0x9bd2ff, transparent:true, opacity:0.35, blending:THREE.AdditiveBlending, depthWrite:false });
  const jet1 = new THREE.Mesh(jetGeom, jetMat); jet1.position.y = 120; grp.add(jet1);
  const jet2 = new THREE.Mesh(jetGeom, jetMat); jet2.rotation.z = Math.PI; jet2.position.y = -120; grp.add(jet2);
  ANIMATORS.push((dt)=>{ disk.rotation.z += 0.002*dt; });
  return grp;
}
function makeAccretionTex(){
  const size = 512;
  const cvs = document.createElement('canvas'); cvs.width=cvs.height=size;
  const ctx = cvs.getContext('2d');
  const grad = ctx.createLinearGradient(0,0,size,0);
  grad.addColorStop(0.0,'rgba(20,40,120,0.0)');
  grad.addColorStop(0.15,'rgba(120,180,255,0.35)');
  grad.addColorStop(0.5,'rgba(255,220,160,0.55)');
  grad.addColorStop(0.85,'rgba(255,130,80,0.35)');
  grad.addColorStop(1.0,'rgba(40,10,5,0.0)');
  ctx.fillStyle = grad; ctx.fillRect(0,0,size,size);
  const tex = new THREE.CanvasTexture(cvs);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createEmissionNebula(){
  const grp = new THREE.Group();
  const sprite = new THREE.SpriteMaterial({ map: makeRadialTex('#b2f2ff',0.0,0.9), blending:THREE.AdditiveBlending, transparent:true, opacity:0.12, depthWrite:false });
  for (let i=0;i<120;i++){
    const s = 60 + rng()*160;
    const sp = new THREE.Sprite(sprite.clone());
    sp.position.set((rng()-0.5)*280, (rng()-0.5)*180, (rng()-0.5)*280);
    sp.scale.set(s, s, 1);
    grp.add(sp);
  }
  // 內部恆星群
  const stars = createSpiralGalaxy({ radius:80, thickness:18, arms:3, starCount:4000, rot:0.0007 });
  grp.add(stars);
  return grp;
}

function createComet(){
  const grp = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(3.5, 18,18), new THREE.MeshStandardMaterial({ color: 0xcfd7ff, roughness:0.8 }));
  grp.add(head);
  const tailCount = 2000;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(tailCount*3);
  for (let i=0;i<tailCount;i++){
    pos[i*3+0]=pos[i*3+1]=pos[i*3+2]=0;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  const m = new THREE.PointsMaterial({ size: 1.2, color: 0x9bd2ff, transparent:true, opacity:0.8, depthWrite:false, blending:THREE.AdditiveBlending });
  const tail = new THREE.Points(g,m);
  grp.add(tail);
  const vel = new THREE.Vector3(2 + rng()*1.5, 0, -4 - rng()*2);
  const origin = new THREE.Vector3(0,0,0);
  ANIMATORS.push((dt)=>{
    // 演化尾巴：簡單粒子位移與衰退
    const arr = tail.geometry.attributes.position.array;
    for (let i=arr.length-3;i>=3;i-=3){
      arr[i] = arr[i-3]*0.98;
      arr[i+1] = arr[i-2]*0.98;
      arr[i+2] = arr[i-1]*0.98;
    }
    // 新粒子在彗頭後方注入
    arr[0] = origin.x - vel.x*10 + (rng()-0.5)*5; 
    arr[1] = origin.y - vel.y*10 + (rng()-0.5)*3;
    arr[2] = origin.z - vel.z*10 + (rng()-0.5)*5;
    tail.geometry.attributes.position.needsUpdate = true;
    // 彗星前進
    origin.addScaledVector(vel, 0.1*dt);
    head.position.copy(origin);
    tail.position.copy(origin);
  });
  return grp;
}

/* ========= 建立 POI 實體、隨機路線 ========= */
const loader = new THREE.TextureLoader();
loader.crossOrigin = 'anonymous';

const NODES = []; // {group, data, position}
let curve = null;
let t = 0;               // [0,1] 曲線參數
let auto = true;         // 自動巡航
let speed = 0.00012;     // 巡航速度
let boosting = false;    // 加速狀態
const tmp = new THREE.Vector3();

async function buildSceneFromPOI(){
  // 清除舊內容（保留星場等背景）
  for (const n of NODES){ scene.remove(n.group); }
  NODES.length = 0;
  // 打亂 POI 順序
  const shuffled = [...POIS].sort(()=> rng()-0.5);
  // 為每個 POI 建立 3D 代理
  for (const p of shuffled){
    const group = new THREE.Group();
    let body = null;
    switch(p.kind){
      case 'galaxy': body = createSpiralGalaxy({ radius: 120 + rng()*80, thickness: 12 + rng()*18, arms: (rng()<0.5?2:3), starCount: 9000 + Math.floor(rng()*6000), rot: 0.0004+ rng()*0.0004 }); break;
      case 'binary': body = createBinarySystem(); break;
      case 'triple': body = createTripleSystem(); break;
      case 'exo': body = createExoPlanet(); break;
      case 'blackhole': body = createBlackHole(); break;
      case 'nebula': body = createEmissionNebula(); break;
      case 'comet': body = createComet(); break;
      default: body = new THREE.Group(); break;
    }
    group.add(body);
    // 隨機位置：沿 -Z 方向形成前進走廊
    const idx = NODES.length;
    const baseZGap = 1200 + rng()*400;
    const pos = new THREE.Vector3((rng()-0.5)*900, (rng()-0.5)*260, -idx*baseZGap - 600);
    group.position.copy(pos);
    scene.add(group);
    NODES.push({ group, data:p });
  }
  // 隨機化曲線控制點（可加入小偏移讓軌跡更自然）
  const pts = NODES.map(n => n.group.position.clone().add(new THREE.Vector3((rng()-0.5)*120, (rng()-0.5)*90, 0)));
  curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.12);
  t = 0; auto = true; boosting = false;
}

await buildSceneFromPOI();

/* ========= NASA Image API 僅供資訊卡 ========= */
async function searchNasaPreview(query, pageSize=1){
  const url = new URL('https://images-api.nasa.gov/search');
  url.searchParams.set('q', query);
  url.searchParams.set('media_type', 'image');
  url.searchParams.set('page_size', String(pageSize));
  const r = await fetch(url, { mode:'cors' });
  const j = await r.json();
  const items = j?.collection?.items || [];
  if (!items.length) return null;
  items.sort((a,b) => {
    const ad = (a.data?.[0]?.center || '') + ' ' + (a.data?.[0]?.title || '');
    const bd = (b.data?.[0]?.center || '') + ' ' + (b.data?.[0]?.title || '');
    const score = (s)=> (/(HUBBLE|WEBB|JWST|HST|ESA|GSFC|JPL|CHANDRA)/i.test(s) ? 1 : 0);
    return score(bd) - score(ad);
  });
  const first = items[0];
  const data = first.data?.[0] || {};
  const previewLink = (first.links || []).find(l => l.rel === 'preview' && l.render === 'image')?.href || first.href;
  let hd = null;
  try{
    const assetRes = await fetch(`https://images-api.nasa.gov/asset/${encodeURIComponent(data.nasa_id)}`);
    const assetJson = await assetRes.json();
    const files = assetJson?.collection?.items || [];
    const candidates = files.map(f => f.href).filter(h => /~(large|orig)\.(jpg|jpeg|png|tif)$/i.test(h));
    hd = candidates[0] || files.map(f => f.href).find(h => /\.(jpg|jpeg|png)$/i.test(h)) || null;
  }catch(e){ /* ignore */ }
  return { nasa_id: data.nasa_id, title: data.title, description: data.description, preview: previewLink, original: hd };
}

/* ========= 互動與資訊面板 ========= */
const infoPanel = document.getElementById('infoPanel');
const objName = document.getElementById('objName');
const objSummary = document.getElementById('objSummary');
const objFacts = document.getElementById('objFacts');
const objImage = document.getElementById('objImage');
const nasaLink = document.getElementById('nasaLink');
const nasaHD = document.getElementById('nasaHD');
const eduMode = document.getElementById('eduMode');
document.getElementById('closePanel').onclick = ()=> infoPanel.classList.add('hidden');

function showInfo(node){
  const d = node.data;
  objName.textContent = d.name;
  objSummary.textContent = d.summary;
  objFacts.innerHTML = '';
  if (eduMode.checked && d.facts){
    for (const s of d.facts){
      const li = document.createElement('li');
      li.textContent = s; objFacts.appendChild(li);
    }
  }
  if (d._nasa?.preview){
    objImage.src = d._nasa.preview;
    objImage.alt = d._nasa.title || 'NASA 圖像';
    nasaLink.href = `https://images.nasa.gov/search?q=${encodeURIComponent(d.nasaSearch)}`;
    nasaHD.href = d._nasa.original || d._nasa.preview;
  }else{
    objImage.removeAttribute('src');
    nasaLink.href = `https://images.nasa.gov/search?q=${encodeURIComponent(d.nasaSearch)}`;
    nasaHD.href = `https://images.nasa.gov/search?q=${encodeURIComponent(d.nasaSearch)}`;
  }
  infoPanel.classList.remove('hidden');
}

function hideInfo(){ infoPanel.classList.add('hidden'); }

async function warmupNasaForNode(node){
  if (node.data._nasa || !node.data.nasaSearch) return;
  node.data._nasa = await searchNasaPreview(node.data.nasaSearch);
}

function checkPOIProximity(){
  const cam = camera.position;
  let nearest = null, minDist = Infinity;
  for (const node of NODES){
    const d = cam.distanceTo(node.group.position);
    if (d < minDist){ minDist = d; nearest = node; }
  }
  if (nearest && minDist < 260){
    // 預先查 NASA
    warmupNasaForNode(nearest);
    showInfo(nearest);
  }else{
    hideInfo();
  }
}

/* ========= 導覽與動畫 ========= */
function updateCameraAlongCurve(dt){
  if (!auto || !curve) return;
  t += (boosting ? speed*5 : speed) * dt;
  if (t > 0.999){ t = 0.999; auto = false; }
  const pos = curve.getPointAt(t);
  const next = curve.getPointAt(Math.min(0.999, t + 0.002));
  camera.position.lerp(pos, 0.2);
  camera.lookAt(next);
}

let last = performance.now();
function animate(){
  const now = performance.now();
  const dt = (now - last) / 16.67;
  last = now;

  for (const f of ANIMATORS) f(dt);
  updateCameraAlongCurve(dt);
  controls.update();
  checkPOIProximity();

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

/* ========= 事件 ========= */
window.addEventListener('resize', ()=>{
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
document.getElementById('toggleAuto').onclick = ()=> { auto = true; };
document.getElementById('toggleManual').onclick = ()=> { auto = false; };
document.getElementById('boost').onpointerdown = ()=> { boosting = true; };
document.getElementById('boost').onpointerup = ()=> { boosting = false; };
document.getElementById('restart').onclick = ()=> { t = 0; auto = true; boosting = false; camera.position.set(0,8,36); controls.update(); };
document.getElementById('newRoute').onclick = ()=> {
  // 重新取 seed、刷新 URL
  const newSeed = Math.floor((Date.now()%1e10) + Math.random()*1e6).toString(36);
  const u = new URL(window.location.href);
  u.searchParams.set('seed', newSeed);
  history.replaceState({}, '', u);
  seed = newSeed; rng = makeRNG(seed);
  document.getElementById('seedDisplay').textContent = `(seed=${seed})`;
  // 清空動畫器並重建
  ANIMATORS.length = 0;
  buildSceneFromPOI();
};

/* ========= 完整 ========= */
