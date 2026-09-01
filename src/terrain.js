// 경복궁 근정전 맵 — 지형 높이/충돌 처리
//
// STL은 Z-up(OpenSCAD)이라 게임에서는 X축으로 -90도 눕혀 씁니다.
//   월드 X =  모델 x * SCALE
//   월드 Y =  모델 z * SCALE   (높이)
//   월드 Z = -모델 y * SCALE
// 높이맵/장애물 마스크는 변환 스크립트가 미리 계산해 둔 것을 그대로 씁니다.

import * as THREE from 'three';

export const MAP_SCALE = 0.22;

let map = null; // { grid, cell, minXY, zMin, zMax, heights, blocked }

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function loadTerrain(json) {
  map = {
    grid: json.grid,
    minXY: json.minXY,
    cell: (json.maxXY - json.minXY) / json.grid,
    zMin: json.zMin,
    zMax: json.zMax,
    heights: b64ToBytes(json.heights),
    blocked: b64ToBytes(json.blocked),
    groups: json.groups,
  };
  return map;
}

export function terrainReady() {
  return map !== null;
}

// 셀 하나의 높이(월드 Y)
function cellHeight(i, j) {
  const g = map.grid;
  i = i < 0 ? 0 : i >= g ? g - 1 : i;
  j = j < 0 ? 0 : j >= g ? g - 1 : j;
  const q = map.heights[i * g + j] / 255;
  return (map.zMin + q * (map.zMax - map.zMin)) * MAP_SCALE;
}

/** 월드 좌표의 바닥 높이 (이중선형 보간) */
export function terrainHeight(wx, wz) {
  if (!map) return 0;
  const mx = wx / MAP_SCALE;
  const my = -wz / MAP_SCALE;
  const fx = (mx - map.minXY) / map.cell - 0.5;
  const fy = (my - map.minXY) / map.cell - 0.5;
  const j = Math.floor(fx);
  const i = Math.floor(fy);
  const tx = fx - j;
  const ty = fy - i;
  const h00 = cellHeight(i, j);
  const h10 = cellHeight(i, j + 1);
  const h01 = cellHeight(i + 1, j);
  const h11 = cellHeight(i + 1, j + 1);
  return (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty;
}

/** 기둥·벽처럼 지나갈 수 없는 칸인지 */
export function terrainBlocked(wx, wz) {
  if (!map) return false;
  const mx = wx / MAP_SCALE;
  const my = -wz / MAP_SCALE;
  const j = Math.floor((mx - map.minXY) / map.cell);
  const i = Math.floor((my - map.minXY) / map.cell);
  if (i < 0 || j < 0 || i >= map.grid || j >= map.grid) return false;
  const idx = i * map.grid + j;
  return (map.blocked[idx >> 3] >> (7 - (idx & 7))) & 1 ? true : false;
}

// 이동 규칙
export const STEP_UP = 0.9;    // 이보다 높으면 못 올라감 (월대 옆면 차단, 계단은 통과)
export const STEP_DOWN = 1.4;  // 이보다 낮으면 못 내려감 (월대에서 떨어지지 않음)
const RADIUS = 0.36;           // 캐릭터 반경

/** 그 자리에 설 수 있는지 (반경 안쪽 네 점까지 확인) */
export function canStand(fromY, wx, wz) {
  if (terrainBlocked(wx, wz)) return false;
  if (
    terrainBlocked(wx + RADIUS, wz) ||
    terrainBlocked(wx - RADIUS, wz) ||
    terrainBlocked(wx, wz + RADIUS) ||
    terrainBlocked(wx, wz - RADIUS)
  ) {
    return false;
  }
  const h = terrainHeight(wx, wz);
  if (h - fromY > STEP_UP) return false;
  if (fromY - h > STEP_DOWN) return false;
  return true;
}

/**
 * 지형을 고려해서 이동. 막히면 축을 하나씩 나눠 시도해 벽을 타고 미끄러지게 함.
 * @returns 실제로 움직였는지
 */
export function moveOnTerrain(obj, dx, dz, bound) {
  const x = obj.position.x;
  const z = obj.position.z;
  const y = terrainHeight(x, z);
  const cl = (v) => THREE.MathUtils.clamp(v, -bound, bound);

  const nx = cl(x + dx);
  const nz = cl(z + dz);

  if ((dx !== 0 || dz !== 0) && canStand(y, nx, nz)) {
    obj.position.x = nx;
    obj.position.z = nz;
    return true;
  }
  if (dx !== 0 && canStand(y, nx, z)) {
    obj.position.x = nx;
    return true;
  }
  if (dz !== 0 && canStand(y, x, nz)) {
    obj.position.z = nz;
    return true;
  }
  return false;
}
