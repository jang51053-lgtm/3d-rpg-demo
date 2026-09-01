# 3d-rpg-demo

Three.js 기반 3D RPG 게임 데모 프로젝트입니다. 아직 초기 단계이며, 이 저장소는 본격적인 개발을 시작하기 위한 뼈대(scaffold)입니다.

## 가장 간단한 실행 방법 — 바로 플레이하기

설치 없이 브라우저에서 바로 플레이할 수 있습니다:

**👉 https://jang51053-lgtm.github.io/3d-rpg-demo/**

(GitHub Pages로 호스팅되어 있어서 링크만 열면 바로 게임이 실행됩니다.)

## 로컬에서 코드 수정하며 실행하기

이 프로젝트는 `index.html`에서 CDN(import map)으로 Three.js를 불러오기 때문에 `npm install`이나 빌드 과정 없이 정적 서버만 띄우면 됩니다.

```bash
git clone https://github.com/jang51053-lgtm/3d-rpg-demo.git
cd 3d-rpg-demo
npx serve .
```

또는 Python이 있다면:

```bash
python3 -m http.server 8000
```

브라우저에서 안내된 주소(예: `http://localhost:3000` 또는 `http://localhost:8000`)로 접속하면 됩니다.

> ES 모듈(`import`)은 브라우저 보안 정책상 `file://`로 직접 열면 동작하지 않아서, 위처럼 간단한 정적 서버가 필요합니다.

### (선택) Vite로 개발하기

번들링/최적화가 필요해지면 Vite도 그대로 쓸 수 있습니다:

```bash
npm install
npm run dev
```

## 무료 3D 에셋 가져다 쓰기

캐릭터 모델, 텍스처, 사운드 같은 무료 에셋을 받아서 바로 적용할 수 있도록 준비돼 있습니다.

1. `assets/models`, `assets/textures`, `assets/sounds` 폴더에 받은 파일을 넣습니다. (추천 사이트와 자세한 설명은 [`assets/README.md`](assets/README.md) 참고)
2. `src/loaders.js`에 있는 `loadModel()` / `loadTexture()` / `loadSound()` 함수로 불러옵니다.
3. `src/main.js`에 사용 예시가 주석으로 이미 들어있으니, 주석을 풀고 파일 경로만 맞추면 됩니다.

`.glb` 같은 3D 모델 파일도 그냥 저장소에 커밋하면 되고, GitHub Pages/로컬 서버 양쪽에서 동일하게 동작합니다.

## 현재 포함된 것

고정 각도 쿼터뷰(탑뷰) 던전 크롤러 스타일 프로토타입입니다.

- **검과 방패를 든 기사 캐릭터** — KayKit Adventurers `Knight` 모델(CC0). 모델에 포함된 실제 애니메이션만 사용합니다.
- 고정 각도 카메라 (마우스 회전 없이 플레이어를 계속 따라다님)
- 체크무늬 던전 타일 바닥 + 벽/기둥으로 구획된 아레나, 플레이어를 따라다니는 횃불 조명

### 액션 (모두 전용 모션)

| 액션 | 애니메이션 | 내용 |
| --- | --- | --- |
| 검 공격 | `1H_Melee_Attack_Slice_Diagonal` | 검이 실제로 닿는 0.22초 시점에 판정, 베기 궤적 + 넉백 + 카메라 흔들림 |
| 돌진 | `1H_Melee_Attack_Stab` | 검을 앞으로 뻗고 7.5칸 돌진, 지나가는 적 전부 타격(20 데미지·강한 넉백) |
| 구르기 | `Dodge_Forward` / `Backward` / `Left` / `Right` | 진행 방향에 맞는 **4방향 구르기**, 구르는 동안 무적 |
| 방어 | `Blocking` / `Block_Hit` | 홀드하는 동안 방패를 들고 **정면 공격 데미지 85% 감소**, 시선 고정 게걸음, 막을 때 가드 이펙트 |
| 피격 | `Hit_A` | 맞으면 휘청이는 모션 + 화면 붉은 플래시 |
| 사망 | `Death_A` | 쓰러지는 모션 후 입구에서 부활 |

