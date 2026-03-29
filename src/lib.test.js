import { describe, it, expect } from "vitest";
import { tags, createElement, render, diff, applyPatches } from "./lib.js";

const { div, p, button, span, ul, li, input, a, h1 } = tags;

describe("tags → createElement → DOM", () => {
  it("빈 요소를 생성한다", () => {
    const el = createElement(div());
    expect(el.tagName).toBe("DIV");
    expect(el.childNodes.length).toBe(0);
  });

  it("텍스트 자식을 추가한다", () => {
    const el = createElement(p("hello"));
    expect(el.tagName).toBe("P");
    expect(el.textContent).toBe("hello");
  });

  it("숫자 자식을 텍스트로 변환한다", () => {
    const el = createElement(span(42));
    expect(el.textContent).toBe("42");
  });

  it("중첩 요소를 생성한다", () => {
    const el = createElement(div(p("hello"), button("click")));
    expect(el.children.length).toBe(2);
    expect(el.children[0].tagName).toBe("P");
    expect(el.children[0].textContent).toBe("hello");
    expect(el.children[1].tagName).toBe("BUTTON");
    expect(el.children[1].textContent).toBe("click");
  });

  it("깊은 중첩을 처리한다", () => {
    const el = createElement(div(div(div(span("deep")))));
    expect(el.querySelector("span").textContent).toBe("deep");
  });

  it("여러 자식을 나열할 수 있다", () => {
    const el = createElement(ul(li("1"), li("2"), li("3")));
    expect(el.children.length).toBe(3);
  });

  it("props 객체로 속성을 설정한다", () => {
    const el = createElement(input({ type: "text", placeholder: "입력" }));
    expect(el.getAttribute("type")).toBe("text");
    expect(el.getAttribute("placeholder")).toBe("입력");
  });

  it("props와 자식을 함께 전달한다", () => {
    const el = createElement(a({ href: "/home" }, "홈으로"));
    expect(el.getAttribute("href")).toBe("/home");
    expect(el.textContent).toBe("홈으로");
  });

  it("class 속성을 설정한다", () => {
    const el = createElement(div({ class: "container" }));
    expect(el.className).toBe("container");
  });

  it("className 속성을 설정한다", () => {
    const el = createElement(div({ className: "wrapper" }));
    expect(el.className).toBe("wrapper");
  });

  it("style 객체를 적용한다", () => {
    const el = createElement(div({ style: { color: "red", fontSize: "16px" } }));
    expect(el.style.color).toBe("red");
    expect(el.style.fontSize).toBe("16px");
  });

  it("이벤트 핸들러를 등록한다", () => {
    let clicked = false;
    const el = createElement(button({ onClick: () => (clicked = true) }, "click me"));
    el.click();
    expect(clicked).toBe(true);
  });

  it("배열 자식을 펼쳐서 추가한다", () => {
    const items = ["a", "b", "c"].map((t) => li(t));
    const el = createElement(ul(items));
    expect(el.children.length).toBe(3);
    expect(el.children[1].textContent).toBe("b");
  });

  it("null, undefined, boolean 자식은 무시한다", () => {
    const el = createElement(div(null, undefined, true, false, "visible"));
    expect(el.childNodes.length).toBe(1);
    expect(el.textContent).toBe("visible");
  });

  it("Proxy이므로 어떤 태그명이든 사용 가능하다", () => {
    const el = createElement(tags["custom-element"]());
    expect(el.tagName).toBe("CUSTOM-ELEMENT");
  });
});

