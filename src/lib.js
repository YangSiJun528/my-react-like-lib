// vnode helpers
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

function isText(node) {
    return typeof node === "string" || typeof node === "number";
}

function isKeyed(node) {
    return node && typeof node === "object" && node.key != null;
}

function normalizeChildren(args) {
    return args
        .flat()
        .filter((c) => c !== null && c !== undefined && typeof c !== "boolean");
}

// DOM props
function setProp(el, key, value) {
    if (key.startsWith("on")) {
        const type = key.slice(2).toLowerCase();
        const store = el._events || (el._events = {});

        if (store[type]) {
            el.removeEventListener(type, store[type]);
            delete store[type];
        }

        if (typeof value === "function") {
            el.addEventListener(type, value);
            store[type] = value;
        }
        return;
    }

    if (key === "class" || key === "className") {
        el.className = value ?? "";
        return;
    }

    if (key === "style") {
        el.style.cssText = "";
        if (typeof value === "string") {
            el.style.cssText = value;
        } else if (value && typeof value === "object") {
            Object.assign(el.style, value);
        }
        return;
    }

    if (key === "value" || key === "checked" || key === "selected") {
        el[key] = value ?? (key === "value" ? "" : false);
        return;
    }

    if (value == null || value === false) {
        el.removeAttribute(key);
        return;
    }

    el.setAttribute(key, value === true ? "" : value);
}

function applyProps(el, props) {
    for (const [key, value] of Object.entries(props)) {
        setProp(el, key, value);
    }
}

// vnode factory
function tag(name, ...args) {
    let props = {};
    let startIdx = 0;

    if (args.length > 0 && isProps(args[0])) {
        props = {...args[0]};
        startIdx = 1;
    }

    const key = props.key !== undefined ? props.key : null;
    delete props.key;

    return {
        $$type: "vnode",
        tag: name,
        props,
        children: normalizeChildren(args.slice(startIdx)),
        key,
    };
}

export const tags = new Proxy(
    {},
    {get: (_, name) => (...args) => tag(name, ...args)}
);