> 방어 중에는 시선이 고정되어 게걸음이 되고, 이때 옆·뒤로 구르면 해당 방향 구르기 모션이 나옵니다.
> 방어 중에는 마나가 회복되지 않습니다.

- 적 4마리(붉게 물들인 기사)가 추격 → 근접 시 검 공격, 맞으면 피격 모션, 처치 시 사망 모션
- 체력(HP) / 마나(MP) 바, 스킬 4종 쿨다운 아이콘, 남은 적 카운터
- 회전하는 아이템 3개 — 가까이 가면 자동 습득 + 회복 효과 + 토스트 알림

## 조작법

| 동작 | 마우스 / 키보드 | 터치·트랙패드 |
| --- | --- | --- |
| 이동 | `W` `A` `S` `D` | — |
| 공격 | **마우스 좌클릭** (또는 `X`) | 🗡️ 버튼 |
| 방어 | **마우스 우클릭 홀드** (또는 `Q` 홀드) | 🛡️ 버튼 길게 누르기 |
| 구르기 | `Space` | 🤸 버튼 |
| 돌진 | `Shift` | ⚡ 버튼 |

마나 소모: 구르기 25 · 돌진 30 (자동 회복, 방어 중에는 회복 정지)

## 캐릭터 모델 / 무기 바꾸기

`src/main.js` 맨 위의 상수만 고치면 됩니다.

```js
const CHARACTER_MODEL_URL = 'assets/models/내캐릭터.glb';  // 모델 교체
const EQUIP_VISIBLE = new Set(['1H_Sword']);               // 손에 들 장비 선택
```

- 모델 키는 `CHARACTER_HEIGHT` 기준으로 자동 정규화되므로 크기를 맞출 필요가 없습니다.
- KayKit 캐릭터는 무기·방패가 모두 모델에 포함되어 있고 보이기/숨기기로 장비를 바꿉니다.
  `EQUIP_VISIBLE` 에 `'2H_Sword'`(양손검), `'Round_Shield'`(방패) 등을 넣으면 그대로 장착됩니다.
- 애니메이션 이름은 상단 `ANIM` 객체에서 지정합니다. 같은 KayKit 팩의 다른 캐릭터
  (Barbarian / Mage / Rogue)는 애니메이션 이름이 같아서 URL만 바꿔도 바로 동작합니다.

## 에셋 출처

- 캐릭터: [KayKit Character Pack: Adventurers](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) by Kay Lousberg — **CC0** (상업적 이용 포함 자유, 출처 표기 불필요)

## 로드맵 (TODO)

- [x] 검을 든 기사 캐릭터 모델 + 전용 애니메이션
- [x] 4방향 구르기 · 돌진 · 방패 방어 · 피격/사망 모션
- [x] 마우스 좌클릭 공격 / 우클릭 방어 + 터치용 화면 버튼
- [ ] 콤보 공격 (모델에 Chop / Slice_Horizontal / Stab 등이 더 있어 연결 가능)
- [ ] 방어 중 반격 (`Block_Attack` 애니메이션 포함되어 있음)
- [ ] 정밀한 충돌 처리 (지금은 위치 클램프만 적용)
- [ ] 스킬 다양화 (범위 공격, 궁극기 등)
- [ ] 인벤토리 / 아이템 효과 시스템
- [ ] 퀘스트 시스템
- [ ] 적 AI (추적/공격 패턴)
- [ ] 맵/던전 여러 개로 확장
- [ ] 세이브/로드

## 기술 스택

- [Three.js](https://threejs.org/) — 3D 렌더링 (CDN import map)
- [Vite](https://vitejs.dev/) — (선택) 빌드 도구 / 개발 서버
- GitHub Pages — 정적 호스팅
