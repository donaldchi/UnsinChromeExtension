# Unsin Fortune Helper

unsin.co.kr 의 “오늘의 운세” 페이지를 위한 비공식 Chrome 확장 프로그램 MVP입니다.

## 기능

- 확장 프로그램 팝업에서 프로필 입력 및 저장
- 이름 입력欄 지원
- unsin.co.kr 오늘의 운세 페이지 열기
- 폼 자동 입력
- “결과보기” 자동 실행
- 결과 페이지 본문을 브라우저 안에서 임시로 가져오기
- 확장 프로그램 결과 페이지에서 보기 좋게 표시
- 결과는 DB, 외부 서버, 영구 저장소에 저장하지 않음

## 저장 방식

- 프로필: `chrome.storage.local`
- 결과: `chrome.storage.session`
- 외부 서버: 없음
- DB: 없음
- 번역/요약: 없음

## 로컬 테스트 방법

1. Chrome에서 `chrome://extensions/` 열기
2. 오른쪽 위 “개발자 모드” ON
3. “압축해제된 확장 프로그램을 로드합니다” 클릭
4. 이 폴더 `unsin-fortune-helper-ko` 선택
5. 확장 프로그램 아이콘 클릭
6. 프로필 저장
7. “오늘의 운세 보기” 클릭

## v0.1.2 변경 사항

- 결과가 `/form` 계열 URL에 그대로 표시되는 경우에도 결과 페이지로 인식하도록 수정
- URL 기준判定より、実際の入力フォーム有無・結果本文有無を優先
- `결과보기` 실행 후 같은 페이지 안에서 결과가出るケースに備え、最大約17秒ポーリング
- content script 대상 URL 범위를 `https://www.unsin.co.kr/*` 로 확대
- 결과 추출 성공 시 기존 unsin 탭을 확장 결과 페이지로 전환
- 기존 탭 전환 실패 시 새 결과 탭을 열도록 보강
- 화면 문구를 한국어로 통일
- 이름 입력欄 추가

## 문제가 있을 때

대상 사이트의 DOM이 변경된 경우 다음 함수를 조정합니다.

- `content.js` 의 `findNameInput()`
- `content.js` 의 `classifySelect()`
- `content.js` 의 `clickRadioNearText()`
- `content.js` 의 `clickSubmit()`
- `content.js` 의 `extractResultText()`

## 공개 전 체크

- [ ] “공식”으로 오해될 표현을 쓰지 않기
- [ ] 설명文에 “비공식” 명시
- [ ] 개인정보 처리방침 공개 URL 준비
- [ ] 결과를 저장하지 않는다는 점 명시
- [ ] 외부 서버로 전송하지 않는다는 점 명시
- [ ] host permission 을 unsin.co.kr 대상 경로로 제한
- [ ] 초기 공개版은 광고/과금 없이 운영
- [ ] 우선 Chrome Web Store 비공개/제한 공개로 검증