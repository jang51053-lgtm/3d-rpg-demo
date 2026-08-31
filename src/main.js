import * as THREE from 'three';
import { loadModel, loadTexture, loadSound } from './loaders.js';

// =================================================================
// 던전 크롤러 프로토타입
// 쿼터뷰 고정 카메라 · WASD 이동 · Space 구르기 · X 공격
// =================================================================

// 캐릭터 모델 (Mixamo 리깅 + Idle/Run 애니메이션 포함).
// 직접 받은 모델을 쓰려면 아래 주소를 'assets/models/내모델.glb' 로 바꾸세요.
const CHARACTER_MODEL_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r169/examples/models/gltf/Soldier.glb';
const CHARACTER_HEIGHT = 1.8;

// ---------- Scene / Camera / Renderer ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0d12);
scene.fog = new THREE.Fog(0x0c0d12, 18, 48);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

// 고정 각도(쿼터뷰) 오프셋 — 회전 없이 플레이어를 따라만 감
const CAMERA_OFFSET = new THREE.Vector3(0, 13, 9);

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
scene.add(new THREE.HemisphereLight(0x3a4a66, 0x0a0a0a, 0.7));

const moonLight = new THREE.DirectionalLight(0x8fb3ff, 0.8);
moonLight.position.set(-10, 20, -10);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.camera.left = -25;
moonLight.shadow.camera.right = 25;
moonLight.shadow.camera.top = 25;
moonLight.shadow.camera.bottom = -25;
scene.add(moonLight);

// 플레이어를 따라다니는 횃불
const torchLight = new THREE.PointLight(0xffb066, 1.6, 14, 2);
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
const wallMat = new THREE.MeshStandardMaterial({ color: 0x3d3830, roughness: 1 });

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

// ---------- 간이 사람 모양 캐릭터 (모델 로딩 전 / 실패 시 / 적으로 사용) ----------
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

  // 어깨/골반에서 회전하도록 피벗을 따로 둠
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

  part(0.52, 0.68, 0.3, main, 0, 1.06, 0); // 몸통
  part(0.34, 0.34, 0.32, skin, 0, 1.57, 0); // 머리
  const armL = limb(0.15, 0.58, 0.17, main, -0.34, 1.36, 0);
  const armR = limb(0.15, 0.58, 0.17, main, 0.34, 1.36, 0);
  const legL = limb(0.19, 0.72, 0.21, dark, -0.14, 0.72, 0);
  const legR = limb(0.19, 0.72, 0.21, dark, 0.14, 0.72, 0);

  group.userData.limbs = { armL, armR, legL, legR };
  group.userData.materials = materials;
  return group;
}

// 팔다리를 걷는 것처럼 흔들어 줌
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

const ROLL_PIVOT_Y = 0.85;
const modelPivot = new THREE.Group(); // 구르기 회전축 (허리 높이)
modelPivot.position.y = ROLL_PIVOT_Y;
player.add(modelPivot);

const characterHolder = new THREE.Group(); // 발이 바닥에 닿도록 되돌림
characterHolder.position.y = -ROLL_PIVOT_Y;
modelPivot.add(characterHolder);

let playerRig = createBlockyHumanoid(); // 모델 로딩 전 임시 캐릭터
characterHolder.add(playerRig);

let mixer = null;
const actions = {};
let currentAction = null;
let rightArmBone = null;

function playAction(name, fade = 0.25) {
  const next = actions[name];
  if (!next || currentAction === next) return;
  next.reset().fadeIn(fade).play();
  if (currentAction) currentAction.fadeOut(fade);
  currentAction = next;
}

const loadingEl = document.getElementById('loading');

loadModel(CHARACTER_MODEL_URL)
  .then((gltf) => {
    const model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false; // 스킨 메시가 화면에서 사라지는 문제 방지
      }
    });

    // 어떤 모델이 와도 키가 맞도록 정규화
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
    playAction(actions.Idle ? 'Idle' : Object.keys(actions)[0], 0);

    rightArmBone =
      model.getObjectByName('mixamorig:RightArm') ||
      model.getObjectByName('mixamorigRightArm') ||
      null;

    loadingEl.classList.add('hidden');
  })
  .catch((err) => {
    console.warn('캐릭터 모델을 불러오지 못해 기본 캐릭터를 사용합니다:', err);
    loadingEl.classList.add('hidden');
  });

