# 새 프로젝트 초기 구성 계획

이 문서는 새 프로젝트를 시작할 때 필요한 최소 계획만 정리한다.

목표:

- `src/constants.js`를 유지한다.
- 공개 시그니처만 먼저 고정한다.
- 구현 본문은 비워 두고, 파일 구조와 진입점만 세팅한다.
- Vite로 실행 코드와 테스트 코드를 붙일 수 있는 초기 상태를 만든다.

## 1. 시작 명령

```bash
 npm create vite@latest dom-vdom -- --template vanilla
 cd dom-vdom
npm install
npm install -D vitest jsdom
```

## 2. 초기 파일 구조

```text
index.html
package.json
src/
  constants.js
  lib.js
  history.js
  main.js
  lib.test.js
```

## 3. `package.json` 기준

```json
{
  "name": "dom-vdom",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest"
  }
}
```

## 4. `src/constants.js`

이 파일은 실제 구현을 시작하기 전에 먼저 고정한다.

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

## 5. `src/lib.js` 시그니처

처음에는 함수 몸체를 구현하지 않고 자리만 만든다.

```js
export { NodeType, PatchType, textNode, elementNode } from "./constants.js";

export function domToVdom(domNode) {
  // TODO
}

export function vdomToDom(vnode) {
  // TODO
}

export function renderTo(container, vdom) {
  // TODO
}

export function diff(oldVdom, newVdom, path = []) {
  // TODO
}

export function applyPatches(rootDom, patches) {
  // TODO
}
```

## 6. `src/history.js` 시그니처

```js
export function createHistory(initialVdom) {
  // TODO
}
```

원하면 나중에 아래 형태로 확장한다.

```js
{
  push(vdom) {},
  current() {},
  back() {},
  forward() {},
  canBack() {},
  canForward() {},
  entries() {},
  currentIndex() {},
}
```

## 7. `src/main.js` 초기 구성

실행 코드 진입점만 만든다.

```js
import { elementNode, textNode, renderTo } from "./lib.js";

const app = document.querySelector("#app");

const initialVdom = elementNode("div", {}, [
  textNode("TODO"),
]);

renderTo(app, initialVdom);
```

주의:

- 이 코드는 `renderTo`가 구현되기 전까지는 실행용 자리만 잡는 수준이다.

## 8. `src/lib.test.js` 초기 구성

테스트 파일도 구조만 먼저 만든다.

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

describe("placeholder", () => {
  it("setup", () => {
    expect(typeof textNode).toBe("function");
    expect(typeof elementNode).toBe("function");
  });
});
```

## 9. `index.html` 초기 구성

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>dom-vdom</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

## 10. 구현 시작 순서

1. `constants.js`
2. `lib.js`의 `vdomToDom`
3. `lib.js`의 `domToVdom`
4. `renderTo`
5. `diff`
6. `applyPatches`
7. `history.js`
8. 테스트 보강

## 11. 이 문서의 범위

이 문서는 아래만 다룬다.

- 어떤 파일이 필요한지
- 어떤 함수 시그니처를 먼저 만들지
- Vite에서 어떤 명령으로 시작할지

이 문서는 아래는 다루지 않는다.

- 각 함수의 상세 동작 규칙
- 패치 알고리즘 세부 요구사항
- 구현 제약과 예외 케이스 정리
