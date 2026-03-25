# Vite로 실행 코드 세팅하기

이 문서는 빈 디렉터리에서 시작해 브라우저에서 현재 구현을 직접 실행해 볼 수 있는 Vite 런타임 환경을 세팅하는 절차를 정리한다.

목표:

- `src/constants.js`를 유지한다.
- `src/lib.js`, `src/history.js`를 import 가능한 구조로 둔다.
- `src/main.js`에서 샘플 vDOM을 렌더링한다.

## 1. 프로젝트 생성

```bash
npm create vite@latest my-react-like-lib -- --template vanilla
cd my-react-like-lib
npm install
```

## 2. 기본 파일 구조 정리

최종적으로는 아래 정도면 충분하다.

```text
index.html
src/
  constants.js
  lib.js
  history.js
  main.js
```

`src/counter.js`, 기본 CSS, 기본 로고 파일은 필요 없으면 지워도 된다.

## 3. `src/constants.js` 작성

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

## 4. `src/lib.js` 작성

구현 항목:

- `NodeType`, `PatchType`, `textNode`, `elementNode` 재수출
- `domToVdom`
- `vdomToDom`
- `renderTo`
- `diff`
- `applyPatches`

이 모듈은 새 프로젝트의 진입점이 아니라 런타임 라이브러리 역할을 한다.

## 5. `src/history.js` 작성

구현 항목:

- `createHistory(initialVdom)`

이 모듈은 샘플 앱에서 undo/redo를 붙일 때 바로 사용할 수 있다.

## 6. `index.html` 준비

최소 예시:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>my-react-like-lib</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

## 7. `src/main.js` 작성

가장 단순한 렌더링 예시:

```js
import { renderTo, elementNode, textNode } from "./lib.js";

const app = document.querySelector("#app");

const vdom = elementNode("div", { id: "root" }, [
  elementNode("h1", {}, [textNode("Virtual DOM Demo")]),
  elementNode("p", { style: "color: blue" }, [textNode("Hello from Vite")]),
  elementNode("ul", {}, [
    elementNode("li", {}, [textNode("Item 1")]),
    elementNode("li", {}, [textNode("Item 2")]),
    elementNode("li", {}, [textNode("Item 3")]),
  ]),
]);

renderTo(app, vdom);
```

이 단계에서 확인할 것:

- 브라우저에 제목, 문단, 리스트가 보이는가
- `renderTo`가 컨테이너 내용을 비우고 새 DOM을 넣는가

## 8. 변경 감지 데모까지 붙이고 싶다면

`diff`와 `applyPatches`를 이용한 예시:

```js
import {
  renderTo,
  vdomToDom,
  diff,
  applyPatches,
  elementNode,
  textNode,
} from "./lib.js";

const app = document.querySelector("#app");

const oldVdom = elementNode("div", {}, [
  elementNode("h1", {}, [textNode("Hello")]),
  elementNode("p", {}, [textNode("Before")]),
]);

const newVdom = elementNode("div", {}, [
  elementNode("h1", {}, [textNode("Changed")]),
  elementNode("p", { class: "done" }, [textNode("After")]),
]);

const rootDom = vdomToDom(oldVdom);
app.appendChild(rootDom);

const patches = diff(oldVdom, newVdom);
applyPatches(rootDom, patches);
```

주의:

- `ADD`는 현재 구현상 지정 인덱스 삽입이 아니라 append로 처리된다.
- 리스트 중간 삽입까지 정확히 보여주려면 `applyPatches`를 먼저 개선해야 한다.

## 9. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 기본 주소를 열어 확인한다.

## 10. 추천 파일 작성 순서

1. `src/constants.js`
2. `src/lib.js`
3. `src/main.js`
4. `src/history.js`
5. 필요하면 `src/lib.test.js`

이 순서가 좋은 이유:

- 데이터 모델이 먼저 고정된다.
- 실행 화면을 먼저 만들면 라이브러리의 동작을 빠르게 육안 검증할 수 있다.
- 이후 테스트를 붙일 때 기대 동작을 이미 한 번 확인한 상태가 된다.

## 11. 새 프로젝트 시작 시 유지할 규칙

- `src/constants.js`를 데이터 모델의 단일 진입점으로 둔다.
- `textNode`, `elementNode`만으로 vDOM을 만들도록 팀 규칙을 둔다.
- `src/lib.js`는 라이브러리 공개 API만 노출한다.
- `src/main.js`는 데모 또는 실제 앱 진입점 역할만 맡긴다.
- 테스트와 실행 코드는 분리한다.

## 12. 최소 런타임 확인 체크리스트

- `npm run dev`가 뜨는가
- `#app`에 렌더링 결과가 보이는가
- `elementNode` 중첩 구조가 실제 DOM으로 변환되는가
- `textNode`가 텍스트 노드로 보이는가
- 필요 시 `diff`와 `applyPatches`가 화면 변화를 만들 수 있는가