// ---------- 공격 이펙트 (베기 궤적) ----------
const slashGeo = new THREE.RingGeometry(0.7, 1.9, 32, 1, -Math.PI * 0.75, Math.PI * 0.5);
slashGeo.rotateX(-Math.PI / 2); // 바닥과 평행 + 정면(+Z) 방향
const slashMat = new THREE.MeshBasicMaterial({
  color: 0xfff0c0,
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

function spawnEnemy(x, z) {
  const group = createBlockyHumanoid({ main: 0x8e2f2f, skin: 0xc98b6b, dark: 0x3a1f1f });
  group.position.set(x, 0, z);
  group.scale.setScalar(0.95);
  scene.add(group);
  enemies.push({
    group,
    hp: 30,
    maxHp: 30,
    alive: true,
    attackCd: Math.random() * 0.8,
    walkPhase: Math.random() * Math.PI * 2,
    hitFlash: 0,
    stagger: 0,
  });
}

spawnEnemy(7, -7);
spawnEnemy(-9, 3);
spawnEnemy(2, 9);
spawnEnemy(-3, -10);

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

// 구르기
const ROLL_DURATION = 0.5;
const ROLL_DISTANCE = 5.2;
const ROLL_COST = 25;
const ROLL_COOLDOWN = 0.85;
let rollT = -1; // -1 = 구르는 중 아님
let rollCooldownLeft = 0;
const rollDir = new THREE.Vector3();
const rollStart = new THREE.Vector3();
const rollCooldownEl = document.getElementById('roll-cooldown');

// 공격
const ATTACK_COOLDOWN = 0.45;
const ATTACK_RANGE = 2.6;
const ATTACK_DAMAGE = 12;
let attackCooldownLeft = 0;
let attackAnimT = -1;
const attackCooldownEl = document.getElementById('attack-cooldown');

// 적 공격
const ENEMY_SPEED = 2.5;
const ENEMY_SIGHT = 16;
const ENEMY_ATTACK_RANGE = 1.7;
const ENEMY_DAMAGE = 8;
const ENEMY_ATTACK_CD = 1.3;

const START_POS = new THREE.Vector3(0, 0, 6);

// ---------- Input ----------
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) tryRoll();
  }
  if (e.code === 'KeyX' && !e.repeat) tryAttack();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

// ---------- Actions ----------
function tryRoll() {
  if (rollT >= 0 || rollCooldownLeft > 0 || mp < ROLL_COST) return;
  rollDir.copy(moveDir.lengthSq() > 0 ? moveDir : lastFacing).normalize();
  rollStart.copy(player.position);
  rollT = 0;
  setMp(mp - ROLL_COST);
  rollCooldownLeft = ROLL_COOLDOWN;
  lastFacing.copy(rollDir);
  playAction('Idle', 0.1);
}

