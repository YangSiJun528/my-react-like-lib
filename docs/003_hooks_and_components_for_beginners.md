# 003. 컴포넌트와 훅 — 초보자를 위한 단계별 해설

> 이 문서는 `docs/002`의 **초보자용 동반 해설**이다.
> JavaScript에는 익숙하지만 컴포넌트·훅 개념이 처음인 독자를 대상으로 한다.
> 각 절의 공식 정의는 `docs/002`의 해당 절을 참고한다.

---

## 1. 함수는 왜 상태를 직접 저장할 수 없나

> 관련 개념: `docs/002` 1절

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

## 2. FunctionComponent 메서드를 평이한 말로

> 관련 개념: `docs/002` 2절

`docs/002`의 표만 보면 추상적으로 느껴질 수 있으니, 각 필드와 메서드가 **언제, 왜** 필요한지 간단히 설명한다.

**필드:**

- `fn`: 컴포넌트를 다시 그려야 할 때 이 함수를 호출해 새로운 vnode를 얻는다.
- `hooks[]`: `useState`나 `useEffect` 같은 훅이 저장하는 데이터가 여기에 담긴다. 렌더가 끝나도 이 배열은 사라지지 않으므로 "다음 렌더 때 꺼내 쓸 수 있다".
- `hookIndex`: 렌더 중 몇 번째 훅 호출인지 추적하는 카운터다. 훅 호출마다 1씩 증가한다.
- `vnode`: 이전에 그린 화면 구조다. 새로 그린 구조와 비교(diff)해 실제로 바뀐 부분만 DOM에 반영한다.
- `domNode`: 이미 화면에 올라간 실제 DOM 요소다. DOM을 조작할 때 이를 통해 접근한다.

**메서드:**

- `mount()`: "컴포넌트를 처음으로 화면에 올리는 역할"이다. 첫 렌더를 실행하고 DOM에 붙인다.
- `_render()`: "컴포넌트 함수를 실행해 새 화면 구조(vnode)를 만드는 역할"이다. 실제 DOM은 건드리지 않는다.
- `_commit()`: "뭔가 바뀌었을 때 DOM을 실제로 고치는 역할"이다. 이전 vnode와 새 vnode를 비교해 달라진 부분만 반영한다.
- `_flushEffects()`: "DOM 갱신이 끝난 뒤 밀린 이펙트(useEffect)를 실행하는 역할"이다.
- `_doUpdate()`: "상태가 바뀌어 리렌더가 필요할 때 _render()와 _commit()을 순서대로 실행하는 역할"이다.
- `update()`: "_doUpdate()를 바로 실행하지 않고 브라우저의 다음 프레임에 예약하는 역할"이다. 여러 상태가 동시에 바뀌어도 렌더는 한 번만 일어나도록 묶어준다.

---

## 3. 전체 라이프사이클 흐름

> 관련 개념: `docs/002` 2절

메서드들이 실제로 어떤 순서로 호출되는지 흐름도와 단계별 설명으로 살펴보자.

### 3-1. 최초 마운트 (`setRoot` 호출 시)

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
            ├─ this.vnode = newVNode
            └─ _flushEffects()
                 └─ pending 훅: cleanup() → fn() → cleanup 갱신
