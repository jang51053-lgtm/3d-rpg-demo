import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { loadModel, loadTexture, loadSound } from './loaders.js';

// =================================================================
// 던전 크롤러 프로토타입
// 쿼터뷰 고정 카메라 · WASD 이동 · Space 구르기 · 좌클릭(또는 화면 버튼) 공격
// =================================================================

// 캐릭터 모델: KayKit Adventurers - Knight (CC0)
// 검(1H_Sword)과 검 공격/회피 애니메이션이 모델에 포함되어 있습니다.
// 다른 모델을 쓰려면 이 주소만 바꾸면 됩니다.
const CHARACTER_MODEL_URL =
  'https://cdn.jsdelivr.net/gh/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0@main/addons/kaykit_character_pack_adventures/Characters/gltf/Knight.glb';
const CHARACTER_HEIGHT = 1.8;

// 사용할 애니메이션 이름
const ANIM = {
  idle: 'Idle',
  run: 'Running_A',
  attack: '1H_Melee_Attack_Slice_Diagonal',
  attackAlt: '1H_Melee_Attack_Chop',
  dodge: 'Dodge_Forward',
  death: 'Death_A',
};

// 손에 들려있는 장비 중 검만 남기고 나머지는 숨김
const EQUIP_NODES = [
  '1H_Sword',
  '1H_Sword_Offhand',
  '2H_Sword',
  'Badge_Shield',
  'Rectangle_Shield',
  'Round_Shield',
  'Spike_Shield',
];
const EQUIP_VISIBLE = new Set(['1H_Sword']);

function equipSwordOnly(root) {
  EQUIP_NODES.forEach((name) => {
    const obj = root.getObjectByName(name);
    if (obj) obj.visible = EQUIP_VISIBLE.has(name);
  });
}

// ---------- Scene / Camera / Renderer ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14161f);
scene.fog = new THREE.Fog(0x14161f, 24, 55);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
const CAMERA_OFFSET = new THREE.Vector3(0, 11.5, 8);

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
scene.add(new THREE.HemisphereLight(0x8899bb, 0x2a2a30, 1.7));

const moonLight = new THREE.DirectionalLight(0xbcd0ff, 1.9);
moonLight.position.set(-10, 20, -10);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.camera.left = -25;
moonLight.shadow.camera.right = 25;
moonLight.shadow.camera.top = 25;
moonLight.shadow.camera.bottom = -25;
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

const ARENA_SIZE = 20;
const BOUND = ARENA_SIZE - 1;

const floorTex = createCheckerTexture('#2b2b30', '#242428');
floorTex.repeat.set(ARENA_SIZE, ARENA_SIZE);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA_SIZE * 2 + 4, ARENA_SIZE * 2 + 4),
  new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------- Walls / pillars ----------
const wallMat = new THREE.MeshStandardMaterial({ color: 0x5c5446, roughness: 1 });

function addBox(x, y, z, w, h, d) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

const WALL_H = 4;
addBox(0, WALL_H / 2, -ARENA_SIZE - 1, ARENA_SIZE * 2 + 4, WALL_H, 2);
addBox(0, WALL_H / 2, ARENA_SIZE + 1, ARENA_SIZE * 2 + 4, WALL_H, 2);
addBox(-ARENA_SIZE - 1, WALL_H / 2, 0, 2, WALL_H, ARENA_SIZE * 2 + 4);
addBox(ARENA_SIZE + 1, WALL_H / 2, 0, 2, WALL_H, ARENA_SIZE * 2 + 4);

addBox(6, 1.5, -6, 2, 3, 2);
addBox(-8, 1.5, 4, 2, 3, 2);
addBox(3, 1, 8, 4, 2, 2);
addBox(-4, 2, -9, 2, 4, 2);

// ---------- 모델 로딩 실패 시 쓰는 간이 캐릭터 ----------
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
    return mesh;
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
player.position.set(0, 0, 6);
scene.add(player);

const characterHolder = new THREE.Group();
player.add(characterHolder);

let playerRig = createBlockyHumanoid(); // 로딩 전 임시
characterHolder.add(playerRig);

// 애니메이션 상태
let mixer = null;
const actions = {};
let currentAction = null;
let animState = 'locomotion'; // 'locomotion' | 'attack' | 'roll'

