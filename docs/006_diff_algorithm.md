# 006. diff 알고리즘 — 재귀 스택 기반 vnode 비교

> 이 문서는 `src/lib.js`의 `diff` / `diffChildren` / `diffProps` / `applyPatches` 구현을 기준으로 정리한다.

---

## 1. 알고리즘 개요

현재 diff는 **재귀 호출 스택 기반** 알고리즘이다.

- `diff(oldNode, newNode, path)` 가 재귀적으로 vnode 트리를 DFS 순회한다
- JS의 함수 호출 스택이 암묵적인 스택 역할을 한다
- 순회 중 발견한 변경 사항을 **평탄한 patches 배열**로 수집한다
- 각 패치는 `path` 배열로 DOM 위치를 기록한다

실제 코드 흐름:
```
diff(root)
  └─ diffChildren(oldChildren, newChildren, path=[])
       ├─ diff(old[0], new[0], path=[0])
       │    └─ diffChildren(..., path=[0])
       │         └─ diff(old[0][0], new[0][0], path=[0,0])
       ├─ diff(old[1], new[1], path=[1])
       └─ ...
```

---

## 2. path — DOM 위치 주소

각 패치가 들고 있는 `path`는 루트 DOM 노드에서 대상 노드까지의 `childNodes` 인덱스 배열이다.

`applyPatches` 내부에서 `navigate` 함수가 path를 따라 실제 DOM 노드를 탐색한다:

```js
function navigate(path) {
    let node = root;
    for (const i of path) node = node.childNodes[i];
    return node;
}
```

- `path=[]` → 루트 노드 자신
- `path=[1]` → 루트의 두 번째 자식 (`root.childNodes[1]`)
- `path=[1,0]` → 루트의 두 번째 자식의 첫 번째 자식 (`root.childNodes[1].childNodes[0]`)
- 재귀가 깊어질수록 `[...path, i]`로 path가 확장된다

---

## 3. diff 함수 — 노드 단위 비교

```js
export function diff(oldNode, newNode, path = []) {
    if (oldNode == null && newNode == null) return [];
    if (oldNode == null) return [{type: PatchType.CREATE, path, newVNode: newNode}];
    if (newNode == null) return [{type: PatchType.REMOVE, path}];

    if (isText(oldNode) && isText(newNode)) {
        return oldNode !== newNode
            ? [{type: PatchType.TEXT, path, text: newNode}]
            : [];
    }

    const {tag: oldTag, props: oldProps, children: oldChildren} = oldNode;
    const {tag: newTag, props: newProps, children: newChildren} = newNode;

    if (oldTag !== newTag) {
        return [{type: PatchType.REPLACE, path, newVNode: newNode}];
    }

    return [
        ...diffProps(oldProps, newProps, path),
        ...diffChildren(oldChildren || [], newChildren || [], path),
    ];
}
```

각 분기 조건:

1. **null 처리**: `oldNode == null` → CREATE 패치, `newNode == null` → REMOVE 패치
2. **텍스트 노드**: 두 노드 모두 텍스트(문자열·숫자)인 경우, 내용이 다르면 TEXT 패치, 같으면 빈 배열 반환
3. **태그 불일치**: `oldTag !== newTag` 이면 REPLACE 패치 (자식 비교 없이 통째로 교체)
4. **태그 일치**: `diffProps`로 props 비교, `diffChildren`으로 자식 비교를 위임

---

## 4. diffProps — props 단위 비교

```js
function diffProps(oldProps, newProps, path) {
    const changedProps = {};
    const removedProps = [];

    for (const [key, value] of Object.entries(newProps)) {
        if (!Object.is(oldProps[key], value)) {
            changedProps[key] = value;
        }
    }

    for (const key of Object.keys(oldProps)) {
        if (!(key in newProps)) {
            removedProps.push(key);
        }
    }

    if (Object.keys(changedProps).length || removedProps.length) {
        return [{type: PatchType.PROPS, path, props: changedProps, removedProps}];
    }

    return [];
}
```

- `Object.is` 비교로 새 props 중 변경된 항목을 `changedProps`에 수집한다
- 이전 props에는 있지만 새 props에는 없는 키를 `removedProps` 배열에 수집한다
- 변경이 없으면 빈 배열을 반환한다

---

## 5. diffChildren — 자식 배열 비교

모든 자식이 `key` 속성을 가지고 있는지 여부에 따라 두 가지 전략 중 하나를 선택한다:

```js
const keyed =
    oldChildren.every(isKeyed) &&
    newChildren.every(isKeyed);
```

### 5-1. index 기반 diff (key 없음)

old/new 중 긴 쪽 길이만큼 인덱스 순서대로 `diff(old[i], new[i])` 재귀 호출한다:

