# 005. React는 왜 컴포넌트마다 인스턴스를 두는가

> 이 문서는 이 라이브러리의 단일 루트 인스턴스 구조가 가진 한계를 출발점으로,
> React가 Fiber 구조를 선택한 이유를 설명한다.

---

## 1. 이 라이브러리의 구조와 한계

이 라이브러리에서 `FunctionComponent` 인스턴스는 앱 전체에서 **하나**뿐이다. 모든 훅 슬롯은 이 단일 인스턴스의 `hooks[]` 배열에 순서대로 쌓인다.

`TaskItem`처럼 리스트 아이템을 표현하는 함수가 있어도, 이 함수는 `FunctionComponent` 인스턴스가 아닌 **일반 함수**다. 렌더마다 호출될 뿐이며, 자신만의 `hooks[]`를 갖지 않는다.

이 구조에서는 다음 문제가 생긴다:

```js
function TaskItem({ task, onToggle, onRemove }) {
    // useCallback을 써도 루트의 hooks[]에 슬롯이 잡힘
    // 태스크가 추가/삭제되면 호출 횟수가 달라져 슬롯이 밀림 → 훅 규칙 위반
    const handleToggle = useCallback(() => onToggle(task.id), [task.id]); // ❌ 불안전
    ...
}
```

태스크가 3개일 때와 4개일 때 `TaskItem`의 호출 횟수가 다르므로, 매 렌더마다 훅 슬롯 수가 달라진다. "훅은 항상 같은 순서로 호출되어야 한다"는 규칙을 구조적으로 어길 수밖에 없다.

결국 per-item 핸들러(`() => onToggle(task.id)`)는 아이템마다 `task.id`를 캡처해야 하므로, 단일 루트 인스턴스 구조에서는 렌더마다 새 클로저를 만드는 것을 피할 방법이 없다.

### _render()가 실행하는 것

단일 인스턴스 구조에서 `_render()`는 루트 컴포넌트 함수(`this.fn()`)를 실행한다. 이 한 번의 호출 안에서 App 내부의 모든 함수 — `TaskItem`, `FilterButton` 등 — 도 함께 실행되며, 그 과정에서 호출되는 모든 훅이 **순서대로** 단일 `hooks[]`에 누적된다.

```
_render() 실행 중 일어나는 일:
  useState  → 현재 값을 hooks[] 슬롯에서 읽어 반환 (변경 감지 없음)
  useEffect → depsChanged 확인 → pending 플래그 설정 (실행은 _flushEffects()에서)
  useMemo   → depsChanged 확인 → 재계산 또는 캐시 반환
  반환값    → 루트 함수가 구성한 최종 vnode 트리 (이후 _commit()에 전달됨)
```

render 예약(`comp.update()`)은 `_render()` 호출 이전에 setter에 의해 이미 완료된 상태다. `_render()`는 "어떻게 그릴지"를 계산할 뿐이며, 렌더 트리거는 이미 결정되어 있다.

`_render()`의 반환값은 루트 함수가 구성한 **vnode 트리 전체**다. 모든 중첩 함수 호출(`TaskItem()`, `StatCard()` 등)의 결과가 하나의 트리로 합쳐져 반환되며, 이를 받은 `_commit()`이 이전 vnode와 diff해 DOM에 반영한다.

이 구조에서 `TaskItem`이 3번 호출되면 3개 × (TaskItem 내 훅 수)만큼 슬롯이 `hooks[]`에 추가된다. 태스크가 하나 추가되면 4번 호출로 바뀌어 슬롯 수 자체가 달라진다 — 이것이 단일 인스턴스에서 per-item 훅이 불안전한 근본 이유다.

---

## 2. React의 해법 — 컴포넌트마다 Fiber 인스턴스

React는 컴포넌트 **트리의 각 노드마다** 독립적인 Fiber 인스턴스를 유지한다. 각 Fiber는 자신만의 훅 상태(`memoizedState`)를 갖는다.

```
App (Fiber)
 ├─ memoizedState: [tasks훅, filter훅, ...]
 │
 ├─ TaskItem (Fiber, task#1)
 │   └─ memoizedState: [handleToggle훅, ...]
 │
 ├─ TaskItem (Fiber, task#2)
 │   └─ memoizedState: [handleToggle훅, ...]
 │
 └─ TaskItem (Fiber, task#3)
     └─ memoizedState: [handleToggle훅, ...]
```

각 `TaskItem`이 독립적인 Fiber를 갖기 때문에:

- `TaskItem` 안에서 `useCallback`을 호출해도 자신의 `memoizedState`에만 슬롯이 잡힌다
- 다른 `TaskItem`의 훅 순서에 영향을 주지 않는다
- `task.id`가 변하지 않는 한 `handleToggle`의 참조가 안정적으로 유지된다

```js
// React에서는 이게 안전하다:
function TaskItem({ task, onToggle }) {
    const handleToggle = useCallback(() => onToggle(task.id), [task.id, onToggle]);
    return <input onChange={handleToggle} />;
    // → task.id가 같은 한 handleToggle 참조 불변 → PROPS 패치 없음
}
```

---

## 3. 두 구조의 비교

| | 이 라이브러리 | React |
|---|---|---|
| 인스턴스 수 | 루트 하나 | 컴포넌트 트리 노드마다 |
| 훅 저장소 | 단일 `hooks[]` | Fiber마다 `memoizedState` |
| per-item useCallback | 불안전 (슬롯 수 변동) | 안전 (Fiber 독립) |
| 구현 복잡도 | 낮음 | 높음 |
| 학습 목적 | 훅/vdom 핵심 원리 | 프로덕션 규모의 상태 격리 |

---

## 4. 왜 이 라이브러리는 단일 인스턴스로 유지하는가

이 프로젝트의 목적은 **훅과 가상 DOM의 핵심 원리를 직접 구현해보는 것**이다. 단일 루트 인스턴스 구조는:

- 구현이 단순해 핵심 동작을 한눈에 파악할 수 있다
- `currentComponent`, `hookIndex`, `getHook`의 동작 원리가 명확하게 드러난다
- Fiber 수준의 복잡도 없이 `useState` / `useEffect` / `useMemo`의 본질을 구현할 수 있다

per-item 핸들러 최적화가 되지 않는다는 한계는 존재하지만, 그 한계가 오히려 React의 Fiber 구조가 왜 필요한지를 보여준다. 이 라이브러리의 패치 로그에서 불필요한 PROPS 패치를 직접 확인하는 것이, React의 컴포넌트 인스턴스 분리가 해결하는 문제를 가장 구체적으로 이해하는 방법이다.
