"""경복궁 근정전 STL -> 게임용 바이너리 STL + 충돌 높이맵(JSON) 변환"""
import numpy as np, struct, json, base64
import scipy.ndimage as ndi

SRC = 'gyeongbokgung.stl'  # 원본 ASCII STL 경로
OUT_STL = '../assets/models/geunjeongjeon.stl'
OUT_MAP = '../assets/models/geunjeongjeon.map.json'

# ---------- 1. 파싱 ----------
verts, norms = [], []
with open(SRC) as f:
    for line in f:
        s = line.strip()
        if s.startswith('vertex'):
            verts.append([float(x) for x in s.split()[1:4]])
        elif s.startswith('facet normal'):
            norms.append([float(x) for x in s.split()[2:5]])
V = np.array(verts, dtype=np.float32).reshape(-1, 3, 3)   # (T,3,3)
N = np.array(norms, dtype=np.float32)                      # (T,3)
T = len(V)
print(f'삼각형 {T}개')

# ---------- 2. 재질 그룹 ----------
# 0=석재(월대·계단·기단)  1=목재(기둥·벽·단청)  2=지붕(기와)
# 높이로 석재 기단을 먼저 가르고, 그 위는 면의 기울기로 벽/지붕을 구분한다.
zc = V[:, :, 2].mean(axis=1)
cx = V[:, :, 0].mean(axis=1)
cy = V[:, :, 1].mean(axis=1)
perimeter = np.maximum(np.abs(cx), np.abs(cy)) > 100      # 둘레 회랑
nz = np.abs(N[:, 2])                                      # 면이 얼마나 수평인지

stone_line = np.where(perimeter, 20.0, 28.0)
mat = np.where(
    zc < stone_line, 0,
    np.where(nz < 0.35, 1, 2)      # 수직면=목재, 기울어진 면=지붕
).astype(np.int32)

order = np.argsort(mat, kind='stable')
V, N, mat = V[order], N[order], mat[order]

groups = []
start = 0
for m in range(3):
    cnt = int((mat == m).sum())
    if cnt:
        groups.append({'start': start * 3, 'count': cnt * 3, 'material': m})
        start += cnt
print('재질 그룹:', groups)

# ---------- 3. 바이너리 STL 출력 ----------
with open(OUT_STL, 'wb') as f:
    f.write(b'geunjeongjeon (from OpenSCAD ascii stl)'.ljust(80, b'\0'))
    f.write(struct.pack('<I', T))
    buf = bytearray()
    for i in range(T):
        buf += struct.pack('<12fH', *N[i], *V[i, 0], *V[i, 1], *V[i, 2], 0)
    f.write(buf)
print(f'STL 저장: {OUT_STL}')

# ---------- 4. 충돌용 높이맵 ----------
GRID = 224
MIN_XY, MAX_XY = -160.0, 160.0
CELL = (MAX_XY - MIN_XY) / GRID
Z_CEIL = 45.0        # 이 위(지붕)는 바닥으로 치지 않음
Z_MIN_Q, Z_MAX_Q = -4.0, 42.0   # 높이 양자화 범위

def to_cell(a):
    return np.clip(((a - MIN_XY) / CELL).astype(np.int32), 0, GRID - 1)

floor = np.full((GRID, GRID), -1e9, dtype=np.float32)

zmin_t = V[:, :, 2].min(axis=1)
zmax_t = V[:, :, 2].max(axis=1)
xmin_t, xmax_t = V[:, :, 0].min(axis=1), V[:, :, 0].max(axis=1)
ymin_t, ymax_t = V[:, :, 1].min(axis=1), V[:, :, 1].max(axis=1)

ix0, ix1 = to_cell(xmin_t), to_cell(xmax_t)
iy0, iy1 = to_cell(ymin_t), to_cell(ymax_t)

# 바닥면: 지붕 아래(z<45) 삼각형의 최고 z
for t in range(T):
    if zmax_t[t] >= Z_CEIL:
        continue
    np.maximum.at(floor, (slice(iy0[t], iy1[t] + 1), slice(ix0[t], ix1[t] + 1)), zmax_t[t]) \
        if False else None
    sub = floor[iy0[t]:iy1[t] + 1, ix0[t]:ix1[t] + 1]
    np.maximum(sub, zmax_t[t], out=sub)

floor[floor < -1e8] = 0.0   # 아무것도 없는 칸 = 땅

# 실내 바닥이 비어 있으므로 기단(z≈26) 영역의 구멍만 메움 (회랑은 건드리지 않도록 범위 제한)
HALL_XY = 100.0   # 이 안쪽만 실내로 간주
hall_zone = np.zeros((GRID, GRID), dtype=bool)
c0, c1 = to_cell(np.array([-HALL_XY])), to_cell(np.array([HALL_XY]))
hall_zone[c0[0]:c1[0] + 1, c0[0]:c1[0] + 1] = True

base = (floor >= 24.0) & (floor < 30.0) & hall_zone     # 기단 상면
vals, cnts = np.unique(np.round(floor[base], 1), return_counts=True)
hall_level = float(vals[np.argmax(cnts)]) if len(vals) else 26.0

filled = ndi.binary_fill_holes(ndi.binary_closing(base, np.ones((5, 5), bool)))
newly = filled & ~base & hall_zone & (floor < 24.0)
floor[newly] = hall_level
print(f'실내 바닥 {int(newly.sum())}칸을 z={hall_level:.1f} 로 채움')

