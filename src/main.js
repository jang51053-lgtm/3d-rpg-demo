import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { loadModel, loadTexture, loadSound } from './loaders.js';
import {
  MAP_SCALE,
  loadTerrain,
  terrainHeight,
  moveOnTerrain,
  canStand,
} from './terrain.js';

// =================================================================
// 경복궁 근정전 — 액션 RPG 프로토타입
// 이동 / 공격 / 구르기(4방향) / 돌진 / 방어 — 모두 모델 내장 애니메이션 사용
// =================================================================

// 맵: 근정전 STL + 미리 계산된 높이맵/장애물 마스크
const MAP_STL_URL = 'assets/models/geunjeongjeon.stl';
const MAP_JSON_URL = 'assets/models/geunjeongjeon.map.json';

// 캐릭터 모델: KayKit Adventurers - Knight (CC0)
const CHARACTER_MODEL_URL =
  'https://cdn.jsdelivr.net/gh/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0@main/addons/kaykit_character_pack_adventures/Characters/gltf/Knight.glb';
const CHARACTER_HEIGHT = 1.8;

const ANIM = {
  idle: 'Idle',
  run: 'Running_A',
  attack: '1H_Melee_Attack_Slice_Diagonal',
  attackAlt: '1H_Melee_Attack_Chop',
  charge: '1H_Melee_Attack_Stab',
  dodgeF: 'Dodge_Forward',
  dodgeB: 'Dodge_Backward',
  dodgeL: 'Dodge_Left',
  dodgeR: 'Dodge_Right',
  block: 'Blocking',
  blockHit: 'Block_Hit',
  hit: 'Hit_A',
  death: 'Death_A',
};

// 손에 들 장비 (모델에 포함된 무기/방패를 보이기/숨기기로 교체)
const EQUIP_NODES = [
  '1H_Sword',
  '1H_Sword_Offhand',
  '2H_Sword',
  'Badge_Shield',
  'Rectangle_Shield',
  'Round_Shield',
  'Spike_Shield',
];
const EQUIP_VISIBLE = new Set(['1H_Sword', 'Round_Shield']);

function equipGear(root) {
  EQUIP_NODES.forEach((name) => {
    const obj = root.getObjectByName(name);
    if (obj) obj.visible = EQUIP_VISIBLE.has(name);
  });
}