describe("tags → HTML 문자열 변환", () => {
  it("빈 요소", () => {
    expect(createElement(div()).outerHTML).toBe("<div></div>");
  });

  it("텍스트 자식", () => {
    expect(createElement(p("hello")).outerHTML).toBe("<p>hello</p>");
  });

  it("숫자 자식", () => {
    expect(createElement(span(42)).outerHTML).toBe("<span>42</span>");
  });

  it("중첩 요소", () => {
    expect(createElement(div(p("hello"), button("click"))).outerHTML).toBe(
      "<div><p>hello</p><button>click</button></div>",
    );
  });

  it("깊은 중첩", () => {
    expect(createElement(div(div(div(span("deep"))))).outerHTML).toBe(
      "<div><div><div><span>deep</span></div></div></div>",
    );
  });

  it("리스트", () => {
    expect(createElement(ul(li("1"), li("2"), li("3"))).outerHTML).toBe(
      "<ul><li>1</li><li>2</li><li>3</li></ul>",
    );
  });

  it("속성이 있는 요소", () => {
    expect(createElement(input({ type: "text", placeholder: "입력" })).outerHTML).toBe(
      '<input type="text" placeholder="입력">',
    );
  });

  it("속성과 자식이 함께 있는 요소", () => {
    expect(createElement(a({ href: "/home" }, "홈으로")).outerHTML).toBe(
      '<a href="/home">홈으로</a>',
    );
  });

  it("class 속성", () => {
    expect(createElement(div({ class: "container" }, "내용")).outerHTML).toBe(
      '<div class="container">내용</div>',
    );
  });

  it("배열 자식", () => {
    const items = ["a", "b", "c"].map((t) => li(t));
    expect(createElement(ul(items)).outerHTML).toBe(
      "<ul><li>a</li><li>b</li><li>c</li></ul>",
    );
  });

  it("null/undefined/boolean 자식 무시", () => {
    expect(createElement(div(null, undefined, true, false, "visible")).outerHTML).toBe(
      "<div>visible</div>",
    );
  });

  it("복합 구조", () => {
    const el = createElement(div(
      { class: "app" },
      h1("제목"),
      p("본문"),
      ul(li("항목1"), li("항목2")),
      button({ class: "btn" }, "확인"),
    ));
    expect(el.outerHTML).toBe(
      '<div class="app">' +
        "<h1>제목</h1>" +
        "<p>본문</p>" +
        "<ul><li>항목1</li><li>항목2</li></ul>" +
        '<button class="btn">확인</button>' +
        "</div>",
    );
  });

  it("커스텀 엘리먼트", () => {
    expect(createElement(tags["my-component"]("내용")).outerHTML).toBe(
      "<my-component>내용</my-component>",
    );
  });
});

describe("vDOM 생성 (tag → vnode)", () => {
  it("div()가 vnode 객체를 반환한다", () => {
    const vnode = div();
    expect(vnode).toEqual({
      $$type: "vnode",
      tag: "div",
      props: {},
      children: [],
      key: null,
    });
  });

  it("p('hello')의 children이 ['hello']이다", () => {
    const vnode = p("hello");
    expect(vnode.$$type).toBe("vnode");
    expect(vnode.tag).toBe("p");
    expect(vnode.children).toEqual(["hello"]);
  });

  it("span(42)의 children이 [42]이다", () => {
    const vnode = span(42);
    expect(vnode.$$type).toBe("vnode");
    expect(vnode.tag).toBe("span");
    expect(vnode.children).toEqual([42]);
  });

  it("div(p('hello'))에서 중첩 vnode 구조를 확인한다", () => {
    const vnode = div(p("hello"));
    expect(vnode.$$type).toBe("vnode");
    expect(vnode.tag).toBe("div");
    expect(vnode.children.length).toBe(1);
    expect(vnode.children[0]).toEqual({
      $$type: "vnode",
      tag: "p",
      props: {},
      children: ["hello"],
      key: null,
    });
  });

  it("div({ class: 'container' })의 props를 확인한다", () => {
    const vnode = div({ class: "container" });
    expect(vnode.$$type).toBe("vnode");
    expect(vnode.props).toEqual({ class: "container" });
    expect(vnode.children).toEqual([]);
  });

  it("div({ key: 'k1' })에서 key가 추출되고 props에서 제거된다", () => {
    const vnode = div({ key: "k1" });
    expect(vnode.key).toBe("k1");
    expect(vnode.props).not.toHaveProperty("key");
  });

  it("div(null, undefined, true, false, 'visible')에서 falsy 값이 필터링된다", () => {
    const vnode = div(null, undefined, true, false, "visible");
    expect(vnode.children).toEqual(["visible"]);
  });

  it("ul([li('1'), li('2')])에서 배열이 평탄화된다", () => {
    const vnode = ul([li("1"), li("2")]);
    expect(vnode.children.length).toBe(2);
    expect(vnode.children[0]).toEqual({
      $$type: "vnode",
      tag: "li",
      props: {},
      children: ["1"],
      key: null,
    });
    expect(vnode.children[1]).toEqual({
      $$type: "vnode",
      tag: "li",
      props: {},
      children: ["2"],
      key: null,
    });
  });
});

