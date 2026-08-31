import * as THREE from 'three';
import { loadModel, loadTexture, loadSound } from './loaders.js';

// =================================================================
// 던전 크롤러 스타일 프로토타입
// 고정 각도 쿼터뷰 카메라 + WASD 이동 + 대시(Space) + 공격(X)
// =================================================================

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

// 고정 각도(쿼터뷰) 오프셋 — 마우스로 회전하지 않고 플레이어를 계속 따라만 감
const CAMERA_OFFSET = new THREE.Vector3(0, 13, 9);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.getElementById('app').appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Lighting (어두운 던전 분위기) ----------
const hemiLight = new THREE.HemisphereLight(0x3a4a66, 0x0a0a0a, 0.6);
scene.add(hemiLight);

const moonLight = new THREE.DirectionalLight(0x8fb3ff, 0.7);
moonLight.position.set(-10, 20, -10);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.camera.left = -25;
moonLight.shadow.camera.right = 25;
moonLight.shadow.camera.top = 25;
moonLight.shadow.camera.bottom = -25;
scene.add(moonLight);

// 플레이어를 따라다니는 횃불 느낌의 포인트 라이트
const torchLight = new THREE.PointLight(0xffb066, 1.4, 12, 2);
torchLight.position.set(0, 3, 0);
scene.add(torchLight);

// ---------- Floor (체크무늬 던전 타일) ----------
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

const ARENA_SIZE = 20; // 플레이어가 이동 가능한 절반 범위 (-ARENA_SIZE ~ +ARENA_SIZE)

const floorTex = createCheckerTexture('#2b2b30', '#242428');
floorTex.repeat.set(ARENA_SIZE, ARENA_SIZE);

const groundGeo = new THREE.PlaneGeometry(ARENA_SIZE * 2 + 4, ARENA_SIZE * 2 + 4);
const groundMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------- Walls / pillars (던전 벽) ----------
const wallMat = new THREE.MeshStandardMaterial({ color: 0x3d3830, roughness: 1 });

function addBox(x, y, z, w, h, d, mat = wallMat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

const WALL_H = 4;
addBox(0, WALL_H / 2, -ARENA_SIZE - 1, ARENA_SIZE * 2 + 4, WALL_H, 2); // 북쪽
addBox(0, WALL_H / 2, ARENA_SIZE + 1, ARENA_SIZE * 2 + 4, WALL_H, 2); // 남쪽
addBox(-ARENA_SIZE - 1, WALL_H / 2, 0, 2, WALL_H, ARENA_SIZE * 2 + 4); // 서쪽
addBox(ARENA_SIZE + 1, WALL_H / 2, 0, 2, WALL_H, ARENA_SIZE * 2 + 4); // 동쪽

// 내부 장애물(기둥/상자)
addBox(6, 1.5, -6, 2, 3, 2);
addBox(-8, 1.5, 4, 2, 3, 2);
addBox(3, 1, 8, 4, 2, 2);
addBox(-4, 2, -9, 2, 4, 2);

// ---------- Player ----------
const player = new THREE.Group();

const bodyGeo = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3498db });
const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
bodyMesh.position.y = 1;
bodyMesh.castShadow = true;
player.add(bodyMesh);

// 공격 시 휘두르는 무기
const weaponGeo = new THREE.BoxGeometry(0.12, 0.12, 1.1);
const weaponMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.3 });
const weapon = new THREE.Mesh(weaponGeo, weaponMat);
weapon.position.set(0.45, 1.1, 0.4);
weapon.castShadow = true;
player.add(weapon);

player.position.set(0, 0, 6);
scene.add(player);

// ---------------------------------------------------------------
// 무료 에셋 적용 예시 (assets/ 폴더에 파일을 넣은 뒤 주석 해제)
//
// loadModel('assets/models/character.glb').then((gltf) => {
//   player.remove(bodyMesh);
//   gltf.scene.traverse((obj) => { if (obj.isMesh) obj.castShadow = true; });
//   player.add(gltf.scene);
// }).catch((err) => console.warn('모델 로드 실패, 기본 캡슐 사용:', err));
// ---------------------------------------------------------------

// ---------- Enemies ----------
const enemyGeo = new THREE.ConeGeometry(0.55, 1.5, 8);
const enemyMatBase = 0xe74c3c;
const enemies = [];

