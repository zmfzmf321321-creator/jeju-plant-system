# 가입 승인과 접근 보안

## 운영자의 승인 절차

1. 사용자는 웹앱에서 가입 신청을 합니다. Supabase Auth 계정과 `public.user_profiles`가 생성됩니다.
2. 신규 프로필은 항상 `role = 'member'`, `is_approved = false`입니다. 가입 metadata로 승인이나 관리자 권한을 지정할 수 없습니다.
3. Supabase 대시보드에서 **Table Editor → user_profiles**를 열고 신청자의 Auth 계정·이메일·신원을 확인합니다.
4. 해당 행의 **is_approved를 true로 변경하고 저장**합니다. 일반 팀원은 role을 member로 유지합니다.
5. 사용자가 다시 로그인하면 시스템을 이용할 수 있습니다.

Auth의 이메일 확인은 이용 승인과 다릅니다. 앱의 관리자 로그인도 승인 여부를 우회하지 않습니다. 앱, 익명 API, 사용자 JWT 및 승인 RPC로 is_approved/role을 변경할 수 없습니다. 대시보드 또는 동등한 권한의 신뢰된 DB 운영자만 변경합니다.

승인 취소는 같은 필드를 false로 저장합니다. DB·Storage·AI의 다음 요청부터 현재 승인 상태를 검사하며, 기존 JWT만으로 접근할 수 없습니다. 열린 앱은 포커스 복귀 및 30초 주기 재검사로 로그아웃합니다. 이미 화면에서 본 정보나 내려받은 파일은 회수할 수 없습니다.

## 서버에서 강제하는 계약

- `private.is_approved_user()`는 user_profiles의 현재 승인 상태와 Auth 익명 로그인 여부를 검사합니다. JWT user_metadata로 승인을 판단하지 않습니다.
- 업무 테이블 11개와 storage.objects에는 restrictive 승인 게이트가 있습니다. 별도의 작업별 정책이 허용하더라도 이 게이트를 통과해야 합니다.
- 업무 테이블의 anon 권한, 과도한 클라이언트 테이블 권한, 겹치는 공개 허용 정책을 제거했습니다. pending 사용자는 자신의 프로필만 읽을 수 있습니다.
- user_profiles의 클라이언트 쓰기는 본인 가입용 id/email/name INSERT만 허용합니다. 승인·역할 UPDATE 및 기존 승인 RPC의 EXECUTE는 금지합니다.
- 신규 가입 trigger가 member/false를 직접 지정합니다. 기존 사용자와 승인값은 유지합니다.
- instrument-photos 및 maintenance-materials는 private입니다. 사진·자료는 사용자 JWT로 다운로드하며 공개·서명 URL을 새로 발급하지 않습니다.
- 사진 업로드는 사용자 UUID 폴더, 랜덤 UUID 파일명, JPEG/PNG/WebP/GIF, 최대 20MiB입니다. 기존 사진 경로와 DB에 저장된 canonical URL은 보존하며 URL을 공개 파일 주소로 사용하지 않습니다.
- gemini-chat은 POST마다 Auth 서버에서 JWT를 검증하고 user_profiles의 실제 승인을 검사한 뒤 요청을 처리합니다. 요청 최대 12MiB, AI 사진 최대 8MiB이며 외부 URL·redirect·SVG를 거절합니다.
- AI 대화 이력은 user_id로 소유권을 확인합니다. 기존 이름 기반 기록 중 단일 프로필과 일치한 기록만 연결하며, 소유자를 확정할 수 없는 기록은 삭제하지 않고 승인된 관리자에게만 허용합니다.

## 프런트엔드 방어

- 저장된 질문·답변·정비내용·설비명·Tag는 DOM/textContent로 렌더링합니다. HTML을 필요한 경우에는 표시용 문자열을 escape합니다.
- private 사진은 인증 다운로드한 Blob으로만 렌더링합니다. stale 비동기 응답은 표시 토큰으로 거절하며 로그아웃 시 Blob URL을 회수합니다.
- 자료실의 새 창 열기는 PDF와 raster 사진만 허용하고, HTML/SVG 등 다른 형식은 파일 다운로드로 처리합니다.
- 정비이력은 편집 시작 시 원본 JSON/null과 DB 값을 비교합니다. 충돌하면 다른 사용자의 기록을 덮어쓰지 않고 입력 내용을 유지합니다. 재시도에도 같은 편집 원본을 사용하므로 바뀐 배열 인덱스에 잘못 저장하지 않습니다.
- 사진 업로드와 이력 저장은 대상을 비동기 작업 시작 전에 고정합니다. 핀 이동은 DB 저장 결과를 확인한 뒤 성공을 표시합니다.

## 검증

```powershell
node --check assets/js/app.js
node --test tests/app-security.test.cjs
node supabase/functions/gemini-chat/security.test.cjs
node tests/live-anonymous-access.cjs
git diff --check
```

기존 사진 공개 주소의 차단까지 확인하려면 live 검사에 SECURITY_TEST_PHOTO_PATH 환경변수로 실제 저장소 경로를 전달합니다. 검사 출력에는 API 키나 업무 데이터를 포함하지 않습니다.

`supabase/tests/approval_access.sql`은 신뢰된 DB 운영자가 SQL Editor에서 실행합니다. 임시 pending/approved/revoked 계정으로 조회·수정·업로드·자기승인·관리자 승격·RPC·신규 교정 ID·대화 소유권 위조를 검사하며 끝에서 전체 fixture를 롤백합니다. ID sequence에는 테스트에 따른 빈 번호가 생길 수 있습니다.

2026-10-01 운영 적용 후 승인 접근 SQL 검사, 익명 HTTP 검사, Edge mock 검사, 프런트엔드 회귀 검사를 통과했습니다. Supabase 보안 Advisor의 남은 경고는 유출된 비밀번호 보호가 꺼져 있다는 설정 항목입니다. 해당 보호는 대시보드 Auth 설정에서 별도로 활성화할 수 있으며 이번 변경에서는 Auth 설정을 바꾸지 않았습니다.

## 배포와 변경 범위

운영 migration `20261001141536_enforce_dashboard_approval`과 gemini-chat v36을 적용했습니다. 프런트엔드는 private 다운로드를 처리하는 새 app.js와 캐시 버전이 포함된 index.html을 함께 배포해야 합니다. 구버전 프런트엔드의 사진 공개 URL은 보안 정책에 의해 차단됩니다.

기존 프로젝트의 초기 스키마 전체가 저장소 migrations에 들어 있지는 않습니다. 이 migration은 운영 스키마에 대한 변경이며 새 빈 DB를 단독으로 생성하는 bootstrap 파일은 아닙니다. 이후 변경에서도 승인 게이트와 클라이언트 승인 변경 금지를 유지해야 합니다.