// ---------- Scene / Camera / Renderer ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1c2231);
scene.fog = new THREE.Fog(0x1c2231, 45, 120);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1000);
const CAMERA_OFFSET = new THREE.Vector3(0, 16, 11.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Lighting ----------
scene.add(new THREE.HemisphereLight(0x9fb0d0, 0x3a3630, 2.2));

const moonLight = new THREE.DirectionalLight(0xc8d8ff, 2.4);
moonLight.position.set(-10, 20, -10);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.camera.left = -45;
moonLight.shadow.camera.right = 45;
moonLight.shadow.camera.top = 45;
moonLight.shadow.camera.bottom = -45;
moonLight.shadow.camera.far = 90;
scene.add(moonLight);

const fillLight = new THREE.DirectionalLight(0xaebedd, 0.55);
fillLight.position.set(4, 10, 14);
scene.add(fillLight);

const torchLight = new THREE.PointLight(0xffb066, 3.2, 20, 2);
torchLight.position.set(0, 3, 0);
scene.add(torchLight);

// ---------- Floor ----------
function createCheckerTexture(colorA, colorB, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;
  ctx.fillStyle = colorA;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = colorB;
  ctx.fillRect(0, 0, half, half);
  ctx.fillRect(half, half, half, half);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const BOUND = 30; // 궁역 밖으로 나가지 않도록

// 마당 바닥 (박석 느낌)
const floorTex = createCheckerTexture('#57534b', '#4e4a43');
floorTex.repeat.set(70, 70);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(260, 260),
  new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.98 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
ground.receiveShadow = true;
scene.add(ground);

// ---------- 근정전 ----------
// 0=석재(월대·계단·기단)  1=목재(기둥·벽·단청)  2=지붕
const palaceMats = [
  new THREE.MeshStandardMaterial({ color: 0x8d8578, roughness: 0.96 }), // 화강암
  new THREE.MeshStandardMaterial({ color: 0x9c3b2c, roughness: 0.75 }), // 단청 기둥
  new THREE.MeshStandardMaterial({ color: 0x3f4550, roughness: 0.8 }),  // 기와
];
const roofMat = palaceMats[2];
const woodMat = palaceMats[1];
let palace = null;

// 지붕이 시야를 가릴 때 투명하게 처리할 범위 (월드 XZ)
const HALL_RECT = { x0: -17.5, x1: 17.5, z0: -14, z1: 13 };

Promise.all([
  new Promise((resolve, reject) => new STLLoader().load(MAP_STL_URL, resolve, undefined, reject)),
  fetch(MAP_JSON_URL).then((r) => r.json()),
])
  .then(([geometry, mapJson]) => {
    loadTerrain(mapJson);

    mapJson.groups.forEach((g) => geometry.addGroup(g.start, g.count, g.material));
    palace = new THREE.Mesh(geometry, palaceMats);
    palace.rotation.x = -Math.PI / 2; // Z-up → Y-up
    palace.scale.setScalar(MAP_SCALE);
    palace.castShadow = true;
    palace.receiveShadow = true;
    scene.add(palace);

    // 지형이 준비됐으니 캐릭터/적/아이템을 바닥에 앉힘
    player.position.y = terrainHeight(player.position.x, player.position.z);
    enemies.forEach((e) => {
      e.group.position.y = terrainHeight(e.group.position.x, e.group.position.z);
    });
    items.forEach((it) => {
      it.baseY = terrainHeight(it.mesh.position.x, it.mesh.position.z) + 0.7;
      it.mesh.position.y = it.baseY;
    });
    showToast('근정전에 도착했다');
  })
  .catch((err) => console.warn('맵을 불러오지 못했습니다:', err));

// ---------- 모델 로딩 실패 시 대체 캐릭터 ----------
function createBlockyHumanoid({ main = 0x3d6fb5, skin = 0xe0ac69, dark = 0x2c3e50 } = {}) {
  const group = new THREE.Group();
  const materials = [];

  function part(w, h, d, color, x, y, z) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    materials.push(mat);
  }

  function limb(w, h, d, color, x, y, z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.y = -h / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    materials.push(mat);
    return pivot;
  }

  part(0.52, 0.68, 0.3, main, 0, 1.06, 0);
  part(0.34, 0.34, 0.32, skin, 0, 1.57, 0);
  const armL = limb(0.15, 0.58, 0.17, main, -0.34, 1.36, 0);
  const armR = limb(0.15, 0.58, 0.17, main, 0.34, 1.36, 0);
  const legL = limb(0.19, 0.72, 0.21, dark, -0.14, 0.72, 0);
  const legR = limb(0.19, 0.72, 0.21, dark, 0.14, 0.72, 0);

  group.userData.limbs = { armL, armR, legL, legR };
  group.userData.materials = materials;
  return group;
}

function animateLimbs(rig, phase, amount) {
  if (!rig || !rig.userData.limbs) return;
  const { armL, armR, legL, legR } = rig.userData.limbs;
  const swing = Math.sin(phase) * amount;
  legL.rotation.x = swing;
  legR.rotation.x = -swing;
  armL.rotation.x = -swing * 0.8;
  armR.rotation.x = swing * 0.8;
}

// ---------- Player ----------
const player = new THREE.Group();
player.position.set(0, 0, 21); // 마당, 계단 앞
player.rotation.y = Math.PI;   // 근정전을 바라봄
scene.add(player);

const characterHolder = new THREE.Group();
player.add(characterHolder);

let playerRig = createBlockyHumanoid();
characterHolder.add(playerRig);

let mixer = null;
const actions = {};
let currentAction = null;

// ---------- 상태 머신 ----------
// locomotion | attack | roll | charge | block | hit | dead
let state = 'locomotion';
let stateTimer = 0;

const MOVE_SCALE = {
  locomotion: 1,
  block: 0.35,
  attack: 0.18,
  hit: 0.3,
  roll: 0,
  charge: 0,
  dead: 0,
};

function setState(name, duration = 0) {
  state = name;
  stateTimer = duration;
}

function playClip(name, { fade = 0.18, once = false, fitDuration = null } = {}) {
  const action = actions[name];
  if (!action) return null;
  if (!once && currentAction === action) return action;

  action.reset();
  action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
  action.clampWhenFinished = once;
  action.timeScale = fitDuration ? action.getClip().duration / fitDuration : 1;
  action.fadeIn(fade).play();
  if (currentAction && currentAction !== action) currentAction.fadeOut(fade);
  currentAction = action;
  return action;
}

const loadingEl = document.getElementById('loading');
let knightTemplate = null;
let knightClips = null;

loadModel(CHARACTER_MODEL_URL)
  .then((gltf) => {
    const model = gltf.scene;
    knightTemplate = model;
    knightClips = gltf.animations;

    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });
    equipGear(model);

    const box = new THREE.Box3().setFromObject(model);
    const height = box.max.y - box.min.y || 1;
    const scale = CHARACTER_HEIGHT / height;
    model.scale.setScalar(scale);
    model.position.y = -box.min.y * scale;

    characterHolder.remove(playerRig);
    playerRig = null;
    characterHolder.add(model);

    mixer = new THREE.AnimationMixer(model);
    gltf.animations.forEach((clip) => {
      actions[clip.name] = mixer.clipAction(clip);
    });
    playClip(ANIM.idle, { fade: 0 });

    spawnEnemies(true);
    loadingEl.classList.add('hidden');
  })
  .catch((err) => {
    console.warn('캐릭터 모델을 불러오지 못해 기본 캐릭터를 사용합니다:', err);
    spawnEnemies(false);
    loadingEl.classList.add('hidden');
  });

