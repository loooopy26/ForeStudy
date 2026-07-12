# 캐릭터 옷 파츠(Paper Doll 레이어) 규격

캐릭터 화면은 **종이인형(Paper Doll)** 방식입니다.
`src/assets/character-base.png`(옷 없는 기본 몸통) 위에, 이 폴더의 **투명 PNG 파츠**를 z-순서로 겹칩니다.

## 파일 규격 (★중요)
- **캔버스 크기·정렬을 `character-base.png`와 100% 동일하게** (현재 **721 × 860 px**).
  - 기본 몸통을 캔버스로 열고 그 위에 **그 옷만** 그린 뒤, **옷 픽셀만 남기고 나머지는 전부 투명(alpha 0)** 으로 저장.
  - "옷 입은 고양이 전체"가 아니라 **옷만** 있어야 합니다. (고양이째로 그리면 몸통이 두 겹이 됩니다.)
- **투명 배경 PNG (RGBA)**, 같은 손그림 화풍.
- 포즈가 고정이라 파츠들끼리 자동으로 정합됩니다.

## 만드는 법 (권장: img2img / 인페인팅)
1. `character-base.png`를 소스로 넣는다.
2. "이 고양이에 <옷>만 입혀줘, 포즈·크기 그대로, 배경 투명" 으로 생성.
3. 결과에서 **옷 픽셀만** 남기고 투명 추출 → `public/layers/<아이템id>.png`.

## 파일명 = 아이템 id
`src/goods.js`의 `CATALOG` id. 예: `green-jacket.png`, `bear-hood.png`, `leaf-hat.png`, `green-backpack.png`, `red-scarf.png`

## 활성화
아이템에 `layer` 필드를 달면 그 파츠가 겹쳐집니다. `src/goods.js`:
```js
{ id: 'green-jacket', name: '초록 재킷', price: 800, kind: 'outfit',
  art: 'jacket', color: '#7d9c62', trim: '#5f7a43',
  layer: 'green-jacket.png' },   // ← 이 줄 추가
```
파일만 `public/layers/`에 주시면 이 연결은 대신 해드립니다.

## 겹침 순서(z-index)
`의상(10) → 가방(20) → 액세서리(30) → 모자(40)` (기본 몸통 0).
가방끈이 옷 위로 오는 것처럼, 앞/뒤 가림은 각 PNG 그림 자체에 포함해 그리면 됩니다.