function tryAttack() {
  if (attackCooldownLeft > 0 || rollT >= 0) return;
  attackCooldownLeft = ATTACK_COOLDOWN;
  attackAnimT = 0;

  slash.visible = true;
  slashMat.opacity = 0.85;
  slash.scale.setScalar(0.75);

  const facing = new THREE.Vector3(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
  enemies.forEach((enemy) => {
    if (!enemy.alive) return;
    const toEnemy = enemy.group.position.clone().sub(player.position);
    toEnemy.y = 0;
    const dist = toEnemy.length();
    if (dist > ATTACK_RANGE) return;
    toEnemy.normalize();
    if (facing.dot(toEnemy) < 0.25) return; // 전방 부채꼴 안에 있어야 명중
    damageEnemy(enemy, ATTACK_DAMAGE, toEnemy);
  });
}

function damageEnemy(enemy, amount, knockDir) {
  enemy.hp -= amount;
  enemy.hitFlash = 0.12;
  enemy.stagger = 0.25;

  // 넉백
  if (knockDir) {
    enemy.group.position.addScaledVector(knockDir, 0.7);
    enemy.group.position.x = THREE.MathUtils.clamp(enemy.group.position.x, -BOUND, BOUND);
    enemy.group.position.z = THREE.MathUtils.clamp(enemy.group.position.z, -BOUND, BOUND);
  }

  if (enemy.hp <= 0 && enemy.alive) {
    enemy.alive = false;
    enemy.dieT = 0;
    const left = updateEnemyCount();
    if (left === 0) showToast('구역 정리 완료!');
  }
}

function damagePlayer(amount) {
  if (rollT >= 0) return; // 구르는 동안 무적
  setHp(hp - amount);
  flashDamage();
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

  // ----- 입력 → 이동 방향 -----
  moveDir.set(0, 0, 0);
  if (keys.has('KeyW')) moveDir.z -= 1;
  if (keys.has('KeyS')) moveDir.z += 1;
  if (keys.has('KeyA')) moveDir.x -= 1;
  if (keys.has('KeyD')) moveDir.x += 1;
  if (moveDir.lengthSq() > 0) moveDir.normalize();

  const isMoving = moveDir.lengthSq() > 0;
  const rolling = rollT >= 0;

  // ----- 구르기 (부드럽게 이동 + 앞구르기 회전) -----
  if (rolling) {
    rollT += dt / ROLL_DURATION;
    const p = Math.min(rollT, 1);
    const eased = easeOut(p);

    player.position.copy(rollStart).addScaledVector(rollDir, ROLL_DISTANCE * eased);
    player.position.x = THREE.MathUtils.clamp(player.position.x, -BOUND, BOUND);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -BOUND, BOUND);
    player.rotation.y = Math.atan2(rollDir.x, rollDir.z);

    modelPivot.rotation.x = -Math.PI * 2 * eased;
    const tuck = 1 - Math.sin(p * Math.PI) * 0.18; // 몸을 살짝 웅크리는 느낌
    modelPivot.scale.setScalar(tuck);

    if (rollT >= 1) {
      rollT = -1;
      modelPivot.rotation.x = 0;
      modelPivot.scale.setScalar(1);
    }
  } else if (isMoving) {
    // ----- 일반 이동 -----
    lastFacing.copy(moveDir);
    player.position.addScaledVector(moveDir, SPEED * dt);
    player.position.x = THREE.MathUtils.clamp(player.position.x, -BOUND, BOUND);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -BOUND, BOUND);
    const target = Math.atan2(moveDir.x, moveDir.z);
    player.rotation.y = lerpAngle(player.rotation.y, target, 1 - Math.exp(-14 * dt));
  }

  // ----- 캐릭터 애니메이션 -----
  if (mixer) {
    playAction(!rolling && isMoving ? 'Run' : 'Idle');
    mixer.update(dt);
    // 공격 시 오른팔을 휘두름 (애니메이션 위에 덧입힘)
    if (rightArmBone && attackAnimT >= 0) {
      rightArmBone.rotateX(-Math.sin(Math.min(attackAnimT, 1) * Math.PI) * 1.7);
    }
  } else if (playerRig) {
    // 모델 로딩 전/실패 시 쓰는 간이 캐릭터
    walkPhase += dt * (isMoving ? 11 : 2.5);
    animateLimbs(playerRig, walkPhase, isMoving ? 0.75 : 0.12);
  }

  // ----- 공격 이펙트 -----
  if (attackAnimT >= 0) {
    attackAnimT += dt / 0.28;
    const p = Math.min(attackAnimT, 1);
    slashMat.opacity = 0.85 * (1 - p);
    slash.scale.setScalar(0.75 + p * 0.5);
    slash.rotation.y = -0.5 + p * 1.0;
    if (attackAnimT >= 1) {
      attackAnimT = -1;
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

    if (!enemy.alive) {
      if (enemy.dieT !== undefined && enemy.dieT < 1) {
        enemy.dieT += dt / 0.4;
        const p = Math.min(enemy.dieT, 1);
        g.scale.setScalar(0.95 * (1 - p));
        g.rotation.z = p * 1.4;
        g.position.y = -p * 0.3;
        if (p >= 1) scene.remove(g);
      }
      return;
    }

    // 피격 플래시
    if (enemy.hitFlash > 0) {
      enemy.hitFlash -= dt;
      const on = enemy.hitFlash > 0;
      g.userData.materials.forEach((m) => m.emissive.setHex(on ? 0xff6666 : 0x000000));
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
        enemy.walkPhase += dt * 9;
        animateLimbs(g, enemy.walkPhase, 0.6);
      } else {
        enemy.walkPhase += dt * 2.5;
        animateLimbs(g, enemy.walkPhase, 0.12);
        enemy.attackCd -= dt;
        if (dist <= ENEMY_ATTACK_RANGE && enemy.attackCd <= 0) {
          enemy.attackCd = ENEMY_ATTACK_CD;
          damagePlayer(ENEMY_DAMAGE);
        }
      }
    } else {
      enemy.walkPhase += dt * 2;
      animateLimbs(g, enemy.walkPhase, 0.1);
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
  camera.lookAt(player.position.x, player.position.y + 1, player.position.z);

  renderer.render(scene, camera);
}

// (임시 디버그 훅 — 확인 후 제거)
window.__debug = { player, keys, camera, modelPivot, characterHolder, enemies, tick: animate };

animate();
