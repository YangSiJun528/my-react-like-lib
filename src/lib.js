function isVNode(arg) {
  return arg !== null && typeof arg === "object" && arg.$$type === "vnode";
}

function isProps(arg) {
  return (
    arg !== null &&
    typeof arg === "object" &&
    !isVNode(arg) &&
    !Array.isArray(arg)
  );
}

function normalizeChildren(args) {
  return args
    .flat()
    .filter((c) => c !== null && c !== undefined && typeof c !== "boolean");
}

function applyProps(el, props) {
  for (let [k, v] of Object.entries(props)) {
    if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === "class" || k === "className") {
      el.className = v;
    } else if (k === "style" && typeof v === "object") {
      Object.assign(el.style, v);
    } else {
      el.setAttribute(k, v);
    }
  }
}

function tag(name, ...args) {
  let props = {};
  let startIdx = 0;

  if (args.length > 0 && isProps(args[0])) {
    props = { ...args[0] };
    startIdx = 1;
  }

  const key = props.key !== undefined ? props.key : null;
  delete props.key;

  const children = normalizeChildren(args.slice(startIdx));

  return { $$type: "vnode", tag: name, props, children, key };
}

export const tags = new Proxy({}, {
  get: (_, name) => tag.bind(null, name),
});

export function createElement(vnode) {
  if (typeof vnode === "string" || typeof vnode === "number") {
    return document.createTextNode(String(vnode));
  }

  const el = document.createElement(vnode.tag);
  applyProps(el, vnode.props);

  for (const child of vnode.children) {
    el.appendChild(createElement(child));
  }

  return el;
}

export function render(vnode, container) {
  container.innerHTML = "";
  container.appendChild(createElement(vnode));
}

function isText(node) {
  return typeof node === "string" || typeof node === "number";
}

function diffProps(oldProps, newProps, path) {
  const changedProps = {};
  const removedProps = [];

  for (const [k, v] of Object.entries(newProps)) {
    if (oldProps[k] !== v) {
      changedProps[k] = v;
    }
  }

  for (const k of Object.keys(oldProps)) {
    if (!(k in newProps)) {
      removedProps.push(k);
    }
  }

  if (Object.keys(changedProps).length > 0 || removedProps.length > 0) {
    return [{ type: "PROPS", path, props: changedProps, removedProps }];
  }
  return [];
}

function diffChildren(oldChildren, newChildren, path) {
  const patches = [];

  const oldKeyMap = new Map();
  for (let i = 0; i < oldChildren.length; i++) {
    const child = oldChildren[i];
    if (child && typeof child === "object" && child.key != null) {
      oldKeyMap.set(child.key, i);
    }
  }

  const usedOldIndices = new Set();

  for (let newIdx = 0; newIdx < newChildren.length; newIdx++) {
    const newChild = newChildren[newIdx];
    const hasKey = newChild && typeof newChild === "object" && newChild.key != null;

    if (hasKey) {
      const key = newChild.key;
      if (oldKeyMap.has(key)) {
        const oldIdx = oldKeyMap.get(key);
        usedOldIndices.add(oldIdx);
        patches.push(...diff(oldChildren[oldIdx], newChild, [...path, newIdx]));
      } else {
        patches.push({ type: "CREATE", path: [...path, newIdx], newVNode: newChild });
      }
    } else {
      const oldChild = oldChildren[newIdx] ?? null;
      if (oldChild != null) usedOldIndices.add(newIdx);
      patches.push(...diff(oldChild, newChild, [...path, newIdx]));
    }
  }

  for (let oldIdx = 0; oldIdx < oldChildren.length; oldIdx++) {
    if (!usedOldIndices.has(oldIdx)) {
      patches.push({ type: "REMOVE", path: [...path, oldIdx] });
    }
  }

  // Detect reordering of keyed nodes (only when all children are keyed)
  const allOldKeyed = oldChildren.every((c) => c && typeof c === "object" && c.key != null);
  const allNewKeyed = newChildren.every((c) => c && typeof c === "object" && c.key != null);

  if (allOldKeyed && allNewKeyed) {
    const matchedOldIndices = newChildren
      .filter((c) => oldKeyMap.has(c.key))
      .map((c) => oldKeyMap.get(c.key));

    if (matchedOldIndices.length > 1) {
      const sorted = [...matchedOldIndices].sort((a, b) => a - b);
      const isReordered = matchedOldIndices.some((idx, i) => idx !== sorted[i]);
      if (isReordered) {
        patches.push({ type: "REORDER", path, order: matchedOldIndices });
      }
    }
  }

  return patches;
}

export function applyPatches(domNode, patches) {
  function navigate(path) {
    let node = domNode;
    for (const i of path) {
      node = node.childNodes[i];
    }
    return node;
  }

  const removes = patches
    .filter((p) => p.type === "REMOVE")
    .sort((a, b) => {
      const ai = a.path[a.path.length - 1] ?? 0;
      const bi = b.path[b.path.length - 1] ?? 0;
      return bi - ai;
    });

  const reorders = patches.filter((p) => p.type === "REORDER");
  const others = patches.filter((p) => p.type !== "REMOVE" && p.type !== "REORDER");

  for (const patch of [...removes, ...reorders, ...others]) {
    if (patch.type === "REMOVE") {
      const node = navigate(patch.path);
      node.parentNode.removeChild(node);
    } else if (patch.type === "CREATE") {
      const parentPath = patch.path.slice(0, -1);
      const idx = patch.path[patch.path.length - 1];
      const parent = navigate(parentPath);
      const newEl = createElement(patch.newVNode);
      const ref = parent.childNodes[idx];
      if (ref) {
        parent.insertBefore(newEl, ref);
      } else {
        parent.appendChild(newEl);
      }
    } else if (patch.type === "REPLACE") {
      const node = navigate(patch.path);
      node.parentNode.replaceChild(createElement(patch.newVNode), node);
    } else if (patch.type === "PROPS") {
      const node = navigate(patch.path);
      applyProps(node, patch.props);
      for (const k of patch.removedProps) {
        node.removeAttribute(k);
      }
    } else if (patch.type === "TEXT") {
      const node = navigate(patch.path);
      node.textContent = patch.text;
    } else if (patch.type === "REORDER") {
      const parent = navigate(patch.path);
      const children = Array.from(parent.childNodes);
      for (const i of patch.order) {
        parent.appendChild(children[i]);
      }
    }
  }
}

export function diff(oldNode, newNode, path = []) {
  if (oldNode == null && newNode != null) {
    return [{ type: "CREATE", path, newVNode: newNode }];
  }

  if (oldNode != null && newNode == null) {
    return [{ type: "REMOVE", path }];
  }

  if (isText(oldNode) && isText(newNode)) {
    return oldNode !== newNode ? [{ type: "TEXT", path, text: newNode }] : [];
  }

  if (oldNode.tag !== newNode.tag) {
    return [{ type: "REPLACE", path, newVNode: newNode }];
  }

  return [
    ...diffProps(oldNode.props, newNode.props, path),
    ...diffChildren(oldNode.children || [], newNode.children || [], path),
  ];
}