describe("createElement", () => {
  it("텍스트 vnode → TextNode 생성", () => {
    const textNode = createElement("hello");
    expect(textNode).toBeInstanceOf(Text);
    expect(textNode.textContent).toBe("hello");
  });

  it("숫자 텍스트 vnode → TextNode 생성", () => {
    const textNode = createElement(42);
    expect(textNode).toBeInstanceOf(Text);
    expect(textNode.textContent).toBe("42");
  });

  it("빈 요소 vnode → 빈 Element 생성", () => {
    const vnode = { $$type: "vnode", tag: "div", props: {}, children: [], key: null };
    const el = createElement(vnode);
    expect(el.tagName).toBe("DIV");
    expect(el.childNodes.length).toBe(0);
  });

  it("props가 있는 vnode → 속성이 설정된 Element", () => {
    const vnode = {
      $$type: "vnode",
      tag: "input",
      props: { type: "text", placeholder: "입력" },
      children: [],
      key: null,
    };
    const el = createElement(vnode);
    expect(el.tagName).toBe("INPUT");
    expect(el.getAttribute("type")).toBe("text");
    expect(el.getAttribute("placeholder")).toBe("입력");
  });

  it("children이 있는 vnode → 자식이 포함된 Element", () => {
    const vnode = {
      $$type: "vnode",
      tag: "ul",
      props: {},
      children: [
        { $$type: "vnode", tag: "li", props: {}, children: ["항목1"], key: null },
        { $$type: "vnode", tag: "li", props: {}, children: ["항목2"], key: null },
      ],
      key: null,
    };
    const el = createElement(vnode);
    expect(el.tagName).toBe("UL");
    expect(el.children.length).toBe(2);
    expect(el.children[0].textContent).toBe("항목1");
    expect(el.children[1].textContent).toBe("항목2");
  });

  it("중첩 vnode → 중첩 DOM", () => {
    const vnode = {
      $$type: "vnode",
      tag: "div",
      props: {},
      children: [
        {
          $$type: "vnode",
          tag: "div",
          props: {},
          children: [
            { $$type: "vnode", tag: "span", props: {}, children: ["deep"], key: null },
          ],
          key: null,
        },
      ],
      key: null,
    };
    const el = createElement(vnode);
    expect(el.querySelector("span").textContent).toBe("deep");
  });

  it("이벤트 핸들러 props → addEventListener", () => {
    let clicked = false;
    const vnode = {
      $$type: "vnode",
      tag: "button",
      props: { onClick: () => (clicked = true) },
      children: ["클릭"],
      key: null,
    };
    const el = createElement(vnode);
    el.click();
    expect(clicked).toBe(true);
  });

  it("class props → className 설정", () => {
    const vnode = {
      $$type: "vnode",
      tag: "div",
      props: { class: "container" },
      children: [],
      key: null,
    };
    const el = createElement(vnode);
    expect(el.className).toBe("container");
  });

  it("className props → className 설정", () => {
    const vnode = {
      $$type: "vnode",
      tag: "div",
      props: { className: "wrapper" },
      children: [],
      key: null,
    };
    const el = createElement(vnode);
    expect(el.className).toBe("wrapper");
  });

  it("style 객체 → style 적용", () => {
    const vnode = {
      $$type: "vnode",
      tag: "div",
      props: { style: { color: "red", fontSize: "16px" } },
      children: [],
      key: null,
    };
    const el = createElement(vnode);
    expect(el.style.color).toBe("red");
    expect(el.style.fontSize).toBe("16px");
  });
});

