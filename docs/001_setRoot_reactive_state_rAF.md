# setRoot + Component + Hooks + requestAnimationFrame 구현 계획

## 배경 및 목표

현재 TODO 데모(`index.html`)는 상태 변경 후 `update()`를 수동으로 호출해야 하며,
UI를 독립적인 단위(Component)로 나눌 수 없다.

아래 네 가지를 구현하여 선언적이고 컴포넌트 기반의 UI 시스템을 완성한다.

1. **`requestAnimationFrame`**: 렌더링을 프레임 단위로 배칭
2. **`setRoot`**: 앱 진입점 — 루트 컴포넌트와 컨테이너를 바인딩
3. **`FunctionComponent`**: UI를 나누는 단위. 자체 렌더/업데이트 담당
4. **Hooks** (`useState` / `useEffect` / `useMemo`): 함수형 컴포넌트에서 상태·사이드이펙트·메모이제이션 사용

---

## 1. 제약 조건 (아키텍처 규칙)

| 규칙 | 설명 |
|------|------|
| **State는 루트 컴포넌트에서만** | `useState` 등 훅은 `setRoot`에 전달된 최상위 컴포넌트 함수 내에서만 호출 |
| **자식 컴포넌트는 Stateless** | 자식은 props만 받아서 vnode를 반환하는 순수 함수. 훅 사용 금지 |
| **Lifting State Up** | 자식이 필요한 데이터와 콜백은 부모(루트)가 props로 전달 |
| **함수형 컴포넌트만** | 클래스 컴포넌트 없음. `FunctionComponent` 클래스는 내부 구현체일 뿐 |

---

## 2. 목표 API

```js
import { tags, setRoot, useState, useEffect, useMemo } from './lib.js';
const { div, ul, li, input, button, p, span } = tags;

// ─── 자식 컴포넌트 (순수 함수, 상태 없음) ───
function TodoItem({ todo, onToggle, onRemove }) {
  return li({ key: String(todo.id) },
    span({
      style: { textDecoration: todo.done ? 'line-through' : 'none' },
      onClick: () => onToggle(todo.id),
    }, todo.text),
    button({ onClick: () => onRemove(todo.id) }, '✕')
  );
}

function TodoList({ todos, onToggle, onRemove }) {
  return ul(...todos.map(todo => TodoItem({ todo, onToggle, onRemove })));
}

// ─── 루트 컴포넌트 (훅 사용 가능) ───
function App() {
  const [todos, setTodos] = useState([]);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    document.title = `TODO (${todos.length})`;
  }, [todos.length]);

  const remaining = useMemo(
    () => todos.filter(t => !t.done).length,
    [todos]
  );

  const addTodo = () => {
    if (!inputValue.trim()) return;
    setTodos([...todos, { id: Date.now(), text: inputValue, done: false }]);
    setInputValue('');
  };

  const toggle = (id) => setTodos(todos.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const remove = (id) => setTodos(todos.filter(t => t.id !== id));

  return div(
    p(`남은 항목: ${remaining}`),
    input({ value: inputValue, onInput: (e) => setInputValue(e.target.value) }),
    button({ onClick: addTodo }, 'Add'),
    TodoList({ todos, onToggle: toggle, onRemove: remove })
  );
}

// ─── 진입점 ───
setRoot(App, document.getElementById('app'));
```

---

## 3. 설계

### 3-1. 공용 내부 헬퍼 (코드량 감축 핵심)

훅마다 반복되는 보일러플레이트를 두 헬퍼로 추출한다.

```js
// 모든 훅이 공유하는 슬롯 접근자
// - currentComponent 유효성 검사
// - hookIndex 관리
// - 초기값 설정을 한 곳에서 처리
function getHook(init) {
  if (!currentComponent) throw new Error('훅은 컴포넌트 내부에서만 사용 가능');
  const i = currentComponent.hookIndex++;
  if (currentComponent.hooks[i] === undefined) currentComponent.hooks[i] = init;
  return currentComponent.hooks[i];
}

// useEffect / useMemo 공용 deps 비교
const depsChanged = (prev, next) =>
  !prev || !next || next.some((d, i) => d !== prev[i]);
```

이 두 헬퍼가 없으면 `useState` / `useEffect` / `useMemo` 각각에
동일한 유효성 검사·인덱스 관리·초기화 코드가 중복된다.

### 3-2. FunctionComponent 클래스

