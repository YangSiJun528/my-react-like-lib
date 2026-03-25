# Vite로 테스트 환경 세팅하기

이 문서는 빈 디렉터리에서 시작해 Vite 기반 프로젝트에 현재 구현을 검증할 테스트 환경을 세팅하는 절차를 정리한다.

목표:

- 브라우저 DOM이 필요한 테스트를 Vitest + jsdom으로 실행한다.
- `src/constants.js`를 유지한 상태로 `src/lib.js`, `src/history.js` 테스트를 돌릴 수 있게 만든다.

## 1. 프로젝트 생성

```bash
npm create vite@latest my-react-like-lib -- --template vanilla
cd my-react-like-lib
npm install
```

vanilla 템플릿을 쓰는 이유:

- 현재 코드는 프레임워크 의존성이 없다.
- DOM API와 ESM만 있으면 된다.

## 2. 테스트 의존성 설치

```bash
npm install -D vitest jsdom
```

필요 이유:

- `vitest`: 테스트 러너
- `jsdom`: 브라우저 DOM API 흉내

## 3. `package.json` 스크립트 정리

`package.json` 예시:

```json
{
  "name": "my-react-like-lib",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest"
  },
  "devDependencies": {
    "jsdom": "^29.0.1",
    "vite": "^8.0.1",
    "vitest": "^4.1.1"
  }
}
```

## 4. 최소 소스 구조 만들기

```text
src/
  constants.js
  lib.js
  history.js
  lib.test.js
```

핵심은 `src/constants.js`를 먼저 만드는 것이다.

## 5. `src/constants.js` 작성

```js
export const NodeType = Object.freeze({
  TEXT: "TEXT_NODE",
  ELEMENT: "ELEMENT_NODE",
});

export function textNode(value) {
  return { nodeType: NodeType.TEXT, value };
}

export function elementNode(type, props = {}, children = []) {
  return { nodeType: NodeType.ELEMENT, type, props, children };
}

export const PatchType = Object.freeze({
  TEXT: "TEXT",
  REPLACE: "REPLACE",
  PROPS: "PROPS",
  ADD: "ADD",
  REMOVE: "REMOVE",
});
```

## 6. 테스트 대상 코드 추가

### `src/lib.js`

- `domToVdom`
- `vdomToDom`
- `renderTo`
- `diff`
- `applyPatches`

### `src/history.js`

- `createHistory`

현재 구현 시그니처는 [Current_API_Signatures_And_Requirements.md](/Users/sijun-yang/Documents/GitHub/my-react-like-lib/plan/Current_API_Signatures_And_Requirements.md)를 따른다.

## 7. 테스트 파일 작성

`src/lib.test.js` 예시 시작점:

```js
import { describe, it, expect } from "vitest";
import {
  domToVdom,
  vdomToDom,
  renderTo,
  diff,
  applyPatches,
  textNode,
  elementNode,
  PatchType,
} from "./lib.js";
import { createHistory } from "./history.js";

function htmlToElement(html) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstChild;
}
```

최소 테스트 범위:

- `domToVdom`: 텍스트 변환, 속성 변환, 중첩 구조 변환, 공백 텍스트 제거
- `vdomToDom`: 텍스트 생성, 요소 생성, props 반영, 자식 재귀 생성
- `renderTo`: 기존 DOM 제거 후 새 DOM 렌더링
- `diff`: `TEXT`, `REPLACE`, `PROPS`, `ADD`, `REMOVE` 생성
- `applyPatches`: 각 패치를 실제 DOM에 반영
- `createHistory`: `push`, `back`, `forward`, truncate 동작

## 8. Vitest 환경 설정 여부

현재 구조에서는 별도 `vitest.config.js` 없이도 테스트가 돈다. 다만 jsdom 환경을 명시하고 싶다면 `vite.config.js`에 아래처럼 추가할 수 있다.

```js
import { defineConfig } from "vite";

export default defineConfig({
  test: {
    environment: "jsdom",
  },
});
```

주의:

- 현재 저장소는 이 설정 없이도 테스트가 동작한다.
- 새 프로젝트에서 DOM 테스트가 `document is not defined`로 실패하면 이 설정을 추가한다.

## 9. 테스트 실행

1. 한 번 실행

```bash
npm test -- --run
```

2. 감시 모드

```bash
npm test
```

## 10. 초기 검증 체크리스트

- `textNode`, `elementNode`가 `src/constants.js`에서 export되는가
- `lib.js`가 `constants.js`를 재수출하는가
- `domToVdom`가 whitespace-only text node를 필터링하는가
- `diff`가 인덱스 기반 비교를 하는가
- `applyPatches`가 `REMOVE`를 역순으로 처리하는가
- `createHistory`가 중간 상태에서 `push`하면 미래 히스토리를 잘라내는가

## 11. 권장 첫 테스트 세트

- 텍스트 노드 round-trip 테스트
- 중첩 요소 round-trip 테스트
- 속성 추가/변경/삭제 diff 테스트
- 패치 적용 후 `domToVdom(dom)`가 기대 vDOM과 같은지 확인하는 통합 테스트
- `undo/redo` 이동 테스트

## 12. 추천 실행 순서

1. `constants.js`
2. `lib.js`의 `vdomToDom`
3. `lib.js`의 `domToVdom`
4. `diff`
5. `applyPatches`
6. `history.js`
7. 통합 테스트

이 순서가 좋은 이유:

- 가장 작은 단위의 데이터 모델부터 고정할 수 있다.
- 렌더링과 변환을 먼저 검증한 뒤 diff/apply로 넘어가면 디버깅 범위가 줄어든다.