// ---------- 베기 궤적 이펙트 ----------
const slashGeo = new THREE.RingGeometry(0.8, 2.1, 32, 1, -Math.PI * 0.8, Math.PI * 0.62);
slashGeo.rotateX(-Math.PI / 2);
const slashMat = new THREE.MeshBasicMaterial({
  color: 0xfff2cc,
  transparent: true,
  opacity: 0,
  side: THREE.DoubleSide,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const slash = new THREE.Mesh(slashGeo, slashMat);
slash.position.y = 0.9;
slash.visible = false;
player.add(slash);

// 돌진 궤적 (앞으로 뻗는 빛줄기)
const trailGeo = new THREE.PlaneGeometry(1.1, 5);
trailGeo.rotateX(-Math.PI / 2);
trailGeo.translate(0, 0, 2.2);
const trailMat = new THREE.MeshBasicMaterial({
  color: 0xaad4ff,
  transparent: true,
  opacity: 0,
  side: THREE.DoubleSide,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const trail = new THREE.Mesh(trailGeo, trailMat);
trail.position.y = 0.5;
trail.visible = false;
player.add(trail);

// 방어 성공 시 번쩍이는 링
const guardGeo = new THREE.RingGeometry(0.75, 1.05, 28);
guardGeo.rotateX(-Math.PI / 2);
const guardMat = new THREE.MeshBasicMaterial({
  color: 0x9fd8ff,
  transparent: true,
  opacity: 0,
  side: THREE.DoubleSide,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const guardFx = new THREE.Mesh(guardGeo, guardMat);
guardFx.position.y = 1.0;
guardFx.visible = false;
player.add(guardFx);

// ---------- Enemies ----------
const enemies = [];
const ENEMY_SPOTS = [
  [-7, 10],   // 기단 앞 좌
  [7, 10],    // 기단 앞 우
  [-11, -2],  // 기단 좌측
  [11, -2],   // 기단 우측
  [-5, -11],  // 기단 뒤 좌
  [5, -11],   // 기단 뒤 우
];

function makeKnightClone() {
  const obj = skeletonClone(knightTemplate);
  obj.scale.copy(knightTemplate.scale);
  obj.position.y = knightTemplate.position.y;
  equipGear(obj);

  const materials = [];
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
      o.material = o.material.clone();
      o.material.color.setRGB(
        Math.min(1, o.material.color.r * 1.35 + 0.25),
        o.material.color.g * 0.5,
        o.material.color.b * 0.5
      );
      materials.push(o.material);
    }
  });

  const m = new THREE.AnimationMixer(obj);
  const acts = {};
  const wanted = [ANIM.idle, ANIM.run, ANIM.attackAlt, ANIM.death, ANIM.hit];
  knightClips.forEach((clip) => {
    if (wanted.includes(clip.name)) acts[clip.name] = m.clipAction(clip);
  });
  return { obj, mixer: m, actions: acts, materials };
}

function spawnEnemies(useModel) {
  ENEMY_SPOTS.forEach(([x, z]) => {
    let visual;
    if (useModel && knightTemplate) {
      const c = makeKnightClone();
      visual = { root: new THREE.Group(), mixer: c.mixer, actions: c.actions, materials: c.materials };
      visual.root.add(c.obj);
    } else {
      const rig = createBlockyHumanoid({ main: 0x8e2f2f, skin: 0xc98b6b, dark: 0x3a1f1f });
      const root = new THREE.Group();
      root.add(rig);
      visual = { root, mixer: null, actions: null, materials: rig.userData.materials, rig };
    }

    visual.root.position.set(x, 0, z);
    scene.add(visual.root);

    enemies.push({
      group: visual.root,
      mixer: visual.mixer,
      actions: visual.actions,
      current: null,
      materials: visual.materials,
      rig: visual.rig || null,
      hp: 40,
      alive: true,
      attackCd: 0.8 + Math.random() * 0.8,
      walkPhase: Math.random() * Math.PI * 2,
      hitFlash: 0,
      stagger: 0,
      busy: -1, // 공격/피격 모션 진행 중
      dieT: undefined,
    });
  });
  updateEnemyCount();
}

function enemyPlay(enemy, name, { once = false, fade = 0.2, fitDuration = null } = {}) {
  if (!enemy.actions) return;
  const action = enemy.actions[name];
  if (!action) return;
  if (!once && enemy.current === action) return;
  action.reset();
  action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
  action.clampWhenFinished = once;
  action.timeScale = fitDuration ? action.getClip().duration / fitDuration : 1;
  action.fadeIn(fade).play();
  if (enemy.current && enemy.current !== action) enemy.current.fadeOut(fade);
  enemy.current = action;
}

const enemyCountEl = document.getElementById('enemy-count');
function updateEnemyCount() {
  const left = enemies.filter((e) => e.alive).length;
  enemyCountEl.textContent = left;
  return left;
}
updateEnemyCount();

// ---------- Items ----------
const itemGeo = new THREE.IcosahedronGeometry(0.35, 0);
const itemMat = new THREE.MeshStandardMaterial({
  color: 0xffd166,
  emissive: 0x8a5a00,
  emissiveIntensity: 0.7,
});
const items = [];

function spawnItem(x, z, label, effect) {
  const mesh = new THREE.Mesh(itemGeo, itemMat);
  mesh.position.set(x, 0.7, z);
  scene.add(mesh);
  items.push({ mesh, label, effect, collected: false, baseY: 0.7 });
}

spawnItem(-13, 8, '체력 물약', 'hp');
spawnItem(0, -2, '마나 구슬', 'mp'); // 전각 내부
spawnItem(13, -10, '금화 주머니', null);

// ---------- HUD ----------
const toastEl = document.getElementById('toast');
let toastTimer = null;
function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1500);
}

const flashEl = document.getElementById('damage-flash');
let flashTimer = null;
function flashDamage() {
  flashEl.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => flashEl.classList.remove('show'), 90);
}

