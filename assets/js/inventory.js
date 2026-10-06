// 자재 목록과 수량 변경. CSV 초기 자료는 public.inventory에서 읽습니다.
(() => {
  const view = document.getElementById('inventory-management-view');
  if (!view) return;
  const tableBody = document.getElementById('inventoryTableBody');
  const status = document.getElementById('inventoryStatus');
  const historyPanel = document.getElementById('inventoryHistoryPanel');
  const historyTitle = document.getElementById('inventoryHistoryTitle');
  const history = document.getElementById('inventoryHistoryList');
  const editor = document.getElementById('inventoryEditorDialog');
  const changeDialog = document.getElementById('inventoryChangeDialog');
  const photoDialog = document.getElementById('inventoryPhotoDialog');
  const photoGallery = document.getElementById('inventoryPhotoGallery');
  const editorPhotos = document.getElementById('inventoryEditorPhotos');
  const photoFiles = document.getElementById('inventoryPhotoFiles');
  const search = document.getElementById('inventorySearch');
  const majorFilter = document.getElementById('inventoryMajorFilter');
  const showArchived = document.getElementById('inventoryShowArchived');
  let items = [];
  let photos = [];
  let photosLoaded = false;
  let historyItemId = null;
  let changeItemId = null;
  let changeDirection = 1;
  let loadToken = 0;
  let lifeMode = 'auto';

  const byId = id => document.getElementById(id);
  const field = id => byId(id).value.trim();
  const categorySelect = byId('inventoryCategory');
  inventoryCategoryOptions.forEach(([name]) => categorySelect.add(new Option(name, name)));
  categorySelect.add(new Option('기타', '기타'));
  const categoryValue = () => categorySelect.value === '기타'
    ? field('inventoryCategoryOther') : categorySelect.value;
  const categoryForInference = () => categorySelect.value === '기타'
    ? field('inventoryCategoryOther') || '기타' : categorySelect.value;
  function refreshCategoryOther() {
    const other = categorySelect.value === '기타';
    byId('inventoryCategoryOtherField').hidden = !other;
    byId('inventoryCategoryOther').required = other;
  }
  const emptyText = value => value == null || value === '' ? '—' : String(value);
  const itemById = id => items.find(item => item.id === id);
  const itemPhotos = id => photos.filter(photo => photo.inventory_id === id && !photo.is_removed);
  const photoValue = photo => photo.image_base64
    ? `data:${photo.mime_type};base64,${photo.image_base64}` : photo.storage_url;
  function photoImage(photo, className = '', onClick = null) {
    const img = make('img', className);
    img.alt = '자재 사진'; img.loading = 'lazy';
    bindPhoto(img, photoValue(photo));
    img.addEventListener('click', onClick || (() => openImageLightbox(photoValue(photo))));
    return img;
  }
  function fillPhotoGrid(container, id, removable = false) {
    container.replaceChildren();
    const list = itemPhotos(id);
    if (!list.length) { container.append(make('p', 'inventory-meta', '등록된 사진이 없습니다.')); return; }
    list.forEach(photo => {
      const card = make('div', 'inventory-photo-card');
      card.append(photoImage(photo), make('span', '', photo.source === 'upload' ? '첨부 사진' : '기존 자료 사진'));
      if (removable) {
        const button = make('button', '', '사진 삭제'); button.type = 'button';
        button.addEventListener('click', async () => {
          if (!confirm('이 사진을 자재에서 삭제할까요?')) return;
          button.disabled = true;
          const { error } = await supabaseClient.from('inventory_photos').update({ is_removed: true }).eq('id', photo.id);
          if (error) { button.disabled = false; byId('inventoryEditorError').textContent = errorText(error); return; }
          photo.is_removed = true; fillPhotoGrid(editorPhotos, id, true); render();
        });
        card.append(button);
      }
      container.append(card);
    });
  }
  function openPhotos(item) {
    byId('inventoryPhotoTitle').textContent = `${item.item_name} 사진`;
    fillPhotoGrid(photoGallery, item.id);
    photoDialog.showModal();
  }
  const inferredLife = () => inferInventoryServiceLife({
    item_name: field('inventoryItemName'), category: categoryForInference(),
    spec: field('inventorySpec'), model_name: field('inventoryModelName')
  });
  function refreshServiceLife() {
    const match = inferredLife();
    if (lifeMode === 'auto') byId('inventoryServiceLife').value = match.value || '';
    const note = byId('inventoryServiceLifeNote');
    note.textContent = lifeMode === 'manual'
      ? '직접 입력한 수명입니다. 자동값으로 돌아가려면 ‘자동값 사용’을 누르세요.'
      : match.value ? `${match.type}: ${match.value} 자동 적용 · 필요하면 수정할 수 있습니다.`
        : match.type ? `${match.type}: 고정 교체주기가 없어 직접 입력해 주세요.`
          : '타입을 구별하지 못했습니다. 수명을 직접 입력해 주세요.';
    byId('inventoryAutoLifeButton').hidden = lifeMode === 'auto' || !match.value;
  }
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
    const majorLabel = value => ({
      '기력': '제주발전본부 1발전소 보일러자재',
      '환경': '제주발전본부 1발전소 환경자재'
    })[value] || value || '대분류 미지정';
    const query = search.value.trim().toLocaleLowerCase();
    const visible = items.filter(item => {
      if (item.is_archived && !showArchived.checked) return false;
      if (majorFilter.value !== '전체' && item.major_category !== majorFilter.value) return false;
      return !query || [item.item_name, item.material_number, item.item_code, item.category, item.spec,
        item.model_name, item.purpose, item.service_life, item.location, item.major_category,
        majorLabel(item.major_category)]
        .some(value => String(value || '').toLocaleLowerCase().includes(query));
    });
    if (historyItemId && !visible.some(item => item.id === historyItemId)) historyItemId = null;
    tableBody.replaceChildren();
    if (!visible.length) {
      const row = make('tr');
      const cell = make('td', '', items.length ? '조건에 맞는 자재가 없습니다.' : '등록된 자재가 없습니다. CSV를 가져오거나 자재를 등록해 주세요.');
      cell.colSpan = 6; row.append(cell); tableBody.append(row); return;
    }
    visible.forEach(item => {
      const row = make('tr', item.is_archived ? 'archived' : '');
      const nameCell = make('td');
      const attached = itemPhotos(item.id);
      if (attached.length) {
        const thumbnail = photoImage(attached[0], 'inventory-list-photo', () => openPhotos(item));
        nameCell.append(thumbnail);
      }
      nameCell.append(make('div', 'inventory-name', item.item_name),
        make('div', 'inventory-meta', [
          item.material_number ? `자재번호 ${item.material_number}` : null,
          item.item_code && item.item_code !== item.material_number ? `품목코드 ${item.item_code}` : null,
          item.category
        ].filter(Boolean).join(' · ') || '자재번호 없음'),
        make('div', 'inventory-major', majorLabel(item.major_category)));
      const specCell = make('td');
      specCell.append(make('div', '', emptyText(item.spec)), make('div', 'inventory-meta', `모델명 ${emptyText(item.model_name)}`));
      const purposeCell = make('td');
      purposeCell.append(make('div', '', emptyText(item.purpose)),
        make('div', 'inventory-meta', `수명 ${emptyText(item.service_life)}`));
      const placeCell = make('td', '', emptyText(item.location));
      const quantity = make('td', 'inventory-qty');
      const current = Number(item.stock_qty || 0);
      const standard = item.standard_qty == null ? null : Number(item.standard_qty);
      quantity.textContent = `${standard ?? '미지정'} / ${current}${item.unit || 'EA'}`;
      if (standard != null && standard > 0 && current <= Math.ceil(standard * 0.2)) quantity.classList.add('low');
      const buttons = make('td', 'inventory-actions');
      buttons.append(action(`사진 ${attached.length}`, 'photos', item.id));
      if (!item.is_archived) {
        buttons.append(action('+ 입고', 'in', item.id), action('− 사용', 'out', item.id),
          action('수정', 'edit', item.id), action('삭제', 'archive', item.id));
      } else buttons.append(action('복원', 'restore', item.id));
      const historyButton = action('이력', 'history', item.id);
      historyButton.setAttribute('aria-expanded', String(historyItemId === item.id));
      if (historyItemId === item.id) historyButton.setAttribute('aria-controls', 'inventoryHistoryPanel');
      buttons.append(historyButton);
      row.append(nameCell, specCell, purposeCell, placeCell, quantity, buttons);
      tableBody.append(row);
      if (historyItemId === item.id) {
        const detailRow = make('tr', 'inventory-history-row');
        const detailCell = make('td');
        detailCell.colSpan = 6;
        historyPanel.hidden = false;
        detailCell.append(historyPanel);
        detailRow.append(detailCell);
        tableBody.append(detailRow);
      }
    });
  }

  async function fetchItems() {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabaseClient.from('inventory')
        .select('id,major_category,category,item_code,material_number,item_name,spec,model_name,purpose,service_life,stock_qty,standard_qty,unit,location,is_archived,updated_at')
        .order('item_name', { ascending: true }).range(offset, offset + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) return rows;
    }
  }

  async function fetchPhotos() {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabaseClient.from('inventory_photos')
        .select('id,inventory_id,storage_url,image_base64,mime_type,source,is_removed')
        .eq('is_removed', false).order('created_at').range(offset, offset + 999);
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
      const [records, photoRecords] = await Promise.all([fetchItems(), photosLoaded ? Promise.resolve(photos) : fetchPhotos()]);
      if (token !== loadToken) return;
      items = records;
      photos = photoRecords; photosLoaded = true;
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
    if (!item || historyItemId !== id) return;
    historyTitle.textContent = `${item.item_name} 수량 변경 이력`;
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
    byId('inventoryMaterialNumber').value = item?.material_number || '';
    const savedCategory = item?.category || '';
    const listedCategory = inventoryCategoryOptions.some(([name]) => name === savedCategory);
    categorySelect.value = savedCategory ? (listedCategory ? savedCategory : '기타') : '';
    byId('inventoryCategoryOther').value = listedCategory ? '' : savedCategory;
    refreshCategoryOther();
    byId('inventorySpec').value = item?.spec || '';
    byId('inventoryModelName').value = item?.model_name || '';
    byId('inventoryPurpose').value = item?.purpose || '';
    byId('inventoryServiceLife').value = item?.service_life || '';
    const match = inferredLife();
    lifeMode = !item?.service_life || item.service_life === match.value ? 'auto' : 'manual';
    refreshServiceLife();
    byId('inventoryLocation').value = item?.location || '';
    byId('inventoryUnit').value = item?.unit || 'EA';
    byId('inventoryStandardQty').value = item?.standard_qty ?? '';
    byId('inventoryInitialQty').value = 0;
    fillPhotoGrid(editorPhotos, item?.id);
    editor.showModal();
  }

  async function saveEditor(event) {
    event.preventDefault();
    const id = field('inventoryEditId');
    const standardText = field('inventoryStandardQty');
    const standard = standardText === '' ? null : Number(standardText);
    const initial = Number(field('inventoryInitialQty'));
    const current = id ? Number(itemById(id)?.stock_qty || 0) : initial;
    const errorElement = byId('inventoryEditorError');
    const files = [...photoFiles.files];
    if (itemPhotos(id).length + files.length > 5) { errorElement.textContent = '사진은 품목당 최대 5장까지 첨부할 수 있습니다.'; return; }
    if (files.some(file => !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 20 * 1024 * 1024)) {
      errorElement.textContent = 'JPEG·PNG·WebP·GIF 사진을 장당 20MB 이하로 선택해 주세요.'; return;
    }
    if (!['기력', '내연', '환경'].includes(field('inventoryMajorCategory'))) {
      errorElement.textContent = '대분류를 선택해 주세요.'; return;
    }
    if (!field('inventoryItemName')) { errorElement.textContent = '품명을 입력해 주세요.'; return; }
    if (!categoryValue()) { errorElement.textContent = '분류를 선택하거나 기타 분류명을 입력해 주세요.'; return; }
    if ((standard !== null && (!Number.isSafeInteger(standard) || standard < 0))
      || !Number.isSafeInteger(current) || current < 0) {
      errorElement.textContent = '정수와 현재고는 0 이상의 정수로 입력해 주세요.'; return;
    }
    const payload = {
      major_category: field('inventoryMajorCategory'), purpose: field('inventoryPurpose') || null,
      service_life: field('inventoryServiceLife') || null,
      item_name: field('inventoryItemName'), item_code: field('inventoryItemCode') || null,
      material_number: field('inventoryMaterialNumber') || null,
      category: categoryValue(), spec: field('inventorySpec') || null,
      model_name: field('inventoryModelName') || null, location: field('inventoryLocation') || null,
      unit: field('inventoryUnit') || 'EA', standard_qty: standard,
      updated_by: currentUserInfo.name || '작업자', updated_at: new Date().toISOString()
    };
    if (!id) payload.stock_qty = initial;
    byId('inventoryEditorSubmit').disabled = true;
    const result = id
      ? await supabaseClient.from('inventory').update(payload).eq('id', id).select('id').single()
      : await supabaseClient.from('inventory').insert(payload).select('id').single();
    if (result.error) { byId('inventoryEditorSubmit').disabled = false; errorElement.textContent = errorText(result.error); return; }
    const savedId = result.data.id;
    if (!id) {
      byId('inventoryEditId').value = savedId;
      byId('inventoryEditorTitle').textContent = '자재 수정';
      byId('inventoryEditorSubmit').textContent = '수정 저장';
      byId('inventoryInitialQtyField').style.display = 'none';
      byId('inventoryEditorHint').style.display = 'none';
    }
    for (const file of files) {
      const url = await uploadImageToStorage(file);
      if (!url) { byId('inventoryEditorSubmit').disabled = false; errorElement.textContent = '자재 정보는 저장됐지만 사진 업로드가 완료되지 않았습니다. 사진을 다시 선택해 주세요.'; await load(); return; }
      const photoResult = await supabaseClient.from('inventory_photos').insert({
        inventory_id: savedId, storage_url: url, mime_type: file.type,
        source: 'upload', created_by: currentUserInfo.id
      });
      if (photoResult.error) { byId('inventoryEditorSubmit').disabled = false; errorElement.textContent = `자재 정보는 저장됐지만 사진 연결에 실패했습니다: ${errorText(photoResult.error)}`; await load(); return; }
    }
    byId('inventoryEditorSubmit').disabled = false;
    if (files.length) { photosLoaded = false; await load(); }
    editor.close();
    if (!files.length) await load();
    setStatus(id ? '자재 정보를 수정했습니다.' : '자재를 등록했습니다.');
  }

  function openChange(item, direction) {
    changeItemId = item.id; changeDirection = direction;
    byId('inventoryChangeForm').reset();
    byId('inventoryChangeError').textContent = '';
    byId('inventoryChangeTitle').textContent = `${item.item_name} ${direction > 0 ? '입고' : '사용'}`;
    byId('inventoryChangeBalance').textContent = `정수 / 현재고: ${item.standard_qty ?? '미지정'} / ${item.stock_qty}${item.unit || 'EA'}`;
    byId('inventoryChangeReasonLabel').textContent = direction > 0 ? '입고 사유' : '사용처·사용 내용';
    byId('inventoryChangeReason').placeholder = direction > 0 ? '예: 신규 구매 입고' : '예: 2호기 보일러 압력계 교체';
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
      errorElement.textContent = changeDirection > 0
        ? '변경 수량과 입고 사유를 입력해 주세요.'
        : '변경 수량과 사용처·사용 내용을 입력해 주세요.';
      return;
    }
    if (next < 0) {
      errorElement.textContent = '변경 후 현재고는 0 이상이어야 합니다.'; return;
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
      case 'history':
        historyItemId = historyItemId === item.id ? null : item.id;
        historyPanel.hidden = !historyItemId;
        render();
        if (historyItemId) loadHistory(item.id);
        break;
      case 'photos': openPhotos(item); break;
    }
  });
  byId('inventoryAddButton').addEventListener('click', () => openEditor());
  byId('inventoryEditorCancel').addEventListener('click', () => editor.close());
  byId('inventoryChangeCancel').addEventListener('click', () => changeDialog.close());
  byId('inventoryPhotoClose').addEventListener('click', () => photoDialog.close());
  byId('inventoryEditorForm').addEventListener('submit', saveEditor);
  ['inventoryItemName', 'inventoryCategoryOther', 'inventorySpec', 'inventoryModelName'].forEach(id =>
    byId(id).addEventListener('input', refreshServiceLife));
  categorySelect.addEventListener('change', () => {
    refreshCategoryOther(); lifeMode = 'auto'; refreshServiceLife();
  });
  byId('inventoryServiceLife').addEventListener('input', () => {
    lifeMode = 'manual'; refreshServiceLife();
  });
  byId('inventoryAutoLifeButton').addEventListener('click', () => {
    lifeMode = 'auto'; refreshServiceLife();
  });
  byId('inventoryChangeForm').addEventListener('submit', saveChange);
  search.addEventListener('input', render);
  majorFilter.addEventListener('change', render);
  showArchived.addEventListener('change', render);
  window.loadInventoryPage = load;
  window.clearInventoryPage = () => {
    loadToken++; items = []; photos = []; photosLoaded = false; historyItemId = null; changeItemId = null;
    historyPanel.hidden = true;
    tableBody.replaceChildren(); history.textContent = '자재의 이력 버튼을 누르면 기록을 볼 수 있습니다.';
    if (editor.open) editor.close(); if (changeDialog.open) changeDialog.close(); if (photoDialog.open) photoDialog.close();
    editorPhotos.replaceChildren(); photoGallery.replaceChildren();
    setStatus('');
  };
})();
