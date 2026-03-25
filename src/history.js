/**
 * createHistory(initialVdom) — undo/redo 가능한 상태 관리
 *
 * push로 새 상태 추가, back/forward로 이동, canBack/canForward로 상태 확인.
 * 히스토리 중간에서 push하면 이후 상태는 잘려나간다(truncate).
 */
export function createHistory(initialVdom) {
  const states = [initialVdom];
  let index = 0;

  return {
    push(vdom) {
      states.splice(index + 1);
      states.push(vdom);
      index++;
    },
    current() {
      return states[index];
    },
    back() {
      if (index > 0) index--;
      return states[index];
    },
    forward() {
      if (index < states.length - 1) index++;
      return states[index];
    },
    canBack() {
      return index > 0;
    },
    canForward() {
      return index < states.length - 1;
    },
  };
}
