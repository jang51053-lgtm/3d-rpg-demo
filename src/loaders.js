// 무료 에셋(모델/텍스처/사운드)을 불러오는 헬퍼 모음입니다.
// assets/models, assets/textures, assets/sounds 폴더에 파일을 넣고
// 아래 함수들로 불러오면 됩니다. (index.html의 importmap에 "three/addons/"가
// 이미 설정되어 있어서 별도 설치 없이 바로 동작합니다.)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const gltfLoader = new GLTFLoader();

// 압축된(.glb, Draco) 모델도 열 수 있도록 디코더를 연결해둡니다.
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/');
gltfLoader.setDRACOLoader(dracoLoader);

const textureLoader = new THREE.TextureLoader();

/**
 * .glb / .gltf 모델을 불러옵니다.
 * 예) const gltf = await loadModel('assets/models/character.glb');
 *     scene.add(gltf.scene);
 */
export function loadModel(path) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(
      path,
      (gltf) => resolve(gltf),
      undefined,
      (err) => reject(err)
    );
  });
}

/**
 * 이미지 텍스처(바닥, 벽, 스킨 등)를 불러옵니다.
 * 예) const tex = await loadTexture('assets/textures/ground.jpg');
 *     tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
 */
export function loadTexture(path) {
  return new Promise((resolve, reject) => {
    textureLoader.load(
      path,
      (tex) => resolve(tex),
      undefined,
      (err) => reject(err)
    );
  });
}

/**
 * 효과음/배경음악을 재생 가능한 <audio> 엘리먼트로 불러옵니다.
 * 예) const sfx = loadSound('assets/sounds/hit.mp3');
 *     sfx.play();
 */
export function loadSound(path, { loop = false, volume = 1 } = {}) {
  const audio = new Audio(path);
  audio.loop = loop;
  audio.volume = volume;
  return audio;
}