function playClip(name, { fade = 0.18, once = false, fitDuration = null } = {}) {
  const action = actions[name];
  if (!action) return null;
  if (!once && currentAction === action) return action;

  action.reset();
  if (once) {
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
  } else {
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
  }
  action.timeScale = fitDuration ? action.getClip().duration / fitDuration : 1;
  action.fadeIn(fade).play();
  if (currentAction && currentAction !== action) currentAction.fadeOut(fade);
  currentAction = action;
  return action;
}

const loadingEl = document.getElementById('loading');
let knightTemplate = null; // 적 복제용 원본
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
    equipSwordOnly(model);

    // 키 정규화 (장비 제외한 몸 기준으로 계산)
    const body = model.getObjectByName('Knight_Body') || model;
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

    // 애니메이션이 끝나면 다시 이동/대기 상태로
    mixer.addEventListener('finished', () => {
      if (animState === 'attack') {
        animState = 'locomotion';
        currentAction = null;
      }
    });

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

// ---------- Enemies ----------
const enemies = [];
const ENEMY_SPOTS = [
  [7, -7],
  [-9, 3],
  [2, 9],
  [-3, -10],
];

function makeKnightClone() {
  const obj = skeletonClone(knightTemplate);
  obj.scale.copy(knightTemplate.scale);
  obj.position.y = knightTemplate.position.y;
  equipSwordOnly(obj);

  // 적은 붉게 물들여 구분
  const materials = [];
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
      o.material = o.material.clone();
      o.material.color.multiplyScalar(1).setRGB(
        Math.min(1, o.material.color.r * 1.35 + 0.25),
        o.material.color.g * 0.5,
        o.material.color.b * 0.5
      );
      materials.push(o.material);
    }
  });

  const mixer = new THREE.AnimationMixer(obj);
  const acts = {};
  knightClips.forEach((clip) => {
    if ([ANIM.idle, ANIM.run, ANIM.attackAlt, ANIM.death].includes(clip.name)) {
      acts[clip.name] = mixer.clipAction(clip);
    }
  });
  return { obj, mixer, actions: acts, materials };
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
      maxHp: 40,
      alive: true,
      attackCd: 0.8 + Math.random() * 0.8,
      walkPhase: Math.random() * Math.PI * 2,
      hitFlash: 0,
      stagger: 0,
      punchT: -1,
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
  mesh.position.set(x, 0.6, z);
  scene.add(mesh);
  items.push({ mesh, label, effect, collected: false });
}

spawnItem(4, 2, '체력 물약', 'hp');
spawnItem(-5, -4, '마나 구슬', 'mp');
spawnItem(0, -12, '금화 주머니', null);

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

// ---------- State ----------
const keys = new Set();
const moveDir = new THREE.Vector3();
const lastFacing = new THREE.Vector3(0, 0, 1);
const SPEED = 6.2;

const ROLL_DURATION = 0.55;
const ROLL_DISTANCE = 5.2;
const ROLL_COST = 25;
const ROLL_COOLDOWN = 0.85;
let rollT = -1;
let rollCooldownLeft = 0;
const rollDir = new THREE.Vector3();
const rollStart = new THREE.Vector3();
const rollCooldownEl = document.getElementById('roll-cooldown');

const ATTACK_COOLDOWN = 0.6;
const ATTACK_DURATION = 0.55;
const ATTACK_HIT_DELAY = 0.22; // 검이 실제로 닿는 타이밍
const ATTACK_RANGE = 2.8;
const ATTACK_DAMAGE = 14;
let attackCooldownLeft = 0;
let pendingHit = -1;
let slashT = -1;
const attackCooldownEl = document.getElementById('attack-cooldown');

const ENEMY_SPEED = 2.5;
const ENEMY_SIGHT = 16;
const ENEMY_ATTACK_RANGE = 1.9;
const ENEMY_DAMAGE = 7;
const ENEMY_ATTACK_CD = 1.5;

let camShake = 0;
const START_POS = new THREE.Vector3(0, 0, 6);

// ---------- Input ----------
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) tryRoll();
  }
  if (e.code === 'KeyX' && !e.repeat) tryAttack(); // 키보드 대체키
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

// 마우스 좌클릭 / 터치로 공격
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  tryAttack();
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

// 화면 버튼 (터치패드 / 모바일)
function bindButton(id, handler) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('pressed');
    handler();
  });
  const release = () => el.classList.remove('pressed');
  el.addEventListener('pointerup', release);
  el.addEventListener('pointerleave', release);
  el.addEventListener('pointercancel', release);
}
bindButton('skill-attack', () => tryAttack());
bindButton('skill-roll', () => tryRoll());