```

각 단계를 순서대로 따라가 보자.

**① FunctionComponent 인스턴스 생성**

`setRoot`가 가장 먼저 하는 일은 `new FunctionComponent(ComponentFn)`으로 래퍼 객체를 만드는 것이다. 이 객체가 `hooks[]`, `vnode`, `domNode` 등 렌더 사이에 살아남아야 할 모든 데이터를 보관한다. 함수 자체는 호출될 때마다 처음부터 실행되지만, 이 래퍼 객체는 앱이 살아있는 동안 계속 존재한다.

**② `update()` 메서드 주입**

인스턴스가 만들어진 직후, `setRoot`는 `instance.update`를 직접 할당한다. 이 메서드가 나중에 setter에서 리렌더를 예약하는 데 쓰인다. `FunctionComponent` 클래스 안에 `update()`가 없고 `setRoot`에서 주입하는 이유는, rAF 배칭 로직이 브라우저 환경에 의존하기 때문이다.

**③ `_render()` — 화면 구조 계산**

`_render()`는 실제 DOM을 전혀 건드리지 않는다. 대신 컴포넌트 함수를 실행해 어떤 화면을 그려야 하는지를 나타내는 **vnode(가상 노드) 트리**를 만들어 반환한다.

이때 핵심적인 일이 일어난다. `currentComponent = this`로 "지금 렌더 중인 컴포넌트"를 전역 변수에 기록해두고, `hookIndex = 0`으로 훅 카운터를 초기화한다. 컴포넌트 함수 안에서 `useState`나 `useEffect`를 호출하면, 이 전역 변수를 통해 올바른 인스턴스의 `hooks[]` 배열에 접근할 수 있다. 렌더가 끝나면 `currentComponent = null`로 되돌려 훅이 렌더 바깥에서 호출되는 것을 감지할 수 있게 한다.

**④ `_commit()` — DOM 반영**

`_render()`가 반환한 vnode를 실제 DOM으로 만드는 단계다. 첫 렌더에서는 `domNode`가 없으므로 `createElement(newVNode)`로 DOM 트리를 통째로 생성하고 `container.appendChild`로 붙인다. 이후 `this.vnode = newVNode`로 현재 화면 상태를 기억해둔다. 다음 렌더 때 비교(diff) 대상으로 쓰인다.

**⑤ `_flushEffects()` — 이펙트 실행**

DOM이 반영된 직후 `useEffect`로 등록된 이펙트 중 `pending` 플래그가 설정된 것들을 실행한다. 이펙트를 렌더 중이 아닌 DOM 반영 이후에 실행하는 이유는, 이펙트 안에서 DOM에 접근하거나 외부 구독을 설정하는 경우 실제 DOM이 이미 준비되어 있어야 하기 때문이다. 이전 이펙트가 반환한 cleanup 함수가 있으면 새 이펙트 실행 전에 먼저 호출한다.

---

### 3-2. 상태 변경 시 (setter 호출 후)

```
setter()
  ├─ 값 비교 (Object.is)
  ├─ hook.value 갱신
  └─ comp.update()
        └─ rAF 등록 (pendingRender 플래그로 중복 방지)
             └─ _doUpdate()
                  ├─ _render()   → 새 vnode 계산
                  ├─ _commit()   → diff → applyPatches → _flushEffects()
                  └─ (완료)
```

**① setter — 값 변경 판단**

`useState`의 setter는 새 값과 현재 값을 `Object.is`로 비교한다. 값이 같으면 아무 일도 일어나지 않는다. 다르면 `hook.value`를 갱신하고 `comp.update()`를 호출한다. `comp`는 setter가 만들어질 때 클로저로 캡처된 컴포넌트 인스턴스다 (5절에서 자세히 설명한다).

**② `comp.update()` — 리렌더 예약**

`update()`는 `requestAnimationFrame`으로 실제 렌더를 다음 프레임으로 미룬다. `pendingRender` 플래그를 `true`로 세우고, 이미 플래그가 서 있으면 rAF를 새로 등록하지 않는다. 덕분에 한 이벤트 핸들러 안에서 setter를 여러 번 호출해도 렌더는 프레임당 딱 한 번만 발생한다.

```js
// 아래 두 setter 호출은 렌더를 두 번 유발하지 않는다
setCount(c => c + 1);
setName("Alice");
// → 다음 프레임에 _doUpdate() 한 번만 실행됨
```

**③ `_doUpdate()` → `_commit()` — 변경된 부분만 DOM 반영**

`_doUpdate()`는 `_render()`를 호출해 새 vnode를 얻은 뒤 `_commit()`에 넘긴다. 이번엔 `domNode`가 이미 있으므로, `_commit()`은 `diff(oldVNode, newVNode)`로 이전 vnode와 비교해 변경된 부분만 계산한다. 그 결과인 패치 목록을 `applyPatches`로 실제 DOM에 반영한다. 변경되지 않은 노드는 건드리지 않는다.

---

### 3-3. 렌더링 대상은 항상 루트뿐이다

`_render()`는 항상 `this` — 즉 `setRoot`에서 만들어진 루트 `FunctionComponent` 인스턴스 — 를 대상으로 한다. `FunctionComponent` 인스턴스는 앱 전체에서 이 하나뿐이고, `hooks[]`를 가질 수 있는 것도 이 인스턴스뿐이다.

그렇다면 자식처럼 쓰이는 함수는? 예를 들어:

```js
function Header() {
    return div("헤더");
}

