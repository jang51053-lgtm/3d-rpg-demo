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

- 고정 각도 카메라 (마우스 회전 없이 플레이어를 계속 따라다님)
- 체크무늬 던전 타일 바닥 + 벽/기둥으로 구획된 아레나
- WASD 이동, 대시(Space, 마나 소모 + 쿨다운), 공격(X, 전방 부채꼴 판정)
- 체력(HP) / 마나(MP) 바, 스킬 쿨다운 아이콘, 남은 적 카운터 HUD
- 적 4마리 배치 — 공격 시 히트 플래시, 처치 시 사라지는 애니메이션과 카운터 갱신
- 회전하는 아이템 3개 — 가까이 가면 자동 습득 + 토스트 알림

## 조작법

- `W` `A` `S` `D`: 이동
- `Space`: 대시 (마나 소모, 쿨다운 있음)
- `X`: 공격 (전방의 적에게 데미지)

## 로드맵 (TODO)

- [ ] 무료 에셋으로 캐릭터 모델(GLTF) 교체 및 애니메이션 적용
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