```js
class FunctionComponent {
  constructor(fn) {
    this.fn = fn;
    this.hooks = [];
    this.hookIndex = 0;
    this.vnode = null;
    this.domNode = null;
  }

  // mount와 _doUpdate의 공통 흐름을 하나로 통합
  // domNode 존재 여부로 최초/갱신을 구분
  _commit(newVNode, container) {
    if (!this.domNode) {
      this.domNode = createElement(newVNode);
      container.appendChild(this.domNode);        // 최초 렌더
    } else {
      applyPatches(this.domNode, diff(this.vnode, newVNode)); // 갱신
    }
    this.vnode = newVNode;
    this._flushEffects();
  }

  _render() {
    currentComponent = this;
    this.hookIndex = 0;
    const vnode = this.fn();
    currentComponent = null;
    return vnode;
  }

  // pending 플래그를 훅 슬롯 자체에 저장 → 별도 pendingEffects[] 배열 불필요
  _flushEffects() {
    this.hooks.forEach(hook => {
      if (!hook?.pending) return;
      hook.cleanup?.();                       // 이전 cleanup 먼저 실행
      hook.cleanup = hook.fn?.() ?? null;     // 새 effect 실행 후 cleanup 저장
      hook.pending = false;
    });
  }

  mount(container) { this._commit(this._render(), container); }
  _doUpdate()      { this._commit(this._render()); }
}
```

**`_commit` 통합의 이점**: `mount`와 `_doUpdate`가 "렌더 → DOM 반영 → effects 실행"
흐름을 각자 구현하지 않아도 된다.

**`pending` 플래그의 이점**: `_pendingEffects: []` 배열을 별도로 유지하고,
렌더마다 초기화하는 코드가 필요 없다.

### 3-3. setRoot

```js
export function setRoot(ComponentFn, container) {
  const instance = new FunctionComponent(ComponentFn);
  let pendingRender = false;

  instance.update = () => {
    if (pendingRender) return;       // 중복 rAF 방지 → 배칭 효과
    pendingRender = true;
    requestAnimationFrame(() => {
      pendingRender = false;
      instance._doUpdate();
    });
  };

  instance.mount(container);         // 즉시 최초 렌더 (rAF 없이)
}
```

> `mount()`는 rAF 없이 즉시 실행 — 첫 화면이 한 프레임 지연되지 않도록.

### 3-4. currentComponent 전역 컨텍스트

```js
let currentComponent = null;
```

- `_render()` 시작 시 `currentComponent = this` 설정
- `_render()` 종료 시 `currentComponent = null` 복원
- 훅 함수들은 `getHook()`을 통해 `currentComponent`에 접근
- 훅이 컴포넌트 바깥에서 호출되면 `getHook()` 내부에서 오류 발생

### 3-5. 훅 구현

`getHook` + `depsChanged`를 활용하면 각 훅이 간결해진다.

```js
export function useState(initialValue) {
  const hook = getHook({ value: initialValue });
  const setValue = (newVal) => {
    hook.value = newVal;
    currentComponent?.update() ?? hook._comp.update();
    // 실제로는 getHook 내부에서 comp 참조를 클로저로 캡처
  };
  return [hook.value, setValue];
}

export function useEffect(fn, deps) {
  const hook = getHook({ fn: null, deps: undefined, cleanup: null, pending: false });
  if (depsChanged(hook.deps, deps)) {
    hook.fn = fn;
    hook.deps = deps;
    hook.pending = true;    // _flushEffects에서 감지
  }
}

export function useMemo(fn, deps) {
  const hook = getHook({ value: fn(), deps });
  if (depsChanged(hook.deps, deps)) {
    hook.value = fn();
    hook.deps = deps;
  }
  return hook.value;
}
```

> `useState`의 setter에서 컴포넌트 참조가 필요하므로, `getHook` 내부에서
> `comp` 참조를 클로저로 캡처하거나 훅 슬롯에 저장하는 구현 선택이 필요하다.

### 3-6. rAF 배칭 효과

```
이벤트 핸들러 실행 중:
  setTodos([...])   → instance.update() → pendingRender=true, rAF 등록
  setInputValue('') → instance.update() → pendingRender=true이므로 재등록 안 함

다음 프레임(rAF 콜백):
  _doUpdate() 한 번만 실행 → diff + applyPatches + effects
```

### 3-7. 코드량 비교

