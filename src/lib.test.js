import { describe, it, expect } from "vitest";
import { domToVdom, vdomToDom, renderTo, diff } from "./lib.js";

// ── 헬퍼: HTML 문자열 → DOM 요소 ──
function htmlToElement(html) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstChild;
}

// ═══════════════════════════════════════════
// domToVdom 테스트
// ═══════════════════════════════════════════
describe("domToVdom", () => {
  it("텍스트 노드가 주어지면 문자열을 반환한다", () => {
    // Given
    const textNode = document.createTextNode("hello");

    // When
    const result = domToVdom(textNode);

    // Then
    expect(result).toBe("hello");
  });

  it("자식이 없는 요소가 주어지면 빈 children 배열을 가진 vDOM 객체를 반환한다", () => {
    // Given
    const el = htmlToElement("<div></div>");

    // When
    const result = domToVdom(el);

    // Then
    expect(result).toEqual({ type: "div", props: {}, children: [] });
  });

  it("속성이 있는 요소가 주어지면 props 객체에 속성을 포함한다", () => {
    // Given
    const el = htmlToElement('<p style="color: blue" class="text"></p>');

    // When
    const result = domToVdom(el);

    // Then
    expect(result.props).toEqual({ style: "color: blue", class: "text" });
  });

  it("중첩된 자식 요소가 주어지면 재귀적으로 변환한다", () => {
    // Given
    const el = htmlToElement("<ul><li>A</li><li>B</li></ul>");

    // When
    const result = domToVdom(el);

    // Then
    expect(result).toEqual({
      type: "ul",
      props: {},
      children: [
        { type: "li", props: {}, children: ["A"] },
        { type: "li", props: {}, children: ["B"] },
      ],
    });
  });

  it("태그 사이에 공백 텍스트 노드가 있으면 필터링한다", () => {
    // Given — HTML의 줄바꿈/들여쓰기가 공백 텍스트 노드를 생성
    const el = htmlToElement(`<div>
      <span>hi</span>
    </div>`);

    // When
    const result = domToVdom(el);

    // Then
    expect(result.children).toEqual([
      { type: "span", props: {}, children: ["hi"] },
    ]);
  });

  it("여러 레벨로 중첩된 복잡한 구조가 주어지면 전체를 올바르게 변환한다", () => {
    // Given
    const el = htmlToElement(`<div>
      <h1>Hello</h1>
      <p style="color: blue">Virtual DOM Demo</p>
      <ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>
    </div>`);

    // When
    const result = domToVdom(el);

    // Then
    expect(result).toEqual({
      type: "div",
      props: {},
      children: [
        { type: "h1", props: {}, children: ["Hello"] },
        { type: "p", props: { style: "color: blue" }, children: ["Virtual DOM Demo"] },
        {
          type: "ul",
          props: {},
          children: [
            { type: "li", props: {}, children: ["Item 1"] },
            { type: "li", props: {}, children: ["Item 2"] },
            { type: "li", props: {}, children: ["Item 3"] },
          ],
        },
      ],
    });
  });
});

// ═══════════════════════════════════════════
// vdomToDom 테스트
// ═══════════════════════════════════════════
describe("vdomToDom", () => {
  it("문자열 vnode가 주어지면 텍스트 노드를 생성한다", () => {
    // Given
    const vnode = "hello";

    // When
    const node = vdomToDom(vnode);

    // Then
    expect(node.nodeType).toBe(Node.TEXT_NODE);
    expect(node.textContent).toBe("hello");
  });

  it("빈 vDOM 객체가 주어지면 자식 없는 요소를 생성한다", () => {
    // Given
    const vnode = { type: "div", props: {}, children: [] };

    // When
    const node = vdomToDom(vnode);

    // Then
    expect(node.tagName).toBe("DIV");
    expect(node.childNodes.length).toBe(0);
  });

  it("props가 있는 vDOM 객체가 주어지면 요소에 속성을 설정한다", () => {
    // Given
    const vnode = {
      type: "p",
      props: { style: "color: red", class: "text" },
      children: [],
    };

    // When
    const node = vdomToDom(vnode);

    // Then
    expect(node.getAttribute("style")).toBe("color: red");
    expect(node.getAttribute("class")).toBe("text");
  });

  it("자식이 있는 vDOM 객체가 주어지면 재귀적으로 DOM을 생성한다", () => {
    // Given
    const vnode = {
      type: "ul",
      props: {},
      children: [
        { type: "li", props: {}, children: ["A"] },
        { type: "li", props: {}, children: ["B"] },
      ],
    };

    // When
    const node = vdomToDom(vnode);

    // Then
    expect(node.childNodes.length).toBe(2);
    expect(node.childNodes[0].textContent).toBe("A");
    expect(node.childNodes[1].textContent).toBe("B");
  });
});

