// 자재 목록과 수량 변경. CSV 초기 자료는 public.inventory에서 읽습니다.
(() => {
  const view = document.getElementById('inventory-management-view');
  if (!view) return;
  const tableBody = document.getElementById('inventoryTableBody');
  const status = document.getElementById('inventoryStatus');
  const history = document.getElementById('inventoryHistoryList');
  const editor = document.getElementById('inventoryEditorDialog');
  const changeDialog = document.getElementById('inventoryChangeDialog');
  const search = document.getElementById('inventorySearch');
  const majorFilter = document.getElementById('inventoryMajorFilter');
  const showArchived = document.getElementById('inventoryShowArchived');
  let items = [];
  let historyItemId = null;
  let changeItemId = null;
  let changeDirection = 1;
  let loadToken = 0;

  const byId = id => document.getElementById(id);
  const field = id => byId(id).value.trim();
  const emptyText = value => value == null || value === '' ? '—' : String(value);
  const itemById = id => items.find(item => item.id === id);
  const errorText = error => error?.code === '23505'
    ? '같은 품목코드가 이미 있습니다.'
    : (error?.message || '요청을 처리하지 못했습니다.');
  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle('error', isError);
  };
  const make = (tag, className, content) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (content !== undefined) el.textContent = content;
    return el;
  };
  const action = (label, name, id) => {
    const button = make('button', '', label);
    button.type = 'button'; button.dataset.action = name; button.dataset.id = id;
    return button;
  };

  function render() {
    const query = search.value.trim().toLocaleLowerCase();
    const visible = items.filter(item => {
      if (item.is_archived && !showArchived.checked) return false;
      if (majorFilter.value !== '전체' && item.major_category !== majorFilter.value) return false;
      return !query || [item.item_name, item.item_code, item.category, item.spec,
        item.model_name, item.purpose, item.service_life, item.location, item.major_category]
        .some(value => String(value || '').toLocaleLowerCase().includes(query));
    });
    tableBody.replaceChildren();
    if (!visible.length) {
      const row = make('tr');
      const cell = make('td', '', items.length ? '조건에 맞는 자재가 없습니다.' : '등록된 자재가 없습니다. CSV를 가져오거나 자재를 등록해 주세요.');
      cell.colSpan = 6; row.append(cell); tableBody.append(row); return;
    }
    visible.forEach(item => {
      const row = make('tr', item.is_archived ? 'archived' : '');
      const nameCell = make('td');
      nameCell.append(make('div', 'inventory-name', item.item_name),
        make('div', 'inventory-meta', [item.item_code, item.category].filter(Boolean).join(' · ') || '품목코드 없음'),
        make('div', 'inventory-major', item.major_category || '대분류 미지정'));
      const specCell = make('td');
      specCell.append(make('div', '', emptyText(item.spec)), make('div', 'inventory-meta', `모델명 ${emptyText(item.model_name)}`));
      const purposeCell = make('td');
      purposeCell.append(make('div', '', emptyText(item.purpose)),
        make('div', 'inventory-meta', `수명 ${emptyText(item.service_life)}`));
      const placeCell = make('td', '', emptyText(item.location));
      const quantity = make('td', 'inventory-qty');
      const current = Number(item.stock_qty || 0);
      const standard = Number(item.standard_qty || 0);
      quantity.textContent = `${standard} / ${current}${item.unit || 'EA'}`;
      if (standard > 0 && current <= Math.ceil(standard * 0.2)) quantity.classList.add('low');
      const buttons = make('td', 'inventory-actions');
      if (!item.is_archived) {
        buttons.append(action('+ 입고', 'in', item.id), action('− 사용', 'out', item.id),
          action('수정', 'edit', item.id), action('삭제', 'archive', item.id));
      } else buttons.append(action('복원', 'restore', item.id));
      buttons.append(action('이력', 'history', item.id));
      row.append(nameCell, specCell, purposeCell, placeCell, quantity, buttons);
      tableBody.append(row);
    });
  }

  async function fetchItems() {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabaseClient.from('inventory')
        .select('id,major_category,category,item_code,item_name,spec,model_name,purpose,service_life,stock_qty,standard_qty,unit,location,is_archived,updated_at')
        .order('item_name', { ascending: true }).range(offset, offset + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) return rows;
    }
  }

  async function load() {
    const token = ++loadToken;
    if (!currentUserInfo.id) { setStatus('승인된 계정으로 로그인하면 자재를 볼 수 있습니다.', true); return; }
    setStatus('자재 목록을 불러오는 중입니다.');
    try {
      const records = await fetchItems();
      if (token !== loadToken) return;
      items = records;
      render();
      setStatus(`자재 ${records.filter(item => !item.is_archived).length}개`);
      if (historyItemId) await loadHistory(historyItemId);
    } catch (error) {
      if (token !== loadToken) return;
      console.error('자재 조회 오류:', error);
      setStatus('자재 목록을 불러오지 못했습니다. ' + errorText(error), true);
    }
  }

  async function loadHistory(id) {
    const item = itemById(id);
    if (!item) return;
    historyItemId = id;
    byId('inventoryHistoryTitle').textContent = `${item.item_name} 수량 변경 이력`;
    history.textContent = '이력을 불러오는 중입니다.';
    const { data, error } = await supabaseClient.from('inventory_movements')
      .select('id,change_qty,before_qty,after_qty,reason,changed_by_name,created_at')
      .eq('inventory_id', id).order('created_at', { ascending: false }).limit(100);
    if (historyItemId !== id) return;
    if (error) { history.textContent = '이력을 불러오지 못했습니다.'; return; }
    history.replaceChildren();
    if (!data?.length) { history.textContent = '수량 변경 기록이 없습니다.'; return; }
    data.forEach(entry => {
      const date = new Date(entry.created_at).toLocaleString('ko-KR');
      const sign = entry.change_qty > 0 ? '+' : '';
      history.append(make('div', 'inventory-history-entry',
        `${date} · ${sign}${entry.change_qty} (${entry.before_qty} → ${entry.after_qty}) · ${entry.reason} · ${entry.changed_by_name}`));
    });
  }

  function openEditor(item = null) {
    byId('inventoryEditorForm').reset();
    byId('inventoryEditorError').textContent = '';
    byId('inventoryEditId').value = item?.id || '';
    byId('inventoryEditorTitle').textContent = item ? '자재 수정' : '자재 등록';
    byId('inventoryEditorSubmit').textContent = item ? '수정 저장' : '등록';
    byId('inventoryInitialQtyField').style.display = item ? 'none' : '';
    byId('inventoryEditorHint').style.display = item ? 'none' : '';
    byId('inventoryMajorCategory').value = item?.major_category || '';
    byId('inventoryItemName').value = item?.item_name || '';
    byId('inventoryItemCode').value = item?.item_code || '';
    byId('inventoryCategory').value = item?.category || '';
    byId('inventorySpec').value = item?.spec || '';
    byId('inventoryModelName').value = item?.model_name || '';
    byId('inventoryPurpose').value = item?.purpose || '';
    byId('inventoryServiceLife').value = item?.service_life || '';
    byId('inventoryLocation').value = item?.location || '';
    byId('inventoryUnit').value = item?.unit || 'EA';
    byId('inventoryStandardQty').value = item?.standard_qty ?? 0;
    byId('inventoryInitialQty').value = 0;
    editor.showModal();
  }

  async function saveEditor(event) {
    event.preventDefault();
    const id = field('inventoryEditId');
    const standard = Number(field('inventoryStandardQty'));
    const initial = Number(field('inventoryInitialQty'));
    const current = id ? Number(itemById(id)?.stock_qty || 0) : initial;
    const errorElement = byId('inventoryEditorError');
    if (!['기력', '내연', '환경'].includes(field('inventoryMajorCategory'))) {
      errorElement.textContent = '대분류를 선택해 주세요.'; return;
    }
    if (!field('inventoryItemName')) { errorElement.textContent = '품명을 입력해 주세요.'; return; }
    if (!Number.isSafeInteger(standard) || standard < 0 || !Number.isSafeInteger(current)
      || current < 0 || current > standard) {
      errorElement.textContent = '정수와 현재고를 확인해 주세요. 현재고는 정수보다 클 수 없습니다.'; return;
    }
    const payload = {
      major_category: field('inventoryMajorCategory'), purpose: field('inventoryPurpose') || null,
      service_life: field('inventoryServiceLife') || null,
      item_name: field('inventoryItemName'), item_code: field('inventoryItemCode') || null,
      category: field('inventoryCategory') || null, spec: field('inventorySpec') || null,
      model_name: field('inventoryModelName') || null, location: field('inventoryLocation') || null,
      unit: field('inventoryUnit') || 'EA', standard_qty: standard,
      updated_by: currentUserInfo.name || '작업자', updated_at: new Date().toISOString()
    };
    if (!id) payload.stock_qty = initial;
    byId('inventoryEditorSubmit').disabled = true;
    const result = id
      ? await supabaseClient.from('inventory').update(payload).eq('id', id)
      : await supabaseClient.from('inventory').insert(payload);
    byId('inventoryEditorSubmit').disabled = false;
    if (result.error) { errorElement.textContent = errorText(result.error); return; }
    editor.close();
    await load();
    setStatus(id ? '자재 정보를 수정했습니다.' : '자재를 등록했습니다.');
  }

  function openChange(item, direction) {
    changeItemId = item.id; changeDirection = direction;
    byId('inventoryChangeForm').reset();
    byId('inventoryChangeError').textContent = '';
    byId('inventoryChangeTitle').textContent = `${item.item_name} ${direction > 0 ? '입고' : '사용'}`;
    byId('inventoryChangeBalance').textContent = `정수 / 현재고: ${item.standard_qty} / ${item.stock_qty}${item.unit || 'EA'}`;
    changeDialog.showModal();
  }

  async function saveChange(event) {
    event.preventDefault();
    const item = itemById(changeItemId);
    if (!item) return;
    const quantity = Number(field('inventoryChangeAmount'));
    const reason = field('inventoryChangeReason');
    const errorElement = byId('inventoryChangeError');
    const next = Number(item.stock_qty) + changeDirection * quantity;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || !reason) {
      errorElement.textContent = '변경 수량과 사유를 입력해 주세요.'; return;
    }
    if (next < 0 || next > Number(item.standard_qty)) {
      errorElement.textContent = '변경 후 현재고는 0 이상 정수 이하이어야 합니다.'; return;
    }
    byId('inventoryChangeSubmit').disabled = true;
    const { error } = await supabaseClient.rpc('change_inventory_stock', {
      p_inventory_id: item.id, p_change_qty: changeDirection * quantity, p_reason: reason
    });
    byId('inventoryChangeSubmit').disabled = false;
    if (error) { errorElement.textContent = errorText(error); return; }
    changeDialog.close();
    historyItemId = item.id;
    await load();
    setStatus(`${item.item_name} 현재고를 변경하고 사유를 기록했습니다.`);
  }

  async function setArchived(item, archived) {
    if (archived && !confirm(`${item.item_name}을 자재 목록에서 삭제할까요? 과거 수량 이력은 보존됩니다.`)) return;
    const { error } = await supabaseClient.from('inventory')
      .update({ is_archived: archived, updated_by: currentUserInfo.name || '작업자', updated_at: new Date().toISOString() })
      .eq('id', item.id);
    if (error) { setStatus(errorText(error), true); return; }
    await load();
    setStatus(archived ? '자재를 목록에서 삭제했습니다. 이력은 보존됩니다.' : '자재를 복원했습니다.');
  }

  tableBody.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const item = itemById(button.dataset.id);
    if (!item) return;
    switch (button.dataset.action) {
      case 'in': openChange(item, 1); break;
      case 'out': openChange(item, -1); break;
      case 'edit': openEditor(item); break;
      case 'archive': setArchived(item, true); break;
      case 'restore': setArchived(item, false); break;
      case 'history': loadHistory(item.id); break;
    }
  });
  byId('inventoryAddButton').addEventListener('click', () => openEditor());
  byId('inventoryEditorCancel').addEventListener('click', () => editor.close());
  byId('inventoryChangeCancel').addEventListener('click', () => changeDialog.close());
  byId('inventoryEditorForm').addEventListener('submit', saveEditor);
  byId('inventoryChangeForm').addEventListener('submit', saveChange);
  search.addEventListener('input', render);
  majorFilter.addEventListener('change', render);
  showArchived.addEventListener('change', render);
  window.loadInventoryPage = load;
  window.clearInventoryPage = () => {
    loadToken++; items = []; historyItemId = null; changeItemId = null;
    tableBody.replaceChildren(); history.textContent = '자재의 이력 버튼을 누르면 기록을 볼 수 있습니다.';
    if (editor.open) editor.close(); if (changeDialog.open) changeDialog.close();
    setStatus('');
  };
})();
