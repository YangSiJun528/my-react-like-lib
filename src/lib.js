// ─── 1. 공개 진입점 ───────────────────────────────────────────────────────────

/**
 * 앱의 진입점. 루트 컴포넌트를 컨테이너에 마운트하고
 * 상태 변경 시 자동으로 리렌더링되도록 연결한다.
 *
 * update()는 rAF로 배칭한다:
 * - rAF: 브라우저 환경에서 프레임 단위로 배칭 (불필요한 중간 렌더 방지)
 * - vitest: vi.useFakeTimers()가 rAF도 교체하므로 vi.runAllTimers()로 flush 가능
 * pendingRender 플래그로 중복 등록을 방지한다.
 *
 * @param {function(): object} ComponentFn - 루트 컴포넌트 함수 (훅 사용 가능)
 * @param {HTMLElement} container - 마운트 대상 DOM 컨테이너
 * @returns {FunctionComponent} 마운트된 컴포넌트 인스턴스
 */
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
    };

    instance.mount(container);
    return instance;
}

// ─── 2. 훅 ────────────────────────────────────────────────────────────────────

/**
 * 컴포넌트 렌더링 사이에 값을 유지하는 상태 훅.
 * setter 호출 시 값이 실제로 변경된 경우에만 리렌더를 예약한다.
 * 반드시 setRoot에 전달된 루트 컴포넌트 함수 내에서만 호출해야 한다.
 *
 * @template T
 * @param {T} initialValue - 초기 상태값
 * @returns {[T, function]} [현재값, setter 함수]
 */
