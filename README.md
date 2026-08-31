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

- **사람 캐릭터 모델** — GLTF(Mixamo 리깅) 모델에 Idle / Run 애니메이션 적용, 멈춤·달리기 자동 전환
- 고정 각도 카메라 (마우스 회전 없이 플레이어를 계속 따라다님)
- 체크무늬 던전 타일 바닥 + 벽/기둥으로 구획된 아레나, 플레이어를 따라다니는 횃불 조명
- WASD 이동, **구르기(Space)** — 앞으로 한 바퀴 구르며 부드럽게 이동, 구르는 동안 무적
- 공격(X) — 전방 부채꼴 판정 + 베기 궤적 이펙트 + 넉백 + 카메라 흔들림
- 적 4마리가 플레이어를 추격하고 근접 시 공격 (걷기/때리기 모션 포함)
- 체력(HP) / 마나(MP) 바, 스킬 쿨다운 아이콘, 남은 적 카운터, 피격 시 화면 붉은 플래시
- 회전하는 아이템 3개 — 가까이 가면 자동 습득 + 회복 효과 + 토스트 알림
- 체력이 0이 되면 입구에서 재시작

## 조작법

- `W` `A` `S` `D`: 이동
- `Space`: 구르기 (마나 소모, 쿨다운 있음, 구르는 동안 무적)
- `X`: 공격 (전방의 적에게 데미지)

## 캐릭터 모델 바꾸기

`src/main.js` 맨 위의 `CHARACTER_MODEL_URL` 한 줄만 바꾸면 됩니다.

```js
const CHARACTER_MODEL_URL = 'assets/models/내캐릭터.glb';
```

모델 키는 자동으로 정규화되므로(`CHARACTER_HEIGHT`) 크기를 맞출 필요는 없습니다.
Mixamo에서 받은 애니메이션이 들어있으면 `Idle` / `Run` 이름을 그대로 인식합니다.

> 현재 기본 모델은 three.js 예제에 포함된 `Soldier.glb` 를 CDN에서 불러옵니다.

## 로드맵 (TODO)

- [x] 사람 캐릭터 모델(GLTF) + Idle/Run 애니메이션
- [x] 구르기(회피) 및 적 추격 AI
- [ ] 공격 전용 애니메이션 (지금은 팔 스윙 + 이펙트로 대체)
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
