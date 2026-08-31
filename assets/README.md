# assets

여기에 무료 3D 에셋(모델/텍스처/사운드)을 넣으면 코드에서 바로 불러올 수 있습니다.

```
assets/
  models/     3D 모델 (.glb, .gltf 권장)
  textures/   이미지 텍스처 (.jpg, .png)
  sounds/     효과음 / 배경음악 (.mp3, .ogg, .wav)
```

## 넣는 방법

1. 아래 사이트 등에서 무료 에셋을 받습니다 (라이선스는 항상 확인하세요).
2. 이 폴더의 해당 하위 폴더에 파일을 올립니다. (GitHub 웹에서 `Add file → Upload files`로도 가능하고, `git add` 로도 가능합니다.)
3. `src/main.js`에 있는 예시 주석(`loadModel`, `loadTexture`, `loadSound`)을 해제하고 파일 경로를 맞춰주면 바로 적용됩니다. 함수 구현은 `src/loaders.js`에 있습니다.

## 추천 무료 에셋 사이트

- [Kenney.nl](https://kenney.nl/assets) — 게임용 3D 모델/텍스처/사운드가 아주 많고 전부 CC0(퍼블릭 도메인)라 라이선스 걱정 없이 바로 써도 됩니다.
- [Poly Haven](https://polyhaven.com/) — 텍스처, HDRI, 일부 3D 모델. 전부 CC0.
- [Sketchfab](https://sketchfab.com/features/free-3d-models) — 무료(CC0/CC-BY) 3D 모델이 많음. 다운로드 시 라이선스 표기 필요한 것도 있으니 확인.
- [Mixamo](https://www.mixamo.com/) — 캐릭터 리깅/애니메이션(걷기, 공격 모션 등)을 무료로 자동 생성해줌. RPG 캐릭터 애니메이션에 특히 유용.
- [OpenGameArt.org](https://opengameart.org/) — 2D/3D 에셋, 사운드 전반.
- [Freesound.org](https://freesound.org/) — 효과음(칼 소리, 발소리 등). 라이선스(CC0/CC-BY 등) 꼭 확인.

## 형식 팁

- 모델은 `.glb`(바이너리, 텍스처 포함이라 파일 하나로 관리하기 편함)를 추천합니다.
- 용량이 큰 모델은 Draco 압축(.glb + Draco)도 지원하도록 `src/loaders.js`에 이미 설정돼 있습니다.
