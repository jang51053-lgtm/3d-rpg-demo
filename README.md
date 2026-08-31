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

## 현재 포함된 것

- 3인칭 카메라(마우스 드래그로 시점 회전)
- WASD 이동, 간단한 캐릭터/카메라 추적
- 임시 지형(그리드 바닥), 장애물 블록, 플레이스홀더 적(enemy)
- 체력바 HUD

## 조작법

- `W` `A` `S` `D`: 이동
- 마우스 드래그: 시점 회전
- (예정) `Space`: 점프, 좌클릭: 공격

## 로드맵 (TODO)

- [ ] 캐릭터 모델(GLTF) 로딩 및 애니메이션
- [ ] 충돌 처리 및 점프/중력
- [ ] 전투 시스템 (공격, 스킬, 데미지)
- [ ] 인벤토리 / 아이템 시스템
- [ ] 퀘스트 시스템
- [ ] 적 AI 및 스폰
- [ ] 맵/던전 디자인
- [ ] 세이브/로드

## 기술 스택

- [Three.js](https://threejs.org/) — 3D 렌더링 (CDN import map)
- [Vite](https://vitejs.dev/) — (선택) 빌드 도구 / 개발 서버
- GitHub Pages — 정적 호스팅
