# 004. 아키텍처 멘탈 모델 — 전체 구조를 한눈에

> 이 문서는 `src/lib.js`의 전체 동작을 **내부 구조 중심**으로 정리한다.
> 개념 설명은 `docs/003`, 공식 정의는 `docs/002`를 참고한다.

---

## 1. FunctionComponent — 상태를 보관하는 래퍼 객체

컴포넌트 함수 자체는 호출될 때마다 처음부터 새로 실행된다. 렌더 사이에 살아남아야 할 데이터는 모두 `FunctionComponent` 인스턴스에 보관된다.

```
FunctionComponent {
    fn        — 컴포넌트 함수 (렌더마다 호출됨)
    hooks[]   — 훅 데이터 배열 (렌더가 끝나도 사라지지 않음)
    hookIndex — 렌더 중 몇 번째 훅 호출인지 추적하는 카운터
    vnode     — 이전 렌더의 vnode 트리 (diff 비교 대상)
    domNode   — 실제 DOM 노드 참조
}
```

`setRoot`는 앱 전체에서 이 인스턴스를 **딱 하나** 만든다. 자식처럼 쓰이는 함수들(`Header()`, `Footer()` 등)은 `FunctionComponent`가 아니라 vnode를 반환하는 **일반 함수**다. 루트 렌더 중에 호출될 뿐이며, 별도의 hooks 배열을 갖지 않는다.

---

## 2. hooks[] 배열 — 훅마다 저장하는 내용이 다르다

`hooks[]`는 훅 호출 순서에 따라 슬롯이 할당되는 배열이다. 훅의 종류마다 저장하는 데이터가 다르다.

| 훅 | 저장 구조 |
|---|---|
| `useState` | `{ value, set }` |
| `useEffect` | `{ fn, deps, cleanup, pending }` |
| `useMemo` | `{ value, deps, initialized }` |

**`useState`에는 deps가 없다.** 상태 변경은 setter가 `Object.is`로 직접 감지한다. deps는 "의존성이 바뀔 때 재실행"이 필요한 `useEffect`와 `useMemo`에만 있다.

**`useEffect`에는 value(상태값)가 없다.** 대신 실행할 함수(`fn`), 이전 deps(`deps`), cleanup 함수(`cleanup`), 실행 대기 여부(`pending`)를 저장한다.

---

## 3. 상태 변경 → 렌더 → DOM 반영 흐름

```
[이벤트 발생]
    │
    └─ setter() 호출
         ├─ Object.is(old, new) → 같으면 종료
         ├─ hook.value 갱신
         └─ comp.update()
               │
               └─ requestAnimationFrame 등록
                  (pendingRender 플래그로 중복 방지)
                       │
                       └─ _doUpdate()
                            ├─ _render()          ← 컴포넌트 함수 재실행
                            │    └─ (useEffect: depsChanged 확인 → pending 플래그 설정)
                            │    └─ (useMemo: depsChanged 확인 → 재계산 여부 결정)
                            │
                            └─ _commit(newVNode)
                                 ├─ diff(oldVNode, newVNode) → patches[]
                                 ├─ applyPatches(domNode, patches)
                                 ├─ this.vnode = newVNode
                                 └─ _flushEffects()
                                      └─ pending 훅: cleanup() → fn() → cleanup 갱신
```

### pendingRender 플래그는 훅과 무관하다

`pendingRender`는 `setRoot` 클로저 안의 변수다. 역할은 단 하나 — **한 프레임 안에 rAF를 중복 등록하지 않는 것**이다. 여러 setter가 연달아 호출되어도 `_doUpdate()`는 프레임당 딱 한 번만 실행된다.

```js
// 두 setter가 같은 이벤트 핸들러에서 호출되어도 렌더는 한 번만
setCount(c => c + 1);  // pendingRender = true, rAF 등록
setName("Alice");      // pendingRender가 이미 true → rAF 재등록 안 함
// → 다음 프레임에 _doUpdate() 한 번만 실행
```

### depsChanged 확인은 _render() 중에 동기적으로 일어난다

`useEffect`와 `useMemo`의 deps 비교는 vdom diff와 무관하다. `_render()` 안에서 컴포넌트 함수가 실행되는 도중, `useEffect`/`useMemo` 호출 시점에 이전 deps와 현재 deps를 즉시 비교한다.

- `useEffect`: deps가 바뀌었으면 `hook.pending = true`로 표시해두고, DOM 반영 후 `_flushEffects()`에서 실행
- `useMemo`: deps가 바뀌었으면 `fn()`을 즉시 재실행해 새 값을 반환 (렌더 중 동기 실행)

---

## 4. diff는 hooks/상태와 완전히 독립적이다

`diff(oldVNode, newVNode)`는 두 vnode 트리를 받아 변경 사항을 패치 목록으로 반환한다. hooks가 뭔지, 어떤 상태가 바뀌었는지 전혀 모른다. 그저 **이전 화면 구조와 새 화면 구조를 비교**할 뿐이다.

```
hooks/setState → 렌더 트리거 → 새 vnode 생성
                                      │
                              diff(old, new) ← 이 함수는 훅을 모른다
                                      │
                              applyPatches → DOM 업데이트
```

이 분리 덕분에 diff/patch 로직은 상태 관리 방식과 무관하게 독립적으로 테스트하고 교체할 수 있다.

---

## 5. 전체 구조 요약

```
setRoot(App, container)
  └─ FunctionComponent 인스턴스 (앱 전체에서 하나)
       ├─ fn: App
       ├─ hooks[]: [useState슬롯, useEffect슬롯, ...]
       ├─ vnode: 이전 렌더 트리
       └─ domNode: 실제 DOM

상태 변경 흐름:
  setter → comp.update() → rAF(배칭) → _doUpdate()
         → _render() [fn() 재실행, deps 확인]
         → _commit() [diff → applyPatches]
         → _flushEffects() [pending 이펙트 실행]

diff 흐름 (hooks와 독립):
  diff(oldVNode, newVNode) → patches[]
  applyPatches(domNode, patches) → DOM 반영
```
