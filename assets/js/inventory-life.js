// 계측기 교체주기 표의 고정 연수만 자동 판별합니다.
// 제작사 Life Cycle 또는 사용 조건에 따라 달라지는 항목은 수동 입력합니다.
(() => {
  const normalize = value => String(value || '').toLocaleUpperCase().replace(/[\s_-]+/g, '');
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

  function inferInventoryServiceLife(item) {
    const fields = [item.item_name, item.category, item.spec, item.model_name].map(normalize);
    for (const text of fields) {
      if (!text) continue;
      if (manufacturerCycle.test(text)) return { type: '제작사 Life Cycle 적용', value: null };
      const rule = rules.find(entry => entry.test(text));
      if (rule) return { type: rule.type, value: `${rule.years}년` };
    }
    return { type: null, value: null };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { inferInventoryServiceLife };
  else window.inferInventoryServiceLife = inferInventoryServiceLife;
})();