export function useState(initialValue) {
    // getter 호출 전에 currentComponent를 comp에 캡처한다.
    // setter(hook.set)는 렌더 이후 비동기적으로 호출되므로,
    // 이 시점에서 currentComponent는 이미 null이 되어 있다.
    // comp를 클로저로 캡처해야 setter가 올바른 컴포넌트를 참조할 수 있다.
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

/**
 * 의존성 배열이 변경될 때마다 사이드이펙트 함수를 실행한다.
 * 이전 실행의 cleanup 함수가 있으면 새 실행 전에 먼저 호출된다.
 * 실제 실행은 렌더 직후 FunctionComponent._flushEffects에서 일어난다.
 *
 * @param {function} fn - 실행할 이펙트 함수. cleanup 함수를 반환할 수 있다.
 * @param {any[]} deps - 변경 감지 대상 의존성 배열
 */
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

/**
 * 의존성 배열이 변경될 때만 fn을 재실행하여 값을 메모이제이션한다.
 * 렌더 중 동기적으로 실행되며, 비용이 큰 계산을 반복하지 않기 위해 사용한다.
 *
 * @template T
 * @param {function(): T} fn - 메모이제이션할 값을 계산하는 함수
 * @param {any[]} deps - 변경 감지 대상 의존성 배열
 * @returns {T} 계산된 메모이제이션 값
 */
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

// ─── 3. 태그 팩토리 ───────────────────────────────────────────────────────────

/**
 * VanJS 스타일의 태그 팩토리 프록시.
 * 프로퍼티 접근 시 해당 태그명의 vnode 생성 함수를 반환한다.
 *
 * @example
 * const { div, p, button } = tags;
 * div({ class: 'container' }, p('hello'))
 * // → { $$type: 'vnode', tag: 'div', props: { class: 'container' }, children: [...], key: null }
 */
export const tags = new Proxy(
    {},
    {get: (_, name) => (...args) => tag(name, ...args)}
);

// ─── 4. 컴포넌트 라이프사이클 ─────────────────────────────────────────────────

class FunctionComponent {
    constructor(fn) {
        this.fn = fn;
        this.hooks = [];
        this.hookIndex = 0;
        this.vnode = null;
        this.domNode = null;
    }

    _render() {
        // currentComponent를 this로 설정하여 훅이 올바른 인스턴스에 접근하도록 한다.
        // try/finally로 렌더 도중 에러가 나도 currentComponent가 null로 복원된다.
        currentComponent = this;
        this.hookIndex = 0;

        try {
            return this.fn();
        } finally {
            currentComponent = null;
        }
    }

    _flushEffects() {
        // pending 플래그가 설정된 훅만 실행한다 (의존성이 변경된 것들).
        // cleanup → fn 순서: 이전 이펙트의 정리 작업을 먼저 실행한 뒤 새 이펙트를 실행한다.
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

// ─── 5. 가상 DOM ──────────────────────────────────────────────────────────────

/**
 * 두 vnode 트리를 비교하여 변경 사항을 패치 배열로 반환한다.
 * 패치 타입: "CREATE" | "REMOVE" | "REPLACE" | "PROPS" | "TEXT" | "REORDER"
 *
 * @param {object|string|number|null} oldNode - 이전 가상 노드
 * @param {object|string|number|null} newNode - 새 가상 노드
 * @param {number[]} [path=[]] - 루트로부터의 childNodes 인덱스 경로
 * @returns {object[]} 적용할 패치 목록
 */
export function diff(oldNode, newNode, path = []) {
    if (oldNode == null && newNode == null) return [];
    if (oldNode == null) return [{type: "CREATE", path, newVNode: newNode}];
    if (newNode == null) return [{type: "REMOVE", path}];

    if (isText(oldNode) && isText(newNode)) {
        return oldNode !== newNode
            ? [{type: "TEXT", path, text: newNode}]
            : [];
    }

    const {tag: oldTag, props: oldProps, children: oldChildren} = oldNode;
    const {tag: newTag, props: newProps, children: newChildren} = newNode;

    if (oldTag !== newTag) {
        return [{type: "REPLACE", path, newVNode: newNode}];
    }

    return [
        ...diffProps(oldProps, newProps, path),
        ...diffChildren(oldChildren || [], newChildren || [], path),
    ];
}

/**
 * diff가 반환한 패치 배열을 실제 DOM에 반영한다.
 * 패치는 REMOVE → REORDER → 나머지 순서로 적용된다.
 * REMOVE는 깊은 노드 / 높은 인덱스부터 처리하여 인덱스 밀림을 방지한다.
 *
 * @param {HTMLElement|Text} domNode - 패치를 적용할 루트 DOM 노드
 * @param {object[]} patches - diff가 반환한 패치 목록
 * @returns {HTMLElement|Text|null} 패치 적용 후의 루트 DOM 노드 (REPLACE 시 변경될 수 있음)
 */
export function applyPatches(domNode, patches) {
    let root = domNode;

    // path는 루트 DOM 노드에서 대상 노드까지의 childNodes 인덱스 배열이다.
    // 예) [1, 0] → root.childNodes[1].childNodes[0]
    function navigate(path) {
        let node = root;
        for (const i of path) node = node.childNodes[i];
        return node;
    }

    // REMOVE를 깊은 노드 우선, 같은 깊이에서는 높은 인덱스 우선으로 정렬한다.
    // 낮은 인덱스 노드를 먼저 삭제하면 형제 노드의 인덱스가 밀려
    // 이후 navigate가 잘못된 노드를 가리키게 된다.
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
            // appendChild는 DOM에 이미 있는 노드를 호출하면 현재 위치에서 제거 후 끝에 추가한다.
            // order 배열 순서대로 appendChild를 반복하면 자식 순서가 새 배열 순서로 재배치된다.
            // 예) children = [A, B, C], order = [2, 0, 1] → C, A, B 순으로 끝에 붙임 → C-A-B
            for (const i of patch.order) {
                const child = children[i];
                if (child) parent.appendChild(child);
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

/**
 * vnode 또는 텍스트 노드를 실제 DOM 노드로 변환한다.
 * 자식 노드를 재귀적으로 처리하며, props는 applyProps에 위임한다.
 *
 * @param {object|string|number} vnode - 변환할 가상 노드
 * @returns {HTMLElement|Text} 생성된 실제 DOM 노드
 */
export function createElement(vnode) {
    if (isText(vnode)) {
        return document.createTextNode(String(vnode));
    }

    const {tag, props, children} = vnode;
    const el = document.createElement(tag);
    applyProps(el, props);

    for (const child of children) {
        el.appendChild(createElement(child));
    }

    return el;
}

// ─── 6. 훅 내부 구현 ─────────────────────────────────────────────────────────

// 현재 렌더링 중인 컴포넌트 인스턴스. 훅이 올바른 인스턴스에 접근할 수 있도록 한다.
let currentComponent = null;

/**
 * 현재 컴포넌트의 훅 슬롯을 반환한다.
 * hookIndex를 증가시키며 순서 기반으로 슬롯을 할당하고, 첫 호출 시 init 값으로 초기화한다.
 * @param {*} init - 해당 슬롯이 처음 생성될 때 사용할 초기값
 * @returns {*} 현재 훅 인덱스에 해당하는 슬롯 값
 */
function getHook(init) {
    if (!currentComponent) {
        throw new Error("훅은 컴포넌트 내부에서만 사용 가능");
    }

    // hookIndex를 렌더 시작마다 0으로 리셋하고, 훅 호출마다 1씩 증가시킨다.
    // 이것이 "훅 호출 순서 고정" 규칙의 실제 구현체다.
    // 조건문 안에서 훅을 호출하면 인덱스가 달라져 다른 슬롯에 접근하게 된다.
    const i = currentComponent.hookIndex++;
    if (currentComponent.hooks[i] === undefined) {
        currentComponent.hooks[i] = init;
    }
    return currentComponent.hooks[i];
}

/**
 * 이전 의존성 배열과 새 의존성 배열을 비교하여 변경 여부를 반환한다.
 * 배열이 없거나 길이가 다르거나, 하나 이상의 요소가 달라지면 true를 반환한다.
 * @param {Array|null|undefined} prev - 이전 렌더 시점의 의존성 배열
 * @param {Array|null|undefined} next - 현재 렌더 시점의 의존성 배열
 * @returns {boolean} 의존성이 변경되었으면 true, 동일하면 false
 */
const depsChanged = (prev, next) =>
    !prev ||
    !next ||
    prev.length !== next.length ||
    next.some((d, i) => !Object.is(d, prev[i]));

// ─── 7. diff 내부 ─────────────────────────────────────────────────────────────

/**
 * 이전 props와 새 props를 비교하여 변경·삭제된 항목을 패치로 반환한다.
 * 변경 사항이 없으면 빈 배열을 반환한다.
 * @param {Object} oldProps - 이전 렌더의 props 객체
 * @param {Object} newProps - 새 렌더의 props 객체
 * @param {Array<number>} path - 패치 위치를 나타내는 vnode 트리 경로
 * @returns {Array<Object>} PROPS 타입 패치 배열 (변경 없으면 빈 배열)
 */
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

/**
 * 이전 자식 배열과 새 자식 배열을 비교하여 필요한 패치 목록을 반환한다.
 * key가 모두 존재하면 keyed diff를, 그렇지 않으면 인덱스 기반 diff를 수행한다.
 * @param {Array} oldChildren - 이전 렌더의 자식 vnode 배열
 * @param {Array} newChildren - 새 렌더의 자식 vnode 배열
 * @param {Array<number>} path - 패치 위치를 나타내는 vnode 트리 경로
 * @returns {Array<Object>} CREATE / REMOVE / REORDER 등의 패치 배열
 */
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

    // keyed diff 3단계:
    // 1) oldKeyMap으로 key → oldIdx 역인덱스 구성
    // 2) newChildren을 순회하며 신규 key는 CREATE, 기존 key는 재귀 diff
    // 3) 사용되지 않은 oldIdx(삭제된 key) → REMOVE
    // 이후 순서 변경이 있으면 REORDER 패치 생성

    // key → 구 배열 내 인덱스 역인덱스. O(1) 조회를 위해 Map 사용
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

    // REORDER 패치 생성:
    // matchedOldIndices: 새 순서대로 나열한 "매칭된 구 인덱스" 목록
    //   예) 구: [A=0, B=1, C=2], 새: [C, A] → matchedOldIndices = [2, 0]
    //
    // kept: REMOVE되지 않고 살아남은 구 인덱스를 오름차순 정렬한 것
    //   예) B가 제거됨 → kept = [0, 2]
    //
    // oldToCurrent: 구 인덱스 → REMOVE 후 압축된 현재 DOM 위치 매핑
    //   예) { 0→0, 2→1 }
    //
    // order: 새 순서대로 "현재 DOM 위치"를 나열한 배열
    //   예) [C→1, A→0] → order = [1, 0]
    //
    // applyPatches의 REORDER는 order 순서대로 appendChild를 호출해 자식을 재배치한다.
    const matchedOldIndices = newChildren
        .filter((child) => oldKeyMap.has(child.key))
        .map((child) => oldKeyMap.get(child.key));

    const kept = [...usedOldIndices].sort((a, b) => a - b);
    const oldToCurrent = new Map(kept.map((idx, i) => [idx, i]));
    const order = matchedOldIndices.map((idx) => oldToCurrent.get(idx));
    // order[i] !== i: 압축된 현재 위치와 새 위치가 하나라도 다르면 재정렬 필요
    const reordered = order.some((idx, i) => idx !== i);

    if (reordered && order.length > 1) {
        patches.push({type: "REORDER", path, order});
    }

    return patches;
}

// ─── 8. DOM 속성 처리 ────────────────────────────────────────────────────────

/**
 * props 객체의 모든 키-값 쌍을 DOM 요소에 적용한다.
 * 각 항목은 setProp으로 위임하여 처리한다.
 * @param {HTMLElement} el - props를 적용할 DOM 요소
 * @param {Object} props - 적용할 props 객체 (이벤트, 클래스, 스타일 등 포함)
 */
function applyProps(el, props) {
    for (const [key, value] of Object.entries(props)) {
        setProp(el, key, value);
    }
}

/**
 * DOM 요소에 단일 prop을 적용한다.
 * 이벤트 핸들러(on*), class, style, 폼 상태 프로퍼티, 일반 어트리뷰트를 구분하여 처리한다.
 * @param {HTMLElement} el - prop을 적용할 DOM 요소
 * @param {string} key - prop 이름 (예: "onClick", "class", "style", "value" 등)
 * @param {*} value - prop 값 (함수, 문자열, 객체, null 등)
 */
function setProp(el, key, value) {
    if (key.startsWith("on")) {
        const type = key.slice(2).toLowerCase();
        const store = el._events || (el._events = {});

        // el._events에 이전 핸들러를 캐싱하여 리렌더 시 제거 후 재등록한다.
        // addEventListener만 반복 호출하면 리스너가 누적되므로 스토어가 필수다.
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

    // 폼 요소의 value/checked/selected는 setAttribute로는 초기값만 설정되고
    // 실제 DOM 상태를 반영하지 못하므로 프로퍼티에 직접 할당한다.
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

// ─── 9. VNode 팩토리 내부 ────────────────────────────────────────────────────

/**
 * 주어진 태그 이름과 인자로 vnode 객체를 생성하는 팩토리 함수.
 * 첫 번째 인자가 props 객체이면 분리하고, 나머지를 자식으로 정규화한다.
 * @param {string} name - HTML 태그 이름 (예: "div", "span")
 * @param {...*} args - props 객체(선택)와 자식 노드들(문자열·숫자·vnode·배열 등)
 * @returns {{$$type: string, tag: string, props: Object, children: Array, key: *}} 생성된 vnode 객체
 */
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

// ─── 10. VNode 유틸리티 ───────────────────────────────────────────────────────

/**
 * 주어진 값이 vnode 객체인지 확인한다.
 * @param {*} arg - 검사할 값
 * @returns {boolean} $$type이 "vnode"인 객체이면 true
 */
function isVNode(arg) {
    return arg !== null && typeof arg === "object" && arg.$$type === "vnode";
}

/**
 * 주어진 값이 props 객체인지 확인한다.
 * vnode나 배열은 props로 간주하지 않는다.
 * @param {*} arg - 검사할 값
 * @returns {boolean} null이 아닌 일반 객체(vnode·배열 제외)이면 true
 */
function isProps(arg) {
    // vnode 객체와 자식 배열을 props로 오인하지 않도록 모두 배제한다
    return (
        arg !== null &&
        typeof arg === "object" &&
        !isVNode(arg) &&
        !Array.isArray(arg)
    );
}

/**
 * 주어진 노드가 텍스트 노드(문자열 또는 숫자)인지 확인한다.
 * @param {*} node - 검사할 노드
 * @returns {boolean} 문자열이나 숫자이면 true
 */
function isText(node) {
    return typeof node === "string" || typeof node === "number";
}

/**
 * 주어진 노드가 key 속성을 가진 keyed vnode인지 확인한다.
 * @param {*} node - 검사할 노드
 * @returns {boolean} key가 null/undefined가 아닌 객체이면 true
 */
function isKeyed(node) {
    return node && typeof node === "object" && node.key != null;
}

/**
 * 자식 인자 배열을 평탄화하고, 렌더링 불필요한 값을 제거하여 정규화한다.
 * null, undefined, boolean 값을 필터링한다.
 * @param {Array} args - tag 함수에서 받은 자식 인자 목록 (중첩 배열 포함 가능)
 * @returns {Array} 평탄화·필터링된 자식 노드 배열
 */
function normalizeChildren(args) {
    // 조건부 렌더링에서 false/true가 children에 포함되는 것을 방지한다
    // 예: condition && div() → condition이 false이면 false가 그대로 전달됨
    return args
        .flat()
        .filter((c) => c !== null && c !== undefined && typeof c !== "boolean");
}