function spawnEnemy(x, z) {
  const mat = new THREE.MeshStandardMaterial({ color: enemyMatBase });
  const mesh = new THREE.Mesh(enemyGeo, mat);
  mesh.position.set(x, 0.8, z);
  mesh.castShadow = true;
  scene.add(mesh);
  enemies.push({ mesh, hp: 30, maxHp: 30, alive: true, bobOffset: Math.random() * Math.PI * 2 });
}

spawnEnemy(7, -7);
spawnEnemy(-9, 3);
spawnEnemy(2, 9);
spawnEnemy(-3, -10);

const enemyCountEl = document.getElementById('enemy-count');
function updateEnemyCount() {
  enemyCountEl.textContent = enemies.filter((e) => e.alive).length;
}
updateEnemyCount();

// ---------- Item pickups ----------
const itemGeo = new THREE.IcosahedronGeometry(0.35, 0);
const itemMat = new THREE.MeshStandardMaterial({
  color: 0xffd166,
  emissive: 0x8a5a00,
  emissiveIntensity: 0.6,
});
const items = [];

function spawnItem(x, z, label) {
  const mesh = new THREE.Mesh(itemGeo, itemMat);
  mesh.position.set(x, 0.6, z);
  scene.add(mesh);
  items.push({ mesh, label, collected: false });
}

spawnItem(4, 2, '체력 물약');
spawnItem(-5, -4, '마나 구슬');
spawnItem(0, -12, '금화 주머니');

// ---------- Toast ----------
const toastEl = document.getElementById('toast');
let toastTimer = null;
function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1500);
}

// ---------- Input ----------
const keys = new Set();
window.__debug = { player, keys, camera };
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) tryDash();
  }
  if (e.code === 'KeyX' && !e.repeat) tryAttack();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

// ---------- Stats (HP / MP) ----------
let hp = 100;
let mp = 100;
const MAX_HP = 100;
const MAX_MP = 100;
const MP_REGEN = 10; // per second

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

// ---------- Dash ----------
const DASH_DISTANCE = 4.5;
const DASH_COST = 25;
const DASH_COOLDOWN = 0.7;
let dashCooldownLeft = 0;
const dashCooldownEl = document.getElementById('dash-cooldown');

function tryDash() {
  if (dashCooldownLeft > 0 || mp < DASH_COST) return;
  const dir = lastFacing.clone();
  const dest = player.position.clone().addScaledVector(dir, DASH_DISTANCE);
  dest.x = THREE.MathUtils.clamp(dest.x, -ARENA_SIZE + 1, ARENA_SIZE - 1);
  dest.z = THREE.MathUtils.clamp(dest.z, -ARENA_SIZE + 1, ARENA_SIZE - 1);
  player.position.copy(dest);
  setMp(mp - DASH_COST);
  dashCooldownLeft = DASH_COOLDOWN;
}

// ---------- Attack ----------
const ATTACK_COOLDOWN = 0.45;
const ATTACK_RANGE = 2.4;
const ATTACK_DAMAGE = 12;
let attackCooldownLeft = 0;
let attackAnimT = -1; // -1 = 재생 중 아님
const attackCooldownEl = document.getElementById('attack-cooldown');