describe("diff() 기본 케이스", () => {
  it("old가 null이고 new가 vnode이면 CREATE 패치를 반환한다", () => {
    // Given
    const oldVNode = null;
    const newVNode = { $$type: "vnode", tag: "div", props: {}, children: [], key: null };

    // When
    const patches = diff(oldVNode, newVNode);

    // Then
    expect(patches).toEqual([{ type: "CREATE", path: [], newVNode }]);
  });

  it("old가 vnode이고 new가 null이면 REMOVE 패치를 반환한다", () => {
    // Given
    const oldVNode = { $$type: "vnode", tag: "div", props: {}, children: [], key: null };
    const newVNode = null;

    // When
    const patches = diff(oldVNode, newVNode);

    // Then
    expect(patches).toEqual([{ type: "REMOVE", path: [] }]);
  });

  it("둘 다 텍스트이고 값이 다르면 TEXT 패치를 반환한다", () => {
    // Given
    const oldVNode = "hello";
    const newVNode = "world";

    // When
    const patches = diff(oldVNode, newVNode);

    // Then
    expect(patches).toEqual([{ type: "TEXT", path: [], text: "world" }]);
  });

  it("tag가 다르면 REPLACE 패치를 반환한다", () => {
    // Given
    const oldVNode = { $$type: "vnode", tag: "div", props: {}, children: [], key: null };
    const newVNode = { $$type: "vnode", tag: "span", props: {}, children: [], key: null };

    // When
    const patches = diff(oldVNode, newVNode);

    // Then
    expect(patches).toEqual([{ type: "REPLACE", path: [], newVNode }]);
  });

  it("tag가 같고 props만 다르면 PROPS 패치를 반환한다", () => {
    // Given
    const oldVNode = {
      $$type: "vnode",
      tag: "div",
      props: { class: "old", id: "to-remove" },
      children: [],
      key: null,
    };
    const newVNode = {
      $$type: "vnode",
      tag: "div",
      props: { class: "new" },
      children: [],
      key: null,
    };

    // When
    const patches = diff(oldVNode, newVNode);

    // Then
    expect(patches).toContainEqual({
      type: "PROPS",
      path: [],
      props: { class: "new" },
      removedProps: ["id"],
    });
  });

  it("tag가 같고 children이 다르면 children에 대해 재귀 diff한다", () => {
    // Given
    const oldVNode = {
      $$type: "vnode",
      tag: "div",
      props: {},
      children: ["hello"],
      key: null,
    };
    const newVNode = {
      $$type: "vnode",
      tag: "div",
      props: {},
      children: ["world"],
      key: null,
    };

    // When
    const patches = diff(oldVNode, newVNode);

    // Then
    expect(patches).toContainEqual({ type: "TEXT", path: [0], text: "world" });
  });
});