function App() {
    const [count, setCount] = useState(0);
    return div(
        Header(),          // ← 그냥 함수 호출
        p(`카운트: ${count}`),
    );
}
setRoot(App, container);
```

`Header`는 `FunctionComponent` 인스턴스가 아니다. vnode를 반환하는 **일반 함수**일 뿐이다. `setCount`가 호출되면 `App` 전체가 다시 실행되고 — `Header()` 호출도 포함해서 — 새 vnode 트리가 만들어진다.

만약 `Header` 안에서 `useState`를 호출하면 어떻게 될까? `Header`가 `App` 렌더 중에 호출되는 시점엔 `currentComponent`가 `App` 인스턴스이므로, `Header`의 `useState` 호출은 `App`의 `hooks[]`에 슬롯을 할당한다. `Header`의 상태도 결국 `App`에 귀속되는 것이다.

**계층 구조(여러 `FunctionComponent` 인스턴스)는 현재 지원되지 않는다.** React는 컴포넌트마다 별도의 Fiber 노드를 두어 각자의 상태를 독립적으로 관리하지만, 이 라이브러리는 단일 루트 인스턴스만 존재하도록 의도적으로 단순하게 유지되어 있다.

### 렌더마다 새로 만들어지는 함수와 과잉 패치

루트 전체가 재실행된다는 사실은 한 가지 부작용을 낳는다. 컴포넌트 함수 안에 선언된 모든 함수가 **렌더마다 새로 생성**된다.

```js
function App() {
    function addTask() { ... }      // 렌더마다 새 함수 참조
    function toggleTask(id) { ... } // 렌더마다 새 함수 참조
    return div(
        button({ onClick: addTask }, "추가"),
        button({ onClick: () => doSomething() }, "실행"),  // 인라인 화살표 함수도 마찬가지
    );
}
```

`diffProps`는 이전 props와 새 props를 `Object.is`로 비교한다. 두 함수의 내용이 같더라도 **다른 렌더에서 만들어진 함수는 항상 다른 참조**이므로, 이벤트 핸들러가 붙은 모든 요소가 PROPS 패치로 잡힌다.

결과적으로 타이머처럼 1초마다 상태가 변하는 경우, 실제로 화면에서 바뀐 것은 숫자 하나뿐이지만 이벤트 핸들러를 가진 모든 버튼·인풋이 패치 목록에 올라간다.

React에서는 `useCallback` 훅으로 함수 참조를 deps가 변경될 때만 재생성해 이 문제를 해결한다. 이 라이브러리도 `useCallback`을 지원한다 — 내부적으로 `useMemo(() => fn, deps)`와 동일하다.

```js
function App() {
    const [tasks, setTasks] = useState([]);

    // toggleTask는 tasks가 바뀔 때만 새 함수 참조가 만들어진다
    const toggleTask = useCallback((id) => {
        setTasks(current => current.map(t => t.id === id ? {...t, done: !t.done} : t));
    }, []);

    return ul(...tasks.map(task =>
        TaskItem({ task, onToggle: toggleTask })
    ));
}
```

`useCallback`으로 감싸면 deps가 변경되지 않는 한 이전 렌더와 동일한 함수 참조가 반환되어, `diffProps`에서 PROPS 패치가 생성되지 않는다.

---

## 4. 훅 규칙을 어기면 무슨 일이 생기나

> 관련 개념: `docs/002` 3절

훅은 `hooks[]` 배열의 **인덱스(번호)** 로 자신의 데이터를 찾는다 (자세한 내용은 `docs/002` 4절에서 설명한다). 문제는 라이브러리가 "이 훅이 useState인지 useEffect인지"를 알 방법이 없다는 점이다. 그저 "0번째 훅 호출 = hooks[0], 1번째 훅 호출 = hooks[1]"로만 연결한다.

`someCondition`이 첫 렌더에서는 `true`였다가 두 번째 렌더에서 `false`가 된다면:

```
첫 렌더:  0번째 호출 → useState(0)  →  hooks[0] = { value: 0, ... }
          1번째 호출 → useState("") →  hooks[1] = { value: "", ... }

두 번째 렌더 (someCondition이 false):
          0번째 호출 → useState("") →  hooks[0]를 읽음 = { value: 0, ... } ← 잘못된 슬롯!