```js
const len = Math.max(oldChildren.length, newChildren.length);
for (let i = 0; i < len; i++) {
    patches.push(
        ...diff(
            oldChildren[i] ?? null,
            newChildren[i] ?? null,
            [...path, i]
        )
    );
}
```

- 새 배열이 더 길어서 `old[i]`가 없는 경우: `null` → `new[i]` → CREATE 패치 발생
- 구 배열이 더 길어서 `new[i]`가 없는 경우: `old[i]` → `null` → REMOVE 패치 발생

**한계**: 리스트 맨 앞에 항목을 추가하면 모든 인덱스가 밀려 n개 항목이 모두 교체된다.

### 5-2. keyed diff (key 있음)

3단계 과정으로 진행한다:

**1단계: oldKeyMap 구성**

key → 구 배열 인덱스를 O(1) 조회를 위해 Map으로 역인덱스를 구성한다:

```js
const oldKeyMap = new Map();
for (let i = 0; i < oldChildren.length; i++) {
    oldKeyMap.set(oldChildren[i].key, i);
}
```

**2단계: newChildren 순회**

```js
for (let newIdx = 0; newIdx < newChildren.length; newIdx++) {
    const newChild = newChildren[newIdx];
    const oldIdx = oldKeyMap.get(newChild.key);

    if (oldIdx == null) {
        // 신규 key → CREATE
        patches.push({ type: PatchType.CREATE, path: [...path, newIdx], newVNode: newChild });
        continue;
    }

    usedOldIndices.add(oldIdx);
    // 기존 key → 재귀 diff
    patches.push(...diff(oldChildren[oldIdx], newChild, [...path, newIdx]));
}
```

- `oldKeyMap`에 없는 key: CREATE 패치 생성
- `oldKeyMap`에 있는 key: 해당 구 인덱스를 `usedOldIndices`에 기록하고 재귀 diff 호출

**3단계: 사용되지 않은 구 인덱스 → REMOVE**

```js
for (let oldIdx = 0; oldIdx < oldChildren.length; oldIdx++) {
    if (!usedOldIndices.has(oldIdx)) {
        patches.push({ type: PatchType.REMOVE, path: [...path, oldIdx] });
    }
}
```

**REORDER 패치 생성 로직**

CREATE/REMOVE 외에 살아남은 노드의 순서가 바뀌었는지 판별해 REORDER 패치를 생성한다:

```js
const matchedOldIndices = newChildren
    .filter((child) => oldKeyMap.has(child.key))
    .map((child) => oldKeyMap.get(child.key));

const kept = [...usedOldIndices].sort((a, b) => a - b);
const oldToCurrent = new Map(kept.map((idx, i) => [idx, i]));
const order = matchedOldIndices.map((idx) => oldToCurrent.get(idx));
const reordered = order.some((idx, i) => idx !== i);

if (reordered && order.length > 1) {
    patches.push({ type: PatchType.REORDER, path, order });
}
```

각 변수의 의미:

- **`matchedOldIndices`**: 새 순서대로 나열한 "매칭된 구 인덱스" 목록
- **`kept`**: REMOVE되지 않고 살아남은 구 인덱스를 오름차순 정렬한 것
- **`oldToCurrent`**: 구 인덱스 → REMOVE 후 압축된 현재 DOM 위치 매핑 (Map)
- **`order`**: 현재 DOM 위치를 새 순서대로 나열한 배열. `applyPatches`에서 이 순서대로 `appendChild`를 반복해 재배치한다

**예시: 구=[A,B,C], 새=[C,A]**

- B가 새 배열에 없으므로 → REMOVE 패치 (B의 구 인덱스 1)
- `matchedOldIndices`: 새 순서 [C, A]에서 구 인덱스를 뽑으면 `[2, 0]`
- `usedOldIndices`: `{0, 2}` (B=1 제외)
- `kept`: `[0, 2]` (오름차순 정렬)
- `oldToCurrent`: `{ 0→0, 2→1 }` (압축 후 인덱스)
- `order`: `matchedOldIndices=[2, 0]`에 `oldToCurrent` 적용 → `[1, 0]`
- `order=[1, 0]`은 `[0, 0]`이 아니므로 → REORDER 패치 생성

`applyPatches`에서는 REMOVE로 B를 제거한 뒤 DOM은 `[A(0), C(1)]` 상태가 된다. `order=[1, 0]`을 순서대로 `appendChild`하면 `C(1)`, `A(0)` 순으로 끝에 붙여 최종 순서가 `[C, A]`가 된다.

---

## 6. applyPatches — 패치 적용 순서와 이유

