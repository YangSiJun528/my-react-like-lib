# 현재 구현 시그니처와 요구사항

이 문서는 현재 `src/constants.js`, `src/lib.js`, `src/history.js` 기준의 공개 API 시그니처와 구현이 전제하는 요구사항을 정리한다.

## 목표 범위

- 문자열 텍스트 노드와 일반 HTML Element만 다룬다.
- 단순한 가상 DOM 구조를 생성한다.
- 두 vDOM 트리를 비교해 패치를 만든다.
- 패치를 실제 DOM에 적용한다.
- undo/redo 가능한 히스토리 객체를 제공한다.

## 공개 모듈

### `src/constants.js`

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

### `src/lib.js`

```js
export { NodeType, PatchType, textNode, elementNode } from "./constants.js";

export function domToVdom(domNode) {}
export function vdomToDom(vnode) {}
export function renderTo(container, vdom) {}
export function diff(oldVdom, newVdom, path = []) {}
export function applyPatches(rootDom, patches) {}
```

### `src/history.js`

```js
export function createHistory(initialVdom) {
    //TODO
}
```

## 데이터 시그니처

### `TextVNode`

```js
{
  nodeType: NodeType.TEXT,
  value: string,
}
```

요구사항:

- `value`는 문자열이어야 한다.
- 텍스트 노드는 `type`, `props`, `children`를 가지지 않는다.

### `ElementVNode`

```js
{
  nodeType: NodeType.ELEMENT,
  type: string,
  props: Record<string, string>,
  children: VNode[],
}
```

요구사항:

- `type`은 소문자 태그명 문자열이어야 한다.
- `props`는 문자열 값을 가지는 평범한 객체여야 한다.
- `children`은 `VNode` 배열이어야 한다.

### `VNode`

```js
type VNode = TextVNode | ElementVNode
```

생성 규칙:

- 텍스트 노드는 `textNode(value)`로 만든다.
- 요소 노드는 `elementNode(type, props, children)`로 만든다.
- 직접 객체 리터럴을 만드는 대신 팩토리 함수를 사용하는 것을 전제로 한다.

### 패치 객체

```js
{ type: PatchType.TEXT, path: number[], value: string }
{ type: PatchType.REPLACE, path: number[], newNode: VNode }
{ type: PatchType.PROPS, path: number[], props: Record<string, string | null> }
{ type: PatchType.ADD, path: number[], newNode: VNode }
{ type: PatchType.REMOVE, path: number[] }
```

## 함수별 요구사항

### `domToVdom(domNode)`

역할:

- 실제 DOM 노드를 현재 vDOM 구조로 변환한다.

입력 요구사항:

- `domNode`는 `Text` 또는 `Element`여야 한다.
- `Comment`, `DocumentFragment` 같은 다른 노드 타입은 지원 대상이 아니다.

출력 규칙:

- 텍스트 노드면 `textNode(domNode.textContent)`를 반환한다.
- 요소 노드면 `elementNode(type, props, children)`를 반환한다.
- 태그명은 `tagName.toLowerCase()`로 소문자화한다.
- 속성은 `NamedNodeMap`을 순회해 `{ [attr.name]: attr.value }` 형태로 복사한다.
- 자식 중 공백만 있는 텍스트 노드는 버린다.

주의사항:

- 들여쓰기나 줄바꿈으로 생긴 whitespace text node는 결과에서 사라진다.
- 따라서 원본 DOM과 vDOM 사이에 공백 텍스트를 완전 보존하지 않는다.

### `vdomToDom(vnode)`

역할:

- vDOM을 실제 DOM으로 재귀 생성한다.

입력 요구사항:

- `vnode`는 유효한 `VNode`여야 한다.
- `nodeType === NodeType.TEXT`이면 `value`가 있어야 한다.
- `nodeType === NodeType.ELEMENT`이면 `type`, `props`, `children`이 있어야 한다.

동작 규칙:

- 텍스트 노드는 `document.createTextNode(vnode.value)`를 만든다.
- 요소 노드는 `document.createElement(vnode.type)`를 만든다.
- `props`는 `setAttribute`로 모두 반영한다.
- `children`은 순서대로 재귀 렌더링해 `appendChild`한다.

제약사항:

- 이벤트 핸들러, 스타일 객체, boolean prop 같은 특수 케이스는 처리하지 않는다.
- 속성 값은 문자열 기반으로만 다룬다.

### `renderTo(container, vdom)`

역할:

- 컨테이너를 비운 뒤 새 vDOM을 렌더링한다.