// ---------- Actions ----------
function tryRoll() {
  if (rollT >= 0 || rollCooldownLeft > 0 || mp < ROLL_COST) return;
  rollDir.copy(moveDir.lengthSq() > 0 ? moveDir : lastFacing).normalize();
  rollStart.copy(player.position);
  rollT = 0;
  setMp(mp - ROLL_COST);
  rollCooldownLeft = ROLL_COOLDOWN;
  lastFacing.copy(rollDir);

  animState = 'roll';
  playClip(ANIM.dodge, { once: true, fade: 0.08, fitDuration: ROLL_DURATION });
}

function tryAttack() {
  if (attackCooldownLeft > 0 || rollT >= 0) return;
  attackCooldownLeft = ATTACK_COOLDOWN;
  pendingHit = ATTACK_HIT_DELAY;

  animState = 'attack';
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
    damageEnemy(enemy, ATTACK_DAMAGE, toEnemy);
    hitAny = true;
  });
  if (!hitAny) camShake = Math.max(camShake, 0.05);
}

function damageEnemy(enemy, amount, knockDir) {
  enemy.hp -= amount;
  enemy.hitFlash = 0.12;
  enemy.stagger = 0.28;
  camShake = Math.max(camShake, 0.28);

  if (knockDir) {
    enemy.group.position.addScaledVector(knockDir, 0.8);
    enemy.group.position.x = THREE.MathUtils.clamp(enemy.group.position.x, -BOUND, BOUND);
    enemy.group.position.z = THREE.MathUtils.clamp(enemy.group.position.z, -BOUND, BOUND);
  }

  if (enemy.hp <= 0 && enemy.alive) {
    enemy.alive = false;
    enemy.dieT = 0;
    if (enemy.actions) enemyPlay(enemy, ANIM.death, { once: true, fade: 0.1 });
    const left = updateEnemyCount();
    if (left === 0) showToast('구역 정리 완료!');
  }
}

