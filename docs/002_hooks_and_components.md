# 002. 컴포넌트와 훅 — 개념과 동작 방식

> 이 문서는 `src/lib.js`의 완성된 코드를 읽는 사람을 위한 **개념 해설**이다.
> VirtualDOM의 diff/patch 동작은 `docs/000`을 참고한다.

> 개념이 처음이라면 `docs/003`의 단계별 해설을 먼저 읽어도 좋다.

---

## 1. 컴포넌트란?

UI를 구성하는 **독립적인 단위**다. 화면의 일부를 담당하면서 자신의 상태와 렌더링 로직을 함께 갖는다.

이 라이브러리는 **함수형 컴포넌트**만 지원한다. 컴포넌트는 단순히 vnode를 반환하는 JavaScript 함수다:

```js
function Counter() {
    const [count, setCount] = useState(0);
    return div(
        p(`카운트: ${count}`),
        button({ onclick: () => setCount(count + 1) }, "증가")
    );
}
```

---

## 2. FunctionComponent 클래스

`FunctionComponent`는 함수형 컴포넌트를 감싸는 **내부 관리 객체**다. 함수가 반환한 vnode, 연결된 실제 DOM 노드, 훅 데이터를 여기에 보관한다.

### 주요 필드

| 필드 | 역할 |
|------|------|
| `fn` | 사용자가 정의한 컴포넌트 함수 |
| `hooks[]` | 훅 슬롯 배열. 렌더 간 데이터 지속 |
| `hookIndex` | 현재 렌더에서 몇 번째 훅을 처리 중인지 |
| `vnode` | 마지막으로 렌더된 vnode 트리 (diff의 기준) |
| `domNode` | 실제 DOM 노드에 대한 참조 |

### 주요 메서드

| 메서드 | 역할 |
|--------|------|
| `mount(container)` | 초기 렌더 및 DOM 삽입 |
| `_render()` | 컴포넌트 함수 실행 → 새 vnode 반환 |
| `_commit(newVNode)` | 새 vnode로 DOM 갱신 (diff → patch) |
| `_flushEffects()` | 렌더 후 대기 중인 이펙트 실행 |
| `_doUpdate()` | 상태 변경 시 재렌더 진입점 |
| `update()` | 리렌더를 rAF로 예약 (setRoot에서 주입) |

---

## 3. 훅(Hook)이란?

함수형 컴포넌트에서 **상태와 사이드이펙트를 다루는 방법**이다.
컴포넌트 함수 자체는 렌더마다 새로 실행되지만, 훅을 통해 **값을 렌더 사이에 유지**할 수 있다.

### 핵심 규칙: 호출 순서를 고정해야 한다

훅은 반드시 **매 렌더마다 같은 순서로 호출**되어야 한다.
조건문, 반복문, 중첩 함수 안에서 훅을 호출하면 안 되는 이유가 여기에 있다.

```js
// ❌ 잘못된 예 — 조건에 따라 훅 호출 순서가 달라짐
function Bad() {
    if (someCondition) {
        const [a, setA] = useState(0); // 어떤 렌더에서는 슬롯 0, 어떤 렌더에서는 없음
    }
    const [b, setB] = useState(""); // 슬롯 번호가 불안정해짐
}
```

이 규칙이 존재하는 이유는 구현 방식과 직접 연결된다.

---

## 4. 훅 내부 구현 메커니즘

### hooks[] 배열과 hookIndex

훅 데이터는 `FunctionComponent`의 `hooks[]` 배열에 **인덱스 순서대로** 저장된다.

```
첫 렌더 후 hooks[] 상태 예시:
  hooks[0] = { value: 0, set: fn }           ← useState(0)
  hooks[1] = { fn, deps, cleanup, pending }  ← useEffect(...)
  hooks[2] = { value: 42, deps, initialized } ← useMemo(...)
```

렌더가 시작될 때 `hookIndex`를 0으로 리셋하고, 훅이 호출될 때마다 1씩 증가시킨다.
이렇게 하면 같은 순서로 호출된 훅은 항상 같은 슬롯을 가리키게 된다.

### getHook(init)

모든 훅의 공통 진입점이다:

```js
function getHook(init) {
    const i = currentComponent.hookIndex++;
    if (currentComponent.hooks[i] === undefined) {
        currentComponent.hooks[i] = init; // 첫 렌더에만 초기화
    }
    return currentComponent.hooks[i];
}
```

- 첫 렌더: 슬롯이 비어 있으므로 `init`으로 초기화
- 이후 렌더: 같은 인덱스에서 이전 데이터를 그대로 반환

### currentComponent

`currentComponent`는 **렌더 중에만 값을 갖는 전역 변수**다.
훅(`useState`, `useEffect` 등)은 어떤 컴포넌트 인스턴스에 속하는지 직접 알 수 없다.
`_render()` 실행 중에 `currentComponent`를 현재 인스턴스로 설정해두면, 훅 내부에서 이를 참조할 수 있다.

```js
_render() {
    currentComponent = this;
    this.hookIndex = 0;
    try {
        return this.fn();   // ← 이 안에서 훅들이 currentComponent를 참조
    } finally {
        currentComponent = null; // 렌더 완료 후 반드시 초기화
    }
}
```

`try/finally`로 에러가 발생해도 `currentComponent`가 null로 복원되도록 보장한다.

### depsChanged(prev, next)

의존성 배열을 비교하는 헬퍼다. 이전 배열과 새 배열을 `Object.is`로 항목마다 비교한다.
배열 자체가 없거나 길이가 다르면 무조건 변경된 것으로 판단한다.

---

## 5. useState — 상태 관리