describe("applyPatches()", () => {
  it("CREATE 패치 → DOM에 새 노드 추가", () => {
    // Arrange
    const container = document.createElement("div");
    render(div(), container);
    const domDiv = container.firstChild;
    const patches = [{ type: "CREATE", path: [0], newVNode: span("added") }];

    // Act
    applyPatches(domDiv, patches);

    // Assert
    expect(domDiv.outerHTML).toBe("<div><span>added</span></div>");
  });

  it("REMOVE 패치 → DOM에서 노드 삭제", () => {
    // Arrange
    const container = document.createElement("div");
    render(div(span("a"), span("b")), container);
    const domDiv = container.firstChild;
    const patches = [{ type: "REMOVE", path: [1] }];

    // Act
    applyPatches(domDiv, patches);

    // Assert
    expect(domDiv.outerHTML).toBe("<div><span>a</span></div>");
  });

  it("REPLACE 패치 → 서브트리 교체", () => {
    // Arrange
    const container = document.createElement("div");
    render(div(span("old")), container);
    const domDiv = container.firstChild;
    const newVNode = { $$type: "vnode", tag: "p", props: {}, children: ["new"], key: null };
    const patches = [{ type: "REPLACE", path: [0], newVNode }];

    // Act
    applyPatches(domDiv, patches);

    // Assert
    expect(domDiv.outerHTML).toBe("<div><p>new</p></div>");
  });

  it("PROPS 패치 → 속성 변경/삭제", () => {
    // Arrange
    const container = document.createElement("div");
    render(div({ class: "old", id: "x" }), container);
    const domDiv = container.firstChild;
    const patches = [{
      type: "PROPS",
      path: [],
      props: { class: "new" },
      removedProps: ["id"],
    }];

    // Act
    applyPatches(domDiv, patches);

    // Assert
    expect(domDiv.className).toBe("new");
    expect(domDiv.hasAttribute("id")).toBe(false);
  });

  it("TEXT 패치 → 텍스트 노드 변경", () => {
    // Arrange
    const container = document.createElement("div");
    render(div("hello"), container);
    const domDiv = container.firstChild;
    const patches = [{ type: "TEXT", path: [0], text: "world" }];

    // Act
    applyPatches(domDiv, patches);

    // Assert
    expect(domDiv.textContent).toBe("world");
  });

  it("여러 패치 순서대로 적용 — PROPS + TEXT 복합", () => {
    // Arrange
    const container = document.createElement("div");
    render(div({ class: "old" }, "hello"), container);
    const domDiv = container.firstChild;
    const patches = [
      { type: "PROPS", path: [], props: { class: "new" }, removedProps: [] },
      { type: "TEXT", path: [0], text: "world" },
    ];

    // Act
    applyPatches(domDiv, patches);

    // Assert
    expect(domDiv.className).toBe("new");
    expect(domDiv.textContent).toBe("world");
  });

  it("REMOVE 뒤→앞 적용 — 여러 인덱스 동시 삭제 시 앞 요소만 남음", () => {
    // Arrange: div(a, b, c) 에서 인덱스 [1]과 [2]를 REMOVE → span("a")만 남아야 함
    const container = document.createElement("div");
    render(div(span("a"), span("b"), span("c")), container);
    const domDiv = container.firstChild;
    const patches = [
      { type: "REMOVE", path: [1] },
      { type: "REMOVE", path: [2] },
    ];

    // Act
    applyPatches(domDiv, patches);

    // Assert
    expect(domDiv.outerHTML).toBe("<div><span>a</span></div>");
  });
});