| 방식 | 예상 추가 코드 |
|------|--------------|
| 헬퍼 없이 각 훅에 보일러플레이트 직접 구현 | ~85줄 |
| `getHook` + `depsChanged` + `_commit` + `pending` 플래그 적용 | ~55줄 |

---

## 4. 구현 단계

### Phase 1: FunctionComponent + setRoot (rAF 배칭 포함)

`lib.js`에 추가. 기존 export(`tags`, `render`, `diff`, `applyPatches`, `createElement`) 무변경.

```js
let currentComponent = null;
function getHook(init) { ... }
const depsChanged = (prev, next) => ...;
class FunctionComponent { ... }
export function setRoot(ComponentFn, container) { ... }
```

### Phase 2: useState

```js
export function useState(initialValue) { ... }
```

### Phase 3: useEffect

```js
export function useEffect(fn, deps) { ... }
// FunctionComponent._flushEffects() 구현 포함 (Phase 1에서 stub으로 추가)
```

### Phase 4: useMemo

```js
export function useMemo(fn, deps) { ... }
```

### Phase 5: 데모 마이그레이션

`index.html`을 컴포넌트 구조로 재작성.
- 루트: `App` (훅 사용)
- 자식: `TodoList`, `TodoItem` (순수 함수)

### Phase 6: 테스트 추가

`lib.test.js`에 아래 케이스 추가:

| 테스트 | 검증 내용 |
|--------|----------|
| `setRoot` 초기 렌더 | mount 후 DOM이 컴포넌트 반환값과 일치 |
| `useState` 초기값 | 첫 렌더에서 올바른 초기값 반환 |
| `useState` 업데이트 | setter 호출 후 rAF 실행 시 DOM 업데이트 |
| 배칭 | setter 2회 호출 → diff 1회만 실행 |
| `useEffect` 실행 | deps 변경 시 effect 호출 확인 |
| `useEffect` cleanup | 재렌더 전 이전 cleanup 호출 확인 |
| `useEffect` deps 불변 | deps 미변경 시 effect 재실행 안 함 |
| `useMemo` 캐싱 | deps 불변 시 팩토리 함수 재실행 안 함 |
| `useMemo` 재계산 | deps 변경 시 새 값 반환 |
| 훅 컨텍스트 오류 | 컴포넌트 외부에서 훅 호출 시 오류 발생 |

> `vi.useFakeTimers()`로 rAF를 제어하여 동기 테스트 가능.

---

## 5. 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/lib.js` | `getHook`, `depsChanged`, `FunctionComponent`, `setRoot`, `useState`, `useEffect`, `useMemo` 추가. 기존 함수 무변경 |
| `src/lib.test.js` | 위 훅/컴포넌트 테스트 추가 |
| `index.html` | 컴포넌트 구조로 전면 재작성 |

---

## 6. 재사용할 기존 함수

| 함수 | 위치 | 용도 |
|------|------|------|
| `render(vnode, container)` | `src/lib.js:70` | (미사용 — `_commit`이 직접 처리) |
| `diff(oldVNode, newVNode)` | `src/lib.js:218` | `_commit` 내부 변경 계산 |
| `applyPatches(domNode, patches)` | `src/lib.js:161` | `_commit` 내부 DOM 업데이트 |
| `createElement(vnode)` | `src/lib.js:55` | `_commit` 내부 최초 DOM 생성 |

---

## 7. 검증 방법

```bash
# 단위 테스트
npx vitest run

# 브라우저 데모
npx vite
# http://localhost:5173 에서 TODO 앱 동작 검증
```

브라우저 DevTools > Performance 탭에서
여러 setState 호출이 하나의 rAF 프레임으로 묶이는지 확인 가능.

---

## 8. 이후 확장 가능성 (이번 범위 외)

- **자식 컴포넌트 로컬 상태**: 각 FunctionComponent 인스턴스가 자체 `update()`를 갖도록 확장하면 자식도 상태 보유 가능
- **useRef**: 렌더를 트리거하지 않는 가변 ref 객체 (`getHook`으로 쉽게 추가)
- **useCallback**: `useMemo(() => fn, deps)`의 별칭으로 추가 가능 (코드 0줄)
- **Deep reactive**: 중첩 객체/배열 변이 감지 (재귀 Proxy)
- **컴포넌트 트리 재조정**: 자식도 FunctionComponent로 래핑하여 독립적 업데이트
