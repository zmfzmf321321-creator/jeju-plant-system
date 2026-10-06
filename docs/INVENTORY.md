# 자재관리와 CSV 초기 자료

자재관리 화면은 Supabase의 `public.inventory`를 읽습니다. 운영 DB에는
`20261002013712_inventory_management.sql`과
`20261002013956_inventory_blank_item_codes.sql`,
`20261002043858_inventory_details.sql`,
`20261002044743_inventory_life_rules.sql`,
`20261002044823_inventory_life_trigger_owner.sql`,
`20261002050239_inventory_category_life.sql`과
`20261003123941_allow_nullable_inventory_standard_and_overstock.sql`을 순서대로 적용해야 합니다.

계측기 교체주기 자동 판별 규칙은 [`INVENTORY_LIFE_RULES.md`](INVENTORY_LIFE_RULES.md)에 정리했습니다.
화면에서는 분류 목록에서 계측기 타입을 선택하고, 목록에 없으면 ‘기타’에서 직접 입력합니다.
선택한 분류의 고정 주기가 있으면 수명을 자동 입력합니다. CSV는 분류를 우선 사용하며,
분류가 비어 있을 때만 품명·규격·모델명에서 타입을 찾습니다.
CSV에서 `service_life`를 비워도 같은 규칙이 적용됩니다. 직접 입력한 수명은 유지됩니다.

## CSV 가져오기

Supabase Dashboard → Table Editor → `inventory` → Import data from CSV에서
[`inventory-import-template.csv`](inventory-import-template.csv)의 열 이름을 사용합니다.
`id`, `created_at`, `updated_at`은 DB 기본값이 있으므로 CSV에서 생략할 수 있습니다.

| 열 | 의미 | 필수 |
| --- | --- | --- |
| `major_category` | 대분류: 기력, 내연, 환경 중 하나 | 예 |
| `item_name` | 품명 | 예 |
| `standard_qty` | 정수(기준 수량). 원본에 값이 없으면 빈칸 | 아니요 |
| `stock_qty` | 시작 현재고 | 예 |
| `item_code` | 중복되지 않는 품목코드 | 아니요 |
| `material_number` | 원본 자료의 자재번호 | 아니요 |
| `category` | 계측기 분류. 화면에서는 목록 또는 기타 직접 입력 | CSV에서는 아니요 |
| `spec` | 규격 | 아니요 |
| `model_name` | 모델명 | 아니요 |
| `purpose` | 용도 | 아니요 |
| `service_life` | 교체주기, 예: 6년. 자동 판별이 안 되면 직접 입력 | 아니요 |
| `unit` | 단위, 예: EA | 아니요 |
| `location` | 보관 위치 | 아니요 |

정수는 비어 있거나 0 이상의 정수이고, 현재고는 0 이상의 정수입니다.
원본 자료처럼 현재고가 정수보다 많은 경우에도 원래 수량을 보존합니다.
품목코드가 없는 행은 CSV 셀을 비워도 됩니다.
원본 두 엑셀의 ‘자재번호’는 기존 이관 시 품목코드로 저장됐으므로,
`20261006041024_inventory_material_number.sql` 적용 시 확인된 66건의
자재번호에도 같은 값을 채웁니다. 이후 두 항목은 화면과 CSV에서 각각 수정할 수 있습니다.
가져온 행의 현재고는 `초기 재고 등록` 이력으로 자동 기록됩니다.

화면에서 `+ 입고` 또는 `− 사용`을 누르면 변경 수량과 사유를 입력합니다.
변경과 이력 저장은 DB에서 한 번에 처리합니다. `삭제`는 목록에서 보관 종료
처리하며, 과거 수량 이력은 보존됩니다. `보관 종료 항목 보기`에서 복원할 수 있습니다.

승인된 팀원만 자재와 이력을 조회하고 변경할 수 있습니다. 브라우저의 직접
`stock_qty` 갱신은 허용하지 않으며 수량 변경 함수만 사용할 수 있습니다.

## 2026년 원본 자료 반영

Gmail 첨부 원본은 공개 GitHub 저장소에 노출되지 않도록 로컬
`data/inventory-source/`에 보관합니다. 원본에서 추출한 매핑과 점검 결과는
`data/inventory-prepared/`에 보관하며 두 경로 모두 Git 추적에서 제외합니다.
보일러 원본의 첫 시트가 자재 목록이고 `Sheet1`의 중요 발전자재 17행은
필요수량 참고표로 사용합니다. TMS 원본의 `기력`·`내연` 두 시트는 모두
웹앱의 ‘제주발전본부 1발전소 환경자재’로 묶고, 원래 시트명은 용도에 남깁니다.
보일러 목록은 ‘제주발전본부 1발전소 보일러자재’로 표시합니다.

## 사진

`20261006022840_inventory_photos.sql`은 승인된 팀원만 조회할 수 있는
`inventory_photos` 테이블을 만듭니다. 자재 목록의 미리보기와 `사진` 버튼에서
품목별 사진을 볼 수 있습니다. 등록·수정 화면에서는 품목당 최대 5장까지
JPEG, PNG, WebP, GIF 사진(장당 20MB 이하)을 첨부하고 기존 사진을 삭제할 수 있습니다.
직접 첨부한 사진은 기존 비공개 `instrument-photos` Storage 버킷에 저장됩니다.

2026년 TMS 원본 엑셀에 포함된 사진 28장은 원본 시트·행과 품목코드를
대조해 환경자재 27개 품목에 연결했습니다. 사진 하나가 더 있는 품목은
두 장 모두 유지했습니다. 기존 계측기 사진은 품명과 모델 정보가 확인된
`O2 분석기` 1건만 연결했습니다. 보일러 원본 엑셀에는 포함된 사진이 없습니다.
사진 원본, 추출본, 일괄 연결용 SQL은 로컬 `data/inventory-prepared/`에만
보관하며 공개 저장소에 올리지 않습니다. CSV 자체에는 사진이 들어가지 않으므로
새 CSV 행에 대한 사진은 화면에서 첨부해야 합니다.