```

`useState("")`가 `hooks[0]`을 가리키게 되는데, 거기에는 숫자 `0`이 들어있다. 결과적으로 **의도하지 않은 값이 반환**되고, 화면이 엉뚱하게 그려지거나 setter를 호출해도 올바른 상태가 갱신되지 않는 버그가 발생한다. 라이브러리는 이런 상황을 자동으로 감지하거나 오류를 던지지 않기 때문에, 디버깅이 매우 어려운 조용한 버그가 된다.

---

## 5. 두 번의 렌더를 단계별로 따라가기

> 관련 개념: `docs/002` 4절

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

---

## 6. 클로저란 무엇이고 useState는 왜 comp를 캡처하나

> 관련 개념: `docs/002` 5절

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

### Object.is는 얕은 비교다

setter 안의 `Object.is(hook.value, value)`는 **두 값이 "같은지"** 를 판단해 불필요한 리렌더를 막는다. 숫자나 문자열 같은 원시값은 내용이 같으면 `Object.is`도 같다고 판단한다.

그런데 **객체나 배열은 다르다.** 내용이 똑같아도 렌더마다 새로 만들어진 객체는 `Object.is` 기준으로 "다른 값"이다:

```js
Object.is(42, 42)           // true  — 같은 숫자
Object.is("hi", "hi")       // true  — 같은 문자열
Object.is({ x: 1 }, { x: 1 }) // false — 내용은 같지만 다른 객체
```

따라서 아래처럼 렌더마다 새 객체를 만들어 상태로 넘기면, 내용이 변하지 않았어도 매번 리렌더가 발생한다:

```js
// ❌ 렌더마다 새 객체 → Object.is가 항상 false → 항상 리렌더
setUser({ name: "Alice" });

// ✅ 내용이 같다면 이전 객체를 그대로 재사용하거나, 필요할 때만 호출
```

같은 이유로 `useEffect`나 `useMemo`의 **deps 배열에 객체·배열을 넣을 때도 주의**해야 한다. 렌더마다 새로 만들어진 배열/객체는 deps가 "항상 바뀐 것"으로 인식되어 매 렌더마다 이펙트가 실행되거나 메모가 재계산된다.

---

## 7. useMemo가 왜 필요한가

> 관련 개념: `docs/002` 7절

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

---

## 8. tags와 tag — 화면 구조를 만드는 방법

> 관련 개념: `docs/002` 3절

컴포넌트 함수는 화면에 무엇을 그릴지를 **vnode(가상 노드) 객체**로 표현해 반환한다. `tags`와 `tag`는 이 vnode를 편리하게 만드는 도구다.

`tags` API는 **[VanJS](https://vanjs.org)**의 스타일을 참고했다. VanJS는 의존성 없이 1KB 미만으로 동작하는 경량 UI 라이브러리로, `const { div, p } = van.tags`처럼 태그 이름을 프로퍼티로 꺼내 쓰는 방식이 특징이다. JSX처럼 별도 빌드 도구나 트랜스파일러가 필요 없고, 순수 JavaScript만으로 화면 구조를 표현할 수 있어서 이 라이브러리에서도 같은 방식을 채택했다.

### 8-1. tags — 태그 이름을 프로퍼티로 접근하기

`tags`는 JavaScript의 **Proxy** 객체다. Proxy는 객체의 프로퍼티 접근을 가로채서 원하는 동작을 수행할 수 있게 해준다.

```js
export const tags = new Proxy(
    {},
    {get: (_, name) => (...args) => tag(name, ...args)}
);
```

`tags.div`에 접근하면 실제로 `div`라는 프로퍼티가 객체에 존재하는 게 아니라, Proxy가 접근을 가로채서 `(...args) => tag("div", ...args)` 함수를 즉석에서 반환한다. 따라서 `tags.div`, `tags.p`, `tags.button` 등 어떤 이름이든 바로 쓸 수 있다.

```js
const { div, p, button } = tags;
// div, p, button은 각각 tag("div", ...), tag("p", ...), tag("button", ...) 를 호출하는 함수가 된다
```

### 8-2. tag — vnode 객체 만들기

`tag(name, ...args)` 함수는 실제로 vnode 객체를 생성한다. 반환 결과는 이런 모양이다:

```js
{
    $$type: "vnode",   // vnode임을 식별하는 마커
    tag: "div",        // HTML 태그 이름
    props: { class: "box" },  // 속성 객체
    children: [...],   // 자식 노드 배열
    key: null,         // 리스트 렌더링에 쓰이는 키 (없으면 null)
}
```

`$$type: "vnode"` 마커는 일반 객체와 vnode를 구분하는 데 쓰인다. `isVNode()` 유틸 함수가 이 값을 확인한다.

### 8-3. props와 children 구분 방법

`tag` 함수는 첫 번째 인자가 props인지 자식 노드인지를 자동으로 판별한다. `isProps()` 함수로 확인하는데, **일반 객체**(vnode도 아니고 배열도 아닌 것)이면 props로 간주한다.

```js
// props가 있는 경우
div({ class: "box", onclick: handleClick }, p("안녕"))
//  ↑ 첫 번째 인자가 일반 객체 → props로 분리
//                               ↑ 나머지는 children