동작 규칙:

- `container.innerHTML = ""`로 기존 내용을 전부 제거한다.
- 이어서 `vdomToDom(vdom)` 결과를 `appendChild`한다.

의미:

- 증분 업데이트가 아니라 전체 교체 렌더링이다.

### `diff(oldVdom, newVdom, path = [])`

역할:

- 두 vDOM 트리를 비교해 패치 목록을 만든다.

입력 요구사항:

- `oldVdom`, `newVdom`은 유효한 `VNode`여야 한다.
- `path`는 현재 비교 위치를 나타내는 인덱스 배열이다.

동작 규칙:

- 두 노드가 모두 텍스트면 `value`가 다를 때만 `TEXT` 패치를 만든다.
- `nodeType`이 다르면 `REPLACE` 패치를 만든다.
- 둘 다 요소인데 `type`이 다르면 `REPLACE` 패치를 만든다.
- 같은 요소면 `props`를 비교해 변경점이 있을 때만 `PROPS` 패치를 만든다.
- 자식은 인덱스 기반으로 비교한다.
- `new`에만 자식이 있으면 `ADD`, `old`에만 자식이 있으면 `REMOVE`를 만든다.
- 둘 다 있으면 재귀 비교한다.

제약사항:

- `key` 기반 재배치가 없다.
- 형제 순서 변경은 효율적으로 처리하지 못하고 교체나 텍스트 변경 조합으로 귀결된다.
- 패치 순서는 구현 순서에 의존한다.

### `applyPatches(rootDom, patches)`

역할:

- 패치 목록을 실제 DOM에 반영한다.

동작 규칙:

- `REMOVE` 패치는 마지막 인덱스 기준 내림차순으로 먼저 정렬한다.
- `REMOVE`를 제외한 패치를 먼저 적용하고, 그 뒤 `REMOVE`를 적용한다.
- `path`를 따라 `childNodes[index]`로 대상 DOM을 탐색한다.

패치별 처리:

- `REPLACE`: 대상 노드를 `newNode`로 교체한다.
- `PROPS`: `null`이면 속성을 제거하고, 그 외에는 `setAttribute`한다.
- `TEXT`: `target.textContent = patch.value`로 변경한다.
- `REMOVE`: 대상 노드를 부모에서 제거한다.
- `ADD`: `path`의 부모까지만 찾은 뒤 `appendChild(vdomToDom(newNode))`한다.

중요 제약:

- 현재 `ADD`는 `path`의 정확한 형제 위치에 끼워 넣지 않고 항상 부모의 끝에 추가한다.
- 따라서 중간 삽입이 필요한 경우에도 append 동작으로 처리된다.

### `createHistory(initialVdom)`

역할:

- vDOM 상태 스냅샷에 대해 undo/redo를 제공한다.

입력 요구사항:

- `initialVdom`은 초기 상태로 저장 가능한 `VNode`여야 한다.

반환 객체 시그니처:

```js
{
  push(vdom): void,
  current(): VNode,
  back(): VNode,
  forward(): VNode,
  canBack(): boolean,
  canForward(): boolean,
  entries(): VNode[],
  currentIndex(): number,
}
```

동작 규칙:

- `push(vdom)`는 현재 인덱스 뒤의 상태를 잘라내고 새 상태를 추가한다.
- `back()`은 이전 상태가 있으면 한 칸 이동한다.
- `forward()`는 다음 상태가 있으면 한 칸 이동한다.
- `entries()`는 내부 배열의 얕은 복사본을 반환한다.

제약사항:

- 깊은 복사를 하지 않으므로 외부에서 같은 객체를 변경하면 히스토리 스냅샷 불변성이 깨질 수 있다.

## 새 프로젝트로 옮길 때 유지해야 할 핵심 규칙

- `src/constants.js`는 `NodeType`, `PatchType`, `textNode`, `elementNode`의 단일 출처로 유지한다.
- `VNode` 생성은 팩토리 함수 경유를 기본 규칙으로 둔다.
- `diff`는 계속 인덱스 기반 비교라는 사실을 문서화한다.
- `applyPatches`의 `ADD`가 append 기반이라는 현재 제약을 명시적으로 유지하거나, 바꿀 경우 별도 설계 결정을 남긴다.
- whitespace-only 텍스트 노드 제거 여부를 프로젝트 규칙으로 고정한다.
- 테스트는 라운드트립, 패치 생성, 패치 적용, 히스토리 동작을 최소 회귀 범위로 유지한다.
