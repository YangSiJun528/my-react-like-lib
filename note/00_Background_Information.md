> https://jungle-lms.krafton.com/learning/75

> 해당 페이지에서 중점 포인트 기반의 내용을 조사합니다.   
> AI를 많이 활용하였습니다.

# 추가

AI 말고 궁금해져서 따로 찾아본 직접 쓴 자료

[[Jungle My Note | W04] React 구현을 위한 학습자료.md](https://gist.github.com/YangSiJun528/68e39f4fbb9b64b06e1df78bb8c3342a)의 내용도 참고하면 좋습니다.

### 리엑트는 빠른가?

> React가 DOM 보다 빠르다는건 잘못된 사실이에요. 사실은: 유지보수 가능한 어플리케이션을 만드는것을 도와주고 그리고 대부분의 경우에 ‘충분히 빠르다’

[[번역] 리액트에 대해서 그 누구도 제대로 설명하기 어려운 것 – 왜 Virtual DOM 인가? | VELOPERT.LOG](https://archive.velopert.com/3236.html)

### 브라우저는 렌더링을 언제 하는가?

DOM Tree + CSS Tree => Render Tree 이고, 브라우저는 Render Tree를 사용해서 렌더링을 한다.



# 프로젝트 구현을 위한 배경지식 - 아래는 AI 답변

## 브라우저에서 DOM을 다루는 방법(Document, Window)

브라우저는 HTML을 파싱하여 **DOM(Document Object Model)** 트리를 생성한다. JavaScript는 `document` 객체를 통해 이 트리를 조작한다.

- **조회**: `document.querySelector()`, `document.getElementById()`
- **생성**: `document.createElement('div')`, `document.createTextNode('hello')`
- **삽입/삭제**: `parent.appendChild(child)`, `parent.removeChild(child)`
- **속성 변경**: `element.setAttribute('class', 'active')`, `element.style.color = 'red'`

`window` 객체는 브라우저 창 자체를 나타내며, `resize`, `scroll` 같은 전역 이벤트와 `requestAnimationFrame` 등의 렌더링 관련 API를 제공한다.

## 실제 DOM의 변화를 감지 하기 위한 브라우저 API

**MutationObserver**는 DOM 트리의 변화를 비동기로 감지하는 브라우저 API이다.

```js
const observer = new MutationObserver((mutations) => {
  mutations.forEach((m) => console.log(m.type, m.target));
});
observer.observe(document.body, { childList: true, subtree: true });
```

자식 노드 추가/삭제(`childList`), 속성 변경(`attributes`), 텍스트 변경(`characterData`) 등을 감시할 수 있다. 이전에 사용되던 `MutationEvents`는 성능 문제로 폐기(deprecated)되었다.

## 실제 DOM이 느린 이유

### Reflow/ Repaint 관점

브라우저는 DOM 변경 시 다음 **렌더링 파이프라인**을 거친다:

**DOM 변경 → Style 계산 → Layout(Reflow) → Paint(Repaint) → Composite**

- **Reflow**: 요소의 크기·위치를 다시 계산한다. 하나의 요소가 바뀌면 주변 요소의 레이아웃도 연쇄적으로 재계산된다.
- **Repaint**: 색상·그림자 등 시각적 속성만 변경될 때 발생한다. Reflow보다 가볍지만 여전히 비용이 있다.

DOM을 10번 수정하면 최악의 경우 10번의 Reflow가 발생할 수 있다. 이것이 DOM 직접 조작이 느린 핵심 이유이며, **변경을 모아서 한 번에 반영**하려는 동기가 된다.

> DOM 조작 자체보다, 그로 인해 발생하는 layout과 paint 비용이 더 크다고 볼 수 있습니다.      
> https://web.dev/articles/rendering-performance   
>
> vDOM은 불필요한 DOM 변경을 줄이는 역할을 하지만,    
> 브라우저는 이미 프레임 단위로 렌더링을 수행하기 때문에 단순히 렌더링 횟수를 줄이는 것만으로는 큰 성능 향상을 보장하지는 않습니다.    
>  
> 다만 DOM 변경이 많아질수록 layout 영향 범위와 계산 비용이 증가할 수 있기 때문에,    
> vDOM은 이러한 불필요한 변경을 줄여 결과적으로 성능 안정성에 기여할 수 있습니다. (하지만 극한? 최적화를 하는 경우 대게 DOM 직접 조작이 더 높은 성능을 보여줍니다.)   
> React의 가장 큰 장점은 선언적인 UI(UI = f(state)를 통해 상태 기반으로 UI를 관리할 수 있다는 점입니다.
> 
> 위와는 별개로,   
>  https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing    
> 브라우저는 프레임 단위로 렌더링을 수행하며, 렌더링 작업이 프레임 예산(약 16ms)을 초과하면 프레임 드랍이 발생할 수 있습니다.

## Virtual DOM

### 구조

Virtual DOM은 실제 DOM을 흉내 낸 **경량 JavaScript 객체 트리**이다.

```js
// Virtual DOM 노드 예시
{
  type: 'div',
  props: { className: 'container' },
  children: [
    { type: 'h1', props: {}, children: ['Hello'] },
    { type: 'p',  props: {}, children: ['World'] }
  ]
}
```

각 노드는 `type`(태그명 또는 컴포넌트), `props`(속성), `children`(자식 노드 배열)으로 구성된다. 실제 DOM 노드와 달리 브라우저 렌더링 엔진과 연결되지 않으므로 생성·비교 비용이 매우 낮다.

### 필요한 이유

1. **성능**: 변경 사항을 메모리상의 vDOM에서 먼저 계산하고, 실제 DOM에는 최소한의 변경만 반영하여 Reflow/Repaint 횟수를 줄인다.
2. **선언적 프로그래밍**: 개발자는 "현재 상태에 맞는 UI"를 선언하기만 하면, 라이브러리가 이전 상태와의 차이를 자동으로 계산해 DOM을 갱신한다.
3. **추상화**: DOM 조작 로직이 라이브러리 내부로 캡슐화되어 코드가 단순해진다.

## Diff 알고리즘

### 동작 방식

두 vDOM 트리(이전 vs 현재)를 비교하여 **변경된 부분만** 찾아내는 알고리즘이다. 일반적인 트리 비교는 O(n³)이지만, 두 가지 휴리스틱으로 **O(n)**에 수행한다:

1. **같은 레벨끼리만 비교**한다 (cross-level 이동은 삭제 + 재생성으로 처리).
2. **`type`이 다르면 해당 서브트리 전체를 교체**한다.

### 최소 변경을 찾기 위한 5가지 핵심 케이스

| 케이스 | 설명 | Patch 동작 |
|--------|------|-----------|
| 노드 추가 | 이전 트리에 없던 노드가 새 트리에 존재 | `appendChild` |
| 노드 삭제 | 이전 트리에 있던 노드가 새 트리에 없음 | `removeChild` |
| 속성 변경 | 같은 노드의 props가 달라짐 | `setAttribute` / `removeAttribute` |
| 텍스트 변경 | 텍스트 노드의 내용이 달라짐 | `textContent` 갱신 |
| 자식 순서 변경 | 자식 리스트의 순서가 바뀜 | `key`를 활용한 재배치 |

### 실제 DOM에 반영 방법

Diff 결과로 생성된 **patch 목록**을 순회하며 실제 DOM API(`createElement`, `removeChild`, `setAttribute` 등)를 호출한다. 모든 patch를 한 번의 렌더링 사이클에 모아서 적용하면 Reflow를 최소화할 수 있다.

## React에서 실제 DOM을 변경할때, Virtual DOM과 Diff 알고리즘의 동작 방식

React의 렌더링은 다음 순서로 진행된다:

1. **상태 변경** — `setState` 또는 hook에 의해 컴포넌트가 "dirty"로 표시된다.
2. **render 호출** — 해당 컴포넌트의 `render()`(또는 함수 컴포넌트 본문)가 실행되어 새로운 vDOM 트리를 반환한다.
3. **Diff(Reconciliation)** — 이전 vDOM과 새 vDOM을 비교하여 변경점(patch)을 산출한다.
4. **Commit(Patch)** — 산출된 변경점을 실제 DOM에 일괄 반영한다.

이 과정에서 `key` prop은 리스트 항목의 동일성을 판별하는 힌트로 사용되어, 불필요한 삭제·재생성을 방지한다. 이 프로젝트에서는 위 1→4 흐름을 직접 구현하게 된다.