const MAX_HP = 100;
const MAX_MP = 100;
const MP_REGEN = 12;
let hp = MAX_HP;
let mp = MAX_MP;

const hpFill = document.getElementById('hp-fill');
const mpFill = document.getElementById('mp-fill');
function setHp(value) {
  hp = THREE.MathUtils.clamp(value, 0, MAX_HP);
  hpFill.style.width = `${(hp / MAX_HP) * 100}%`;
}
function setMp(value) {
  mp = THREE.MathUtils.clamp(value, 0, MAX_MP);
  mpFill.style.width = `${(mp / MAX_MP) * 100}%`;
}
setHp(hp);
setMp(mp);

// ---------- 상태 변수 ----------
const keys = new Set();
const moveDir = new THREE.Vector3();
const lastFacing = new THREE.Vector3(0, 0, 1);
const SPEED = 6.2;

// 구르기
const ROLL_DURATION = 0.5;
const ROLL_DISTANCE = 5.0;
const ROLL_COST = 25;
const ROLL_COOLDOWN = 0.8;
let rollT = -1;
let rollCooldownLeft = 0;
const rollDir = new THREE.Vector3();
const rollStart = new THREE.Vector3();
const rollCooldownEl = document.getElementById('roll-cooldown');

// 돌진
const CHARGE_DURATION = 0.42;
const CHARGE_DISTANCE = 7.5;
const CHARGE_COST = 30;
const CHARGE_COOLDOWN = 1.8;
const CHARGE_DAMAGE = 20;
const CHARGE_HIT_RADIUS = 1.7;
let chargeT = -1;
let chargeCooldownLeft = 0;
const chargeDir = new THREE.Vector3();
const chargeStart = new THREE.Vector3();
let chargeHitSet = new Set();
const chargeCooldownEl = document.getElementById('charge-cooldown');

// 공격
const ATTACK_COOLDOWN = 0.6;
const ATTACK_DURATION = 0.55;
const ATTACK_HIT_DELAY = 0.22;
const ATTACK_RANGE = 2.8;
const ATTACK_DAMAGE = 14;
let attackCooldownLeft = 0;
let pendingHit = -1;
let slashT = -1;
const attackCooldownEl = document.getElementById('attack-cooldown');

// 방어
const BLOCK_REDUCTION = 0.85; // 막으면 데미지 85% 감소
let blockHeld = false;
let guardT = -1;
const blockBtnEl = document.getElementById('skill-block');

// 이펙트
let trailT = -1;

// 적
const ENEMY_SPEED = 2.5;
const ENEMY_SIGHT = 26;
const ENEMY_ATTACK_RANGE = 1.9;
const ENEMY_DAMAGE = 9;
const ENEMY_ATTACK_CD = 1.5;

let camShake = 0;
const START_POS = new THREE.Vector3(0, 0, 21);

// ---------- Input ----------
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) tryRoll();
  }
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) tryCharge();
  if (e.code === 'KeyQ' && !e.repeat) blockHeld = true;
  if (e.code === 'KeyX' && !e.repeat) tryAttack();
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'KeyQ') blockHeld = false;
});
window.addEventListener('blur', () => {
  keys.clear();
  blockHeld = false;
});