// render
export function createElement(vnode) {
    if (isText(vnode)) {
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

// diff
function diffProps(oldProps, newProps, path) {
    const changedProps = {};
    const removedProps = [];

    for (const [key, value] of Object.entries(newProps)) {
        if (!Object.is(oldProps[key], value)) {
            changedProps[key] = value;
        }
    }

    for (const key of Object.keys(oldProps)) {
        if (!(key in newProps)) {
            removedProps.push(key);
        }
    }

    if (Object.keys(changedProps).length || removedProps.length) {
        return [{type: "PROPS", path, props: changedProps, removedProps}];
    }

    return [];
}

function diffChildren(oldChildren, newChildren, path) {
    const patches = [];
    const keyed =
        oldChildren.every(isKeyed) &&
        newChildren.every(isKeyed);

    // 혼합 keyed/unkeyed는 단순 index diff로 유지
    if (!keyed) {
        const len = Math.max(oldChildren.length, newChildren.length);
        for (let i = 0; i < len; i++) {
            patches.push(
                ...diff(
                    oldChildren[i] ?? null,
                    newChildren[i] ?? null,
                    [...path, i]
                )
            );
        }
        return patches;
    }

    const oldKeyMap = new Map();
    for (let i = 0; i < oldChildren.length; i++) {
        oldKeyMap.set(oldChildren[i].key, i);
    }

    const usedOldIndices = new Set();

    for (let newIdx = 0; newIdx < newChildren.length; newIdx++) {
        const newChild = newChildren[newIdx];
        const oldIdx = oldKeyMap.get(newChild.key);

        if (oldIdx == null) {
            patches.push({
                type: "CREATE",
                path: [...path, newIdx],
                newVNode: newChild,
            });
            continue;
        }

        usedOldIndices.add(oldIdx);
        patches.push(...diff(oldChildren[oldIdx], newChild, [...path, newIdx]));
    }

    for (let oldIdx = 0; oldIdx < oldChildren.length; oldIdx++) {
        if (!usedOldIndices.has(oldIdx)) {
            patches.push({type: "REMOVE", path: [...path, oldIdx]});
        }
    }

    const matchedOldIndices = newChildren
        .filter((child) => oldKeyMap.has(child.key))
        .map((child) => oldKeyMap.get(child.key));

    const kept = [...usedOldIndices].sort((a, b) => a - b);
    const oldToCurrent = new Map(kept.map((idx, i) => [idx, i]));
    const order = matchedOldIndices.map((idx) => oldToCurrent.get(idx));
    const reordered = order.some((idx, i) => idx !== i);

    if (reordered && order.length > 1) {
        patches.push({type: "REORDER", path, order});
    }

    return patches;
}

export function diff(oldNode, newNode, path = []) {
    if (oldNode == null && newNode != null) {
        return [{type: "CREATE", path, newVNode: newNode}];
    }

    if (oldNode != null && newNode == null) {
        return [{type: "REMOVE", path}];
    }

    if (isText(oldNode) && isText(newNode)) {
        return oldNode !== newNode
            ? [{type: "TEXT", path, text: newNode}]
            : [];
    }

    if (oldNode.tag !== newNode.tag) {
        return [{type: "REPLACE", path, newVNode: newNode}];
    }

    return [
        ...diffProps(oldNode.props, newNode.props, path),
        ...diffChildren(oldNode.children || [], newNode.children || [], path),
    ];
}

export function applyPatches(domNode, patches) {
    let root = domNode;

    function navigate(path) {
        let node = root;
        for (const i of path) node = node.childNodes[i];
        return node;
    }

    const removes = patches
        .filter((p) => p.type === "REMOVE")
        .sort((a, b) => {
            if (a.path.length !== b.path.length) {
                return b.path.length - a.path.length;
            }
            const ai = a.path[a.path.length - 1] ?? 0;
            const bi = b.path[b.path.length - 1] ?? 0;
            return bi - ai;
        });

    const reorders = patches.filter((p) => p.type === "REORDER");
    const others = patches.filter(
        (p) => p.type !== "REMOVE" && p.type !== "REORDER"
    );

    for (const patch of [...removes, ...reorders, ...others]) {
        if (patch.type === "REMOVE") {
            if (patch.path.length === 0) {
                root.parentNode?.removeChild(root);
                root = null;
                continue;
            }

            const node = navigate(patch.path);
            node.parentNode.removeChild(node);
            continue;
        }

        if (patch.type === "REORDER") {
            const parent = navigate(patch.path);
            const children = Array.from(parent.childNodes);
            for (const i of patch.order) {
                parent.appendChild(children[i]);
            }
            continue;
        }

        if (patch.type === "CREATE") {
            const parentPath = patch.path.slice(0, -1);
            const idx = patch.path[patch.path.length - 1];
            const parent = navigate(parentPath);
            const newEl = createElement(patch.newVNode);
            const ref = parent.childNodes[idx];
            ref ? parent.insertBefore(newEl, ref) : parent.appendChild(newEl);
            continue;
        }

        if (patch.type === "REPLACE") {
            const newEl = createElement(patch.newVNode);

            if (patch.path.length === 0) {
                const parent = root.parentNode;
                if (parent) parent.replaceChild(newEl, root);
                root = newEl;
                continue;
            }

            const node = navigate(patch.path);
            node.parentNode.replaceChild(newEl, node);
            continue;
        }

        if (patch.type === "PROPS") {
            const node = navigate(patch.path);

            for (const key of patch.removedProps) {
                setProp(node, key, null);
            }

            applyProps(node, patch.props);
            continue;
        }

        if (patch.type === "TEXT") {
            const node = navigate(patch.path);
            node.textContent = patch.text;
        }
    }

    return root;
}

// hooks/runtime
let currentComponent = null;

function getHook(init) {
    if (!currentComponent) {
        throw new Error("훅은 컴포넌트 내부에서만 사용 가능");
    }

    const i = currentComponent.hookIndex++;
    if (currentComponent.hooks[i] === undefined) {
        currentComponent.hooks[i] = init;
    }
    return currentComponent.hooks[i];
}

const depsChanged = (prev, next) =>
    !prev ||
    !next ||
    prev.length !== next.length ||
    next.some((d, i) => !Object.is(d, prev[i]));

class FunctionComponent {
    constructor(fn) {
        this.fn = fn;
        this.hooks = [];
        this.hookIndex = 0;
        this.vnode = null;
        this.domNode = null;
    }

    _render() {
        currentComponent = this;
        this.hookIndex = 0;

        try {
            return this.fn();
        } finally {
            currentComponent = null;
        }
    }

    _flushEffects() {
        this.hooks.forEach((hook) => {
            if (!hook?.pending) return;
            hook.cleanup?.();
            hook.cleanup = hook.fn?.() ?? null;
            hook.pending = false;
        });
    }

    _commit(newVNode, container = this.domNode?.parentNode) {
        if (!this.domNode) {
            this.domNode = createElement(newVNode);
            container.appendChild(this.domNode);
        } else {
            this.domNode = applyPatches(
                this.domNode,
                diff(this.vnode, newVNode)
            );
        }

        this.vnode = newVNode;
        this._flushEffects();
    }

    mount(container) {
        this._commit(this._render(), container);
    }

    _doUpdate() {
        this._commit(this._render());
    }
}

export function useState(initialValue) {
    const comp = currentComponent;
    const hook = getHook({value: initialValue, set: null});

    if (!hook.set) {
        hook.set = (next) => {
            const value =
                typeof next === "function" ? next(hook.value) : next;

            if (Object.is(hook.value, value)) return;

            hook.value = value;
            comp.update();
        };
    }

    return [hook.value, hook.set];
}

export function useEffect(fn, deps) {
    const hook = getHook({
        fn: null,
        deps: undefined,
        cleanup: null,
        pending: false,
    });

    if (depsChanged(hook.deps, deps)) {
        hook.fn = fn;
        hook.deps = deps;
        hook.pending = true;
    }
}

export function useMemo(fn, deps) {
    const hook = getHook({
        value: undefined,
        deps: undefined,
        initialized: false,
    });

    if (!hook.initialized || depsChanged(hook.deps, deps)) {
        hook.value = fn();
        hook.deps = deps;
        hook.initialized = true;
    }

    return hook.value;
}

export function setRoot(ComponentFn, container) {
    const instance = new FunctionComponent(ComponentFn);
    let pendingRender = false;

    instance.update = () => {
        if (pendingRender) return;
        pendingRender = true;

        const run = () => {
            if (!pendingRender) return;
            pendingRender = false;
            instance._doUpdate();
        };

        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(run);
        }

        // fake timer 환경에서도 flush되도록 유지
        setTimeout(run, 0);
    };

    instance.mount(container);
    return instance;
}