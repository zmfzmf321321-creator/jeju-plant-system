# 제주 발전 계측관리 코드 구조

현재 코드는 기존 단일 `index.html`에서 역할별 파일로 분리되어 있습니다.

## 파일 역할

- `index.html`: 화면 구조와 모달, 버튼, 입력 폼 같은 HTML 마크업
- `assets/css/styles.css`: 전체 화면 스타일, 반응형 레이아웃, 모달/패널 디자인
- `assets/js/app.js`: Supabase 연동, 메뉴 전환, 설비 도면, 이력, AI 점검, 검색 등 동작 로직
- `assets/js/inventory.js`: 자재 등록·수정·보관 종료, 정수/현재고 표시, 사유가 남는 입출고와 이력
- `assets/floor-plans/`: 보일러, 탈질, 내연, 연료펌프룸, 암모니아탱크 도면 이미지
- `assets/models/`: 3D 모델 파일
- `assets/icons/`: 앱 아이콘
- `supabase/migrations/`: 데이터베이스 마이그레이션
- `docs/INVENTORY.md`: Supabase CSV 초기 자료 열과 자재관리 사용 안내
- `supabase/functions/gemini-chat/index.ts`: 사용자 인증·승인 검사 후 AI 대화/OCR을 처리하는 운영 Edge Function
- `supabase/tests/approval_access.sql`: 임시 계정과 레코드를 롤백하면서 승인 전/후/취소 및 권한 위조를 검증
- `tests/app-security.test.cjs`: 프런트엔드 승인, 사진, XSS, 페이지 조회, 좌표·날짜, 저장 충돌 회귀 검사
- `tests/live-anonymous-access.cjs`: 운영 API의 익명 데이터·AI·사진 접근 차단을 읽기 전용으로 확인
- `SECURITY.md`: Supabase 승인 절차, 접근 계약, 보안 검증 및 배포 주의점

## `assets/js/app.js` 안의 주요 분야

- 설정/공통: Supabase 설정, 전역 상태, 날짜/이미지/좌표 변환 유틸
- 로직관리: 로직 변경 이력 입력과 조회
- TMS: 환경 설비 등록, 수정, 삭제
- 할 일: 홈 대시보드, 할 일 등록/수정/완료 처리
- 자료실: 파일 업로드, 검색, 열기, 다운로드, 삭제
- 메뉴/화면 전환: 홈, 설비, AI점검, 할 일, 정비이력, 자료실 전환
- 설비 3D/2D: 모델 뷰어, 층별 도면, 핀, 관리 설비 패널
- 설비 메뉴에서는 호기/설비를 고른 뒤 3D와 각 층을 같은 선택줄에서 직접 전환
- 설비 탐색 메뉴에서 호기/설비를 고른 뒤 3D와 각 층을 같은 선택줄에서 직접 전환
- 통합 이력: 설비 기본자료, 점검/정비, 교정, TMS, 로직, 자료, 할 일 통합 조회
- AI 점검/OCR: 점검 기록, 사진, OCR 추출, AI 대화
- 인증: 로그인, 가입, 패스키, 로그아웃
- 가입은 항상 미승인 `member`로 생성하며, `user_profiles.is_approved = true`인 계정만 사용 가능
- 승인/역할 변경은 Supabase 대시보드의 신뢰된 운영자가 수행하며 브라우저 및 승인 RPC에는 변경 권한 없음
- 업무 테이블과 Storage에는 현재 DB 승인 상태를 확인하는 restrictive RLS 적용
- 설비 사진 및 자료실 버킷은 private이며, 인증 다운로드한 Blob URL로 표시·다운로드
- 정비이력은 편집 시작 시의 JSON 원본과 비교해 갱신하며 동시 변경 시 덮어쓰기를 거절
- AI 대화 이력은 이름 대신 사용자 UUID로 조회·저장
- 통합 이력과 Excel 조회는 기본키로 정렬한 페이지 조회 사용
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
