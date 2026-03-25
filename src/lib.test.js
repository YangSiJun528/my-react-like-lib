import { describe, it, expect } from "vitest";
import { domToVdom, vdomToDom, renderTo, diff, applyPatches, textNode, elementNode, PatchType } from "./lib.js";
import { createHistory } from "./history.js";

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
  it("텍스트 노드가 주어지면 텍스트 vDOM을 반환한다", () => {
    // Given
    const domTextNode = document.createTextNode("hello");

    // When
    const result = domToVdom(domTextNode);

    // Then
    expect(result).toEqual(textNode("hello"));
  });

  it("자식이 없는 요소가 주어지면 빈 children 배열을 가진 vDOM 객체를 반환한다", () => {
    // Given
    const elem = htmlToElement("<div></div>");

    // When
    const result = domToVdom(elem);

    // Then
    expect(result).toEqual(elementNode("div", {}, []));
  });

  it("속성이 있는 요소가 주어지면 props 객체에 속성을 포함한다", () => {
    // Given
    const elem = htmlToElement('<p style="color: blue" class="text"></p>');

    // When
    const result = domToVdom(elem);

    // Then
    expect(result.props).toEqual({ style: "color: blue", class: "text" });
  });

  it("중첩된 자식 요소가 주어지면 재귀적으로 변환한다", () => {
    // Given
    const elem = htmlToElement("<ul><li>A</li><li>B</li></ul>");

    // When
    const result = domToVdom(elem);

    // Then
    expect(result).toEqual(
      elementNode("ul", {}, [
        elementNode("li", {}, [textNode("A")]),
        elementNode("li", {}, [textNode("B")]),
      ]),
    );
  });

  it("태그 사이에 공백 텍스트 노드가 있으면 필터링한다", () => {
    // Given — HTML의 줄바꿈/들여쓰기가 공백 텍스트 노드를 생성
    const elem = htmlToElement(`<div>
      <span>hi</span>
    </div>`);

    // When
    const result = domToVdom(elem);

    // Then
    expect(result.children).toEqual([
      elementNode("span", {}, [textNode("hi")]),
    ]);
  });

  it("여러 레벨로 중첩된 복잡한 구조가 주어지면 전체를 올바르게 변환한다", () => {
    // Given
    const elem = htmlToElement(`<div>
      <h1>Hello</h1>
      <p style="color: blue">Virtual DOM Demo</p>
      <ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>
    </div>`);

    // When
    const result = domToVdom(elem);

    // Then
    expect(result).toEqual(
      elementNode("div", {}, [
        elementNode("h1", {}, [textNode("Hello")]),
        elementNode("p", { style: "color: blue" }, [textNode("Virtual DOM Demo")]),
        elementNode("ul", {}, [
          elementNode("li", {}, [textNode("Item 1")]),
          elementNode("li", {}, [textNode("Item 2")]),
          elementNode("li", {}, [textNode("Item 3")]),
        ]),
      ]),
    );
  });
});

