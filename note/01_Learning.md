# 프로젝트 구현을 위한 자료 조사 과정

> 프로젝트 구현을 위해 어떤 구체적으로 어떤 전략을 사용하는게 좋을지 자료 조사를 합니다.

> 주로 조사한 내용을 어떻게 구현하고, 검증 가능한지에 대한 자료를 정리합니다.

## (Bulk?) 렌더링 구현

> `vDOM` -> `DOM` 으로 반영하는 로직을 어떻게 구현할 수 있을지

### 렌더링 성능, 프레임 테스트 방법 - Chrome Devtools 사용법

- [런타임 성능 분석 | Chrome DevTools](https://developer.chrome.com/docs/devtools/performance?hl=ko)

### 렌더링 시 무엇을 사용해야 하나요?

- [requestAnimationFrame()을 사용하세요.](https://stackoverflow.com/a/38709924)


## 구현에 참고할만한 다른 구현 예시 

실제 기능만큼 복잡하지 않으면서 필수 기능을 흉내내거나 단순하게 구현된 라이브러리를 사용

- https://youtu.be/wakCXia3CEA?si=xW4FZep3YSOcw_73
- https://vanjs.org/about#source-guide
- https://github.com/YangSiJun528/forked-2023-FE-with-no-framework

## Proxy와 Reflect

- [Proxy and Reflect](https://javascript.info/proxy)
- `Reflect`는 Proxy 트랩 안에서 원래 객체의 기본 동작을 위임할 때 사용
- 현재 `tags` 구현처럼 원래 객체에 위임할 필요 없이 항상 새 값을 반환하는 경우에는 `Reflect` 불필요
- VanJS도 동일하게 `Reflect` 없이 Proxy 사용

## 컴포넌트는 어떻게?

VanJS 처럼 코드? 기반으로 처리

## 
