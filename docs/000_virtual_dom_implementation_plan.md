# Virtual DOM 구현 계획

## 목표

현재 `tag()` 함수가 직접 real DOM을 반환하는 구조를,
**vDOM 객체 반환 → diff → patch** 구조로 전환한다.
VanJS 스타일 API(`const {div, p} = tags`)는 그대로 유지한다.

---

## 1. VNode 데이터 구조

```js
// 요소 노드
{
  $$type: "vnode",      // vDOM 노드 식별 마커
  tag: "div",           // 태그명
  props: { class: "container" },
  children: [vnode | string | number],
  key: "item-1" | null  // props.key에서 추출
}

// 텍스트는 children 배열 안의 string/number 원시값으로 표현
```

- `$$type: "vnode"` 마커로 props 객체와 vDOM 노드를 구분
- `key`는 `props.key`에서 추출 후 props에서 제거 (DOM 속성으로 렌더링하지 않기 위해)

---

## 2. 구현 단계

### Phase 1: tag() → vDOM 반환으로 변경

`tag()`이 `document.createElement` 대신 plain object를 반환하도록 변경.

```js
function isVNode(arg) {
  return arg !== null && typeof arg === "object" && arg.$$type === "vnode";
}

function isProps(arg) {
  return arg !== null && typeof arg === "object" && !isVNode(arg) && !Array.isArray(arg);
}

function tag(name, ...args) {
  let props = {};
  let startIdx = 0;
  if (args.length > 0 && isProps(args[0])) {
    props = { ...args[0] };
    startIdx = 1;
  }
  const key = props.key ?? null;
  delete props.key;
  const children = normalizeChildren(args.slice(startIdx));
  return { $$type: "vnode", tag: name, props, children, key };
}
```

`normalizeChildren`: 배열 평탄화 + null/undefined/boolean 제거.

### Phase 2: createElement() + render()

vDOM → real DOM 생성.

```js
function createElement(vnode) {
  if (typeof vnode === "string" || typeof vnode === "number") {
    return document.createTextNode(String(vnode));
  }
  const el = document.createElement(vnode.tag);
  // props 적용 (on* → addEventListener, class/className, style, setAttribute)
  for (const child of vnode.children) {
    el.appendChild(createElement(child));
  }
  return el;
}

function render(vnode, container) {
  container.innerHTML = "";
  container.appendChild(createElement(vnode));
}
```

> Phase 1+2는 반드시 함께 작업. Phase 1만 하면 모든 테스트가 깨진 상태로 남음.

### Phase 3: diff() 기본 케이스

두 vDOM 트리를 비교하여 patch 목록 반환.

```
diff(oldNode, newNode):
  1. old == null, new != null  → CREATE
  2. old != null, new == null  → REMOVE
  3. 둘 다 텍스트, 값 다름    → TEXT
  4. old.tag !== new.tag       → REPLACE
  5. 같은 tag → diffProps() + diffChildren()
```

**Patch 타입:**

| 타입 | 설명 |
|------|------|
| CREATE | 새 노드 추가 |
| REMOVE | 기존 노드 삭제 |
| REPLACE | 서브트리 전체 교체 |
| PROPS | 속성만 변경 |
| TEXT | 텍스트 내용 변경 |

### Phase 4: Key 기반 리스트 Reconciliation

`diffChildren` 내부에서 key 기반 매칭 수행. **핵심 난이도 구간.**

```
diffChildren(oldChildren, newChildren):
  1. old/new 각각에서 key→index 맵 생성
  2. new children 순회:
     - key가 있고 old에 같은 key 존재 → 해당 old 노드와 재귀 diff
     - key가 있지만 old에 없음 → CREATE
     - key가 없으면 → 인덱스 기반 매칭
  3. old 중 new에 매칭 안 된 것 → REMOVE
```

### Phase 5: applyPatches()

diff 결과를 실제 DOM에 반영.

```js
function applyPatches(domNode, patches) {
  for (const patch of patches) {
    const target = getNodeByPath(domNode, patch.path);
    switch (patch.type) {
      case "CREATE":  /* appendChild */
      case "REMOVE":  /* removeChild */
      case "REPLACE": /* replaceChild */
      case "PROPS":   /* setAttribute / removeAttribute */
      case "TEXT":    /* textContent 갱신 */
    }
  }
}
```

> REMOVE 패치는 뒤에서 앞으로 적용해야 인덱스가 꼬이지 않음.

---

## 3. 주의사항

| 항목 | 설명 |
|------|------|
| 이벤트 핸들러 비교 | 함수는 참조 비교만 가능. 다르면 기존 리스너 제거 후 새로 등록. DOM 노드에 `_listeners` 저장 필요 |
| style 객체 diff | key별 개별 비교 필요 (`JSON.stringify`는 순서 의존성 문제) |
| key 혼합 | key 있는 자식과 없는 자식이 섞이면 분리 처리. key 없는 것은 인덱스 매칭 |
| 패치 적용 순서 | 삭제는 뒤→앞, 추가는 앞→뒤 순서로 처리 |

---

## 4. 테스트 전략

### vDOM 생성 (Phase 1)
- `div()`가 올바른 vnode 객체를 반환하는지
- `isProps()`가 vDOM 노드를 props로 오인하지 않는지

### render (Phase 2)
- 기존 테스트를 `render()` 경유 방식으로 수정
- `render(vnode, container)` 후 `container.innerHTML` 검증

### diff (Phase 3~4)
- 5가지 케이스 각각 단위 테스트
- key 기반 리스트 재정렬 테스트

### 통합 (Phase 5)
- `render(old)` → `diff(old, new)` → `applyPatches()` → DOM 결과가 `render(new)`와 동일한지

---

## 5. Export 목록

```js
export const tags;
export function render(vnode, container);
export function diff(oldVNode, newVNode);
export function applyPatches(domNode, patches);
export function createElement(vnode);
```

---

## 6. 파일 구조

```
src/
  lib.js       # tag(), render(), diff(), applyPatches() 모두 포함
  lib.test.js  # 기존 테스트 수정 + vDOM/diff/patch 테스트 추가
```

학습 프로젝트이므로 단일 파일에 전체 흐름이 보이는 것이 유리.
