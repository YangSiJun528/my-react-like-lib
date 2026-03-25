import { NodeType } from "./constants.js";

export function textNode(value) {
  return { nodeType: NodeType.TEXT, value };
}

export function elementNode(type, props = {}, children = []) {
  return { nodeType: NodeType.ELEMENT, type, props, children };
}
