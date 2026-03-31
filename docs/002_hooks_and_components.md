# 002. 컴포넌트와 훅 — 개념과 동작 방식

> 이 문서는 `src/lib.js`의 완성된 코드를 읽는 사람을 위한 **개념 해설**이다.
> VirtualDOM의 diff/patch 동작은 `docs/000`을 참고한다.

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

### 왜 단순 함수만으로는 부족한가?

"함수가 상태를 갖고 있으면 되지 않나?"라는 의문이 들 수 있다. 그런데 JavaScript 함수는 **호출될 때마다 처음부터 새로 실행**된다. 지역 변수는 함수가 끝나는 순간 사라진다.

예를 들어 이렇게 작성했다고 가정해보자:

```js
function Counter() {
    let count = 0; // ← 렌더마다 0으로 초기화되어버린다!
    return div(
        p(`카운트: ${count}`),
        button({ onclick: () => { count++; } }, "증가") // ← 클릭해도 count가 유지되지 않음
    );
}
```

버튼을 클릭하면 `count`가 1이 되지만, 화면을 다시 그리기 위해 `Counter()`를 다시 호출하는 순간 `count`는 다시 0이 된다. 상태가 렌더 사이에 살아남지 못하는 것이다.

그래서 **함수 바깥 어딘가에 상태를 보관**해야 한다. 이 역할을 하는 것이 바로 **래퍼 객체**다. 함수가 호출될 때마다 새로 실행되더라도, 래퍼 객체는 살아남아 이전 상태를 기억하고 있다.

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

표만 보면 추상적으로 느껴질 수 있으니, 각 필드가 **언제, 왜** 필요한지 간단히 설명한다:

- `fn`: 컴포넌트를 다시 그려야 할 때 이 함수를 호출해 새로운 vnode를 얻는다.
- `hooks[]`: `useState`나 `useEffect` 같은 훅이 저장하는 데이터가 여기에 담긴다. 렌더가 끝나도 이 배열은 사라지지 않으므로 "다음 렌더 때 꺼내 쓸 수 있다".
- `hookIndex`: 렌더 중 몇 번째 훅 호출인지 추적하는 카운터다. 훅 호출마다 1씩 증가한다.
- `vnode`: 이전에 그린 화면 구조다. 새로 그린 구조와 비교(diff)해 실제로 바뀐 부분만 DOM에 반영한다.
- `domNode`: 이미 화면에 올라간 실제 DOM 요소다. DOM을 조작할 때 이를 통해 접근한다.

### 주요 메서드

| 메서드 | 역할 |
|--------|------|
| `mount(container)` | 초기 렌더 및 DOM 삽입 |
| `_render()` | 컴포넌트 함수 실행 → 새 vnode 반환 |
| `_commit(newVNode)` | 새 vnode로 DOM 갱신 (diff → patch) |
| `_flushEffects()` | 렌더 후 대기 중인 이펙트 실행 |
| `_doUpdate()` | 상태 변경 시 재렌더 진입점 |
| `update()` | 리렌더를 rAF로 예약 (setRoot에서 주입) |

메서드들도 평이한 말로 풀어보면:

- `mount()`: "컴포넌트를 처음으로 화면에 올리는 역할"이다. 첫 렌더를 실행하고 DOM에 붙인다.
- `_render()`: "컴포넌트 함수를 실행해 새 화면 구조(vnode)를 만드는 역할"이다. 실제 DOM은 건드리지 않는다.
- `_commit()`: "뭔가 바뀌었을 때 DOM을 실제로 고치는 역할"이다. 이전 vnode와 새 vnode를 비교해 달라진 부분만 반영한다.
- `_flushEffects()`: "DOM 갱신이 끝난 뒤 밀린 이펙트(useEffect)를 실행하는 역할"이다.
- `_doUpdate()`: "상태가 바뀌어 리렌더가 필요할 때 _render()와 _commit()을 순서대로 실행하는 역할"이다.
- `update()`: "_doUpdate()를 바로 실행하지 않고 브라우저의 다음 프레임에 예약하는 역할"이다. 여러 상태가 동시에 바뀌어도 렌더는 한 번만 일어나도록 묶어준다.

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

### 규칙을 어기면 실제로 어떤 일이 생기나?

훅은 `hooks[]` 배열의 **인덱스(번호)** 로 자신의 데이터를 찾는다 (자세한 내용은 4절에서 설명한다). 문제는 라이브러리가 "이 훅이 useState인지 useEffect인지"를 알 방법이 없다는 점이다. 그저 "0번째 훅 호출 = hooks[0], 1번째 훅 호출 = hooks[1]"로만 연결한다.

`someCondition`이 첫 렌더에서는 `true`였다가 두 번째 렌더에서 `false`가 된다면:

```
첫 렌더:  0번째 호출 → useState(0)  →  hooks[0] = { value: 0, ... }
          1번째 호출 → useState("") →  hooks[1] = { value: "", ... }

두 번째 렌더 (someCondition이 false):
          0번째 호출 → useState("") →  hooks[0]를 읽음 = { value: 0, ... } ← 잘못된 슬롯!
```

`useState("")`가 `hooks[0]`을 가리키게 되는데, 거기에는 숫자 `0`이 들어있다. 결과적으로 **의도하지 않은 값이 반환**되고, 화면이 엉뚱하게 그려지거나 setter를 호출해도 올바른 상태가 갱신되지 않는 버그가 발생한다. 라이브러리는 이런 상황을 자동으로 감지하거나 오류를 던지지 않기 때문에, 디버깅이 매우 어려운 조용한 버그가 된다.

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

### 두 번의 렌더를 단계별로 추적해보기

아래 컴포넌트를 예시로 삼아, **첫 렌더**와 **버튼 클릭 후 두 번째 렌더**를 순서대로 따라가 보자.