function damagePlayer(amount) {
  if (rollT >= 0) return; // 구르는 동안 무적
  setHp(hp - amount);
  flashDamage();
  camShake = Math.max(camShake, 0.35);
  if (hp <= 0) {
    player.position.copy(START_POS);
    setHp(MAX_HP);
    setMp(MAX_MP);
    showToast('쓰러졌다… 입구에서 다시 시작');
  }
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
  const rolling = rollT >= 0;

  // ----- 구르기 -----
  if (rolling) {
    rollT += dt / ROLL_DURATION;
    const p = Math.min(rollT, 1);
    const eased = easeOut(p);

    player.position.copy(rollStart).addScaledVector(rollDir, ROLL_DISTANCE * eased);
    player.position.x = THREE.MathUtils.clamp(player.position.x, -BOUND, BOUND);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -BOUND, BOUND);
    player.rotation.y = Math.atan2(rollDir.x, rollDir.z);

    if (!mixer && playerRig) {
      // 모델이 없을 때만 직접 굴려줌
      characterHolder.rotation.x = Math.PI * 2 * eased;
    }

    if (rollT >= 1) {
      rollT = -1;
      characterHolder.rotation.x = 0;
      animState = 'locomotion';
      currentAction = null;
    }
  } else if (isMoving) {
    lastFacing.copy(moveDir);
    player.position.addScaledVector(moveDir, SPEED * dt);
    player.position.x = THREE.MathUtils.clamp(player.position.x, -BOUND, BOUND);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -BOUND, BOUND);
    const target = Math.atan2(moveDir.x, moveDir.z);
    player.rotation.y = lerpAngle(player.rotation.y, target, 1 - Math.exp(-14 * dt));
  }

  // ----- 공격 타이밍 -----
  if (pendingHit >= 0) {
    pendingHit -= dt;
    if (pendingHit <= 0) {
      pendingHit = -1;
      resolveAttackHit();
    }
  }

  // ----- 캐릭터 애니메이션 -----
  if (mixer) {
    if (animState === 'locomotion') {
      playClip(isMoving ? ANIM.run : ANIM.idle);
    }
    mixer.update(dt);
  } else if (playerRig) {
    walkPhase += dt * (isMoving ? 11 : 2.5);
    animateLimbs(playerRig, walkPhase, isMoving ? 0.75 : 0.12);
  }

  // ----- 베기 이펙트 -----
  if (slashT >= 0) {
    slashT += dt / 0.22;
    const p = Math.min(slashT, 1);
    slashMat.opacity = 0.9 * (1 - p);
    slash.scale.setScalar(0.8 + p * 0.45);
    slash.rotation.y = -0.45 + p * 0.9;
    if (slashT >= 1) {
      slashT = -1;
      slash.visible = false;
      slashMat.opacity = 0;
    }
  }

  // ----- 쿨다운 / 마나 -----
  if (rollCooldownLeft > 0) rollCooldownLeft = Math.max(0, rollCooldownLeft - dt);
  if (attackCooldownLeft > 0) attackCooldownLeft = Math.max(0, attackCooldownLeft - dt);
  setMp(mp + MP_REGEN * dt);
  rollCooldownEl.style.height = `${(rollCooldownLeft / ROLL_COOLDOWN) * 100}%`;
  attackCooldownEl.style.height = `${(attackCooldownLeft / ATTACK_COOLDOWN) * 100}%`;

  // ----- 적 -----
  enemies.forEach((enemy) => {
    const g = enemy.group;
    if (enemy.mixer) enemy.mixer.update(dt);

    if (!enemy.alive) {
      if (enemy.dieT !== undefined && enemy.dieT < 1) {
        enemy.dieT += dt / (enemy.mixer ? 1.6 : 0.4);
        const p = Math.min(enemy.dieT, 1);
        if (enemy.mixer) {
          if (p > 0.7) {
            const fade = (p - 0.7) / 0.3;
            g.scale.setScalar(1 - fade);
          }
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

    const toPlayer = player.position.clone().sub(g.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    if (dist < ENEMY_SIGHT && dist > 0.01) {
      toPlayer.normalize();
      const targetRot = Math.atan2(toPlayer.x, toPlayer.z);
      g.rotation.y = lerpAngle(g.rotation.y, targetRot, 1 - Math.exp(-8 * dt));

      if (dist > ENEMY_ATTACK_RANGE && enemy.stagger <= 0) {
        g.position.addScaledVector(toPlayer, ENEMY_SPEED * dt);
        if (enemy.mixer) {
          if (enemy.punchT < 0) enemyPlay(enemy, ANIM.run);
        } else {
          enemy.walkPhase += dt * 9;
          animateLimbs(enemy.rig, enemy.walkPhase, 0.6);
        }
      } else {
        if (enemy.mixer) {
          if (enemy.punchT < 0) enemyPlay(enemy, ANIM.idle);
        } else {
          enemy.walkPhase += dt * 2.5;
          animateLimbs(enemy.rig, enemy.walkPhase, 0.12);
        }
        enemy.attackCd -= dt;
        if (dist <= ENEMY_ATTACK_RANGE && enemy.attackCd <= 0) {
          enemy.attackCd = ENEMY_ATTACK_CD;
          enemy.punchT = 0;
          if (enemy.mixer) enemyPlay(enemy, ANIM.attackAlt, { once: true, fade: 0.08, fitDuration: 0.7 });
          damagePlayer(ENEMY_DAMAGE);
        }
      }
    } else if (!enemy.mixer) {
      enemy.walkPhase += dt * 2;
      animateLimbs(enemy.rig, enemy.walkPhase, 0.1);
    } else if (enemy.punchT < 0) {
      enemyPlay(enemy, ANIM.idle);
    }

    // 때리는 모션 진행 (간이 캐릭터용 + 상태 해제)
    if (enemy.punchT >= 0) {
      enemy.punchT += dt / (enemy.mixer ? 0.7 : 0.3);
      if (!enemy.mixer && enemy.rig) {
        const s = Math.sin(Math.min(enemy.punchT, 1) * Math.PI);
        enemy.rig.userData.limbs.armR.rotation.x = -2.1 * s;
        enemy.rig.userData.limbs.armL.rotation.x = -0.5 * s;
      }
      if (enemy.punchT >= 1) {
        enemy.punchT = -1;
        enemy.current = null;
      }
    }
  });

  // ----- 아이템 -----
  items.forEach((item) => {
    if (item.collected) return;
    item.mesh.rotation.y += dt * 1.6;
    item.mesh.position.y = 0.6 + Math.sin(clock.elapsedTime * 3) * 0.08;
    if (player.position.distanceTo(item.mesh.position) < 1.2) {
      item.collected = true;
      scene.remove(item.mesh);
      if (item.effect === 'hp') setHp(hp + 40);
      if (item.effect === 'mp') setMp(mp + 60);
      showToast(`아이템 획득: ${item.label}`);
    }
  });

  // ----- 조명 / 카메라 -----
  torchLight.position.set(player.position.x, 3, player.position.z);

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