**패치 적용 순서: REMOVE → REORDER → 나머지**

```js
const removes = patches.filter((p) => p.type === PatchType.REMOVE).sort(...);
const reorders = patches.filter((p) => p.type === PatchType.REORDER);
const others = patches.filter(
    (p) => p.type !== PatchType.REMOVE && p.type !== PatchType.REORDER
);

for (const patch of [...removes, ...reorders, ...others]) { ... }
```

**REMOVE를 먼저 적용하는 이유**: 낮은 인덱스의 노드를 먼저 삭제하면 형제 노드의 인덱스가 밀려 `navigate`가 잘못된 노드를 가리키게 된다. 따라서 REMOVE는 깊이 우선(깊은 노드 먼저), 같은 깊이에서는 높은 인덱스 우선으로 정렬해 처리한다:

```js
.sort((a, b) => {
    if (a.path.length !== b.path.length) {
        return b.path.length - a.path.length; // 깊은 노드 우선
    }
    const ai = a.path[a.path.length - 1] ?? 0;
    const bi = b.path[b.path.length - 1] ?? 0;
    return bi - ai; // 높은 인덱스 우선
});
```

**REORDER를 나머지보다 앞에 처리하는 이유**: CREATE/PROPS/TEXT 패치의 path는 새 트리 기준이고, REORDER는 REMOVE 직후의 DOM 상태를 기준으로 순서를 재배치한다. REORDER 이후 DOM 순서가 바뀌면 나머지 패치의 path 인덱스가 맞지 않게 되므로, REORDER를 나머지 패치 이전에 처리해야 한다.

**각 패치 타입별 DOM 조작**:

- **CREATE**: `parentPath`로 부모를 찾아 `parent.childNodes[idx]`가 있으면 `insertBefore`, 없으면 `appendChild`
- **REMOVE**: `path`가 `[]`이면 루트 자체를 제거, 아니면 `navigate`로 노드를 찾아 `parentNode.removeChild`
- **REPLACE**: `path`가 `[]`이면 `parent.replaceChild`로 루트를 교체, 아니면 대상 노드를 찾아 `parentNode.replaceChild`
- **PROPS**: `removedProps` 배열의 각 key에 `setProp(node, key, null)`, 변경된 props는 `applyProps`로 적용
- **TEXT**: `node.textContent = patch.text`
- **REORDER**: `Array.from(parent.childNodes)`로 현재 자식 목록을 스냅샷 후, `order` 배열 순서대로 `parent.appendChild(children[i])`를 반복 (DOM에 이미 있는 노드에 `appendChild`를 호출하면 현재 위치에서 제거 후 끝에 추가되는 성질을 이용)

---

## 7. 패치 타입 정리

| 타입 | 발생 조건 | DOM 조작 |
|---|---|---|
| CREATE | 새 노드가 추가됨 | `insertBefore` / `appendChild` |
| REMOVE | 기존 노드가 사라짐 | `removeChild` |
| REPLACE | 태그가 바뀜 | `replaceChild` |
| PROPS | props가 바뀜 | `setAttribute` / `removeAttribute` / `addEventListener` 등 |
| TEXT | 텍스트 내용이 바뀜 | `textContent =` |
| REORDER | keyed 자식 순서가 바뀜 | `appendChild` 반복 |

---

## 8. 현재 알고리즘의 특성과 한계

**특성:**
- 구현이 단순하고 코드가 직관적
- 재귀 깊이 = 트리 깊이 (일반적인 DOM 깊이에서는 문제 없음)
- `path` 배열로 DOM 위치를 주소화해 `applyPatches`가 독립적으로 동작 가능
- REMOVE 정렬 로직을 통해 인덱스 밀림 문제를 안전하게 처리

**한계:**
- index 기반 diff에서 리스트 앞 삽입은 O(n) 교체 발생
- REORDER 판단이 단순 (LCS 기반 최소 이동 계산 없음)
- 대형 트리에서 재귀 호출 깊이 제한 가능성 (실제 DOM은 수백 깊이가 드물어 실용적 문제는 없음)
- keyed diff에서 CREATE 패치의 path가 새 배열 인덱스 기준이어서, REMOVE 이후 DOM 인덱스와 맞지 않을 수 있다 → REORDER 이후 CREATE를 처리하는 순서로 보완

**React와의 비교:**
- React Fiber는 재귀 대신 링크드 리스트 + 반복문으로 트리를 순회해 실행을 중단/재개할 수 있다 (Concurrent Mode)
- 이 구현은 동기적 단일 패스로 완료된다
- React는 key가 없을 때도 동일 타입 재사용 휴리스틱을 적용하지만, 이 구현은 태그 불일치 시 즉시 REPLACE한다