// ═══════════════════════════════════════════
// vdomToDom 테스트
// ═══════════════════════════════════════════
describe("vdomToDom", () => {
  it("텍스트 vnode가 주어지면 텍스트 노드를 생성한다", () => {
    // Given
    const vnode = textNode("hello");

    // When
    const node = vdomToDom(vnode);

    // Then
    expect(node.nodeType).toBe(Node.TEXT_NODE);
    expect(node.textContent).toBe("hello");
  });

  it("빈 vDOM 객체가 주어지면 자식 없는 요소를 생성한다", () => {
    // Given
    const vnode = elementNode("div", {}, []);

    // When
    const node = vdomToDom(vnode);

    // Then
    expect(node.tagName).toBe("DIV");
    expect(node.childNodes.length).toBe(0);
  });

  it("props가 있는 vDOM 객체가 주어지면 요소에 속성을 설정한다", () => {
    // Given
    const vnode = elementNode("p", { style: "color: red", class: "text" }, []);

    // When
    const node = vdomToDom(vnode);

    // Then
    expect(node.getAttribute("style")).toBe("color: red");
    expect(node.getAttribute("class")).toBe("text");
  });

  it("자식이 있는 vDOM 객체가 주어지면 재귀적으로 DOM을 생성한다", () => {
    // Given
    const vnode = elementNode("ul", {}, [
      elementNode("li", {}, [textNode("A")]),
      elementNode("li", {}, [textNode("B")]),
    ]);

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
    const vdom = elementNode("span", {}, [textNode("new")]);

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
    const elem = htmlToElement("<span>hello</span>");

    // When
    const vdom = domToVdom(elem);
    const rebuilt = vdomToDom(vdom);
    const vdomAfter = domToVdom(rebuilt);

    // Then
    expect(vdomAfter).toEqual(vdom);
  });

  it("다중 속성 요소가 주어지면 라운드트립 후에도 동일한 vDOM을 얻는다", () => {
    // Given
    const elem = htmlToElement('<input type="text" placeholder="name" class="field">');

    // When
    const vdom = domToVdom(elem);
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
    const oldVdom = textNode("hello");
    const newVdom = textNode("world");

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([
      { type: PatchType.TEXT, path: [], value: "world" },
    ]);
  });

  it("양쪽 텍스트 노드의 내용이 같으면 빈 패치 목록을 반환한다", () => {
    // Given
    const oldVdom = textNode("same");
    const newVdom = textNode("same");

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([]);
  });

  // ── REPLACE 패치 ──
  it("텍스트 노드와 요소 노드가 주어지면 REPLACE 패치를 생성한다", () => {
    // Given
    const oldVdom = textNode("text");
    const newVdom = elementNode("span", {}, [textNode("text")]);

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([
      { type: PatchType.REPLACE, path: [], newNode: newVdom },
    ]);
  });

  it("태그명이 다른 요소가 주어지면 REPLACE 패치를 생성한다", () => {
    // Given
    const oldVdom = elementNode("p", {}, [textNode("text")]);
    const newVdom = elementNode("span", {}, [textNode("text")]);

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([
      { type: PatchType.REPLACE, path: [], newNode: newVdom },
    ]);
  });

  // ── PROPS 패치 ──
  it("속성이 추가되면 PROPS 패치에 새 값을 포함한다", () => {
    // Given
    const oldVdom = elementNode("div", {}, []);
    const newVdom = elementNode("div", { class: "box" }, []);

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([
      { type: PatchType.PROPS, path: [], props: { class: "box" } },
    ]);
  });

  it("속성이 변경되면 PROPS 패치에 변경된 값을 포함한다", () => {
    // Given
    const oldVdom = elementNode("div", { class: "old" }, []);
    const newVdom = elementNode("div", { class: "new" }, []);

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([
      { type: PatchType.PROPS, path: [], props: { class: "new" } },
    ]);
  });

  it("속성이 삭제되면 PROPS 패치에 null 값을 포함한다", () => {
    // Given
    const oldVdom = elementNode("div", { class: "box", id: "main" }, []);
    const newVdom = elementNode("div", { class: "box" }, []);

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([
      { type: PatchType.PROPS, path: [], props: { id: null } },
    ]);
  });

  it("속성이 동일하면 PROPS 패치를 생성하지 않는다", () => {
    // Given
    const oldVdom = elementNode("div", { class: "box" }, []);
    const newVdom = elementNode("div", { class: "box" }, []);

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([]);
  });

  // ── ADD 패치 ──
  it("new에만 자식이 있으면 ADD 패치를 생성한다", () => {
    // Given
    const oldVdom = elementNode("ul", {}, []);
    const newVdom = elementNode("ul", {}, [
      elementNode("li", {}, [textNode("A")]),
    ]);

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([
      { type: PatchType.ADD, path: [0], newNode: elementNode("li", {}, [textNode("A")]) },
    ]);
  });

  // ── REMOVE 패치 ──
  it("old에만 자식이 있으면 REMOVE 패치를 생성한다", () => {
    // Given
    const oldVdom = elementNode("ul", {}, [
      elementNode("li", {}, [textNode("A")]),
      elementNode("li", {}, [textNode("B")]),
    ]);
    const newVdom = elementNode("ul", {}, [
      elementNode("li", {}, [textNode("A")]),
    ]);

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([
      { type: PatchType.REMOVE, path: [1] },
    ]);
  });

  // ── 자식 재귀 비교 ──
  it("중첩된 자식의 텍스트가 변경되면 올바른 path로 패치를 생성한다", () => {
    // Given
    const oldVdom = elementNode("div", {}, [
      elementNode("h1", {}, [textNode("Hello")]),
    ]);
    const newVdom = elementNode("div", {}, [
      elementNode("h1", {}, [textNode("Changed")]),
    ]);

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    expect(patches).toEqual([
      { type: PatchType.TEXT, path: [0, 0], value: "Changed" },
    ]);
  });

  // ── 동일한 vDOM ──
  it("동일한 vDOM이 주어지면 빈 패치 목록을 반환한다", () => {
    // Given
    const vdom = elementNode("div", { class: "box" }, [
      elementNode("p", {}, [textNode("hello")]),
    ]);

    // When
    const patches = diff(vdom, vdom);

    // Then
    expect(patches).toEqual([]);
  });

  // ── path 전달 ──
  it("초기 path가 주어지면 모든 패치 경로에 접두사로 포함된다", () => {
    // Given
    const oldVdom = elementNode("div", {}, [
      elementNode("p", {}, [textNode("old")]),
    ]);
    const newVdom = elementNode("div", { class: "new" }, [
      elementNode("p", {}, [textNode("new")]),
      elementNode("span", {}, [textNode("added")]),
    ]);
    const basePath = [1, 3];

    // When
    const patches = diff(oldVdom, newVdom, basePath);

    // Then — 모든 패치의 path가 basePath로 시작해야 한다
    for (const patch of patches) {
      expect(patch.path.slice(0, 2)).toEqual([1, 3]);
    }
    expect(patches).toContainEqual({ type: PatchType.PROPS, path: [1, 3], props: { class: "new" } });
    expect(patches).toContainEqual({ type: PatchType.TEXT, path: [1, 3, 0, 0], value: "new" });
    expect(patches).toContainEqual({
      type: PatchType.ADD, path: [1, 3, 1],
      newNode: elementNode("span", {}, [textNode("added")]),
    });
  });

  // ── 복합 시나리오: 계획서의 Phase 2 검증 케이스 ──
  it("여러 종류의 변경이 동시에 있으면 모든 패치 타입을 올바르게 생성한다", () => {
    // Given — Phase 2 계획서의 검증 시나리오
    const oldVdom = elementNode("div", {}, [
      elementNode("h1", {}, [textNode("Hello")]),
      elementNode("p", { style: "color: blue" }, [textNode("Virtual DOM Demo")]),
      elementNode("ul", {}, [
        elementNode("li", {}, [textNode("Item 1")]),
        elementNode("li", {}, [textNode("Item 2")]),
        elementNode("li", {}, [textNode("Item 3")]),
      ]),
    ]);
    const newVdom = elementNode("div", {}, [
      elementNode("h1", {}, [textNode("Changed!")]),                                // TEXT 변경
      elementNode("span", {}, [textNode("New element")]),                           // REPLACE (p→span)
      elementNode("ul", { class: "list" }, [                                 // PROPS 변경
        elementNode("li", {}, [textNode("Item 1")]),
        elementNode("li", {}, [textNode("Item 3")]),                                // Item 2→Item 3 (TEXT)
        // Item 3 삭제 → REMOVE
      ]),
    ]);

    // When
    const patches = diff(oldVdom, newVdom);

    // Then
    const types = patches.map((p) => p.type);
    expect(types).toContain(PatchType.TEXT);
    expect(types).toContain(PatchType.REPLACE);
    expect(types).toContain(PatchType.PROPS);
    expect(types).toContain(PatchType.REMOVE);

    // TEXT: h1 텍스트 변경 (path: [0, 0])
    expect(patches).toContainEqual({ type: PatchType.TEXT, path: [0, 0], value: "Changed!" });

    // REPLACE: p → span (path: [1])
    expect(patches).toContainEqual({
      type: PatchType.REPLACE, path: [1],
      newNode: elementNode("span", {}, [textNode("New element")]),
    });

    // PROPS: ul에 class 추가 (path: [2])
    expect(patches).toContainEqual({ type: PatchType.PROPS, path: [2], props: { class: "list" } });

    // REMOVE: ul의 세 번째 자식 삭제 (path: [2, 2])
    expect(patches).toContainEqual({ type: PatchType.REMOVE, path: [2, 2] });
  });
});

