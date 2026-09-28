# 제주 발전 계측관리 코드 구조

현재 코드는 기존 단일 `index.html`에서 역할별 파일로 분리되어 있습니다.

## 파일 역할

- `index.html`: 화면 구조와 모달, 버튼, 입력 폼 같은 HTML 마크업
- `assets/css/styles.css`: 전체 화면 스타일, 반응형 레이아웃, 모달/패널 디자인
- `assets/js/app.js`: Supabase 연동, 메뉴 전환, 설비 도면, 이력, AI 점검, 검색 등 동작 로직
- `assets/floor-plans/`: 보일러, 탈질, 내연, 연료펌프룸, 암모니아탱크 도면 이미지
- `assets/models/`: 3D 모델 파일
- `assets/icons/`: 앱 아이콘
- `supabase/migrations/`: 데이터베이스 마이그레이션

## `assets/js/app.js` 안의 주요 분야

- 설정/공통: Supabase 설정, 전역 상태, 날짜/이미지/좌표 변환 유틸
- 로직관리: 로직 변경 이력 입력과 조회
- TMS: 환경 설비 등록, 수정, 삭제
- 할 일: 홈 대시보드, 할 일 등록/수정/완료 처리
- 자료실: 파일 업로드, 검색, 열기, 다운로드, 삭제
- 메뉴/화면 전환: 홈, 설비, AI점검, 할 일, 정비이력, 자료실 전환
- 설비 3D/2D: 모델 뷰어, 층별 도면, 핀, 관리 설비 패널
- 통합 이력: 설비 기본자료, 점검/정비, 교정, TMS, 로직, 자료, 할 일 통합 조회
- AI 점검/OCR: 점검 기록, 사진, OCR 추출, AI 대화
- 인증: 로그인, 가입, 패스키, 로그아웃
- 계측/검색: 3D/2D 거리 계측, 통합 검색, 설비 위치 이동

## 다음에 더 나누기 좋은 기준

기능 추가가 계속된다면 `assets/js/app.js`를 아래처럼 더 잘게 나누는 것이 좋습니다.

- `assets/js/config.js`
- `assets/js/state.js`
- `assets/js/auth.js`
- `assets/js/navigation.js`
- `assets/js/equipment-map.js`
- `assets/js/history.js`
- `assets/js/todo.js`
- `assets/js/materials.js`
- `assets/js/ai-inspection.js`
- `assets/js/search.js`

다만 현재 HTML의 `onclick` 호출과 전역 상태 공유가 많아서, 이번 정리는 동작 변경 없이 파일 역할을 먼저 분리하는 방식으로 진행했습니다.