// props가 없는 경우
div(p("안녕"), p("세상"))
//  ↑ 첫 번째 인자가 vnode → props 없음, 모두 children
```

### 8-4. children 정규화

자식 노드는 `normalizeChildren`을 통해 정리된다. 중첩 배열을 펼치고(`flat()`), `null`, `undefined`, `boolean` 값을 제거한다.

```js
div(
    condition && p("조건부"),  // condition이 false면 false가 전달됨 → 제거됨
    [p("배열"), p("자식")],    // 중첩 배열 → 펼쳐짐
    null,                      // null → 제거됨
)
// 결과 children: condition이 true면 [p("조건부"), p("배열"), p("자식")]
//               condition이 false면 [p("배열"), p("자식")]
```

이 덕분에 `condition && element` 패턴으로 조건부 렌더링을 자연스럽게 쓸 수 있다.

### 8-5. key prop

`key`는 리스트에서 각 항목을 고유하게 식별하는 특별한 prop이다. props 객체에서 꺼내 vnode의 `key` 필드에 별도로 저장되며, 실제 DOM에는 반영되지 않는다.

```js
items.map(item => div({ key: item.id }, item.name))
// vnode.key = item.id
// vnode.props에서 key는 제거됨 (DOM 어트리뷰트로 설정되지 않음)
```

key가 있으면 `diffChildren`이 **keyed diff**를 수행한다. 리스트 순서가 바뀌어도 key로 같은 항목을 찾아 DOM을 재사용하고, 실제로 제거된 항목만 삭제한다.

---

## 9. lib.js에서 자주 보이는 JS 문법 정리

`src/lib.js`를 읽다 보면 JavaScript 특유의 문법이 많이 등장한다. 각 문법이 코드 어디에 쓰이는지 함께 설명한다.

### 9-1. `function` 선언과 화살표 함수

JS에는 함수를 정의하는 방식이 두 가지다.

```js
// function 선언: 이름이 있고, 파일 어디서든 호출 가능
function tag(name, ...args) { ... }

// 화살표 함수: 짧은 표현, 주로 값으로 전달되거나 내부에서만 씀
const depsChanged = (prev, next) => !prev || ...;
hook.set = (next) => { ... };
```

`lib.js`에서 `export function setRoot(...)`, `function diffChildren(...)` 등은 function 선언이고, `getHook` 내부의 콜백이나 setter는 화살표 함수로 작성되어 있다. 두 방식의 차이 중 실용적으로 중요한 것은 화살표 함수는 자신만의 `this`를 갖지 않는다는 점인데, `lib.js`에서는 `this`를 클래스 메서드 안에서만 쓰므로 혼동할 일이 적다.

### 9-2. `class`와 `constructor`

`class`는 관련 데이터와 메서드를 묶는 문법이다.

```js
class FunctionComponent {
    constructor(fn) {    // new FunctionComponent(fn) 호출 시 자동 실행
        this.fn = fn;    // this는 "새로 만들어진 이 객체"를 가리킨다
        this.hooks = [];
    }

    _render() { ... }    // 인스턴스 메서드
}

const instance = new FunctionComponent(MyApp); // 인스턴스 생성
```

`this.hooks`처럼 `this.`를 붙이면 그 인스턴스에 속한 속성이 된다. `_`로 시작하는 메서드(`_render`, `_commit` 등)는 "외부에서 직접 호출하지 말 것"을 관례적으로 표시한 것이다(JS 언어 차원에서 강제되지는 않는다).

### 9-3. 구조 분해 할당(Destructuring)

객체나 배열에서 값을 꺼내 변수에 바로 담는 문법이다.

```js
// 객체 구조 분해
const { tag, props, children } = oldNode;
// 위는 아래와 동일하다:
// const tag = oldNode.tag;
// const props = oldNode.props;
// const children = oldNode.children;