// ═══════════════════════════════════════════
// applyPatches 테스트
// ═══════════════════════════════════════════
describe("applyPatches", () => {
  it("TEXT 패치가 주어지면 대상 텍스트 노드의 내용을 변경한다", () => {
    // Given
    const dom = htmlToElement("<div><p>old</p></div>");
    const patches = [{ type: PatchType.TEXT, path: [0, 0], value: "new" }];

    // When
    applyPatches(dom, patches);

    // Then
    expect(dom.querySelector("p").textContent).toBe("new");
  });

  it("REPLACE 패치가 주어지면 대상 노드를 새 노드로 교체한다", () => {
    // Given
    const dom = htmlToElement("<div><p>old</p></div>");
    const patches = [{
      type: PatchType.REPLACE, path: [0],
      newNode: elementNode("span", {}, [textNode("replaced")]),
    }];

    // When
    applyPatches(dom, patches);

    // Then
    expect(dom.firstChild.tagName).toBe("SPAN");
    expect(dom.firstChild.textContent).toBe("replaced");
  });

  it("PROPS 패치가 주어지면 속성을 추가/변경한다", () => {
    // Given
    const dom = htmlToElement('<div class="old"></div>');
    const patches = [{ type: PatchType.PROPS, path: [], props: { class: "new", id: "main" } }];

    // When
    applyPatches(dom, patches);

    // Then
    expect(dom.getAttribute("class")).toBe("new");
    expect(dom.getAttribute("id")).toBe("main");
  });

  it("PROPS 패치에서 null 값이 주어지면 해당 속성을 삭제한다", () => {
    // Given
    const dom = htmlToElement('<div class="box" id="main"></div>');
    const patches = [{ type: PatchType.PROPS, path: [], props: { id: null } }];

    // When
    applyPatches(dom, patches);

    // Then
    expect(dom.getAttribute("class")).toBe("box");
    expect(dom.hasAttribute("id")).toBe(false);
  });

  it("ADD 패치가 주어지면 부모에 새 자식 노드를 추가한다", () => {
    // Given
    const dom = htmlToElement("<ul><li>A</li></ul>");
    const patches = [{
      type: PatchType.ADD, path: [1],
      newNode: elementNode("li", {}, [textNode("B")]),
    }];

    // When
    applyPatches(dom, patches);

    // Then
    expect(dom.childNodes.length).toBe(2);
    expect(dom.childNodes[1].textContent).toBe("B");
  });

  it("REMOVE 패치가 주어지면 대상 자식 노드를 삭제한다", () => {
    // Given
    const dom = htmlToElement("<ul><li>A</li><li>B</li></ul>");
    const patches = [{ type: PatchType.REMOVE, path: [1] }];

    // When
    applyPatches(dom, patches);

    // Then
    expect(dom.childNodes.length).toBe(1);
    expect(dom.childNodes[0].textContent).toBe("A");
  });

  it("여러 REMOVE 패치가 주어지면 인덱스 시프트 없이 역순으로 적용한다", () => {
    // Given
    const dom = htmlToElement("<ul><li>A</li><li>B</li><li>C</li><li>D</li></ul>");
    const patches = [
      { type: PatchType.REMOVE, path: [1] },
      { type: PatchType.REMOVE, path: [2] },
    ];

    // When
    applyPatches(dom, patches);

    // Then — B(1)와 C(2)가 삭제되고 A, D만 남아야 한다
    expect(dom.childNodes.length).toBe(2);
    expect(dom.childNodes[0].textContent).toBe("A");
    expect(dom.childNodes[1].textContent).toBe("D");
  });

  it("diff 결과를 applyPatches에 적용하면 DOM이 newVdom과 동일해진다", () => {
    // Given
    const oldVdom = elementNode("div", {}, [
      elementNode("h1", {}, [textNode("Hello")]),
      elementNode("p", { style: "color: blue" }, [textNode("Demo")]),
      elementNode("ul", {}, [
        elementNode("li", {}, [textNode("Item 1")]),
        elementNode("li", {}, [textNode("Item 2")]),
        elementNode("li", {}, [textNode("Item 3")]),
      ]),
    ]);
    const newVdom = elementNode("div", {}, [
      elementNode("h1", {}, [textNode("Changed!")]),
      elementNode("span", {}, [textNode("New element")]),
      elementNode("ul", { class: "list" }, [
        elementNode("li", {}, [textNode("Item 1")]),
        elementNode("li", {}, [textNode("Item 3")]),
      ]),
    ]);
    const dom = vdomToDom(oldVdom);
    const patches = diff(oldVdom, newVdom);

    // When
    applyPatches(dom, patches);

    // Then — 패치 적용 후 DOM을 다시 vDOM으로 변환하면 newVdom과 동일해야 한다
    expect(domToVdom(dom)).toEqual(newVdom);
  });
});

