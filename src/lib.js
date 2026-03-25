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

/**
 * diff(oldVdom, newVdom, path) — 두 vDOM 비교 → 패치 목록 반환
 *
 * 패치 타입: REPLACE, PROPS, TEXT, ADD, REMOVE
 * 같은 레벨 인덱스 기반 비교 (key 기반 재배치 생략)
 */
export function diff(oldVdom, newVdom, path = []) {
  const patches = [];

  // 둘 다 문자열(텍스트 노드)
  if (typeof oldVdom === "string" && typeof newVdom === "string") {
    if (oldVdom !== newVdom) {
      patches.push({ type: "TEXT", path, value: newVdom });
    }
    return patches;
  }

  // 타입이 다름: 텍스트↔요소, 또는 태그명 불일치
  if (
    typeof oldVdom !== typeof newVdom ||
    (typeof oldVdom === "object" && oldVdom.type !== newVdom.type)
  ) {
    patches.push({ type: "REPLACE", path, newNode: newVdom });
    return patches;
  }

  // 같은 태그 요소 — props 비교
  const oldProps = oldVdom.props;
  const newProps = newVdom.props;
  const propChanges = {};
  let hasChanges = false;

  // 추가/변경된 속성
  for (const key of Object.keys(newProps)) {
    if (oldProps[key] !== newProps[key]) {
      propChanges[key] = newProps[key];
      hasChanges = true;
    }
  }
  // 삭제된 속성
  for (const key of Object.keys(oldProps)) {
    if (!(key in newProps)) {
      propChanges[key] = null;
      hasChanges = true;
    }
  }

  if (hasChanges) {
    patches.push({ type: "PROPS", path, props: propChanges });
  }

  // 자식 비교
  const maxLen = Math.max(oldVdom.children.length, newVdom.children.length);
  for (let i = 0; i < maxLen; i++) {
    const childPath = [...path, i];

    if (i >= oldVdom.children.length) {
      // old에 없고 new에 있음 → ADD
      patches.push({ type: "ADD", path: childPath, newNode: newVdom.children[i] });
    } else if (i >= newVdom.children.length) {
      // old에 있고 new에 없음 → REMOVE
      patches.push({ type: "REMOVE", path: childPath });
    } else {
      // 양쪽 다 있음 → 재귀 비교
      patches.push(...diff(oldVdom.children[i], newVdom.children[i], childPath));
    }
  }

  return patches;
}