// ═══════════════════════════════════════════
// renderTo 테스트
// ═══════════════════════════════════════════
describe("renderTo", () => {
  it("기존 내용이 있는 컨테이너가 주어지면 비우고 새 vDOM을 렌더링한다", () => {
    // Given
    const container = document.createElement("div");
    container.innerHTML = "<p>old content</p>";
    const vdom = { type: "span", props: {}, children: ["new"] };

    // When
    renderTo(container, vdom);

    // Then
    expect(container.childNodes.length).toBe(1);
    expect(container.firstChild.tagName).toBe("SPAN");
    expect(container.firstChild.textContent).toBe("new");
  });
});

// ═══════════════════════════════════════════
// 라운드트립 테스트 (DOM → vDOM → DOM → vDOM)
// ═══════════════════════════════════════════
describe("라운드트립", () => {
  it("복잡한 DOM 구조가 주어지면 vDOM 변환 후 복원해도 동일한 vDOM을 얻는다", () => {
    // Given
    const original = htmlToElement(`<div>
      <h1>Hello</h1>
      <p style="color: blue">Virtual DOM Demo</p>
      <ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>
    </div>`);

    // When
    const vdom1 = domToVdom(original);
    const reconstructed = vdomToDom(vdom1);
    const vdom2 = domToVdom(reconstructed);

    // Then
    expect(vdom2).toEqual(vdom1);
  });

  it("단순 텍스트 요소가 주어지면 라운드트립 후에도 동일한 vDOM을 얻는다", () => {
    // Given
    const el = htmlToElement("<span>hello</span>");

    // When
    const vdom = domToVdom(el);
    const rebuilt = vdomToDom(vdom);
    const vdomAfter = domToVdom(rebuilt);

    // Then
    expect(vdomAfter).toEqual(vdom);
  });

  it("다중 속성 요소가 주어지면 라운드트립 후에도 동일한 vDOM을 얻는다", () => {
    // Given
    const el = htmlToElement('<input type="text" placeholder="name" class="field">');

    // When
    const vdom = domToVdom(el);
    const rebuilt = vdomToDom(vdom);
    const vdomAfter = domToVdom(rebuilt);

    // Then
    expect(vdomAfter).toEqual(vdom);
  });
});