// 마우스: 좌클릭 공격 / 우클릭 방어(홀드)
renderer.domElement.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (e.button === 0) tryAttack();
  if (e.button === 2) blockHeld = true;
});
window.addEventListener('pointerup', (e) => {
  if (e.button === 2) blockHeld = false;
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

// 화면 버튼
function bindButton(id, onDown, onUp) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('pressed');
    if (onDown) onDown();
  });
  const release = () => {
    el.classList.remove('pressed');
    if (onUp) onUp();
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointerleave', release);
  el.addEventListener('pointercancel', release);
}
bindButton('skill-attack', () => tryAttack());
bindButton('skill-roll', () => tryRoll());
bindButton('skill-charge', () => tryCharge());
bindButton('skill-block', () => { blockHeld = true; }, () => { blockHeld = false; });

// ---------- 액션 ----------
function canAct() {
  return state === 'locomotion' || state === 'block';
}

function tryRoll() {
  if (!canAct() || rollCooldownLeft > 0 || mp < ROLL_COST) return;
  rollDir.copy(moveDir.lengthSq() > 0 ? moveDir : lastFacing).normalize();
  rollStart.copy(player.position);
  rollT = 0;
  setMp(mp - ROLL_COST);
  rollCooldownLeft = ROLL_COOLDOWN;

  // 바라보는 방향 기준으로 4방향 구르기 중 하나 선택
  const facing = new THREE.Vector3(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
  const dot = facing.dot(rollDir);
  const cross = facing.z * rollDir.x - facing.x * rollDir.z;
  let clip = ANIM.dodgeF;
  if (dot > 0.5) {
    clip = ANIM.dodgeF;
    player.rotation.y = Math.atan2(rollDir.x, rollDir.z); // 앞구르기는 진행방향을 봄
    lastFacing.copy(rollDir);
  } else if (dot < -0.5) {
    clip = ANIM.dodgeB;
  } else {
    clip = cross > 0 ? ANIM.dodgeL : ANIM.dodgeR;
  }

  setState('roll', ROLL_DURATION);
  playClip(clip, { once: true, fade: 0.06, fitDuration: ROLL_DURATION });
}

function tryCharge() {
  if (!canAct() || chargeCooldownLeft > 0 || mp < CHARGE_COST) return;
  chargeDir.copy(moveDir.lengthSq() > 0 ? moveDir : lastFacing).normalize();
  chargeStart.copy(player.position);
  chargeT = 0;
  chargeHitSet = new Set();
  setMp(mp - CHARGE_COST);
  chargeCooldownLeft = CHARGE_COOLDOWN;
  lastFacing.copy(chargeDir);
  player.rotation.y = Math.atan2(chargeDir.x, chargeDir.z);

  trailT = 0;
  trail.visible = true;
  trailMat.opacity = 0.75;

  setState('charge', CHARGE_DURATION);
  playClip(ANIM.charge, { once: true, fade: 0.05, fitDuration: CHARGE_DURATION + 0.15 });
  camShake = Math.max(camShake, 0.2);
}

function tryAttack() {
  if (state !== 'locomotion' || attackCooldownLeft > 0) return;
  attackCooldownLeft = ATTACK_COOLDOWN;
  pendingHit = ATTACK_HIT_DELAY;
  setState('attack', ATTACK_DURATION);
  playClip(ANIM.attack, { once: true, fade: 0.06, fitDuration: ATTACK_DURATION });
}

function resolveAttackHit() {
  slashT = 0;
  slash.visible = true;
  slashMat.opacity = 0.9;
  slash.scale.setScalar(0.8);

  const facing = new THREE.Vector3(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
  let hitAny = false;
  enemies.forEach((enemy) => {
    if (!enemy.alive) return;
    const toEnemy = enemy.group.position.clone().sub(player.position);
    toEnemy.y = 0;
    const dist = toEnemy.length();
    if (dist > ATTACK_RANGE) return;
    toEnemy.normalize();
    if (facing.dot(toEnemy) < 0.25) return;
    damageEnemy(enemy, ATTACK_DAMAGE, toEnemy, 0.8);
    hitAny = true;
  });
  if (!hitAny) camShake = Math.max(camShake, 0.05);
}

function damageEnemy(enemy, amount, knockDir, knockDist = 0.8) {
  enemy.hp -= amount;
  enemy.hitFlash = 0.12;
  enemy.stagger = 0.3;
  camShake = Math.max(camShake, 0.28);

  if (knockDir) {
    moveOnTerrain(enemy.group, knockDir.x * knockDist, knockDir.z * knockDist, BOUND);
  }

  if (enemy.hp <= 0 && enemy.alive) {
    enemy.alive = false;
    enemy.dieT = 0;
    if (enemy.actions) enemyPlay(enemy, ANIM.death, { once: true, fade: 0.1 });
    const left = updateEnemyCount();
    if (left === 0) showToast('구역 정리 완료!');
  } else if (enemy.actions) {
    enemy.busy = 0.45;
    enemyPlay(enemy, ANIM.hit, { once: true, fade: 0.06, fitDuration: 0.45 });
  }
}

function damagePlayer(amount, fromPos) {
  if (state === 'roll' || state === 'dead') return; // 구르는 동안 무적

  // 앞에서 오는 공격만 막을 수 있음
  let blocked = false;
  if (state === 'block' && fromPos) {
    const facing = new THREE.Vector3(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
    const toAttacker = fromPos.clone().sub(player.position);
    toAttacker.y = 0;
    if (toAttacker.lengthSq() > 0 && facing.dot(toAttacker.normalize()) > 0.15) blocked = true;
  }

  if (blocked) {
    setHp(hp - amount * (1 - BLOCK_REDUCTION));
    playClip(ANIM.blockHit, { once: true, fade: 0.05, fitDuration: 0.4 });
    guardT = 0;
    guardFx.visible = true;
    guardMat.opacity = 0.9;
    guardFx.scale.setScalar(0.8);
    camShake = Math.max(camShake, 0.12);
  } else {
    setHp(hp - amount);
    flashDamage();
    camShake = Math.max(camShake, 0.35);
    if (hp > 0 && state === 'locomotion') {
      setState('hit', 0.35);
      playClip(ANIM.hit, { once: true, fade: 0.05, fitDuration: 0.35 });
    }
  }

  if (hp <= 0) {
    setState('dead', 1.6);
    playClip(ANIM.death, { once: true, fade: 0.1, fitDuration: 0.9 });
    showToast('쓰러졌다…');
  }
}

function respawn() {
  player.position.copy(START_POS);
  player.rotation.y = 0;
  setHp(MAX_HP);
  setMp(MAX_MP);
  setState('locomotion');
  currentAction = null;
  playClip(ANIM.idle, { fade: 0.1 });
  showToast('입구에서 다시 시작');
}

// ---------- Helpers ----------
function lerpAngle(a, b, t) {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// ---------- Camera ----------
camera.position.copy(player.position).add(CAMERA_OFFSET);
camera.lookAt(player.position);
const camTarget = new THREE.Vector3();

// ---------- Game loop ----------
const clock = new THREE.Clock();
let walkPhase = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  // ----- 입력 -----
  moveDir.set(0, 0, 0);
  if (keys.has('KeyW')) moveDir.z -= 1;
  if (keys.has('KeyS')) moveDir.z += 1;
  if (keys.has('KeyA')) moveDir.x -= 1;
  if (keys.has('KeyD')) moveDir.x += 1;
  if (moveDir.lengthSq() > 0) moveDir.normalize();
  const isMoving = moveDir.lengthSq() > 0;

  // ----- 상태 타이머 -----
  if (state !== 'locomotion' && state !== 'block') {
    stateTimer -= dt;
    if (stateTimer <= 0) {
      if (state === 'dead') {
        respawn();
      } else {
        setState('locomotion');
        currentAction = null;
      }
    }
  }

  // ----- 방어 상태 진입/해제 -----
  if (blockHeld && state === 'locomotion') setState('block');
  if (!blockHeld && state === 'block') {
    setState('locomotion');
    currentAction = null;
  }

  // ----- 구르기 (지형 충돌을 위해 프레임마다 조금씩 이동) -----
  if (rollT >= 0) {
    const prev = easeOut(Math.min(rollT, 1));
    rollT += dt / ROLL_DURATION;
    const step = (easeOut(Math.min(rollT, 1)) - prev) * ROLL_DISTANCE;
    moveOnTerrain(player, rollDir.x * step, rollDir.z * step, BOUND);
    if (!mixer && playerRig) characterHolder.rotation.x = Math.PI * 2 * easeOut(Math.min(rollT, 1));
    if (rollT >= 1) {
      rollT = -1;
      characterHolder.rotation.x = 0;
    }
  }

  // ----- 돌진 -----
  if (chargeT >= 0) {
    const prev = easeOut(Math.min(chargeT, 1));
    chargeT += dt / CHARGE_DURATION;
    const step = (easeOut(Math.min(chargeT, 1)) - prev) * CHARGE_DISTANCE;
    moveOnTerrain(player, chargeDir.x * step, chargeDir.z * step, BOUND);

    // 지나가면서 부딪히는 적에게 데미지 (적당 1회)
    enemies.forEach((enemy, idx) => {
      if (!enemy.alive || chargeHitSet.has(idx)) return;
      const d = enemy.group.position.clone().sub(player.position);
      d.y = 0;
      if (d.length() <= CHARGE_HIT_RADIUS) {
        chargeHitSet.add(idx);
        damageEnemy(enemy, CHARGE_DAMAGE, d.normalize(), 1.6);
      }
    });

    if (chargeT >= 1) chargeT = -1;
  }

  // ----- 일반 이동 -----
  const moveScale = MOVE_SCALE[state] ?? 1;
  if (isMoving && moveScale > 0) {
    lastFacing.copy(moveDir);
    const d = SPEED * moveScale * dt;
    moveOnTerrain(player, moveDir.x * d, moveDir.z * d, BOUND);
    // 방어 중에는 시선을 고정 (게걸음 + 4방향 구르기가 가능해짐)
    if (state !== 'block') {
      const target = Math.atan2(moveDir.x, moveDir.z);
      const turnRate = state === 'attack' ? 5 : 14;
      player.rotation.y = lerpAngle(player.rotation.y, target, 1 - Math.exp(-turnRate * dt));
    }
  }

  // ----- 지형 높이 따라가기 (계단·월대) -----
  const groundY = terrainHeight(player.position.x, player.position.z);
  player.position.y += (groundY - player.position.y) * (1 - Math.exp(-18 * dt));

  // ----- 공격 판정 타이밍 -----
  if (pendingHit >= 0) {
    pendingHit -= dt;
    if (pendingHit <= 0) {
      pendingHit = -1;
      resolveAttackHit();
    }
  }

  // ----- 캐릭터 애니메이션 -----
  if (mixer) {
    if (state === 'locomotion') {
      playClip(isMoving ? ANIM.run : ANIM.idle);
    } else if (state === 'block') {
      playClip(ANIM.block, { fade: 0.12 });
    }
    mixer.update(dt);
  } else if (playerRig) {
    walkPhase += dt * (isMoving ? 11 : 2.5);
    animateLimbs(playerRig, walkPhase, isMoving ? 0.75 : 0.12);
  }

  // ----- 이펙트 -----
  if (slashT >= 0) {
    slashT += dt / 0.22;
    const p = Math.min(slashT, 1);
    slashMat.opacity = 0.9 * (1 - p);
    slash.scale.setScalar(0.8 + p * 0.45);
    slash.rotation.y = -0.45 + p * 0.9;
    if (slashT >= 1) {
      slashT = -1;
      slash.visible = false;
    }
  }

  if (trailT >= 0) {
    trailT += dt / 0.35;
    const p = Math.min(trailT, 1);
    trailMat.opacity = 0.75 * (1 - p);
    trail.scale.set(1 - p * 0.3, 1, 1);
    if (trailT >= 1) {
      trailT = -1;
      trail.visible = false;
    }
  }

  if (guardT >= 0) {
    guardT += dt / 0.3;
    const p = Math.min(guardT, 1);
    guardMat.opacity = 0.9 * (1 - p);
    guardFx.scale.setScalar(0.8 + p * 0.7);
    if (guardT >= 1) {
      guardT = -1;
      guardFx.visible = false;
    }
  }

  // ----- 쿨다운 / 마나 -----
  if (rollCooldownLeft > 0) rollCooldownLeft = Math.max(0, rollCooldownLeft - dt);
  if (chargeCooldownLeft > 0) chargeCooldownLeft = Math.max(0, chargeCooldownLeft - dt);
  if (attackCooldownLeft > 0) attackCooldownLeft = Math.max(0, attackCooldownLeft - dt);
  if (state !== 'block') setMp(mp + MP_REGEN * dt); // 방어 중에는 마나 회복 정지
  rollCooldownEl.style.height = `${(rollCooldownLeft / ROLL_COOLDOWN) * 100}%`;
  chargeCooldownEl.style.height = `${(chargeCooldownLeft / CHARGE_COOLDOWN) * 100}%`;
  attackCooldownEl.style.height = `${(attackCooldownLeft / ATTACK_COOLDOWN) * 100}%`;
  blockBtnEl.classList.toggle('active', state === 'block');

  // ----- 적 -----
  enemies.forEach((enemy) => {
    const g = enemy.group;
    if (enemy.mixer) enemy.mixer.update(dt);

    if (!enemy.alive) {
      if (enemy.dieT !== undefined && enemy.dieT < 1) {
        enemy.dieT += dt / (enemy.mixer ? 1.6 : 0.4);
        const p = Math.min(enemy.dieT, 1);
        if (enemy.mixer) {
          if (p > 0.7) g.scale.setScalar(1 - (p - 0.7) / 0.3);
        } else {
          g.scale.setScalar(1 - p);
          g.rotation.z = p * 1.4;
          g.position.y = -p * 0.3;
        }
        if (p >= 1) scene.remove(g);
      }
      return;
    }

    if (enemy.hitFlash > 0) {
      enemy.hitFlash -= dt;
      const on = enemy.hitFlash > 0;
      enemy.materials.forEach((m) => {
        if (m.emissive) m.emissive.setHex(on ? 0x772222 : 0x000000);
      });
    }
    if (enemy.stagger > 0) enemy.stagger -= dt;

    // 지형 높이 따라가기
    const eY = terrainHeight(g.position.x, g.position.z);
    g.position.y += (eY - g.position.y) * (1 - Math.exp(-14 * dt));

    if (enemy.busy >= 0) {
      enemy.busy -= dt;
      if (enemy.busy < 0) enemy.current = null;
    }

    const toPlayer = player.position.clone().sub(g.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    const busy = enemy.busy >= 0;

    if (dist < ENEMY_SIGHT && dist > 0.01) {
      toPlayer.normalize();
      const targetRot = Math.atan2(toPlayer.x, toPlayer.z);
      g.rotation.y = lerpAngle(g.rotation.y, targetRot, 1 - Math.exp(-8 * dt));

      if (dist > ENEMY_ATTACK_RANGE && enemy.stagger <= 0 && !busy) {
        const s = ENEMY_SPEED * dt;
        moveOnTerrain(g, toPlayer.x * s, toPlayer.z * s, BOUND);
        if (enemy.mixer) enemyPlay(enemy, ANIM.run);
        else {
          enemy.walkPhase += dt * 9;
          animateLimbs(enemy.rig, enemy.walkPhase, 0.6);
        }
      } else {
        if (!busy) {
          if (enemy.mixer) enemyPlay(enemy, ANIM.idle);
          else {
            enemy.walkPhase += dt * 2.5;
            animateLimbs(enemy.rig, enemy.walkPhase, 0.12);
          }
        }
        enemy.attackCd -= dt;
        if (dist <= ENEMY_ATTACK_RANGE && enemy.attackCd <= 0 && !busy) {
          enemy.attackCd = ENEMY_ATTACK_CD;
          enemy.busy = 0.7;
          if (enemy.mixer) enemyPlay(enemy, ANIM.attackAlt, { once: true, fade: 0.08, fitDuration: 0.7 });
          else {
            enemy.walkPhase = 0;
            animateLimbs(enemy.rig, Math.PI / 2, 1.6);
          }
          damagePlayer(ENEMY_DAMAGE, g.position);
        }
      }
    } else if (!busy) {
      if (enemy.mixer) enemyPlay(enemy, ANIM.idle);
      else {
        enemy.walkPhase += dt * 2;
        animateLimbs(enemy.rig, enemy.walkPhase, 0.1);
      }
    }
  });

  // ----- 아이템 -----
  items.forEach((item) => {
    if (item.collected) return;
    item.mesh.rotation.y += dt * 1.6;
    item.mesh.position.y = item.baseY + Math.sin(clock.elapsedTime * 3) * 0.1;
    if (player.position.distanceTo(item.mesh.position) < 1.4) {
      item.collected = true;
      scene.remove(item.mesh);
      if (item.effect === 'hp') setHp(hp + 40);
      if (item.effect === 'mp') setMp(mp + 60);
      showToast(`아이템 획득: ${item.label}`);
    }
  });

  // ----- 지붕이 시야를 가리면 투명하게 -----
  if (palace) {
    const px = player.position.x;
    const pz = player.position.z;
    const hidden =
      px > HALL_RECT.x0 && px < HALL_RECT.x1 &&
      pz < HALL_RECT.z1 && pz + CAMERA_OFFSET.z > HALL_RECT.z0;
    const targetOpacity = hidden ? 0.32 : 1;
    const woodTarget = hidden ? 0.8 : 1;
    roofMat.opacity += (targetOpacity - roofMat.opacity) * (1 - Math.exp(-8 * dt));
    woodMat.opacity += (woodTarget - woodMat.opacity) * (1 - Math.exp(-8 * dt));
    roofMat.transparent = roofMat.opacity < 0.99;
    woodMat.transparent = woodMat.opacity < 0.99;
    roofMat.depthWrite = roofMat.opacity > 0.9;
  }

  // ----- 조명 / 카메라 -----
  torchLight.position.set(player.position.x, player.position.y + 3, player.position.z);

  camTarget.copy(player.position).add(CAMERA_OFFSET);
  camera.position.lerp(camTarget, 1 - Math.exp(-9 * dt));

  if (camShake > 0) {
    camShake = Math.max(0, camShake - dt * 1.6);
    camera.position.x += (Math.random() - 0.5) * camShake;
    camera.position.y += (Math.random() - 0.5) * camShake;
    camera.position.z += (Math.random() - 0.5) * camShake;
  }

  camera.lookAt(player.position.x, player.position.y + 1, player.position.z);

  renderer.render(scene, camera);
}

animate();
