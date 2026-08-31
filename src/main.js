import * as THREE from 'three';
import { loadModel, loadTexture, loadSound } from './loaders.js';

// ---------- Scene / Camera / Renderer ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 30, 100);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

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

// ---------- Lighting ----------
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
sunLight.position.set(20, 30, 10);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -40;
sunLight.shadow.camera.right = 40;
sunLight.shadow.camera.top = 40;
sunLight.shadow.camera.bottom = -40;
scene.add(sunLight);

// ---------- Ground ----------
const groundGeo = new THREE.PlaneGeometry(200, 200);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a7d44 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(200, 40, 0x225522, 0x225522);
grid.position.y = 0.01;
scene.add(grid);

// ---------- World props (placeholder "dungeon" blocks) ----------
const propMat = new THREE.MeshStandardMaterial({ color: 0x8a7f6a });
function addBlock(x, y, z, w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, propMat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
addBlock(10, 1.5, -10, 4, 3, 4);
addBlock(-12, 2, 6, 3, 4, 3);
addBlock(0, 1, -20, 6, 2, 2);

// ---------- Player ----------
const player = new THREE.Group();
const bodyGeo = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3498db });
const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
bodyMesh.position.y = 1;
bodyMesh.castShadow = true;
player.add(bodyMesh);
player.position.set(0, 0, 5);
scene.add(player);

// ---------------------------------------------------------------
// 무료 에셋 적용하기 (assets/ 폴더에 파일을 넣은 뒤 아래 주석을 해제하세요)
//
// 1) 캐릭터 모델(.glb)로 기본 캡슐 교체:
//
// loadModel('assets/models/character.glb')
//   .then((gltf) => {
//     player.remove(bodyMesh); // 기본 캡슐 제거
//     gltf.scene.scale.set(1, 1, 1);
//     gltf.scene.traverse((obj) => {
//       if (obj.isMesh) obj.castShadow = true;
//     });
//     player.add(gltf.scene);
//   })
//   .catch((err) => console.warn('모델 로드 실패, 기본 캡슐 사용:', err));
//
// 2) 바닥에 텍스처 입히기:
//
// loadTexture('assets/textures/ground.jpg').then((tex) => {
//   tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
//   tex.repeat.set(20, 20);
//   groundMat.map = tex;
//   groundMat.needsUpdate = true;
// });
//
// 3) 효과음 재생하기:
//
// const hitSfx = loadSound('assets/sounds/hit.mp3', { volume: 0.6 });
// hitSfx.play();
// ---------------------------------------------------------------

// A simple placeholder "enemy"
const enemyGeo = new THREE.ConeGeometry(0.6, 1.6, 8);
const enemyMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c });
const enemy = new THREE.Mesh(enemyGeo, enemyMat);
enemy.position.set(6, 0.8, -6);
enemy.castShadow = true;
scene.add(enemy);

// ---------- Camera rig (third-person follow) ----------
const cameraOffset = new THREE.Vector3(0, 4, 8);
let yaw = 0;

// ---------- Input ----------
const keys = new Set();
window.addEventListener('keydown', (e) => keys.add(e.code));
window.addEventListener('keyup', (e) => keys.delete(e.code));

let dragging = false;
let lastX = 0;
renderer.domElement.addEventListener('mousedown', (e) => {
  dragging = true;
  lastX = e.clientX;
});
window.addEventListener('mouseup', () => (dragging = false));
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  lastX = e.clientX;
  yaw -= dx * 0.005;
});

// ---------- HP demo ----------
let hp = 100;
const hpFill = document.getElementById('hp-fill');
function setHp(value) {
  hp = THREE.MathUtils.clamp(value, 0, 100);
  hpFill.style.width = `${hp}%`;
}
setHp(hp);

// ---------- Game loop ----------
const clock = new THREE.Clock();
const moveDir = new THREE.Vector3();
const speed = 6;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  // movement relative to camera yaw
  moveDir.set(0, 0, 0);
  if (keys.has('KeyW')) moveDir.z -= 1;
  if (keys.has('KeyS')) moveDir.z += 1;
  if (keys.has('KeyA')) moveDir.x -= 1;
  if (keys.has('KeyD')) moveDir.x += 1;

  if (moveDir.lengthSq() > 0) {
    moveDir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    player.position.addScaledVector(moveDir, speed * dt);
    const targetRot = Math.atan2(moveDir.x, moveDir.z);
    player.rotation.y = THREE.MathUtils.lerp(player.rotation.y, targetRot, 0.2);
  }

  // enemy bobs gently as a placeholder for future AI
  enemy.position.y = 0.8 + Math.sin(clock.elapsedTime * 2) * 0.1;
  enemy.rotation.y += dt;

  // camera follows player
  const rotatedOffset = cameraOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const desiredCamPos = player.position.clone().add(rotatedOffset);
  camera.position.lerp(desiredCamPos, 0.1);
  camera.lookAt(player.position.clone().add(new THREE.Vector3(0, 1.2, 0)));

  renderer.render(scene, camera);
}

animate();