describe("통합: render → diff → applyPatches", () => {
  it("텍스트 변경 — render 후 diff+applyPatches 하면 DOM이 새 vnode와 일치한다", () => {
    // Arrange
    const container = document.createElement("div");
    const oldVNode = div("hello");
    const newVNode = div("world");
    render(oldVNode, container);
    const domRoot = container.firstChild;

    // Act
    const patches = diff(oldVNode, newVNode);
    applyPatches(domRoot, patches);

    // Assert
    expect(domRoot.outerHTML).toBe(createElement(newVNode).outerHTML);
  });

  it("속성 변경 — render 후 diff+applyPatches 하면 DOM이 새 vnode와 일치한다", () => {
    // Arrange
    const container = document.createElement("div");
    const oldVNode = div({ class: "old" }, "text");
    const newVNode = div({ class: "new" }, "text");
    render(oldVNode, container);
    const domRoot = container.firstChild;

    // Act
    const patches = diff(oldVNode, newVNode);
    applyPatches(domRoot, patches);

    // Assert
    expect(domRoot.outerHTML).toBe(createElement(newVNode).outerHTML);
  });

  it("자식 추가 — render 후 diff+applyPatches 하면 DOM이 새 vnode와 일치한다", () => {
    // Arrange
    const container = document.createElement("div");
    const oldVNode = ul(li("1"), li("2"));
    const newVNode = ul(li("1"), li("2"), li("3"));
    render(oldVNode, container);
    const domRoot = container.firstChild;

    // Act
    const patches = diff(oldVNode, newVNode);
    applyPatches(domRoot, patches);

    // Assert
    expect(domRoot.outerHTML).toBe(createElement(newVNode).outerHTML);
  });

  it("key 기반 리스트 재정렬 — render 후 diff+applyPatches 하면 DOM이 새 순서와 일치한다", () => {
    // Arrange
    const container = document.createElement("div");
    const oldVNode = ul(
      li({ key: "a" }, "항목A"),
      li({ key: "b" }, "항목B"),
      li({ key: "c" }, "항목C"),
    );
    const newVNode = ul(
      li({ key: "c" }, "항목C"),
      li({ key: "a" }, "항목A"),
      li({ key: "b" }, "항목B"),
    );
    render(oldVNode, container);
    const domRoot = container.firstChild;

    // Act
    const patches = diff(oldVNode, newVNode);
    applyPatches(domRoot, patches);

    // Assert
    expect(domRoot.outerHTML).toBe(createElement(newVNode).outerHTML);
  });
});

