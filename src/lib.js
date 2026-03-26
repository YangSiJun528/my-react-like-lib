function isProps(arg) {
  return (
    arg !== null &&
    typeof arg === "object" &&
    !(arg instanceof Node) &&
    !Array.isArray(arg)
  );
}

function appendChild(el, child) {
  if (child === null || child === undefined || typeof child === "boolean") {
    return;
  }
  if (child instanceof Node) {
    el.appendChild(child);
  } else if (Array.isArray(child)) {
    child.forEach((c) => appendChild(el, c));
  } else {
    el.appendChild(document.createTextNode(String(child)));
  }
}

function tag(name, ...args) {
  let el = document.createElement(name);

  let startIdx = 0;
  if (args.length > 0 && isProps(args[0])) {
    let props = args[0];
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
    startIdx = 1;
  }

  for (let i = startIdx; i < args.length; i++) {
    appendChild(el, args[i]);
  }

  return el;
}

export const tags = new Proxy({}, {
  get: (_, name) => tag.bind(null, name),
});
