import { NodeType } from "./constants.js";

export { NodeType } from "./constants.js";

/**
 * domToVdom(domNode) — 실제 DOM → vDOM 변환
 *
 * TEXT_NODE → { nodeType: NodeType.TEXT, value } 반환
 * ELEMENT_NODE → { nodeType: NodeType.ELEMENT, type, props, children } 반환
 */
export function domToVdom(domNode) {
  // 텍스트 노드 → 문자열
  if (domNode.nodeType === Node.TEXT_NODE) {
    return { nodeType: NodeType.TEXT, value: domNode.textContent };
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

  return { nodeType: NodeType.ELEMENT, type, props, children };
}

/**
 * vdomToDom(vnode) — vDOM → 실제 DOM 생성
 *
 * NodeType.TEXT면 TextNode, NodeType.ELEMENT면 Element
 */
export function vdomToDom(vnode) {
  // 텍스트 노드
  if (vnode.nodeType === NodeType.TEXT) {
    return document.createTextNode(vnode.value);
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

  // 둘 다 텍스트 노드
  if (oldVdom.nodeType === NodeType.TEXT && newVdom.nodeType === NodeType.TEXT) {
    if (oldVdom.value !== newVdom.value) {
      patches.push({ type: "TEXT", path, value: newVdom.value });
    }
    return patches;
  }

  // 타입이 다름: 텍스트↔요소, 또는 태그명 불일치
  if (
    oldVdom.nodeType !== newVdom.nodeType ||
    (oldVdom.nodeType === NodeType.ELEMENT && oldVdom.type !== newVdom.type)
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

/**
 * applyPatches(rootDom, patches) — 패치를 실제 DOM에 적용
 *
 * path 배열로 대상 노드를 탐색하고, 타입별로 DOM 조작 수행.
 * REMOVE 패치는 인덱스 시프트 방지를 위해 역순 적용.
 */
export function applyPatches(rootDom, patches) {
  // REMOVE를 역순(인덱스 큰 것부터)으로 정렬하기 위해 분리
  const removes = patches
    .filter((p) => p.type === "REMOVE")
    .sort((a, b) => {
      // path의 마지막 인덱스 기준 내림차순
      const lastA = a.path[a.path.length - 1];
      const lastB = b.path[b.path.length - 1];
      return lastB - lastA;
    });
  const others = patches.filter((p) => p.type !== "REMOVE");

  // REMOVE 이외 패치 먼저 적용
  for (const patch of others) {
    applyPatch(rootDom, patch);
  }

  // REMOVE 패치 역순 적용
  for (const patch of removes) {
    applyPatch(rootDom, patch);
  }
}

function applyPatch(rootDom, patch) {
  const { type, path } = patch;

  if (type === "ADD") {
    // 부모 노드 탐색 (path의 마지막 제외)
    const parentPath = path.slice(0, -1);
    let parent = rootDom;
    for (const i of parentPath) {
      parent = parent.childNodes[i];
    }
    parent.appendChild(vdomToDom(patch.newNode));
    return;
  }

  // 대상 노드 탐색
  let target = rootDom;
  for (const i of path) {
    target = target.childNodes[i];
  }

  switch (type) {
    case "REPLACE": {
      const parent = target.parentNode;
      parent.replaceChild(vdomToDom(patch.newNode), target);
      break;
    }
    case "PROPS": {
      for (const [key, value] of Object.entries(patch.props)) {
        if (value === null) {
          target.removeAttribute(key);
        } else {
          target.setAttribute(key, value);
        }
      }
      break;
    }
    case "TEXT": {
      target.textContent = patch.value;
      break;
    }
    case "REMOVE": {
      const parent = target.parentNode;
      parent.removeChild(target);
      break;
    }
  }
}