// ═══════════════════════════════════════════
// diff 테스트
// ═══════════════════════════════════════════
describe("diff", () => {
  // ── TEXT 패치 ──
  it("양쪽 텍스트 노드의 내용이 다르면 TEXT 패치를 생성한다", () => {
    // Given
    const oldVdom = "hello";
    const newVdom = "world";

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([
      { type: "TEXT", path: [], value: "world" },
    ]);
  });

  it("양쪽 텍스트 노드의 내용이 같으면 빈 패치 목록을 반환한다", () => {
    // Given
    const oldVdom = "same";
    const newVdom = "same";

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([]);
  });

  // ── REPLACE 패치 ──
  it("텍스트 노드와 요소 노드가 주어지면 REPLACE 패치를 생성한다", () => {
    // Given
    const oldVdom = "text";
    const newVdom = { type: "span", props: {}, children: ["text"] };

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([
      { type: "REPLACE", path: [], newNode: newVdom },
    ]);
  });

  it("태그명이 다른 요소가 주어지면 REPLACE 패치를 생성한다", () => {
    // Given
    const oldVdom = { type: "p", props: {}, children: ["text"] };
    const newVdom = { type: "span", props: {}, children: ["text"] };

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([
      { type: "REPLACE", path: [], newNode: newVdom },
    ]);
  });

  // ── PROPS 패치 ──
  it("속성이 추가되면 PROPS 패치에 새 값을 포함한다", () => {
    // Given
    const oldVdom = { type: "div", props: {}, children: [] };
    const newVdom = { type: "div", props: { class: "box" }, children: [] };

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([
      { type: "PROPS", path: [], props: { class: "box" } },
    ]);
  });

  it("속성이 변경되면 PROPS 패치에 변경된 값을 포함한다", () => {
    // Given
    const oldVdom = { type: "div", props: { class: "old" }, children: [] };
    const newVdom = { type: "div", props: { class: "new" }, children: [] };

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([
      { type: "PROPS", path: [], props: { class: "new" } },
    ]);
  });

  it("속성이 삭제되면 PROPS 패치에 null 값을 포함한다", () => {
    // Given
    const oldVdom = { type: "div", props: { class: "box", id: "main" }, children: [] };
    const newVdom = { type: "div", props: { class: "box" }, children: [] };

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([
      { type: "PROPS", path: [], props: { id: null } },
    ]);
  });

  it("속성이 동일하면 PROPS 패치를 생성하지 않는다", () => {
    // Given
    const oldVdom = { type: "div", props: { class: "box" }, children: [] };
    const newVdom = { type: "div", props: { class: "box" }, children: [] };

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([]);
  });

  // ── ADD 패치 ──
  it("new에만 자식이 있으면 ADD 패치를 생성한다", () => {
    // Given
    const oldVdom = { type: "ul", props: {}, children: [] };
    const newVdom = {
      type: "ul", props: {}, children: [
        { type: "li", props: {}, children: ["A"] },
      ],
    };

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([
      { type: "ADD", path: [0], newNode: { type: "li", props: {}, children: ["A"] } },
    ]);
  });

  // ── REMOVE 패치 ──
  it("old에만 자식이 있으면 REMOVE 패치를 생성한다", () => {
    // Given
    const oldVdom = {
      type: "ul", props: {}, children: [
        { type: "li", props: {}, children: ["A"] },
        { type: "li", props: {}, children: ["B"] },
      ],
    };
    const newVdom = {
      type: "ul", props: {}, children: [
        { type: "li", props: {}, children: ["A"] },
      ],
    };

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([
      { type: "REMOVE", path: [1] },
    ]);
  });

  // ── 자식 재귀 비교 ──
  it("중첩된 자식의 텍스트가 변경되면 올바른 path로 패치를 생성한다", () => {
    // Given
    const oldVdom = {
      type: "div", props: {}, children: [
        { type: "h1", props: {}, children: ["Hello"] },
      ],
    };
    const newVdom = {
      type: "div", props: {}, children: [
        { type: "h1", props: {}, children: ["Changed"] },
      ],
    };

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([
      { type: "TEXT", path: [0, 0], value: "Changed" },
    ]);
  });

  // ── 동일한 vDOM ──
  it("동일한 vDOM이 주어지면 빈 패치 목록을 반환한다", () => {
    // Given
    const vdom = {
      type: "div", props: { class: "box" }, children: [
        { type: "p", props: {}, children: ["hello"] },
      ],
    };

    // When
    const patches = diff(vdom, vdom);

    // Then
    expect(patches).toEqual([]);
  });

  // ── path 전달 ──
  it("초기 path가 주어지면 모든 패치 경로에 접두사로 포함된다", () => {
    // Given
    const oldVdom = {
      type: "div", props: {}, children: [
        { type: "p", props: {}, children: ["old"] },
      ],
    };
    const newVdom = {
      type: "div", props: { class: "new" }, children: [
        { type: "p", props: {}, children: ["new"] },
        { type: "span", props: {}, children: ["added"] },
      ],
    };
    const basePath = [1, 3];

    // When
    const patches = diff(oldVdom, newVdom, basePath);

    // Then — 모든 패치의 path가 basePath로 시작해야 한다
    for (const patch of patches) {
      expect(patch.path.slice(0, 2)).toEqual([1, 3]);
    }
    expect(patches).toContainEqual({ type: "PROPS", path: [1, 3], props: { class: "new" } });
    expect(patches).toContainEqual({ type: "TEXT", path: [1, 3, 0, 0], value: "new" });
    expect(patches).toContainEqual({
      type: "ADD", path: [1, 3, 1],
      newNode: { type: "span", props: {}, children: ["added"] },
    });
  });

  // ── 복합 시나리오: 계획서의 Phase 2 검증 케이스 ──
  it("여러 종류의 변경이 동시에 있으면 모든 패치 타입을 올바르게 생성한다", () => {
    // Given — Phase 2 계획서의 검증 시나리오
    const oldVdom = {
      type: "div", props: {}, children: [
        { type: "h1", props: {}, children: ["Hello"] },
        { type: "p", props: { style: "color: blue" }, children: ["Virtual DOM Demo"] },
        {
          type: "ul", props: {}, children: [
            { type: "li", props: {}, children: ["Item 1"] },
            { type: "li", props: {}, children: ["Item 2"] },
            { type: "li", props: {}, children: ["Item 3"] },
          ],
        },
      ],
    };
    const newVdom = {
      type: "div", props: {}, children: [
        { type: "h1", props: {}, children: ["Changed!"] },          // TEXT 변경
        { type: "span", props: {}, children: ["New element"] },     // REPLACE (p→span)
        {
          type: "ul", props: { class: "list" }, children: [         // PROPS 변경
            { type: "li", props: {}, children: ["Item 1"] },
            { type: "li", props: {}, children: ["Item 3"] },        // Item 2→Item 3 (TEXT)
            // Item 3 삭제 → REMOVE
          ],
        },
      ],
    };

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    const types = patches.map((p) => p.type);
    expect(types).toContain("TEXT");
    expect(types).toContain("REPLACE");
    expect(types).toContain("PROPS");
    expect(types).toContain("REMOVE");

    // TEXT: h1 텍스트 변경 (path: [0, 0])
    expect(patches).toContainEqual({ type: "TEXT", path: [0, 0], value: "Changed!" });

    // REPLACE: p → span (path: [1])
    expect(patches).toContainEqual({
      type: "REPLACE", path: [1],
      newNode: { type: "span", props: {}, children: ["New element"] },
    });

    // PROPS: ul에 class 추가 (path: [2])
    expect(patches).toContainEqual({ type: "PROPS", path: [2], props: { class: "list" } });

    // REMOVE: ul의 세 번째 자식 삭제 (path: [2, 2])
    expect(patches).toContainEqual({ type: "REMOVE", path: [2, 2] });
  });
});
