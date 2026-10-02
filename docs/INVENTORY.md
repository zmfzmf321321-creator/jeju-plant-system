# 자재관리와 CSV 초기 자료

자재관리 화면은 Supabase의 `public.inventory`를 읽습니다. 운영 DB에는
`20261002013712_inventory_management.sql`과
`20261002013956_inventory_blank_item_codes.sql`,
`20261002043858_inventory_details.sql`,
`20261002044743_inventory_life_rules.sql`,
`20261002044823_inventory_life_trigger_owner.sql`을 순서대로 적용해야 합니다.

계측기 교체주기 자동 판별 규칙은 [`INVENTORY_LIFE_RULES.md`](INVENTORY_LIFE_RULES.md)에 정리했습니다.
품명·분류·규격·모델명에서 타입을 확인하며, 일치하는 고정 주기가 있으면 수명을 자동 입력합니다.
CSV에서 `service_life`를 비워도 같은 규칙이 적용됩니다. 직접 입력한 수명은 유지됩니다.

## CSV 가져오기

Supabase Dashboard → Table Editor → `inventory` → Import data from CSV에서
[`inventory-import-template.csv`](inventory-import-template.csv)의 열 이름을 사용합니다.
`id`, `created_at`, `updated_at`은 DB 기본값이 있으므로 CSV에서 생략할 수 있습니다.

| 열 | 의미 | 필수 |
| --- | --- | --- |
| `major_category` | 대분류: 기력, 내연, 환경 중 하나 | 예 |
| `item_name` | 품명 | 예 |
| `standard_qty` | 정수(최대 보관 수량) | 예 |
| `stock_qty` | 시작 현재고 | 예 |
| `item_code` | 중복되지 않는 품목코드 | 아니요 |
| `category` | 자재 분류 | 아니요 |
| `spec` | 규격 | 아니요 |
| `model_name` | 모델명 | 아니요 |
| `purpose` | 용도 | 아니요 |
| `service_life` | 교체주기, 예: 6년. 자동 판별이 안 되면 직접 입력 | 아니요 |
| `unit` | 단위, 예: EA | 아니요 |
| `location` | 보관 위치 | 아니요 |

정수와 현재고는 0 이상의 정수이며, 현재고는 정수를 넘을 수 없습니다.
품목코드가 없는 행은 CSV 셀을 비워도 됩니다.
가져온 행의 현재고는 `초기 재고 등록` 이력으로 자동 기록됩니다.

화면에서 `+ 입고` 또는 `− 사용`을 누르면 변경 수량과 사유를 입력합니다.
변경과 이력 저장은 DB에서 한 번에 처리합니다. `삭제`는 목록에서 보관 종료
처리하며, 과거 수량 이력은 보존됩니다. `보관 종료 항목 보기`에서 복원할 수 있습니다.

승인된 팀원만 자재와 이력을 조회하고 변경할 수 있습니다. 브라우저의 직접
`stock_qty` 갱신은 허용하지 않으며 수량 변경 함수만 사용할 수 있습니다.
