/**
 * domToVdom(domNode) — 실제 DOM → vDOM 변환
 *
 * TEXT_NODE → 문자열 반환
 * ELEMENT_NODE → { type, props, children } 객체 반환
 */
export function domToVdom(domNode) {
  // 텍스트 노드 → 문자열
  if (domNode.nodeType === Node.TEXT_NODE) {
    return domNode.textContent;
  }

  // 요소 노드 → { type, props, children }
  const type = domNode.tagName.toLowerCase();

  const props = {};
  for (const attr of domNode.attributes) {
    props[attr.name] = attr.value;
  }

  const children = [];
  for (const child of domNode.childNodes) {
    // 빈 공백 텍스트 노드 필터링
    if (child.nodeType === Node.TEXT_NODE && child.textContent.trim() === "") {
      continue;
    }
    children.push(domToVdom(child));
  }

  return { type, props, children };
}

/**
 * vdomToDom(vnode) — vDOM → 실제 DOM 생성
 *
 * 문자열이면 TextNode, 객체면 Element
 */
export function vdomToDom(vnode) {
  // 문자열 → 텍스트 노드
  if (typeof vnode === "string") {
    return document.createTextNode(vnode);
  }

  const el = document.createElement(vnode.type);

  // 속성 설정
  for (const [key, value] of Object.entries(vnode.props)) {
    el.setAttribute(key, value);
  }

  // 자식 재귀 생성 & 추가
  for (const child of vnode.children) {
    el.appendChild(vdomToDom(child));
  }

  return el;
}

/**
 * renderTo(container, vdom) — 컨테이너에 vDOM 렌더링
 *
 * 기존 내용을 비우고 vdomToDom 결과를 append
 */
export function renderTo(container, vdom) {
  container.innerHTML = "";
  container.appendChild(vdomToDom(vdom));
}
