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

## 3. 훅 규칙을 어기면 무슨 일이 생기나

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

## 4. 두 번의 렌더를 단계별로 따라가기

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

## 5. 클로저란 무엇이고 useState는 왜 comp를 캡처하나

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

---

## 6. useMemo가 왜 필요한가

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