컴포넌트가 렌더 사이에 값을 유지하고, 값이 바뀌면 리렌더를 예약한다.

### 슬롯 구조

```js
{ value: T, set: Function }
```

### 동작 방식

1. 첫 렌더: 슬롯에 `{ value: initialValue, set: null }` 저장
2. setter(`set`)를 한 번만 생성해 슬롯에 저장 — 매 렌더마다 새로 만들지 않는다
3. setter 호출 시 `Object.is`로 이전 값과 비교 — 같으면 리렌더 하지 않음
4. 값이 다르면 슬롯의 `value`를 갱신하고 `comp.update()` 호출

### setter가 comp를 클로저로 캡처하는 이유

setter는 렌더 이후 비동기적으로 호출된다 (버튼 클릭 등). 이 시점에는 `currentComponent`가 이미 null이다.
그래서 `useState` 실행 시점에 `comp = currentComponent`로 캡처해둔다.

```js
export function useState(initialValue) {
    const comp = currentComponent; // 렌더 중에 캡처
    const hook = getHook({ value: initialValue, set: null });

    if (!hook.set) {
        hook.set = (next) => {
            const value = typeof next === "function" ? next(hook.value) : next;
            if (Object.is(hook.value, value)) return;
            hook.value = value;
            comp.update(); // 캡처된 comp를 통해 리렌더 예약
        };
    }
    return [hook.value, hook.set];
}
```

---

## 6. useEffect — 사이드이펙트 관리

DOM 반영 이후에 실행해야 하는 작업(API 호출, 타이머, 이벤트 리스너 등)을 다룬다.

### 슬롯 구조

```js
{ fn: Function, deps: any[], cleanup: Function|null, pending: boolean }
```

### 동작 방식

렌더 중에는 **실행하지 않고 `pending` 플래그만 세운다**.
실제 실행은 `_commit()` 안의 `_flushEffects()`에서, DOM 반영 후에 일어난다.

```
렌더 중 (useEffect 호출 시):
  deps가 변경됨 → hook.pending = true, hook.fn = fn 저장

렌더 후 (_flushEffects 호출 시):
  pending이 true인 훅에 대해:
    1. 이전 cleanup 실행 (있으면)
    2. fn() 실행 → 반환값을 새 cleanup으로 저장
    3. pending = false
```

### cleanup의 역할

이펙트 함수가 함수를 반환하면, 그 함수가 다음 이펙트 실행 직전 또는 컴포넌트 언마운트 시 호출된다.
예: 타이머 해제, 이벤트 리스너 제거 등.

### useEffect vs useMemo 실행 시점 비교

| | useEffect | useMemo |
|--|-----------|---------|
| 실행 시점 | 렌더 **후** (DOM 반영 이후) | 렌더 **중** (동기 실행) |
| 반환값 | 없음 (사이드이펙트 목적) | 계산된 값 |
| 용도 | 외부 시스템과의 동기화 | 비용 큰 계산 결과 재사용 |

---

## 7. useMemo — 계산값 메모이제이션

의존성이 바뀔 때만 fn을 재실행해 불필요한 재계산을 방지한다.

### 슬롯 구조

```js
{ value: T, deps: any[], initialized: boolean }
```

### 동작 방식

렌더 중 동기적으로 실행된다. `initialized` 플래그로 첫 렌더를 구분한다:

- 첫 렌더 (`initialized === false`): fn 실행, 결과와 deps 저장
- 이후 렌더: deps 비교 → 변경 없으면 저장된 value 그대로 반환, 변경 있으면 fn 재실행

---

## 8. 전체 라이프사이클 흐름

```
setRoot(ComponentFn, container)
  │
  ├─ FunctionComponent 인스턴스 생성
  ├─ update() 메서드 주입 (rAF 배칭 로직 포함)
  └─ mount(container) 호출
       │
       ├─ _render()
       │    ├─ currentComponent = this, hookIndex = 0
       │    ├─ ComponentFn() 실행
       │    │    └─ (훅 호출 → getHook으로 슬롯 접근/초기화)
       │    └─ currentComponent = null
       │
       └─ _commit(newVNode, container)
            ├─ [첫 렌더] createElement → container.appendChild
            ├─ [재렌더]  diff(oldVNode, newVNode) → applyPatches
            ├─ this.vnode = newVNode
            └─ _flushEffects()
                 └─ pending 훅: cleanup() → fn() → cleanup 갱신


상태 변경 시 (setter 호출):
  setter()
    ├─ 값 비교 (Object.is)
    ├─ hook.value 갱신
    └─ comp.update()
          └─ rAF 등록 (pendingRender 플래그로 중복 방지)
               └─ _doUpdate()
                    └─ _render() → _commit() → _flushEffects()
```

---

## 9. 요약

| 개념 | 역할 | 관련 코드 |
|------|------|-----------|
| `FunctionComponent` | 함수형 컴포넌트의 상태·훅·DOM을 관리하는 래퍼 | `class FunctionComponent` |
| `hooks[]` + `hookIndex` | 훅 데이터를 렌더 간 유지하는 슬롯 배열 | `getHook()` |
| `currentComponent` | 렌더 중 활성화되는 "현재 컴포넌트" 전역 포인터 | `_render()` |
| `useState` | 값 유지 + setter로 리렌더 예약 | `useState()` |
| `useEffect` | DOM 반영 후 사이드이펙트 실행 (cleanup 포함) | `useEffect()`, `_flushEffects()` |
| `useMemo` | 렌더 중 비용 큰 계산 메모이제이션 | `useMemo()` |
| `setRoot` | 전체 진입점, update() 배칭 로직 주입 | `setRoot()` |