// 배열 구조 분해
const [count, setCount] = useState(0);
// const count = useState(0)[0];
// const setCount = useState(0)[1]; 와 동일
```

`useState`가 배열을 반환하기 때문에 배열 구조 분해로 값을 꺼낸다.

### 9-4. 나머지 매개변수와 전개 연산자(`...`)

`...`는 문맥에 따라 두 가지로 쓰인다.

```js
// 나머지 매개변수(rest): 함수 인자를 배열로 수집
function tag(name, ...args) {
    // args는 name 이후 전달된 모든 인자의 배열
}

// 전개(spread): 배열이나 객체를 펼쳐 넣음
[...path, i]          // path 배열의 모든 요소 뒤에 i를 붙인 새 배열
{...args[0]}          // args[0] 객체의 모든 속성을 복사한 새 객체
patches.push(...diff()); // diff()가 반환한 배열의 요소들을 하나씩 push
```

### 9-5. 옵셔널 체이닝(`?.`)과 널 병합(`??`)

값이 `null`이거나 `undefined`일 때를 안전하게 처리하는 단축 문법이다.

```js
// ?.: 앞의 값이 null/undefined면 에러 없이 undefined 반환
hook.cleanup?.();          // cleanup이 없으면 그냥 넘어감
root.parentNode?.removeChild(root);  // parentNode가 없으면 그냥 넘어감

// ??: 앞의 값이 null/undefined일 때만 뒤의 기본값 사용
hook.cleanup = hook.fn?.() ?? null;  // fn()이 undefined를 반환하면 null로
const ai = a.path[a.path.length - 1] ?? 0;  // 인덱스가 없으면 0
```

### 9-6. 템플릿 리터럴

백틱(`` ` ``)으로 문자열을 만들면 `${...}` 안에 JS 표현식을 바로 넣을 수 있다.

```js
`카운트: ${count}`     // "카운트: 3" 처럼 값이 삽입됨
`안녕, ${name}!`
```

docs/003의 예시 코드에서도 사용된다.

### 9-7. `typeof`와 `instanceof`

값의 타입을 런타임에 확인하는 연산자다.

```js
typeof next === "function"   // next가 함수이면 true
typeof value === "string"    // value가 문자열이면 true
typeof value === "object"    // value가 객체(또는 null)이면 true
```

`lib.js`에서 props인지, 텍스트인지, 이벤트 핸들러인지를 구분할 때 모두 `typeof`를 활용한다.

### 9-8. `export`와 `import`

`export`가 붙은 함수나 변수는 다른 파일에서 가져다 쓸 수 있다.

```js
// lib.js
export function useState(...) { ... }
export const tags = ...;

// 사용하는 파일
import { useState, tags } from './lib.js';
```

`lib.js`에서 `export`가 없는 함수(`diffChildren`, `getHook` 등)는 파일 내부에서만 쓰이는 내부 구현이다.

### 9-9. `Map`과 `Set`

배열보다 특화된 자료구조다.

```js
// Map: key → value 쌍 (Object와 달리 어떤 값도 key가 될 수 있음)
const oldKeyMap = new Map();
oldKeyMap.set("item-1", 0);  // key, value 저장
oldKeyMap.get("item-1");     // 0 반환
oldKeyMap.has("item-2");     // false

// Set: 중복 없는 값의 집합
const usedOldIndices = new Set();
usedOldIndices.add(2);
usedOldIndices.has(2);       // true
```

`diffChildren`에서 keyed diff를 구현할 때 O(1) 조회를 위해 사용한다.

---

## 10. 더 깊이 공부하려면

이 라이브러리의 `useState`, `useEffect`, `useMemo`는 React의 동명 훅과 동일한 개념에서 출발한다. React 공식 문서는 각 훅의 동작 방식, 주의 사항, 실전 패턴을 상세히 다루고 있으니 함께 참고하면 이해가 깊어진다.

- **hooks**: https://react.dev/reference/react/hooks
- **useState**: https://react.dev/reference/react/useState
- **useEffect**: https://react.dev/reference/react/useEffect
  - 언제 useEffect를 사용하는게 적절한가?: https://react.dev/learn/you-might-not-need-an-effect
- **useMemo**: https://react.dev/reference/react/useMemo