# ---------- 4-b. 계단 다듬기 ----------
# 이웃과의 높이차가 작은 곳(=계단)만 평활화해서 램프로 만들고,
# 월대 옆면처럼 큰 단차는 그대로 남겨 못 올라가게 유지
SMOOTH_THRESHOLD = 8.0
orig = floor.copy()

# 원본 기준으로 '절벽 옆'인 칸을 찾아 두고, 그런 칸은 평활화에서 제외한다.
# (이렇게 안 하면 반복하면서 절벽이 경사로가 되어 월대를 그냥 걸어 내려가게 됨)
cliff = np.zeros_like(orig, dtype=bool)
for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
    nb = np.roll(np.roll(orig, dy, axis=0), dx, axis=1)
    cliff |= np.abs(nb - orig) >= SMOOTH_THRESHOLD

for _ in range(4):
    acc = floor.copy()
    cnt = np.ones_like(floor)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        nb = np.roll(np.roll(floor, dy, axis=0), dx, axis=1)
        nb_cliff = np.roll(np.roll(cliff, dy, axis=0), dx, axis=1)
        ok = (np.abs(nb - floor) < SMOOTH_THRESHOLD) & ~nb_cliff
        acc += np.where(ok, nb, 0)
        cnt += ok
    floor = np.where(cliff, orig, acc / cnt)

print(f'절벽 칸 {int(cliff.sum())}개는 원본 높이 유지')

# ---------- 5. 장애물(기둥/벽) 마스크 ----------
blocked = np.zeros((GRID, GRID), dtype=bool)
BAND_LO, BAND_HI = 6.0, 22.0   # 바닥 위 이 높이대에 면이 있으면 막힘
for t in range(T):
    if zmin_t[t] >= Z_CEIL:
        continue
    ys, xs = slice(iy0[t], iy1[t] + 1), slice(ix0[t], ix1[t] + 1)
    f = floor[ys, xs]
    hit = (zmax_t[t] > f + BAND_LO) & (zmin_t[t] < f + BAND_HI)
    blocked[ys, xs] |= hit

# 전각 내부로 들어갈 수 있게 앞/뒤 어칸에 출입구를 냄
# (기둥이 아니라 '긴 벽'인 행을 찾아서 가운데를 뚫음)
mid = GRID // 2
core = np.abs((np.arange(GRID) - mid) * CELL) < 55        # 내벽이 있는 범위
row_len = (blocked & core[None, :]).sum(axis=1)
wall_rows = [r for r in range(GRID) if core[r] and row_len[r] >= 20]
DOOR_HALF = 14.0                                          # 모델단위 출입구 반폭
dc = int(DOOR_HALF / CELL)
opened = 0
for r in wall_rows:
    seg = blocked[r, mid - dc: mid + dc + 1]
    opened += int(seg.sum())
    blocked[r, mid - dc: mid + dc + 1] = False
print(f'내벽 행 {wall_rows} → 출입구 {opened}칸 개방')

print(f'장애물 칸: {int(blocked.sum())} / {GRID*GRID}')

# ---------- 6. 저장 ----------
q = np.clip((floor - Z_MIN_Q) / (Z_MAX_Q - Z_MIN_Q) * 255.0, 0, 255).astype(np.uint8)
packed = np.packbits(blocked.reshape(-1))

meta = {
    'grid': GRID,
    'minXY': MIN_XY,
    'maxXY': MAX_XY,
    'zMin': Z_MIN_Q,
    'zMax': Z_MAX_Q,
    'zCeil': Z_CEIL,
    'groups': groups,
    'modelSize': [float(V[:, :, i].max() - V[:, :, i].min()) for i in range(3)],
    'heights': base64.b64encode(q.tobytes()).decode(),
    'blocked': base64.b64encode(packed.tobytes()).decode(),
}
with open(OUT_MAP, 'w') as f:
    json.dump(meta, f)
import os
print(f'맵 저장: {OUT_MAP} ({os.path.getsize(OUT_MAP)/1024:.0f} KB)')
print(f'STL 크기: {os.path.getsize(OUT_STL)/1024:.0f} KB')

# ---------- 7. 진단 ----------
def at(mx, my):
    i, j = to_cell(np.array([my]))[0], to_cell(np.array([mx]))[0]
    return floor[i, j], blocked[i, j]

print('\n계단 단면 (x=0, y=-130 → -50):')
prev = None
for my in range(-130, -45, 5):
    f, b = at(0, my)
    d = '' if prev is None else f'  Δ{f-prev:+.1f}'
    print(f'  y={my:>5}: floor={f:6.1f} {"[막힘]" if b else "":6}{d}')
    prev = f

print('\n마당/월대 단면 (y=0, x=-150 → 0):')
for mx in range(-150, 5, 10):
    f, b = at(mx, 0)
    print(f'  x={mx:>5}: floor={f:6.1f} {"[막힘]" if b else ""}')

walk = (floor > 24) & (floor < 30)
ys, xs = np.where(walk)
if len(xs):
    print(f'\n기단 상면 범위: x[{MIN_XY+xs.min()*CELL:.0f},{MIN_XY+xs.max()*CELL:.0f}] '
          f'y[{MIN_XY+ys.min()*CELL:.0f},{MIN_XY+ys.max()*CELL:.0f}]  칸수={walk.sum()}')

# 시각화
np.save('/home/claude/floor.npy', floor)
np.save('/home/claude/blocked.npy', blocked)
