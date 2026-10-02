// 계측기 교체주기 표의 고정 연수만 자동 판별합니다.
// 제작사 Life Cycle 또는 사용 조건에 따라 달라지는 항목은 수동 입력합니다.
(() => {
  const normalize = value => String(value || '').toLocaleUpperCase().replace(/[\s_-]+/g, '');
  const categoryOptions = [
    ['제어카드', null], ['제어카드 I/O', null], ['PLC', 8],
    ['서버 컴퓨터', 6], ['운전원용 컴퓨터', 6], ['LCD 모니터', 6],
    ['GPS 수신기', null], ['네트워크 스위치', null], ['LVDT', 10],
    ['포지셔너 (RVDT)', 6], ['릴레이', 6],
    ['레벨 전송기', null], ['압력 전송기', null], ['온도 전송기', null],
    ['유량 전송기', null], ['로드셀', 15],
    ['레벨 스위치', null], ['압력 스위치', null], ['유량 스위치', null],
    ['유압 스위치', null], ['솔레노이드', null], ['서보 밸브', null]
  ];
  const rules = [
    { type: '포지셔너 (RVDT)', years: 6, test: text => /포지셔너|POSITIONER|RVDT/.test(text) },
    { type: 'LVDT', years: 10, test: text => /LVDT/.test(text) },
    { type: '로드셀', years: 15, test: text => /로드셀|LOADCELL/.test(text) },
    { type: '운전원용 컴퓨터', years: 6, test: text => /운전원용(컴퓨터|PC)/.test(text) },
    { type: '서버 컴퓨터', years: 6, test: text => /서버(컴퓨터|PC)/.test(text) },
    { type: 'LCD 모니터', years: 6, test: text => /LCD모니터|LCDMONITOR/.test(text) },
    { type: 'PLC', years: 8, test: text => /PLC/.test(text) },
    { type: '릴레이', years: 6, test: text => /릴레이|RELAY/.test(text) }
  ];
  const manufacturerCycle = /제어카드|CONTROL(CARD|IO)|GPS수신기|GPSRECEIVER|네트워크스위치|NETWORKSWITCH/;
  const conditionalCycle = /레벨전송기|압력전송기|온도전송기|유량전송기|레벨스위치|압력스위치|유량스위치|유압스위치|솔레노이드|서보밸브/;

  function inferInventoryServiceLife(item) {
    const category = normalize(item.category);
    if (category) {
      const option = categoryOptions.find(([name]) => normalize(name) === category);
      if (option) return { type: option[0], value: option[1] == null ? null : `${option[1]}년` };
      return { type: null, value: null };
    }
    const fields = [item.item_name, item.spec, item.model_name].map(normalize);
    for (const text of fields) {
      if (!text) continue;
      if (manufacturerCycle.test(text)) return { type: '제작사 Life Cycle 적용', value: null };
      if (conditionalCycle.test(text)) return { type: '조건별 교체주기 적용', value: null };
      const rule = rules.find(entry => entry.test(text));
      if (rule) return { type: rule.type, value: `${rule.years}년` };
    }
    return { type: null, value: null };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { inferInventoryServiceLife, inventoryCategoryOptions: categoryOptions };
  else {
    window.inferInventoryServiceLife = inferInventoryServiceLife;
    window.inventoryCategoryOptions = categoryOptions;
  }
})();