describe("diff() key 기반 리스트 reconciliation", () => {
  it("key로 매칭된 노드 재정렬 — REMOVE/CREATE 없이 key 매칭 기반 패치", () => {
    // Given: 동일한 노드를 다른 순서로 배치
    const oldVNode = ul(
      li({ key: "a" }, "A"),
      li({ key: "b" }, "B"),
      li({ key: "c" }, "C"),
    );
    const newVNode = ul(
      li({ key: "c" }, "C"),
      li({ key: "a" }, "A"),
      li({ key: "b" }, "B"),
    );

    // When
    const patches = diff(oldVNode, newVNode);

    // Then: 내용은 동일하지만 순서가 바뀌었으므로 REORDER 패치 1개만 발생
    expect(patches).toHaveLength(1);
    expect(patches[0].type).toBe("REORDER");
    expect(patches.filter((p) => p.type === "REMOVE")).toHaveLength(0);
    expect(patches.filter((p) => p.type === "CREATE")).toHaveLength(0);
    expect(patches.filter((p) => p.type === "TEXT")).toHaveLength(0);
  });

  it("key 있는 새 노드 추가 — 신규 key에 대한 CREATE 패치만 발생", () => {
    // Given: 기존 [a,b]에서 [b,a,c]로 변경 (재정렬 + 추가)
    const oldVNode = ul(
      li({ key: "a" }, "A"),
      li({ key: "b" }, "B"),
    );
    const newVNode = ul(
      li({ key: "b" }, "B"),
      li({ key: "a" }, "A"),
      li({ key: "c" }, "C"),
    );

    // When
    const patches = diff(oldVNode, newVNode);

    // Then: key "c"에 대한 CREATE 1개만, REMOVE/TEXT 패치 없음
    const createPatches = patches.filter((p) => p.type === "CREATE");
    const removePatches = patches.filter((p) => p.type === "REMOVE");
    const textPatches = patches.filter((p) => p.type === "TEXT");
    expect(createPatches).toHaveLength(1);
    expect(createPatches[0].newVNode.key).toBe("c");
    expect(removePatches).toHaveLength(0);
    expect(textPatches).toHaveLength(0);
  });

  it("key 있는 노드 삭제 — 삭제된 key에 대한 REMOVE 패치만 발생", () => {
    // Given: [a,b,c] → [a,c] (b 삭제)
    const oldVNode = ul(
      li({ key: "a" }, "A"),
      li({ key: "b" }, "B"),
      li({ key: "c" }, "C"),
    );
    const newVNode = ul(
      li({ key: "a" }, "A"),
      li({ key: "c" }, "C"),
    );

    // When
    const patches = diff(oldVNode, newVNode);

    // Then: key "b"에 대한 REMOVE 1개만, TEXT/PROPS 패치 없음
    const removePatches = patches.filter((p) => p.type === "REMOVE");
    const textPatches = patches.filter((p) => p.type === "TEXT");
    const propsPatches = patches.filter((p) => p.type === "PROPS");
    expect(removePatches).toHaveLength(1);
    expect(textPatches).toHaveLength(0);
    expect(propsPatches).toHaveLength(0);
  });

  it("key 같으면 props 변경만 diff — TEXT 패치 없이 PROPS 패치만 발생", () => {
    // Given: [a(class:old),b] → [b,a(class:new)] (재정렬 + a의 class 변경)
    const oldVNode = ul(
      li({ key: "a", class: "old" }, "A"),
      li({ key: "b" }, "B"),
    );
    const newVNode = ul(
      li({ key: "b" }, "B"),
      li({ key: "a", class: "new" }, "A"),
    );

    // When
    const patches = diff(oldVNode, newVNode);

    // Then: key "a"의 class 변경에 대한 PROPS 패치 1개만, TEXT 패치 없음
    const propsPatches = patches.filter((p) => p.type === "PROPS");
    const textPatches = patches.filter((p) => p.type === "TEXT");
    expect(propsPatches).toHaveLength(1);
    expect(propsPatches[0].props).toEqual({ class: "new" });
    expect(textPatches).toHaveLength(0);
  });

  it("key 없는 자식은 기존 인덱스 매칭 유지", () => {
    // Given: key 없는 리스트에서 중간 항목 변경
    const oldVNode = ul(li("A"), li("B"), li("C"));
    const newVNode = ul(li("A"), li("X"), li("C"));

    // When
    const patches = diff(oldVNode, newVNode);

    // Then: 인덱스 기반으로 B→X TEXT 패치 1개
    const textPatches = patches.filter((p) => p.type === "TEXT");
    expect(textPatches).toHaveLength(1);
    expect(textPatches[0].text).toBe("X");
  });

  it("key 있는/없는 혼합 처리 — key 노드는 key 매칭, 없는 노드는 인덱스 매칭", () => {
    // Given: key 있는 노드 재정렬, key 없는 노드 동일 유지
    const oldVNode = ul(
      li({ key: "a" }, "A"),
      li("no-key"),
      li({ key: "b" }, "B"),
    );
    const newVNode = ul(
      li({ key: "b" }, "B"),
      li("no-key"),
      li({ key: "a" }, "A"),
    );

    // When
    const patches = diff(oldVNode, newVNode);

    // Then: key 노드(a,b)는 내용 동일, key 없는 노드도 동일 → 패치 없음
    expect(patches).toHaveLength(0);
  });

  it("빈 리스트 → 비어있지 않은 리스트 — 전부 CREATE", () => {
    // Given
    const oldVNode = ul();
    const newVNode = ul(
      li({ key: "a" }, "A"),
      li({ key: "b" }, "B"),
      li({ key: "c" }, "C"),
    );

    // When
    const patches = diff(oldVNode, newVNode);

    // Then: 3개 CREATE 패치
    const createPatches = patches.filter((p) => p.type === "CREATE");
    expect(createPatches).toHaveLength(3);
  });

  it("비어있지 않은 리스트 → 빈 리스트 — 전부 REMOVE", () => {
    // Given
    const oldVNode = ul(
      li({ key: "a" }, "A"),
      li({ key: "b" }, "B"),
      li({ key: "c" }, "C"),
    );
    const newVNode = ul();

    // When
    const patches = diff(oldVNode, newVNode);

    // Then: 3개 REMOVE 패치
    const removePatches = patches.filter((p) => p.type === "REMOVE");
    expect(removePatches).toHaveLength(3);
  });
});
