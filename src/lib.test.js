import { describe, it, expect } from "vitest";
import { tags } from "./lib.js";

const { div, p, button, span, ul, li, input, a, h1 } = tags;

describe("tags", () => {
  it("빈 요소를 생성한다", () => {
    const el = div();
    expect(el.tagName).toBe("DIV");
    expect(el.childNodes.length).toBe(0);
  });

  it("텍스트 자식을 추가한다", () => {
    const el = p("hello");
    expect(el.tagName).toBe("P");
    expect(el.textContent).toBe("hello");
  });

  it("숫자 자식을 텍스트로 변환한다", () => {
    const el = span(42);
    expect(el.textContent).toBe("42");
  });

  it("중첩 요소를 생성한다", () => {
    const el = div(p("hello"), button("click"));
    expect(el.children.length).toBe(2);
    expect(el.children[0].tagName).toBe("P");
    expect(el.children[0].textContent).toBe("hello");
    expect(el.children[1].tagName).toBe("BUTTON");
    expect(el.children[1].textContent).toBe("click");
  });

  it("깊은 중첩을 처리한다", () => {
    const el = div(div(div(span("deep"))));
    expect(el.querySelector("span").textContent).toBe("deep");
  });

  it("여러 자식을 나열할 수 있다", () => {
    const el = ul(li("1"), li("2"), li("3"));
    expect(el.children.length).toBe(3);
  });

  it("props 객체로 속성을 설정한다", () => {
    const el = input({ type: "text", placeholder: "입력" });
    expect(el.getAttribute("type")).toBe("text");
    expect(el.getAttribute("placeholder")).toBe("입력");
  });

  it("props와 자식을 함께 전달한다", () => {
    const el = a({ href: "/home" }, "홈으로");
    expect(el.getAttribute("href")).toBe("/home");
    expect(el.textContent).toBe("홈으로");
  });

  it("class 속성을 설정한다", () => {
    const el = div({ class: "container" });
    expect(el.className).toBe("container");
  });

  it("className 속성을 설정한다", () => {
    const el = div({ className: "wrapper" });
    expect(el.className).toBe("wrapper");
  });

  it("style 객체를 적용한다", () => {
    const el = div({ style: { color: "red", fontSize: "16px" } });
    expect(el.style.color).toBe("red");
    expect(el.style.fontSize).toBe("16px");
  });

  it("이벤트 핸들러를 등록한다", () => {
    let clicked = false;
    const el = button({ onClick: () => (clicked = true) }, "click me");
    el.click();
    expect(clicked).toBe(true);
  });

  it("배열 자식을 펼쳐서 추가한다", () => {
    const items = ["a", "b", "c"].map((t) => li(t));
    const el = ul(items);
    expect(el.children.length).toBe(3);
    expect(el.children[1].textContent).toBe("b");
  });

  it("null, undefined, boolean 자식은 무시한다", () => {
    const el = div(null, undefined, true, false, "visible");
    expect(el.childNodes.length).toBe(1);
    expect(el.textContent).toBe("visible");
  });

  it("Proxy이므로 어떤 태그명이든 사용 가능하다", () => {
    const el = tags["custom-element"]();
    expect(el.tagName).toBe("CUSTOM-ELEMENT");
  });
});

describe("tags → HTML 문자열 변환", () => {
  it("빈 요소", () => {
    expect(div().outerHTML).toBe("<div></div>");
  });

  it("텍스트 자식", () => {
    expect(p("hello").outerHTML).toBe("<p>hello</p>");
  });

  it("숫자 자식", () => {
    expect(span(42).outerHTML).toBe("<span>42</span>");
  });

  it("중첩 요소", () => {
    expect(div(p("hello"), button("click")).outerHTML).toBe(
      "<div><p>hello</p><button>click</button></div>",
    );
  });

  it("깊은 중첩", () => {
    expect(div(div(div(span("deep")))).outerHTML).toBe(
      "<div><div><div><span>deep</span></div></div></div>",
    );
  });

  it("리스트", () => {
    expect(ul(li("1"), li("2"), li("3")).outerHTML).toBe(
      "<ul><li>1</li><li>2</li><li>3</li></ul>",
    );
  });

  it("속성이 있는 요소", () => {
    expect(input({ type: "text", placeholder: "입력" }).outerHTML).toBe(
      '<input type="text" placeholder="입력">',
    );
  });

  it("속성과 자식이 함께 있는 요소", () => {
    expect(a({ href: "/home" }, "홈으로").outerHTML).toBe(
      '<a href="/home">홈으로</a>',
    );
  });

  it("class 속성", () => {
    expect(div({ class: "container" }, "내용").outerHTML).toBe(
      '<div class="container">내용</div>',
    );
  });

  it("배열 자식", () => {
    const items = ["a", "b", "c"].map((t) => li(t));
    expect(ul(items).outerHTML).toBe(
      "<ul><li>a</li><li>b</li><li>c</li></ul>",
    );
  });

  it("null/undefined/boolean 자식 무시", () => {
    expect(div(null, undefined, true, false, "visible").outerHTML).toBe(
      "<div>visible</div>",
    );
  });

  it("복합 구조", () => {
    const el = div(
      { class: "app" },
      h1("제목"),
      p("본문"),
      ul(li("항목1"), li("항목2")),
      button({ class: "btn" }, "확인"),
    );
    expect(el.outerHTML).toBe(
      '<div class="app">' +
        "<h1>제목</h1>" +
        "<p>본문</p>" +
        "<ul><li>항목1</li><li>항목2</li></ul>" +
        '<button class="btn">확인</button>' +
        "</div>",
    );
  });

  it("커스텀 엘리먼트", () => {
    expect(tags["my-component"]("내용").outerHTML).toBe(
      "<my-component>내용</my-component>",
    );
  });
});