```js
function Counter() {
    const [count, setCount] = useState(0);       // 첫 번째 훅
    const [name, setName] = useState("익명");    // 두 번째 훅
    return div(
        p(`${name}: ${count}`),
        button({ onclick: () => setCount(count + 1) }, "증가")
    );
}
```

**첫 렌더 시작 전:**

```
hooks = []   (비어 있음)
hookIndex = 0
```

**첫 렌더 진행 (Counter() 실행 중):**

```
useState(0) 호출
  → hookIndex = 0, hooks[0]이 비어 있으므로 초기화
  → hooks[0] = { value: 0, set: <setter 함수> }
  → hookIndex가 1로 증가
  → [0, setCount] 반환

useState("익명") 호출
  → hookIndex = 1, hooks[1]이 비어 있으므로 초기화
  → hooks[1] = { value: "익명", set: <setter 함수> }
  → hookIndex가 2로 증가
  → ["익명", setName] 반환

Counter() 함수 실행 종료 → vnode 반환 → DOM에 그려짐
```

**첫 렌더 종료 후 hooks 상태:**

```
hooks[0] = { value: 0,    set: fn }
hooks[1] = { value: "익명", set: fn }
hookIndex = 0으로 리셋 대기 (다음 렌더 시작 때)
```

**"증가" 버튼 클릭 → setCount(1) 호출 → 두 번째 렌더 시작:**

```
hookIndex = 0으로 리셋

useState(0) 호출  ← 인자 0은 이번엔 무시됨
  → hookIndex = 0, hooks[0]이 이미 존재함
  → hooks[0].value는 setCount(1)로 갱신된 1
  → [1, setCount] 반환  ← count가 1로 올바르게 반환됨

useState("익명") 호출
  → hookIndex = 1, hooks[1]이 이미 존재함
  → ["익명", setName] 반환  ← 변경 없으므로 그대로

Counter() 함수 실행 종료 → 새 vnode → diff → DOM 업데이트
```

핵심 포인트: 두 번째 렌더에서 `useState(0)`의 초기값 `0`은 완전히 무시된다. `hooks[0]`이 이미 존재하기 때문에 `getHook`은 초기화 없이 기존 슬롯을 그대로 반환한다.

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

**클로저(closure)가 낯선 독자를 위한 설명:**

클로저란 "함수가 자신이 만들어질 당시의 변수를 기억하는 능력"이다. 아래 예를 보자:

```js
function makeGreeter(name) {
    // name은 makeGreeter가 끝나도 사라지지 않는다.
    // sayHello 함수가 name을 "기억"하고 있기 때문이다.
    return function sayHello() {
        console.log(`안녕, ${name}!`);
    };
}

const greetAlice = makeGreeter("Alice");
greetAlice(); // "안녕, Alice!" — name 변수는 여전히 살아있다
```

`useState`에서도 같은 일이 일어난다. setter 함수가 만들어지는 순간, 그 시점의 `comp` 변수(현재 컴포넌트 인스턴스)를 기억해둔다. 나중에 버튼 클릭으로 setter가 호출될 때 `currentComponent`는 이미 null이지만, setter는 `comp`를 통해 "내가 속한 컴포넌트"를 정확히 알고 있다.

```js
export function useState(initialValue) {
    const comp = currentComponent; // 렌더 중에 캡처 — 이 시점의 comp를 setter가 기억하게 된다
    const hook = getHook({ value: initialValue, set: null });

    if (!hook.set) {
        hook.set = (next) => {
            // 이 함수는 나중에 호출되지만, comp는 위에서 캡처된 값을 그대로 기억하고 있다
            const value = typeof next === "function" ? next(hook.value) : next;
            if (Object.is(hook.value, value)) return; // 값이 같으면 리렌더 없음
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

### 왜 필요한가?

컴포넌트 함수는 상태가 하나라도 바뀌면 **전체가 다시 실행**된다. 대부분의 경우 이것은 문제가 없지만, 함수 안에 **시간이 오래 걸리는 계산**이 포함되어 있다면 성능 문제가 생긴다.

예를 들어 아래 컴포넌트를 보자:

```js
function Dashboard({ data }) {
    const [theme, setTheme] = useState("light");

    // data에서 통계를 계산하는 무거운 작업 (수만 개의 항목을 순회한다고 가정)
    const stats = computeExpensiveStats(data);

    return div(
        p(`테마: ${theme}`),
        p(`총합: ${stats.total}`),
        button({ onclick: () => setTheme("dark") }, "다크 모드")
    );
}
```

"다크 모드" 버튼을 클릭하면 `theme` 상태만 바뀐다. 그런데 컴포넌트 함수 전체가 다시 실행되므로, `computeExpensiveStats(data)`도 매번 다시 계산된다. `data`는 전혀 바뀌지 않았는데도 말이다.

`useMemo`를 쓰면 이 문제를 해결할 수 있다:

```js
function Dashboard({ data }) {
    const [theme, setTheme] = useState("light");

    // data가 바뀌지 않는 한 이전에 계산한 결과를 그대로 재사용한다
    const stats = useMemo(() => computeExpensiveStats(data), [data]);

    return div(
        p(`테마: ${theme}`),
        p(`총합: ${stats.total}`),
        button({ onclick: () => setTheme("dark") }, "다크 모드")
    );
}
```

이제 "다크 모드" 버튼을 클릭해도 `data`가 바뀌지 않았으므로 `computeExpensiveStats`는 다시 실행되지 않는다.

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

컴포넌트가 처음 화면에 나타날 때부터 상태가 바뀌어 업데이트될 때까지, 라이브러리 내부에서 어떤 순서로 함수들이 호출되는지 한눈에 보여주는 흐름도다.

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