// ═══════════════════════════════════════════
// createHistory 테스트
// ═══════════════════════════════════════════
describe("createHistory", () => {
  it("초기 vdom이 주어지면 current로 해당 상태를 반환한다", () => {
    // Given
    const initial = elementNode("div", {}, [textNode("v1")]);

    // When
    const h = createHistory(initial);

    // Then
    expect(h.current()).toEqual(initial);
  });

  it("push로 상태를 추가하면 current가 새 상태를 반환한다", () => {
    // Given
    const h = createHistory(elementNode("div", {}, [textNode("v1")]));
    const v2 = elementNode("div", {}, [textNode("v2")]);

    // When
    h.push(v2);

    // Then
    expect(h.current()).toEqual(v2);
  });

  it("back을 호출하면 이전 상태를 반환한다", () => {
    // Given
    const v1 = elementNode("div", {}, [textNode("v1")]);
    const v2 = elementNode("div", {}, [textNode("v2")]);
    const h = createHistory(v1);
    h.push(v2);

    // When
    const result = h.back();

    // Then
    expect(result).toEqual(v1);
    expect(h.current()).toEqual(v1);
  });

  it("forward를 호출하면 다음 상태를 반환한다", () => {
    // Given
    const v1 = elementNode("div", {}, [textNode("v1")]);
    const v2 = elementNode("div", {}, [textNode("v2")]);
    const h = createHistory(v1);
    h.push(v2);
    h.back();

    // When
    const result = h.forward();

    // Then
    expect(result).toEqual(v2);
    expect(h.current()).toEqual(v2);
  });

  it("첫 번째 상태에서 back을 호출하면 현재 상태를 유지한다", () => {
    // Given
    const v1 = elementNode("div", {}, [textNode("v1")]);
    const h = createHistory(v1);

    // When
    const result = h.back();

    // Then
    expect(result).toEqual(v1);
  });

  it("마지막 상태에서 forward를 호출하면 현재 상태를 유지한다", () => {
    // Given
    const v1 = elementNode("div", {}, [textNode("v1")]);
    const h = createHistory(v1);

    // When
    const result = h.forward();

    // Then
    expect(result).toEqual(v1);
  });

  it("canBack은 이전 상태가 있을 때만 true를 반환한다", () => {
    // Given
    const h = createHistory(elementNode("div", {}, [textNode("v1")]));

    // Then
    expect(h.canBack()).toBe(false);

    // When
    h.push(elementNode("div", {}, [textNode("v2")]));

    // Then
    expect(h.canBack()).toBe(true);
  });

  it("canForward는 다음 상태가 있을 때만 true를 반환한다", () => {
    // Given
    const h = createHistory(elementNode("div", {}, [textNode("v1")]));
    h.push(elementNode("div", {}, [textNode("v2")]));

    // Then — 마지막 상태이므로 false
    expect(h.canForward()).toBe(false);

    // When
    h.back();

    // Then
    expect(h.canForward()).toBe(true);
  });

  it("히스토리 중간에서 push하면 이후 상태를 잘라내고 새 상태를 추가한다", () => {
    // Given
    const v1 = elementNode("div", {}, [textNode("v1")]);
    const v2 = elementNode("div", {}, [textNode("v2")]);
    const v3 = elementNode("div", {}, [textNode("v3")]);
    const v4 = elementNode("div", {}, [textNode("v4")]);
    const h = createHistory(v1);
    h.push(v2);
    h.push(v3);
    h.back(); // v2로 이동

    // When
    h.push(v4); // v3이 잘려나가고 v4가 추가

    // Then
    expect(h.current()).toEqual(v4);
    expect(h.canForward()).toBe(false);
    h.back();
    expect(h.current()).toEqual(v2);
    h.back();
    expect(h.current()).toEqual(v1);
  });
});