function tryAttack() {
  if (attackCooldownLeft > 0) return;
  attackCooldownLeft = ATTACK_COOLDOWN;
  attackAnimT = 0;

  enemies.forEach((enemy) => {
    if (!enemy.alive) return;
    const toEnemy = enemy.mesh.position.clone().sub(player.position);
    const dist = toEnemy.length();
    if (dist > ATTACK_RANGE) return;
    toEnemy.normalize();
    const facing = new THREE.Vector3(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
    if (facing.dot(toEnemy) < 0.3) return; // 대략 전방 부채꼴 안에 있어야 타격
    damageEnemy(enemy, ATTACK_DAMAGE);
  });
}

function damageEnemy(enemy, amount) {
  enemy.hp -= amount;
  enemy.mesh.material.color.setHex(0xffffff);
  setTimeout(() => {
    if (enemy.alive) enemy.mesh.material.color.setHex(enemyMatBase);
  }, 100);

  if (enemy.hp <= 0 && enemy.alive) {
    enemy.alive = false;
    updateEnemyCount();
    const startScale = enemy.mesh.scale.clone();
    const start = performance.now();
    function dieAnim() {
      const t = (performance.now() - start) / 300;
      if (t >= 1) {
        scene.remove(enemy.mesh);
        return;
      }
      enemy.mesh.scale.copy(startScale).multiplyScalar(1 - t);
      enemy.mesh.position.y = 0.8 - t * 0.8;
      requestAnimationFrame(dieAnim);
    }
    dieAnim();
  }
}

// ---------- Camera follow (고정 쿼터뷰, 회전 없음) ----------
function updateCamera(alpha) {
  const desired = player.position.clone().add(CAMERA_OFFSET);
  camera.position.lerp(desired, alpha);
  camera.lookAt(player.position.clone().add(new THREE.Vector3(0, 1, 0)));
}
camera.position.copy(player.position).add(CAMERA_OFFSET);
camera.lookAt(player.position);

// ---------- Game loop ----------
const clock = new THREE.Clock();
const moveDir = new THREE.Vector3();
const lastFacing = new THREE.Vector3(0, 0, 1);
const SPEED = 6.5;
const PICKUP_RADIUS = 1.2;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  // ----- 이동 (카메라가 고정 각도라 월드 축 기준으로 이동) -----
  moveDir.set(0, 0, 0);
  if (keys.has('KeyW')) moveDir.z -= 1;
  if (keys.has('KeyS')) moveDir.z += 1;
  if (keys.has('KeyA')) moveDir.x -= 1;
  if (keys.has('KeyD')) moveDir.x += 1;

  if (moveDir.lengthSq() > 0) {
    moveDir.normalize();
    lastFacing.copy(moveDir);
    const next = player.position.clone().addScaledVector(moveDir, SPEED * dt);
    next.x = THREE.MathUtils.clamp(next.x, -ARENA_SIZE + 1, ARENA_SIZE - 1);
    next.z = THREE.MathUtils.clamp(next.z, -ARENA_SIZE + 1, ARENA_SIZE - 1);
    player.position.copy(next);
    const targetRot = Math.atan2(moveDir.x, moveDir.z);
    player.rotation.y = THREE.MathUtils.lerp(player.rotation.y, targetRot, 0.25);
  }

  // ----- 무기 스윙 애니메이션 -----
  if (attackAnimT >= 0) {
    attackAnimT += dt / 0.25;
    const swing = Math.sin(Math.min(attackAnimT, 1) * Math.PI);
    weapon.rotation.y = -0.6 + swing * 1.8;
    if (attackAnimT >= 1) {
      attackAnimT = -1;
      weapon.rotation.y = -0.6;
    }
  }

  // ----- 쿨다운 / 마나 회복 -----
  if (dashCooldownLeft > 0) dashCooldownLeft = Math.max(0, dashCooldownLeft - dt);
  if (attackCooldownLeft > 0) attackCooldownLeft = Math.max(0, attackCooldownLeft - dt);
  setMp(mp + MP_REGEN * dt);
  dashCooldownEl.style.height = `${(dashCooldownLeft / DASH_COOLDOWN) * 100}%`;
  attackCooldownEl.style.height = `${(attackCooldownLeft / ATTACK_COOLDOWN) * 100}%`;

  // ----- 적 은은한 부유 애니메이션 -----
  enemies.forEach((enemy) => {
    if (!enemy.alive) return;
    enemy.mesh.position.y = 0.8 + Math.sin(clock.elapsedTime * 2 + enemy.bobOffset) * 0.08;
    enemy.mesh.rotation.y += dt * 0.6;
  });

  // ----- 아이템 회전 + 습득 판정 -----
  items.forEach((item) => {
    if (item.collected) return;
    item.mesh.rotation.y += dt * 1.5;
    item.mesh.position.y = 0.6 + Math.sin(clock.elapsedTime * 3) * 0.08;
    if (player.position.distanceTo(item.mesh.position) < PICKUP_RADIUS) {
      item.collected = true;
      scene.remove(item.mesh);
      showToast(`아이템 획득: ${item.label}`);
    }
  });

  // ----- 횃불 라이트 위치 -----
  torchLight.position.set(player.position.x, 3, player.position.z);

  // ----- 카메라 -----
  updateCamera(0.12);

  renderer.render(scene, camera);
}

window.__debug.tick = animate;
animate();
