// 제주 발전 계측관리 시스템 동작 로직
//
// 분야별 위치
// 1. 설정/전역 상태/공통 유틸
// 2. 로직관리, TMS, 할 일, 자료실
// 3. 메뉴 전환과 설비 3D/2D 도면
// 4. 통합 이력, AI 점검, OCR
// 5. 인증, 계측, 검색
const SUPABASE_URL = 'https://euohxdxddvyldtfdvpkk.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_p3OXbhWhj04w_eFGMpu83w_ZbybQ_t_';
  const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      experimental: { passkey: true }
    }
  });

  let currentInstruments = [];
  let currentManuals = [];
  let currentMaterials = [];
  let currentTmsEquipment = [];
  let currentUserInfo = { id: '', name: '', email: '', role: 'member' };
  let isAdminMode = false;

  let selectedMajor = '기력';
  let selectedSubTab = '2호기';
  let selectedSection = '보일러';
  let selectedFloor = 'ALL';
  let selectedViewMode = '3d';
  let selectedMainMenu = '홈';
  let selectedTodoFilter = '전체';
  let currentTodoRecords = [];
  const lastEquipmentUnit = { '기력': '2호기', '내연': '1호기' };
  let activeTargetId = null;
  let activeCalibRecord = null;
  let editingHistoryIndex = null;
  let clickedFloorCoord = { x: 0, y: 0 };
  let isMeasureMode = false;
  let measurePoints = [];
  let currentChatSessionId = 'session_' + Date.now();
  let currentChatMessages = [];
  let isAiRequestPending = false;
  let calibrationCache = [];
  let calibrationCacheLoadedAt = 0;
  let editingTmsId = null;
  let unifiedData = { tms: [], logic: [], materials: [], todos: [], calibrations: [], aiInspections: [] };
  let unifiedDataLoadedAt = 0;
  let unifiedDataLoadingPromise = null;
  let historyEditOpenedFromTable = false;
  let instrumentEditOpenedFromHistory = false;
  let calibrationEditOpenedFromHistory = false;
  let selectedHistorySource = '전체';
  let selectedHistoryZone = '전체';
  let currentInspectionId = null;
  let currentInspectionItems = [];
  let currentInspectionSummary = '';
  let currentInspectionPhotos = [];
  let pendingInspectionPhotoFiles = [];

  let pendingInstPhotoFile = null;
  let pendingInitHistPhotoFile = null;
  let pendingHistPhotoFile = null;
  let pendingEditInstPhotoFile = null;

  let scale = 0.65;
  let panX = 0, panY = 0;
  let isDragging = false;
  let dragStartX = 0, dragStartY = 0;
  let initialPinchDist = 0;
  let initialScale = 0.65;

  const floor3DHeights = {
    'IDF': 5.00, '1층': 8.14, '2층': 11.50, '2.5층': 14.50, '3층': 17.50,
    '3.1/3층': 20.50, '3.2/3층': 23.50, '4층': 26.50, '4.5층': 29.50,
    '5층': 32.50, '5.5층': 35.50, '6층': 38.50, '7층': 44.80
  };

  const floorCorners2D = {
    'IDF':     { c1: { x: 300, y: 200 }, c4: { x: 1100, y: 900 } },
    '1층':     { c1: { x: 397, y: 216 }, c4: { x: 1118, y: 928 } },
    '2층':     { c1: { x: 372, y: 216 }, c4: { x: 1016, y: 838 } },
    '2.5층':   { c1: { x: 493, y: 230 }, c4: { x: 1130, y: 856 } },
    '3층':     { c1: { x: 374, y: 245 }, c4: { x: 1058, y: 929 } },
    '3.1/3층': { c1: { x: 425, y: 199 }, c4: { x: 1100, y: 859 } },
    '3.2/3층': { c1: { x: 402, y: 219 }, c4: { x: 1047, y: 829 } },
    '4층':     { c1: { x: 466, y: 168 }, c4: { x: 1155, y: 821 } },
    '4.5층':   { c1: { x: 589, y: 185 }, c4: { x: 1039, y: 838 } },
    '5층':     { c1: { x: 535, y: 187 }, c4: { x: 962,  y: 816 } },
    '5.5층':   { c1: { x: 591, y: 174 }, c4: { x: 1044, y: 844 } },
    '6층':     { c1: { x: 554, y: 170 }, c4: { x: 993,  y: 822 } },
    '7층':     { c1: { x: 132, y: 242 }, c4: { x: 569,  y: 855 } }
  };

    
  // 내연 도면 실측 기준: 좌상단 1코너 → 우하단 4코너
  const engineFloorCorners2D = {
    '지하층': { c1: { x: 504, y: 165 }, c4: { x: 842,  y: 840 } },
    '1층':   { c1: { x: 445, y: 158 }, c4: { x: 892,  y: 836 } },
    '2층':   { c1: { x: 447, y: 152 }, c4: { x: 916,  y: 828 } },
    '3층':   { c1: { x: 574, y: 187 }, c4: { x: 1003, y: 831 } }
  };

  // 내연 GLB는 모델 Y축이 높이, Z축이 도면 세로 방향이다. 같은 층 핀은 같은 EL에 표시한다.
  const engineFloor3DHeights = {
    '지하층': -3.50,
    '1층': 0.20,
    '2층': 6.00,
    '3층': 11.00
  };

  const engineModelCorners3D = {
    c1: { x: 0, y: -26.00 },    c4: { x: 40.00, y: 30.00 }
  };
    /* 💡 층수 명칭 완벽 정규화 함수 (어떤 형태로 입력되어 있어도 시스템 표준으로 변환) */
  function normalizeFloor(floorStr) {
    if (!floorStr) return '6층';
    let s = String(floorStr).trim();
    if (s.includes('지하') || /^b1$/i.test(s)) return '지하층';
    if (s.includes('IDF')) return 'IDF';
    if (s.includes('암모니아') || s.includes('탱크')) return '암모니아 탱크 구역';
    if (s.includes('연료')) return '연료펌프 1층';
    if (s.includes('탈질')) {
      if (s.includes('3.1/3')) return '탈질 3.1/3층';
      if (s.includes('4.5')) return '탈질 4.5층';
      if (s.includes('3')) return '탈질 3층';
      return '탈질 1층';
    }
    // 일반 층수 처리 ('6', '6F', '6f', '6층' -> '6층')
    s = s.replace(/f$/i, '').trim();
    if (!s.endsWith('층')) s += '층';
    return s;
  }

  window.openImageLightbox = function(imgSrc) {
    if (!imgSrc) return;
    const modal = document.getElementById('image-lightbox-modal');
    const targetImg = document.getElementById('lightbox-target-img');
    targetImg.src = imgSrc;
    modal.style.display = 'flex';
  };

  window.closeImageLightbox = function() {
    document.getElementById('image-lightbox-modal').style.display = 'none';
  };

  document.getElementById('infoMainImg').addEventListener('click', (e) => {
    if (e.target.src) openImageLightbox(e.target.src);
  });
  document.getElementById('photoPreview').addEventListener('click', (e) => {
    if (e.target.src) openImageLightbox(e.target.src);
  });
  document.getElementById('initHistPreview').addEventListener('click', (e) => {
    if (e.target.src) openImageLightbox(e.target.src);
  });
  document.getElementById('editInstPhotoPreview').addEventListener('click', (e) => {
    if (e.target.src) openImageLightbox(e.target.src);
  });
  document.getElementById('histPhotoPreview').addEventListener('click', (e) => {
    if (e.target.src) openImageLightbox(e.target.src);
  });

  function get3DCoordFrom2D(floor, cx, cy, major = selectedMajor) {
    const validFloor = normalizeFloor(floor);
    if (major === '내연') {
      const bounds = engineFloorCorners2D[validFloor] || engineFloorCorners2D['1층'];
      const u = (cx - bounds.c1.x) / (bounds.c4.x - bounds.c1.x || 1);
      const v = (cy - bounds.c1.y) / (bounds.c4.y - bounds.c1.y || 1);
      const x3d = engineModelCorners3D.c1.x + u * (engineModelCorners3D.c4.x - engineModelCorners3D.c1.x);
      const z3d = engineModelCorners3D.c1.y + v * (engineModelCorners3D.c4.y - engineModelCorners3D.c1.y);
      const y3d = engineFloor3DHeights[validFloor] ?? engineFloor3DHeights['1층'];
      return { x3d, y3d, z3d };
    }
    const h = floor3DHeights[validFloor] !== undefined ? floor3DHeights[validFloor] : 26;
    const bounds = floorCorners2D[validFloor] || floorCorners2D['1층'];
    const u = (cx - bounds.c1.x) / (bounds.c4.x - bounds.c1.x || 1);
    const v = (cy - bounds.c1.y) / (bounds.c4.y - bounds.c1.y || 1);
    const x3d = 19.96 + (u * (30.93 - 19.96)) + (v * (1.65 - 19.96));
    const z3d = -11.43 + (u * (6.89 - (-11.43))) + (v * (-0.47 - (-11.43)));
    return { x3d, y3d: h, z3d };
  }

  async function uploadImageToStorage(file) {
    if (!file) return null;
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      const filePath = `${fileName}`;
      const { data, error } = await supabaseClient.storage.from('instrument-photos').upload(filePath, file);
      if (error) {
        alert('⚠️ 이미지 업로드 실패: ' + error.message);
        return null;
      }
      const { data: publicURLData } = supabaseClient.storage.from('instrument-photos').getPublicUrl(filePath);
      return publicURLData.publicUrl;
    } catch (err) {
      return null;
    }
  }

  async function prepareImagePayloadForOcr(fileOrUrl) {
    if (typeof fileOrUrl === 'string') {
      return fileOrUrl;
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width;
          let h = img.height;
          const maxDim = 1200;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => resolve(e.target.result);
        img.src = e.target.result;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(fileOrUrl);
    });
  }

  function getLocalDateValue() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function setLogicStatus(message, type = '') {
    const status = document.getElementById('logicManagementStatus');
    status.textContent = message;
    status.className = `logic-status${type ? ` ${type}` : ''}`;
  }

  function renderLogicRecords(records) {
    const body = document.getElementById('logicManagementBody');
    body.replaceChildren();

    if (!records.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.className = 'logic-empty';
      cell.textContent = `[${selectedMajor}발전]에 등록된 로직 수정이력이 없습니다.`;
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }

    records.forEach(record => {
      const row = document.createElement('tr');
      [record.equipment_name, record.change_content, record.change_reason, record.change_date].forEach(value => {
        const cell = document.createElement('td');
        cell.textContent = value || '-';
        row.appendChild(cell);
      });
      body.appendChild(row);
    });
  }

  async function loadLogicRecords() {
    const dateInput = document.getElementById('logicChangeDate');
    if (!dateInput.value) dateInput.value = getLocalDateValue();
    setLogicStatus('수정이력을 불러오는 중입니다.');

    const { data: authData } = await supabaseClient.auth.getSession();
    if (!authData.session) {
      renderLogicRecords([]);
      setLogicStatus('Supabase 팀원 계정으로 로그인해야 로직 이력을 조회·등록할 수 있습니다.', 'error');
      return;
    }

    const { data, error } = await supabaseClient
      .from('logic_change_logs')
      .select('id, equipment_name, change_content, change_reason, change_date, created_at')
      .eq('major_category', selectedMajor)
      .order('change_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('로직 수정이력 조회 오류:', error);
      renderLogicRecords([]);
      setLogicStatus('수정이력을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
      return;
    }

    renderLogicRecords(data || []);
    setLogicStatus(`총 ${(data || []).length}건의 이력을 불러왔습니다.`);
  }

  document.getElementById('btnSaveLogicRecord').addEventListener('click', async () => {
    const equipmentName = document.getElementById('logicEquipmentName').value.trim();
    const changeContent = document.getElementById('logicChangeContent').value.trim();
    const changeReason = document.getElementById('logicChangeReason').value.trim();
    const changeDate = document.getElementById('logicChangeDate').value;
    const saveButton = document.getElementById('btnSaveLogicRecord');

    if (!equipmentName || !changeContent || !changeReason || !changeDate) {
      setLogicStatus('설비명, 수정내용, 수정사유, 수정날짜를 모두 입력해 주세요.', 'error');
      return;
    }

    const { data: authData } = await supabaseClient.auth.getSession();
    if (!authData.session) {
      setLogicStatus('Supabase 팀원 계정으로 로그인해야 등록할 수 있습니다.', 'error');
      return;
    }

    saveButton.disabled = true;
    setLogicStatus('수정이력을 등록하는 중입니다.');
    const { error } = await supabaseClient.from('logic_change_logs').insert([{
      major_category: selectedMajor,
      equipment_name: equipmentName,
      change_content: changeContent,
      change_reason: changeReason,
      change_date: changeDate
    }]);
    saveButton.disabled = false;

    if (error) {
      console.error('로직 수정이력 등록 오류:', error);
      setLogicStatus('등록하지 못했습니다. 로그인 상태와 입력 내용을 확인해 주세요.', 'error');
      return;
    }

    document.getElementById('logicEquipmentName').value = '';
    document.getElementById('logicChangeContent').value = '';
    document.getElementById('logicChangeReason').value = '';
    invalidateUnifiedData();
    await loadLogicRecords();
    setLogicStatus('로직 수정이력을 등록했습니다.', 'success');
  });

  function setTmsStatus(message, type = '') {
    const status = document.getElementById('tmsManagementStatus');
    status.textContent = message;
    status.className = `tms-status${type ? ` ${type}` : ''}`;
  }

  function resetTmsForm() {
    editingTmsId = null;
    document.getElementById('tmsEquipmentForm').reset();
    document.getElementById('btnSaveTmsEquipment').textContent = 'TMS 설비 추가';
    document.getElementById('btnCancelTmsEdit').style.display = 'none';
  }

  function renderTmsEquipment() {
    const list = document.getElementById('tmsEquipmentList');
    const count = document.getElementById('tmsEquipmentCount');
    list.replaceChildren();
    count.textContent = `총 ${currentTmsEquipment.length}대`;

    if (!currentTmsEquipment.length) {
      const empty = document.createElement('div');
      empty.className = 'tms-empty';
      empty.textContent = `[${selectedMajor}발전]에 등록된 TMS 설비가 없습니다.`;
      list.appendChild(empty);
      return;
    }

    currentTmsEquipment.forEach(record => {
      const item = document.createElement('div');
      item.className = 'tms-item';

      const main = document.createElement('div');
      main.className = 'tms-item-main';
      const heading = document.createElement('div');
      heading.className = 'tms-item-heading';
      const tag = document.createElement('span');
      tag.className = 'tms-tag';
      tag.textContent = record.tag_name;
      const name = document.createElement('span');
      name.className = 'tms-equipment-name';
      name.textContent = record.equipment_name;
      heading.append(tag, name);

      const history = document.createElement('div');
      history.className = `tms-history${record.maintenance_history ? '' : ' empty'}`;
      history.textContent = record.maintenance_history || '등록된 정비이력이 없습니다.';
      const meta = document.createElement('div');
      meta.className = 'tms-meta';
      meta.textContent = `최근 수정 ${formatTodoDate(record.updated_at || record.created_at)}`;
      main.append(heading, history, meta);

      const actions = document.createElement('div');
      actions.className = 'tms-item-actions';
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'tms-action-btn';
      editButton.textContent = '수정';
      editButton.addEventListener('click', () => startTmsEdit(record));
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'tms-action-btn delete';
      deleteButton.textContent = '삭제';
      deleteButton.addEventListener('click', () => deleteTmsEquipment(record, deleteButton));
      actions.append(editButton, deleteButton);

      item.append(main, actions);
      list.appendChild(item);
    });
  }

  async function loadTmsEquipment() {
    setTmsStatus('TMS 설비 목록을 불러오는 중입니다.');
    const { data: authData } = await supabaseClient.auth.getSession();
    if (!authData.session) {
      currentTmsEquipment = [];
      renderTmsEquipment();
      setTmsStatus('팀원 계정으로 로그인해야 TMS 설비를 확인할 수 있습니다.', 'error');
      return;
    }

    const { data, error } = await supabaseClient
      .from('tms_equipment')
      .select('id, major_category, tag_name, equipment_name, maintenance_history, created_at, updated_at')
      .eq('major_category', selectedMajor)
      .order('tag_name', { ascending: true });

    if (error) {
      console.error('TMS 설비 조회 오류:', error);
      currentTmsEquipment = [];
      renderTmsEquipment();
      setTmsStatus('TMS 설비 목록을 불러오지 못했습니다.', 'error');
      return;
    }

    currentTmsEquipment = data || [];
    renderTmsEquipment();
    setTmsStatus(`총 ${currentTmsEquipment.length}대의 TMS 설비를 불러왔습니다.`);
  }

  function startTmsEdit(record) {
    editingTmsId = record.id;
    document.getElementById('tmsTagName').value = record.tag_name || '';
    document.getElementById('tmsEquipmentName').value = record.equipment_name || '';
    document.getElementById('tmsMaintenanceHistory').value = record.maintenance_history || '';
    document.getElementById('btnSaveTmsEquipment').textContent = '수정 저장';
    document.getElementById('btnCancelTmsEdit').style.display = 'inline-block';
    setTmsStatus(`[${record.tag_name}] 설비를 수정 중입니다.`);
    document.getElementById('tmsTagName').focus();
    document.getElementById('tms-management-view').scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteTmsEquipment(record, button) {
    if (!confirm(`[${record.tag_name}] ${record.equipment_name} 설비와 정비이력을 삭제할까요?`)) return;
    button.disabled = true;
    setTmsStatus('TMS 설비를 삭제하는 중입니다.');
    const { data, error } = await supabaseClient
      .from('tms_equipment')
      .delete()
      .eq('id', record.id)
      .select('id');

    if (error || !data?.length) {
      console.error('TMS 설비 삭제 오류:', error);
      button.disabled = false;
      setTmsStatus('TMS 설비를 삭제하지 못했습니다.', 'error');
      return;
    }

    if (editingTmsId === record.id) resetTmsForm();
    invalidateUnifiedData();
    await loadTmsEquipment();
    setTmsStatus('TMS 설비를 삭제했습니다.', 'success');
  }

  document.getElementById('btnCancelTmsEdit').addEventListener('click', () => {
    resetTmsForm();
    setTmsStatus('수정을 취소했습니다.');
  });

  document.getElementById('tmsEquipmentForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const tagName = document.getElementById('tmsTagName').value.trim();
    const equipmentName = document.getElementById('tmsEquipmentName').value.trim();
    const maintenanceHistory = document.getElementById('tmsMaintenanceHistory').value.trim();
    const saveButton = document.getElementById('btnSaveTmsEquipment');

    if (!tagName || !equipmentName) {
      setTmsStatus('Tag-name과 기기명을 입력해 주세요.', 'error');
      return;
    }

    const { data: authData } = await supabaseClient.auth.getUser();
    const user = authData?.user;
    if (!user) {
      setTmsStatus('팀원 계정으로 로그인해야 저장할 수 있습니다.', 'error');
      return;
    }

    saveButton.disabled = true;
    setTmsStatus(editingTmsId ? 'TMS 설비를 수정하는 중입니다.' : 'TMS 설비를 추가하는 중입니다.');
    const values = {
      major_category: selectedMajor,
      tag_name: tagName,
      equipment_name: equipmentName,
      maintenance_history: maintenanceHistory,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    };

    const query = editingTmsId
      ? supabaseClient.from('tms_equipment').update(values).eq('id', editingTmsId)
      : supabaseClient.from('tms_equipment').insert([values]);
    const { data, error } = await query.select('id');
    saveButton.disabled = false;

    if (error || !data?.length) {
      console.error('TMS 설비 저장 오류:', error);
      const duplicate = error?.code === '23505';
      setTmsStatus(duplicate ? '같은 발전구분에 동일한 Tag-name이 이미 있습니다.' : 'TMS 설비를 저장하지 못했습니다.', 'error');
      return;
    }

    const wasEditing = Boolean(editingTmsId);
    resetTmsForm();
    invalidateUnifiedData();
    await loadTmsEquipment();
    setTmsStatus(wasEditing ? 'TMS 설비를 수정했습니다.' : 'TMS 설비를 추가했습니다.', 'success');
  });

  function setTodoStatus(message, type = '') {
    const status = document.getElementById('todoManagementStatus');
    status.textContent = message;
    status.className = `todo-status${type ? ` ${type}` : ''}`;
  }

  function formatTodoDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date);
  }

  function todoCategory(record = {}) {
    const raw = String(record.major_category || '').trim();
    if (raw.includes('내연')) return '내연';
    if (raw.includes('환경') || raw.includes('TMS')) return '환경';
    if (raw.includes('기력')) return '기력';
    return raw || '기타';
  }

  function todoMatchesFilter(record) {
    if (selectedTodoFilter === '전체') return true;
    return todoCategory(record) === selectedTodoFilter;
  }

  function updateTodoFilterButtons() {
    document.querySelectorAll('.todo-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.todoFilter === selectedTodoFilter);
    });
  }

  window.setTodoFilter = function(filter) {
    selectedTodoFilter = filter;
    updateTodoFilterButtons();
    renderTodos(currentTodoRecords);
  };

  function updateTodoBadge(records = currentTodoRecords) {
    const badge = document.getElementById('todoBadge');
    if (!badge) return;
    const remaining = records.filter(record => !record.completed_at).length;
    badge.textContent = String(remaining);
    badge.style.display = remaining > 0 ? 'inline-block' : 'none';
  }

  function renderHomeTodos(records = currentTodoRecords) {
    const list = document.getElementById('homeTodoList');
    if (!list) return;
    list.replaceChildren();
    const preview = [...records].sort((a, b) => {
      const completedOrder = Number(Boolean(a.completed_at)) - Number(Boolean(b.completed_at));
      if (completedOrder !== 0) return completedOrder;
      return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    }).slice(0, 5);

    if (!preview.length) {
      const empty = document.createElement('div');
      empty.className = 'home-empty';
      empty.textContent = '등록된 할 일이 없습니다. + 할 일 추가에서 첫 항목을 만들 수 있습니다.';
      list.appendChild(empty);
      return;
    }

    preview.forEach(record => {
      const item = document.createElement('div');
      const isCompleted = Boolean(record.completed_at);
      item.className = `home-todo-item${isCompleted ? ' done' : ''}`;
      const check = document.createElement('div');
      check.className = 'home-todo-check';
      check.textContent = isCompleted ? '☑' : '☐';
      const text = document.createElement('div');
      text.className = 'home-todo-text';
      text.textContent = record.task_text || '할 일';
      const category = document.createElement('div');
      category.className = 'home-todo-category';
      category.textContent = todoCategory(record);
      item.append(check, text, category);
      item.addEventListener('click', () => switchMainMenu('할일'));
      list.appendChild(item);
    });
  }

  async function loadTodoOverview() {
    const { data: authData } = await supabaseClient.auth.getSession();
    if (!authData.session) {
      currentTodoRecords = [];
      updateTodoBadge([]);
      renderHomeTodos([]);
      return [];
    }
    const { data, error } = await supabaseClient
      .from('maintenance_todos')
      .select('id, major_category, task_text, created_by_name, created_at, completed_at')
      .order('created_at', { ascending: true });
    if (error) {
      console.error('할 일 요약 조회 오류:', error);
      return currentTodoRecords;
    }
    currentTodoRecords = data || [];
    updateTodoBadge(currentTodoRecords);
    renderHomeTodos(currentTodoRecords);
    return currentTodoRecords;
  }

  function renderTodos(records) {
    const list = document.getElementById('todoList');
    list.replaceChildren();
    const filteredRecords = records.filter(todoMatchesFilter);

    if (!filteredRecords.length) {
      const empty = document.createElement('div');
      empty.className = 'todo-empty';
      empty.textContent = selectedTodoFilter === '전체'
        ? '등록된 할 일이 없습니다.'
        : `[${selectedTodoFilter}] 분류에 등록된 할 일이 없습니다.`;
      list.appendChild(empty);
      return;
    }

    filteredRecords.forEach(record => {
      const item = document.createElement('div');
      const isCompleted = Boolean(record.completed_at);
      item.className = `todo-item${isCompleted ? ' completed' : ''}`;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'todo-checkbox';
      checkbox.checked = isCompleted;
      checkbox.setAttribute('aria-label', `${record.task_text} ${isCompleted ? '완료 취소' : '완료'}`);

      const content = document.createElement('div');
      content.className = 'todo-content';
      const task = document.createElement('div');
      task.className = 'todo-text';
      task.textContent = record.task_text;
      const meta = document.createElement('div');
      meta.className = 'todo-meta';
      const creator = record.created_by_name || '작업자';
      const date = formatTodoDate(record.created_at);
      const category = document.createElement('span');
      category.className = 'todo-category-chip';
      category.textContent = todoCategory(record);
      const metaText = document.createElement('span');
      metaText.textContent = [creator, date, isCompleted ? '완료' : ''].filter(Boolean).join(' · ');
      meta.append(category, document.createTextNode(' '), metaText);
      content.append(task, meta);
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'todo-edit-btn';
      editButton.textContent = '수정';
      editButton.addEventListener('click', async () => {
        const nextText = prompt('할 일을 수정하세요.', record.task_text);
        if (nextText === null) return;
        const trimmed = nextText.trim();
        if (!trimmed) {
          setTodoStatus('할 일 내용은 비워둘 수 없습니다.', 'error');
          return;
        }
        editButton.disabled = true;
        setTodoStatus('할 일을 수정하는 중입니다.');
        const { data, error } = await supabaseClient
          .from('maintenance_todos')
          .update({ task_text: trimmed })
          .eq('id', record.id)
          .select('id');
        editButton.disabled = false;
        if (error || !data?.length) {
          console.error('할 일 수정 오류:', error);
          setTodoStatus('할 일을 수정하지 못했습니다.', 'error');
          return;
        }
        invalidateUnifiedData();
        await loadTodos();
        await loadTodoOverview();
        setTodoStatus('할 일을 수정했습니다.', 'success');
      });
      item.append(checkbox, content, editButton);
      list.appendChild(item);

      checkbox.addEventListener('change', async () => {
        const willComplete = checkbox.checked;
        checkbox.disabled = true;
        setTodoStatus(willComplete ? '완료 처리하는 중입니다.' : '할 일로 되돌리는 중입니다.');

        const { data: authData } = await supabaseClient.auth.getUser();
        const user = authData?.user;
        if (!user) {
          checkbox.checked = isCompleted;
          checkbox.disabled = false;
          setTodoStatus('로그인 상태를 확인해 주세요.', 'error');
          return;
        }

        const { data, error } = await supabaseClient
          .from('maintenance_todos')
          .update({
            completed_at: willComplete ? new Date().toISOString() : null,
            completed_by: willComplete ? user.id : null
          })
          .eq('id', record.id)
          .select('id');

        if (error || !data?.length) {
          console.error('할 일 완료 처리 오류:', error);
          checkbox.checked = isCompleted;
          checkbox.disabled = false;
          setTodoStatus('상태를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
          return;
        }

        invalidateUnifiedData();
        await loadTodos();
        await loadTodoOverview();
        setTodoStatus(willComplete ? '완료 항목에 취소선을 표시했습니다.' : '다시 할 일로 되돌렸습니다.', 'success');
      });
    });
  }

  async function loadTodos() {
    setTodoStatus('할 일을 불러오는 중입니다.');
    const { data: authData } = await supabaseClient.auth.getSession();
    if (!authData.session) {
      renderTodos([]);
      setTodoStatus('팀원 계정으로 로그인해야 할 일을 확인할 수 있습니다.', 'error');
      return;
    }

    const { data, error } = await supabaseClient
      .from('maintenance_todos')
      .select('id, major_category, task_text, created_by_name, created_at, completed_at')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('할 일 조회 오류:', error);
      renderTodos([]);
      setTodoStatus('할 일을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
      return;
    }

    const records = data || [];
    currentTodoRecords = records;
    records.sort((a, b) => {
      const completedOrder = Number(Boolean(a.completed_at)) - Number(Boolean(b.completed_at));
      if (completedOrder !== 0) return completedOrder;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    updateTodoFilterButtons();
    renderTodos(records);
    const remainingCount = records.filter(record => !record.completed_at).length;
    const filteredCount = records.filter(todoMatchesFilter).length;
    updateTodoBadge(records);
    renderHomeTodos(records);
    setTodoStatus(`전체 남은 할 일 ${remainingCount}개 · 현재 필터 ${filteredCount}개`);
  }

  document.getElementById('todoAddForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('todoTaskInput');
    const addButton = document.getElementById('btnAddTodo');
    const taskText = input.value.trim();

    if (!taskText) {
      setTodoStatus('할 일을 입력해 주세요.', 'error');
      input.focus();
      return;
    }

    const { data: authData } = await supabaseClient.auth.getSession();
    if (!authData.session) {
      setTodoStatus('팀원 계정으로 로그인해야 추가할 수 있습니다.', 'error');
      return;
    }

    addButton.disabled = true;
    setTodoStatus('할 일을 추가하는 중입니다.');
    const categoryForInsert = ['기력', '내연', '환경', '기타'].includes(selectedTodoFilter)
      ? selectedTodoFilter
      : selectedMajor;
    const { error } = await supabaseClient.from('maintenance_todos').insert([{
      major_category: categoryForInsert,
      task_text: taskText,
      created_by_name: currentUserInfo.name || '작업자'
    }]);
    addButton.disabled = false;

    if (error) {
      console.error('할 일 등록 오류:', error);
      setTodoStatus('할 일을 추가하지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
      return;
    }

    input.value = '';
    invalidateUnifiedData();
    await loadTodos();
    await loadTodoOverview();
    setTodoStatus('할 일을 추가했습니다.', 'success');
    input.focus();
  });

  function allPrimaryViews() {
    return [
      'home-dashboard-view',
      'overall-3d-view',
      'floor-room-view',
      'empty-engine-view',
      'history-table-view',
      'logic-management-view',
      'tms-management-view',
      'todo-management-view',
      'materials-management-view',
      'ai-inspection-view'
    ].map(id => document.getElementById(id)).filter(Boolean);
  }

  function hidePrimaryViews() {
    allPrimaryViews().forEach(view => { view.style.display = 'none'; });
  }

  function setMainMenuActive(menu) {
    const map = {
      '홈': 'main-menu-home',
      '설비': 'main-menu-equipment',
      'AI점검': 'main-menu-ai',
      '할일': 'main-menu-todo',
      '정비이력': 'main-menu-history',
      '자료실': 'main-menu-materials'
    };
    Object.entries(map).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('active', key === menu);
    });
  }

  function setEquipmentNavVisible(visible) {
    const kicker = document.getElementById('equipment-nav-kicker');
    const majorRow = document.getElementById('major-selector-row');
    const steamRow = document.getElementById('sub-tabs-steam');
    const engineRow = document.getElementById('sub-tabs-engine');
    const sectionRow = document.getElementById('section-selector-row');
    const viewModeRow = document.getElementById('view-mode-row');
    if (kicker) kicker.style.display = visible ? '' : 'none';
    if (majorRow) majorRow.style.display = visible ? 'flex' : 'none';
    if (!visible) {
      if (steamRow) steamRow.style.display = 'none';
      if (engineRow) engineRow.style.display = 'none';
      if (sectionRow) sectionRow.style.display = 'none';
      if (viewModeRow) viewModeRow.style.display = 'none';
      return;
    }
    if (steamRow) steamRow.style.display = selectedMajor === '기력' ? 'flex' : 'none';
    if (engineRow) engineRow.style.display = selectedMajor === '내연' ? 'flex' : 'none';
    syncSectionControls();
  }

  function syncSectionControls() {
    const boilerBtn = document.getElementById('sec-boiler');
    const amBtn = document.getElementById('sec-am');
    if (!boilerBtn || !amBtn) return;
    const showSectionButtons = selectedMajor === '기력' && (selectedSubTab === '2호기' || selectedSubTab === '3호기');
    boilerBtn.style.display = showSectionButtons ? '' : 'none';
    amBtn.style.display = showSectionButtons ? '' : 'none';
  }

  window.switchMainMenu = function(menu) {
    selectedMainMenu = menu;
    setMainMenuActive(menu);
    measurePoints = [];
    clearAllMeasureVisuals();
    hidePrimaryViews();

    if (menu === '홈') {
      setEquipmentNavVisible(false);
      document.getElementById('home-dashboard-view').style.display = 'block';
      loadTodoOverview();
      updateFloorTitle();
      return;
    }

    if (menu === '설비') {
      setEquipmentNavVisible(true);
      switchSubTab(lastEquipmentUnit[selectedMajor] || (selectedMajor === '내연' ? '1호기' : '2호기'));
      return;
    }

    setEquipmentNavVisible(false);

    if (menu === 'AI점검') {
      selectedSubTab = 'AI점검';
      document.getElementById('ai-inspection-view').style.display = 'block';
      document.getElementById('aiInspectionTitle').innerText = '🤖 AI 점검';
      loadLatestInspection();
    } else if (menu === '할일') {
      selectedSubTab = '할일';
      selectedTodoFilter = '전체';
      document.getElementById('todo-management-view').style.display = 'block';
      document.getElementById('todoManagementTitle').innerText = '✅ 통합 할 일';
      updateTodoFilterButtons();
      loadTodos();
    } else if (menu === '정비이력') {
      selectedSubTab = '관리이력';
      selectedHistorySource = '전체';
      selectedHistoryZone = '전체';
      document.getElementById('history-table-view').style.display = 'block';
      document.getElementById('tableFilterInput').value = '';
      updateHistoryFilterButtons();
      renderHistoryTable();
    } else if (menu === '자료실') {
      selectedSubTab = '자료실';
      document.getElementById('materials-management-view').style.display = 'block';
      document.getElementById('materialsManagementTitle').innerText = '📁 자료실';
      document.getElementById('materialsSearchInput').value = '';
      loadMaterials();
    }
    updateFloorTitle();
  };

  function setMaterialsStatus(message, type = '') {
    const status = document.getElementById('materialsManagementStatus');
    status.textContent = message;
    status.className = `materials-status${type ? ` ${type}` : ''}`;
  }

  function formatFileSize(bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderMaterials() {
    const list = document.getElementById('materialsList');
    const keyword = document.getElementById('materialsSearchInput').value.trim().toLowerCase();
    const records = currentMaterials.filter(record => {
      if (!keyword) return true;
      return [record.title, record.description, record.material_type, record.original_file_name, record.uploaded_by_name]
        .some(value => String(value || '').toLowerCase().includes(keyword));
    });
    list.replaceChildren();

    if (!records.length) {
      const empty = document.createElement('div');
      empty.className = 'materials-empty';
      empty.textContent = keyword
        ? '검색 결과가 없습니다.'
        : `[${selectedMajor}발전]에 등록된 자료가 없습니다.`;
      list.appendChild(empty);
      return;
    }

    records.forEach(record => {
      const item = document.createElement('div');
      item.className = 'material-item';

      const main = document.createElement('div');
      main.className = 'material-main';
      const name = document.createElement('div');
      name.className = 'material-name';
      name.textContent = record.title;
      const description = document.createElement('div');
      description.className = 'material-description';
      description.textContent = record.description || '';
      if (!record.description) description.style.display = 'none';
      const meta = document.createElement('div');
      meta.className = 'material-meta';
      const type = document.createElement('span');
      type.className = 'material-type';
      type.textContent = record.material_type;
      meta.appendChild(type);
      meta.append(document.createTextNode(
        `${record.original_file_name} · ${formatFileSize(record.file_size)} · ${record.uploaded_by_name || '작업자'} · ${formatTodoDate(record.created_at)}`
      ));
      main.append(name, description, meta);

      const actions = document.createElement('div');
      actions.className = 'material-actions';
      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'material-action-btn';
      openButton.textContent = '열기';
      openButton.addEventListener('click', () => openMaterial(record));
      const downloadButton = document.createElement('button');
      downloadButton.type = 'button';
      downloadButton.className = 'material-action-btn';
      downloadButton.textContent = '다운로드';
      downloadButton.addEventListener('click', () => downloadMaterial(record));
      actions.append(openButton, downloadButton);

      if (isAdminMode || record.uploaded_by === currentUserInfo.id) {
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'material-action-btn delete';
        deleteButton.textContent = '삭제';
        deleteButton.addEventListener('click', () => deleteMaterial(record, deleteButton));
        actions.appendChild(deleteButton);
      }

      item.append(main, actions);
      list.appendChild(item);
    });
  }

  async function loadMaterials() {
    setMaterialsStatus('자료 목록을 불러오는 중입니다.');
    const { data: authData } = await supabaseClient.auth.getSession();
    if (!authData.session) {
      currentMaterials = [];
      renderMaterials();
      setMaterialsStatus('팀원 계정으로 로그인해야 자료를 확인할 수 있습니다.', 'error');
      return;
    }

    const { data, error } = await supabaseClient
      .from('maintenance_materials')
      .select('id, major_category, title, description, material_type, original_file_name, storage_path, mime_type, file_size, uploaded_by, uploaded_by_name, created_at')
      .eq('major_category', selectedMajor)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('자료 목록 조회 오류:', error);
      currentMaterials = [];
      renderMaterials();
      setMaterialsStatus('자료 목록을 불러오지 못했습니다.', 'error');
      return;
    }

    currentMaterials = data || [];
    renderMaterials();
    setMaterialsStatus(`총 ${currentMaterials.length}개의 자료가 있습니다.`);
  }

  async function openMaterial(record) {
    setMaterialsStatus('자료를 여는 중입니다.');
    const { data, error } = await supabaseClient.storage
      .from('maintenance-materials')
      .createSignedUrl(record.storage_path, 300);
    if (error || !data?.signedUrl) {
      console.error('자료 열기 오류:', error);
      setMaterialsStatus('자료를 열지 못했습니다.', 'error');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
    setMaterialsStatus('자료를 새 창에서 열었습니다.', 'success');
  }

  async function downloadMaterial(record) {
    setMaterialsStatus('자료를 다운로드하는 중입니다.');
    const { data, error } = await supabaseClient.storage
      .from('maintenance-materials')
      .download(record.storage_path);
    if (error || !data) {
      console.error('자료 다운로드 오류:', error);
      setMaterialsStatus('자료를 다운로드하지 못했습니다.', 'error');
      return;
    }
    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = record.original_file_name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMaterialsStatus('다운로드를 시작했습니다.', 'success');
  }

  async function deleteMaterial(record, button) {
    if (!confirm(`'${record.title}' 자료를 삭제하시겠습니까?\n삭제한 파일은 복구할 수 없습니다.`)) return;
    button.disabled = true;
    setMaterialsStatus('자료를 삭제하는 중입니다.');

    const { error: storageError } = await supabaseClient.storage
      .from('maintenance-materials')
      .remove([record.storage_path]);
    if (storageError) {
      console.error('자료 파일 삭제 오류:', storageError);
      button.disabled = false;
      setMaterialsStatus('파일을 삭제하지 못했습니다. 권한을 확인해 주세요.', 'error');
      return;
    }

    const { error: metadataError } = await supabaseClient
      .from('maintenance_materials')
      .delete()
      .eq('id', record.id);
    if (metadataError) {
      console.error('자료 정보 삭제 오류:', metadataError);
      setMaterialsStatus('파일은 삭제됐지만 목록 정리에 실패했습니다. 관리자에게 알려주세요.', 'error');
      await loadMaterials();
      return;
    }

    invalidateUnifiedData();
    await loadMaterials();
    setMaterialsStatus('자료를 삭제했습니다.', 'success');
  }

  document.getElementById('materialsSearchInput').addEventListener('input', renderMaterials);

  document.getElementById('materialFile').addEventListener('change', event => {
    const file = event.target.files?.[0];
    const title = document.getElementById('materialTitle');
    if (file && !title.value.trim()) {
      title.value = file.name.replace(/\.[^.]+$/, '');
    }
  });

  document.getElementById('materialsUploadForm').addEventListener('submit', async event => {
    event.preventDefault();
    const titleInput = document.getElementById('materialTitle');
    const descriptionInput = document.getElementById('materialDescription');
    const typeInput = document.getElementById('materialType');
    const fileInput = document.getElementById('materialFile');
    const uploadButton = document.getElementById('btnUploadMaterial');
    const title = titleInput.value.trim();
    const file = fileInput.files?.[0];

    if (!title || !file) {
      setMaterialsStatus('자료명과 파일을 모두 입력해 주세요.', 'error');
      return;
    }
    if (file.size <= 0 || file.size > 20 * 1024 * 1024) {
      setMaterialsStatus('파일 크기는 20MB 이하여야 합니다.', 'error');
      return;
    }

    const rawExtension = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
    const allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'xlsx', 'xls', 'csv', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'zip', 'hwp', 'hwpx'];
    if (!allowedExtensions.includes(rawExtension)) {
      setMaterialsStatus('지원하지 않는 파일 형식입니다.', 'error');
      return;
    }

    const { data: authData } = await supabaseClient.auth.getUser();
    const user = authData?.user;
    if (!user) {
      setMaterialsStatus('팀원 계정으로 로그인해야 업로드할 수 있습니다.', 'error');
      return;
    }

    const extension = rawExtension.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
    const fileId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const storagePath = `${user.id}/${fileId}${extension ? `.${extension}` : ''}`;

    uploadButton.disabled = true;
    setMaterialsStatus('파일을 업로드하는 중입니다.');
    const { error: uploadError } = await supabaseClient.storage
      .from('maintenance-materials')
      .upload(storagePath, file, {
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('자료 파일 업로드 오류:', uploadError);
      uploadButton.disabled = false;
      setMaterialsStatus('파일을 업로드하지 못했습니다. 로그인 상태와 파일 크기를 확인해 주세요.', 'error');
      return;
    }

    setMaterialsStatus('자료 정보를 저장하는 중입니다.');
    const { error: metadataError } = await supabaseClient.from('maintenance_materials').insert([{
      major_category: selectedMajor,
      title,
      description: descriptionInput.value.trim(),
      material_type: typeInput.value,
      original_file_name: file.name.slice(0, 255),
      storage_path: storagePath,
      mime_type: file.type || null,
      file_size: file.size,
      uploaded_by_name: currentUserInfo.name || '작업자'
    }]);

    if (metadataError) {
      console.error('자료 정보 저장 오류:', metadataError);
      await supabaseClient.storage.from('maintenance-materials').remove([storagePath]);
      uploadButton.disabled = false;
      setMaterialsStatus('자료 정보를 저장하지 못해 업로드를 취소했습니다.', 'error');
      return;
    }

    titleInput.value = '';
    descriptionInput.value = '';
    fileInput.value = '';
    uploadButton.disabled = false;
    invalidateUnifiedData();
    await loadMaterials();
    setMaterialsStatus('자료를 업로드했습니다.', 'success');
  });

  window.switchMajor = function(major) {
    selectedMainMenu = '설비';
    setMainMenuActive('설비');
    setEquipmentNavVisible(true);
    selectedMajor = major;
    measurePoints = [];
    clearAllMeasureVisuals();
    document.getElementById('btn-major-steam').classList.toggle('active', major === '기력');
    document.getElementById('btn-major-engine').classList.toggle('active', major === '내연');
    if (major === '기력') {
      document.getElementById('sub-tabs-steam').style.display = 'flex';
      document.getElementById('sub-tabs-engine').style.display = 'none';
      switchSubTab('2호기');
    } else {
      document.getElementById('sub-tabs-steam').style.display = 'none';
      document.getElementById('sub-tabs-engine').style.display = 'flex';
      switchSubTab('1호기');
    }
  };

  window.switchSubTab = function(sub) {
    if (['2호기', '3호기', '1호기', '연료펌프룸', '암모니아탱크', 'TMS(환경)', '로직관리', 'AI점검', '자료실', '관리이력', '할일'].includes(sub)) {
      selectedMainMenu = '설비';
      setMainMenuActive('설비');
    }
    selectedSubTab = sub;
    if (selectedMajor === '기력' && ['2호기', '3호기', '연료펌프룸', '암모니아탱크'].includes(sub)) lastEquipmentUnit['기력'] = sub;
    if (selectedMajor === '내연' && ['1호기', '2호기'].includes(sub)) lastEquipmentUnit['내연'] = sub;
    measurePoints = [];
    clearAllMeasureVisuals();
    if (selectedMajor === '기력') {
      ['AI점검', '할일', '자료실', 'TMS(환경)', '2호기', '3호기', '연료펌프룸', '암모니아탱크', '관리이력', '로직관리'].forEach(key => {
        const idMap = { 'AI점검': 'sub-steam-ai', '할일': 'sub-steam-todo', '자료실': 'sub-steam-materials', 'TMS(환경)': 'sub-steam-tms', '2호기': 'sub-steam-2', '3호기': 'sub-steam-3', '연료펌프룸': 'sub-steam-fuel', '암모니아탱크': 'sub-steam-am', '관리이력': 'sub-steam-hist', '로직관리': 'sub-steam-logic' };
        const el = document.getElementById(idMap[key]);
        if (el) el.classList.toggle('active', sub === key);
      });
      document.getElementById('section-selector-row').style.display = (sub === '2호기' || sub === '3호기') ? 'flex' : 'none';
    } else {
      const engineAi = document.getElementById('sub-engine-ai');
      const engineMaterials = document.getElementById('sub-engine-materials');
      const engineHist = document.getElementById('sub-engine-hist');
      if (engineAi) engineAi.classList.toggle('active', sub === 'AI점검');
      document.getElementById('sub-engine-todo').classList.toggle('active', sub === '할일');
      if (engineMaterials) engineMaterials.classList.toggle('active', sub === '자료실');
      document.getElementById('sub-engine-tms').classList.toggle('active', sub === 'TMS(환경)');
      document.getElementById('sub-engine-1').classList.toggle('active', sub === '1호기');
      document.getElementById('sub-engine-2').classList.toggle('active', sub === '2호기');
      if (engineHist) engineHist.classList.toggle('active', sub === '관리이력');
      document.getElementById('sub-engine-logic').classList.toggle('active', sub === '로직관리');
      document.getElementById('section-selector-row').style.display = (sub === '1호기' || sub === '2호기') ? 'flex' : 'none';
    }
    syncSectionControls();

    const viewHome = document.getElementById('home-dashboard-view');
    const view3D = document.getElementById('overall-3d-view');
    const viewFloor = document.getElementById('floor-room-view');
    const viewEmpty = document.getElementById('empty-engine-view');
    const viewHist = document.getElementById('history-table-view');
    const viewLogic = document.getElementById('logic-management-view');
    const viewTms = document.getElementById('tms-management-view');
    const viewTodo = document.getElementById('todo-management-view');
    const viewMaterials = document.getElementById('materials-management-view');
    const viewAiInspection = document.getElementById('ai-inspection-view');
    const floorBar = document.getElementById('floor-bar');
    const viewModeRow = document.getElementById('view-mode-row');

    if (viewHome) viewHome.style.display = 'none';
    view3D.style.display = 'none';
    viewFloor.style.display = 'none';
    viewEmpty.style.display = 'none';
    viewHist.style.display = 'none';
    viewLogic.style.display = 'none';
    viewTms.style.display = 'none';
    viewTodo.style.display = 'none';
    viewMaterials.style.display = 'none';
    viewAiInspection.style.display = 'none';
    if (viewModeRow) viewModeRow.style.display = 'none';

    if (sub === 'AI점검') {
      floorBar.style.display = 'none';
      viewAiInspection.style.display = 'block';
      document.getElementById('aiInspectionTitle').innerText = `🤖 [${selectedMajor}발전] AI 점검`;
      loadLatestInspection();
    } else if (sub === '할일') {
      floorBar.style.display = 'none';
      viewTodo.style.display = 'block';
      document.getElementById('todoManagementTitle').innerText = `☑ [${selectedMajor}발전] To Do List`;
      loadTodos();
    } else if (sub === '자료실') {
      floorBar.style.display = 'none';
      viewMaterials.style.display = 'block';
      document.getElementById('materialsManagementTitle').innerText = `📁 [${selectedMajor}발전] 자료실`;
      document.getElementById('materialsSearchInput').value = '';
      loadMaterials();
    } else if (sub === '관리이력') {
      floorBar.style.display = 'none';
      viewHist.style.display = 'block';
      selectedHistorySource = '전체';
      selectedHistoryZone = '전체';
      document.getElementById('tableFilterInput').value = '';
      updateHistoryFilterButtons();
      document.getElementById('historyTableTitle').innerText = `📋 [${selectedMajor}발전] 데이터별 통합 관리이력`;
      renderHistoryTable();
    } else if (sub === '로직관리') {
      floorBar.style.display = 'none';
      viewLogic.style.display = 'block';
      document.getElementById('logicManagementTitle').innerText = `🧩 [${selectedMajor}발전] 로직관리`;
      loadLogicRecords();
    } else if (sub === 'TMS(환경)') {
      floorBar.style.display = 'none';
      viewTms.style.display = 'block';
      document.getElementById('tmsManagementTitle').innerText = `🌿 [${selectedMajor}발전] TMS(환경)`;
      resetTmsForm();
      loadTmsEquipment();
    } else if (sub === '연료펌프룸') {
      if (viewModeRow) viewModeRow.style.display = 'flex';
      renderFloorBar();
      selectedViewMode = 'floor';
      switchViewMode('floor');
    } else if (sub === '암모니아탱크') {
      if (viewModeRow) viewModeRow.style.display = 'flex';
      renderFloorBar();
      selectedViewMode = 'floor';
      switchViewMode('floor');
    } else if (selectedMajor === '기력') {
      if (viewModeRow) viewModeRow.style.display = 'flex';
      selectedViewMode = '3d';
      switchSection(selectedSection || '보일러');
    } else {
      if (viewModeRow) viewModeRow.style.display = 'flex';
      selectedViewMode = '3d';
      switchViewMode('3d');
    }
    updateFloorTitle();
  };

  window.switchSection = function(section) {
    selectedSection = section;
    document.getElementById('sec-boiler').classList.toggle('active', section === '보일러');
    document.getElementById('sec-am').classList.toggle('active', section === '탈질');
    renderFloorBar();

    if (section !== '보일러') selectedViewMode = 'floor';
    switchViewMode(selectedViewMode);
    updateFloorTitle();
  };

  function selectedModelSource() {
    if (selectedMajor === '내연') {
      return selectedSubTab === '2호기'
        ? './assets/models/engine/engine_unit2_yup_v7.glb'
        : './assets/models/engine/engine_unit1_yup_v7.glb';
    }
    return './assets/models/boiler/boiler.glb';
  }

  function defaultFloorForSelection() {
    if (selectedSubTab === '연료펌프룸') return ['연료펌프 1층', 'assets/floor-plans/fuel-pump-room/fuel_floor_1f.jpg'];
    if (selectedSubTab === '암모니아탱크') return ['암모니아 탱크 구역', 'assets/floor-plans/ammonia-tank/am_tank_floor.jpg'];
    if (selectedMajor === '내연') return ['3층', 'assets/floor-plans/engine/engine_floor_3f.jpg'];
    if (selectedSection === '탈질') return ['탈질 1층', 'assets/floor-plans/denitrification/am_floor_1f.jpg'];
    return ['3층', 'assets/floor-plans/boiler/floor_3f.jpg'];
  }

  window.switchViewMode = function(mode) {
    selectedViewMode = mode === 'floor' ? 'floor' : '3d';
    const view3D = document.getElementById('overall-3d-view');
    const viewFloor = document.getElementById('floor-room-view');
    const btn3d = document.getElementById('view-mode-3d');
    const btnFloor = document.getElementById('view-mode-floor');
    btn3d.classList.toggle('active', selectedViewMode === '3d');
    btnFloor.classList.toggle('active', selectedViewMode === 'floor');

    const supports3d = selectedMajor === '내연' || (
      selectedMajor === '기력' && (selectedSubTab === '2호기' || selectedSubTab === '3호기') && selectedSection === '보일러'
    );
    if (selectedViewMode === '3d' && !supports3d) selectedViewMode = 'floor';

    if (selectedViewMode === '3d') {
      viewFloor.style.display = 'none';
      viewFloor.classList.remove('managed-open');
      document.getElementById('btnToggleManagedEquipment').classList.remove('active');
      view3D.style.display = 'block';
      selectedFloor = 'ALL';
      const src = selectedModelSource();
      if (viewer.getAttribute('src') !== src) viewer.setAttribute('src', src);
      if (selectedMajor === '내연') {
        // v7 GLB는 Y축이 높이인 glTF 표준 좌표로 제작되어 별도 축 보정이 필요 없다.
        viewer.setAttribute('orientation', '0deg 0deg 0deg');
        viewer.setAttribute('camera-orbit', '0deg 75deg 380m');
        viewer.setAttribute('touch-action', 'none');
        viewer.setAttribute('min-camera-orbit', 'auto 0deg auto');
        viewer.setAttribute('max-camera-orbit', 'auto 180deg auto');
        viewer.setAttribute('shadow-intensity', '0.35');
        viewer.setAttribute('exposure', '0.85');
      } else {
        viewer.setAttribute('orientation', '90deg 270deg 210deg');
        viewer.setAttribute('camera-orbit', '0deg 75deg 380m');
        viewer.setAttribute('touch-action', 'none');
        viewer.setAttribute('min-camera-orbit', 'auto 0deg auto');
        viewer.setAttribute('max-camera-orbit', 'auto 180deg auto');
        viewer.setAttribute('shadow-intensity', '1.5');
        viewer.setAttribute('exposure', '1.0');
      }
      render3DHotspots();
    } else {
      view3D.style.display = 'none';
      renderFloorBar();
      const [floor, file] = defaultFloorForSelection();
      openFloorRoom(floor, file, null);
    }
    btn3d.classList.toggle('active', selectedViewMode === '3d');
    btnFloor.classList.toggle('active', selectedViewMode === 'floor');
    updateFloorTitle();
  };

  function renderFloorBar() {
    const bar = document.getElementById('floor-floor-buttons');
    bar.innerHTML = '';

    if (selectedSubTab === '연료펌프룸') {
      bar.innerHTML = `<button class="floor-btn active" onclick="openFloorRoom('연료펌프 1층', 'assets/floor-plans/fuel-pump-room/fuel_floor_1f.jpg', this)">연료펌프 1층</button>`;
      return;
    }
    if (selectedSubTab === '암모니아탱크') {
      bar.innerHTML = `<button class="floor-btn active" onclick="openFloorRoom('암모니아 탱크 구역', 'assets/floor-plans/ammonia-tank/am_tank_floor.jpg', this)">암모니아 탱크 구역</button>`;
      return;
    }

    if (selectedMajor === '내연') {
      bar.innerHTML = `
        <button class="floor-btn" onclick="openFloorRoom('지하층', 'assets/floor-plans/engine/engine_floor_b1.jpg', this)">지하</button>
        <button class="floor-btn" onclick="openFloorRoom('1층', 'assets/floor-plans/engine/engine_floor_1f.jpg', this)">1층</button>
        <button class="floor-btn" onclick="openFloorRoom('2층', 'assets/floor-plans/engine/engine_floor_2f.jpg', this)">2층</button>
        <button class="floor-btn active" onclick="openFloorRoom('3층', 'assets/floor-plans/engine/engine_floor_3f.jpg', this)">3층</button>
      `;
    } else if (selectedSection === '보일러') {
      bar.innerHTML = `
        <button class="floor-btn" onclick="openFloorRoom('IDF', 'assets/floor-plans/idf/IDF_FRONT.PNG', this)">IDF</button>
        <button class="floor-btn" onclick="openFloorRoom('1층', 'assets/floor-plans/boiler/floor_1f.jpg', this)">1층</button>
        <button class="floor-btn" onclick="openFloorRoom('2층', 'assets/floor-plans/boiler/floor_2f.jpg', this)">2층</button>
        <button class="floor-btn" onclick="openFloorRoom('2.5층', 'assets/floor-plans/boiler/floor_2_5f.jpg', this)">2.5층</button>
        <button class="floor-btn" onclick="openFloorRoom('3층', 'assets/floor-plans/boiler/floor_3f.jpg', this)">3층</button>
        <button class="floor-btn" onclick="openFloorRoom('3.1/3층', 'assets/floor-plans/boiler/floor_3_1_3f.jpg', this)">3.1/3층</button>
        <button class="floor-btn" onclick="openFloorRoom('3.2/3층', 'assets/floor-plans/boiler/floor_3_2_3f.jpg', this)">3.2/3층</button>
        <button class="floor-btn" onclick="openFloorRoom('4층', 'assets/floor-plans/boiler/floor_4f.jpg', this)">4층</button>
        <button class="floor-btn" onclick="openFloorRoom('4.5층', 'assets/floor-plans/boiler/floor_4_5f.jpg', this)">4.5층</button>
        <button class="floor-btn" onclick="openFloorRoom('5층', 'assets/floor-plans/boiler/floor_5f.jpg', this)">5층</button>
        <button class="floor-btn" onclick="openFloorRoom('5.5층', 'assets/floor-plans/boiler/floor_5_5f.jpg', this)">5.5층</button>
        <button class="floor-btn" onclick="openFloorRoom('6층', 'assets/floor-plans/boiler/floor_6f.jpg', this)">6층</button>
        <button class="floor-btn" onclick="openFloorRoom('7층', 'assets/floor-plans/boiler/floor_7f.jpg', this)">7층</button>
      `;
    } else if (selectedSection === '탈질') {
      bar.innerHTML = `
        <button class="floor-btn active" onclick="openFloorRoom('탈질 1층', 'assets/floor-plans/denitrification/am_floor_1f.jpg', this)">탈질 1층</button>
        <button class="floor-btn" onclick="openFloorRoom('탈질 3층', 'assets/floor-plans/denitrification/am_floor_3f.jpg', this)">탈질 3층</button>
        <button class="floor-btn" onclick="openFloorRoom('탈질 3.1/3층', 'assets/floor-plans/denitrification/am_floor_3_1_3f.jpg', this)">탈질 3.1/3층</button>
        <button class="floor-btn" onclick="openFloorRoom('탈질 4.5층', 'assets/floor-plans/denitrification/am_4_5f.jpg', this)">탈질 4.5층</button>
      `;
    }
  }

  function updateFloorTitle() {
    const floorTag = document.getElementById('currentFloorTag');
    if (selectedMainMenu === '홈') {
      floorTag.innerText = '홈';
    } else if (selectedMainMenu === 'AI점검') {
      floorTag.innerText = 'AI 점검';
    } else if (selectedMainMenu === '할일') {
      floorTag.innerText = '통합 할 일';
    } else if (selectedMainMenu === '정비이력') {
      floorTag.innerText = '통합 정비이력';
    } else if (selectedMainMenu === '자료실') {
      floorTag.innerText = '자료실';
    } else if (selectedSubTab === '할일') {
      floorTag.innerText = `${selectedMajor} 할 일`;
    } else if (selectedSubTab === '자료실') {
      floorTag.innerText = `${selectedMajor} 자료실`;
    } else if (selectedSubTab === '관리이력') {
      floorTag.innerText = `${selectedMajor} 관리이력`;
    } else if (selectedSubTab === '로직관리') {
      floorTag.innerText = `${selectedMajor} 로직관리`;
    } else if (selectedSubTab === 'TMS(환경)') {
      floorTag.innerText = `${selectedMajor} TMS(환경)`;
    } else if (selectedSubTab === 'AI점검') {
      floorTag.innerText = `${selectedMajor} AI 점검`;
    } else if (selectedSubTab === '연료펌프룸' || selectedSubTab === '암모니아탱크') {
      floorTag.innerText = `기력 ${selectedSubTab}`;
    } else if (selectedMajor === '기력') {
      const secText = selectedSection || '보일러';
      floorTag.innerText = selectedFloor === 'ALL' ? `기력 ${selectedSubTab} ${secText} 전체` : `기력 ${selectedSubTab} ${secText} ${selectedFloor}`;
    } else {
      floorTag.innerText = selectedFloor === 'ALL' ? `내연 ${selectedSubTab} 3D` : `내연 ${selectedSubTab} ${selectedFloor}`;
    }
    const floorViewTitle = document.getElementById('floor-view-title');
    if (floorViewTitle && selectedFloor !== 'ALL') {
      const area = selectedMajor === '내연' ? `내연 ${selectedSubTab}` : (selectedSection === '탈질' ? '탈질설비' : (selectedSubTab === '연료펌프룸' || selectedSubTab === '암모니아탱크' ? selectedSubTab : '보일러'));
      floorViewTitle.textContent = `${area} ${selectedFloor} 설비도`;
    }
  }

  function invalidateUnifiedData() {
    unifiedDataLoadedAt = 0;
    calibrationCacheLoadedAt = 0;
  }

  async function loadUnifiedData(force = false) {
    const cacheIsFresh = Date.now() - unifiedDataLoadedAt < 60 * 1000;
    if (!force && cacheIsFresh) return unifiedData;
    if (unifiedDataLoadingPromise) return unifiedDataLoadingPromise;

    const readTable = async (label, query) => {
      const { data, error } = await query;
      if (error) {
        console.error(`${label} 통합조회 오류:`, error);
        return [];
      }
      return data || [];
    };

    unifiedDataLoadingPromise = Promise.all([
      readTable('TMS', supabaseClient.from('tms_equipment').select('id, major_category, tag_name, equipment_name, maintenance_history, created_at, updated_at').limit(1000)),
      readTable('로직', supabaseClient.from('logic_change_logs').select('id, major_category, equipment_name, change_content, change_reason, change_date, created_at').limit(1000)),
      readTable('자료', supabaseClient.from('maintenance_materials').select('id, major_category, title, description, material_type, original_file_name, uploaded_by_name, created_at').limit(1000)),
      readTable('할 일', supabaseClient.from('maintenance_todos').select('id, major_category, task_text, created_by_name, created_at, completed_at').limit(1000)),
      readTable('AI 점검', supabaseClient.from('ai_inspections').select('id, major_category, unit, title, question, ai_summary, checklist, result_summary, status, photo_urls, created_by_name, created_at, updated_at, completed_at').limit(1000)),
      getCalibrationRecords().catch(error => {
        console.error('교정 통합조회 오류:', error);
        return [];
      })
    ]).then(([tms, logic, materials, todos, aiInspections, calibrations]) => {
      unifiedData = { tms, logic, materials, todos, aiInspections, calibrations };
      unifiedDataLoadedAt = Date.now();
      return unifiedData;
    }).finally(() => {
      unifiedDataLoadingPromise = null;
    });
    return unifiedDataLoadingPromise;
  }

  function unifiedDate(value) {
    if (!value) return '-';
    const text = String(value);
    return text.includes('T') ? text.slice(0, 10) : text;
  }

  function instrumentMajor(item) {
    return item.major_category || ((item.unit || '').includes('내연') ? '내연' : '기력');
  }

  function historyZoneForInstrument(item) {
    const major = instrumentMajor(item);
    const unit = String(item.unit || '');
    if (major === '내연') return '내연';
    if (unit.includes('탈질')) return '탈질';
    if (unit.includes('연료펌프')) return '연료펌프룸';
    if (unit.includes('암모니아')) return '암모니아탱크';
    return '보일러';
  }

  function historyZoneFromLocation(location, major = '기력') {
    const text = String(location || '');
    if (major === '내연' || text.includes('내연')) return '내연';
    if (text.includes('탈질')) return '탈질';
    if (text.includes('연료펌프')) return '연료펌프룸';
    if (text.includes('암모니아')) return '암모니아탱크';
    return text ? '보일러' : '공통';
  }

  function updateHistoryFilterButtons() {
    document.querySelectorAll('[data-history-source]').forEach(button => {
      button.classList.toggle('active', button.dataset.historySource === selectedHistorySource);
    });
    document.querySelectorAll('[data-history-zone]').forEach(button => {
      button.classList.toggle('active', button.dataset.historyZone === selectedHistoryZone);
    });
  }

  window.setHistorySourceFilter = function(source) {
    selectedHistorySource = source;
    updateHistoryFilterButtons();
    renderHistoryTable();
  };

  window.setHistoryZoneFilter = function(zone) {
    selectedHistoryZone = zone;
    updateHistoryFilterButtons();
    renderHistoryTable();
  };

  function buildUnifiedHistoryRows() {
    const rows = [];
    const instrumentByTag = new Map(currentInstruments.map(item => [String(item.tag_no || '').trim().toLowerCase(), item]));

    currentInstruments.forEach(item => {
      const major = instrumentMajor(item);
      const zone = historyZoneForInstrument(item);
      rows.push({
        source: '설비 기본자료', major, zone, date: unifiedDate(item.updated_at || item.created_at), tag: item.tag_no || '-',
        name: item.name || '-', author: '-',
        content: [`모델 ${item.model || '-'}`, `범위 ${item.signal_range || '-'}`, `위치 ${item.unit || '-'} ${item.floor || '-'}`].join(' · '),
        sortDate: item.updated_at || item.created_at || '', action: 'instrument', instrumentId: item.id
      });
      (item.history_logs || []).forEach((log, historyIndex) => rows.push({
        source: '점검·정비', major, zone, date: unifiedDate(log.date), tag: item.tag_no || '-', name: item.name || '-',
        author: log.author || '-', content: log.content || '-', photo: log.photo || null,
        sortDate: log.date || '', action: 'maintenance', instrumentId: item.id, historyIndex
      }));
    });

    unifiedData.calibrations.forEach(record => {
      const tag = record['Tag No'] || '-';
      const instrument = instrumentByTag.get(String(tag).trim().toLowerCase());
      const location = record['설치위치'] || '';
      const major = instrument ? instrumentMajor(instrument) : (location.includes('내연') ? '내연' : '기력');
      const zone = instrument ? historyZoneForInstrument(instrument) : historyZoneFromLocation(location, major);
      rows.push({
        source: '교정정보', major, zone, date: unifiedDate(record['점검일자']), tag, name: record['기기명'] || instrument?.name || '-',
        author: [record['점검자'], record['감독자']].filter(Boolean).join(' / ') || '-',
        content: [`TYPE ${record.TYPE || '-'}`, `RANGE ${record.RANGE || '-'}`, `제작사 ${record['제작사'] || '-'}`, `모델 ${record['모델명'] || '-'}`, `위치 ${location || '-'}`].join(' · '),
        sortDate: record['점검일자'] || '', action: instrument ? 'calibration' : 'none', instrumentId: instrument?.id
      });
    });

    unifiedData.tms.forEach(record => rows.push({
      source: 'TMS', major: record.major_category || '기력', zone: '공통', date: unifiedDate(record.updated_at || record.created_at),
      tag: record.tag_name || '-', name: record.equipment_name || '-', author: '-',
      content: record.maintenance_history || '등록된 정비이력 없음', sortDate: record.updated_at || record.created_at || '',
      action: 'tms', record
    }));
    unifiedData.logic.forEach(record => rows.push({
      source: '로직', major: record.major_category || '기력', zone: '공통', date: unifiedDate(record.change_date || record.created_at),
      tag: '-', name: record.equipment_name || '-', author: '-',
      content: `수정내용 ${record.change_content || '-'} · 수정사유 ${record.change_reason || '-'}`,
      sortDate: record.change_date || record.created_at || '', action: 'logic'
    }));
    unifiedData.materials.forEach(record => rows.push({
      source: '자료', major: record.major_category || '기력', zone: '공통', date: unifiedDate(record.created_at), tag: '-',
      name: record.title || '-', author: record.uploaded_by_name || '-',
      content: [record.description, record.material_type, record.original_file_name].filter(Boolean).join(' · ') || '-',
      sortDate: record.created_at || '', action: 'materials'
    }));
    unifiedData.todos.forEach(record => rows.push({
      source: '할 일', major: record.major_category || '기력', zone: '공통', date: unifiedDate(record.completed_at || record.created_at),
      tag: '-', name: record.task_text || '-', author: record.created_by_name || '-',
      content: record.completed_at ? `완료 · ${unifiedDate(record.completed_at)}` : '진행 중',
      sortDate: record.completed_at || record.created_at || '', action: 'todo'
    }));
    unifiedData.aiInspections.forEach(record => {
      const checklist = Array.isArray(record.checklist) ? record.checklist : [];
      const completedCount = checklist.filter(item => item.completed).length;
      rows.push({
        source: 'AI 점검', major: record.major_category || '기력', zone: record.major_category === '내연' ? '내연' : '보일러',
        date: unifiedDate(record.completed_at || record.updated_at || record.created_at), tag: '-', name: record.title || 'AI 점검표',
        author: record.created_by_name || '-',
        content: [record.status, `${completedCount}/${checklist.length}개 확인`, record.result_summary || record.ai_summary].filter(Boolean).join(' · '),
        sortDate: record.completed_at || record.updated_at || record.created_at || '', action: 'aiInspection', record
      });
    });
    return rows.sort((a, b) => String(b.sortDate).localeCompare(String(a.sortDate)));
  }

  function excelDate(value) {
    if (!value) return '';
    const dateOnlyMatch = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = dateOnlyMatch
      ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
      : new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date;
  }

  function addExcelSheet(workbook, name, headers, rows, widths, dateColumns = []) {
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows], { cellDates: true });
    worksheet['!cols'] = widths.map(width => ({ wch: width }));
    worksheet['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: rows.length, c: headers.length - 1 }
      })
    };
    dateColumns.forEach(columnIndex => {
      for (let rowIndex = 1; rowIndex <= rows.length; rowIndex += 1) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
        if (cell?.v instanceof Date) cell.z = 'yyyy-mm-dd hh:mm';
      }
    });
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  }

  function checklistText(item = {}) {
    return item.task || item.content || item.title || item.name || '-';
  }

  function excelCellValue(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value;
    if (Array.isArray(value)) return value.join('\n');
    if (typeof value === 'object') return JSON.stringify(value);
    return value;
  }

  async function fetchAllExcelRows(table, columns = '*') {
    const pageSize = 1000;
    const rows = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabaseClient
        .from(table)
        .select(columns)
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(`${table} 자료 조회 실패: ${error.message}`);
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return rows;
  }

  async function exportAllDataToExcel() {
    const button = document.getElementById('btnExportExcel');
    if (!window.XLSX) {
      alert('Excel 생성 기능을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
      return;
    }

    const { data: authData } = await supabaseClient.auth.getSession();
    if (!authData.session) {
      alert('로그인 후 Excel 자료를 내려받을 수 있습니다.');
      return;
    }

    button.disabled = true;
    const originalLabel = button.innerHTML;
    button.textContent = 'Excel 만드는 중...';

    try {
      const [instruments, tms, logic, materials, todos, aiInspections, calibrations] = await Promise.all([
        fetchAllExcelRows('instruments'),
        fetchAllExcelRows('tms_equipment', 'id, major_category, tag_name, equipment_name, maintenance_history, created_at, updated_at'),
        fetchAllExcelRows('logic_change_logs', 'id, major_category, equipment_name, change_content, change_reason, change_date, created_at'),
        fetchAllExcelRows('maintenance_materials', 'id, major_category, title, description, material_type, original_file_name, uploaded_by_name, created_at'),
        fetchAllExcelRows('maintenance_todos', 'id, major_category, task_text, created_by_name, created_at, completed_at'),
        fetchAllExcelRows('ai_inspections', 'id, major_category, unit, title, question, ai_summary, checklist, result_summary, status, photo_urls, created_by_name, created_at, updated_at, completed_at'),
        fetchAllExcelRows('Instrumnet_calibration')
      ]);
      currentInstruments = instruments.map(normalizeInstrumentRecord);
      unifiedData = { tms, logic, materials, todos, aiInspections, calibrations };
      unifiedDataLoadedAt = Date.now();
      calibrationCache = calibrations;
      calibrationCacheLoadedAt = Date.now();
      const workbook = XLSX.utils.book_new();
      workbook.Props = {
        Title: '제주 발전 계측관리 전체 자료',
        Subject: '설비 및 유지관리 자료',
        Author: currentUserInfo.name || currentUserInfo.email || '제주 발전',
        CreatedDate: new Date()
      };

      const maintenanceRows = [];
      currentInstruments.forEach(instrument => {
        (instrument.history_logs || []).forEach(log => maintenanceRows.push([
          instrumentMajor(instrument), instrument.unit || '', instrument.floor || '', instrument.tag_no || '', instrument.name || '',
          excelDate(log.date), log.author || '', log.content || '', log.photo || ''
        ]));
      });

      const inspectionItemRows = [];
      unifiedData.aiInspections.forEach(inspection => {
        (Array.isArray(inspection.checklist) ? inspection.checklist : []).forEach((item, index) => inspectionItemRows.push([
          inspection.title || 'AI 점검표', index + 1, checklistText(item), item.completed ? '완료' : '미완료',
          item.result || item.status || '', item.note || item.memo || '', excelDate(inspection.updated_at || inspection.created_at)
        ]));
      });

      const fullHistoryRows = buildUnifiedHistoryRows();
      const summaryRows = [
        ['내보낸 날짜', excelDate(new Date())],
        ['내보낸 사용자', currentUserInfo.name || currentUserInfo.email || '-'],
        ['통합 이력', fullHistoryRows.length],
        ['설비', currentInstruments.length],
        ['점검·정비', maintenanceRows.length],
        ['교정정보', unifiedData.calibrations.length],
        ['TMS', unifiedData.tms.length],
        ['로직', unifiedData.logic.length],
        ['자료실', unifiedData.materials.length],
        ['할 일', unifiedData.todos.length],
        ['AI 점검', unifiedData.aiInspections.length],
        ['AI 점검항목', inspectionItemRows.length]
      ];
      addExcelSheet(workbook, '요약', ['항목', '값'], summaryRows, [22, 28], [1]);

      addExcelSheet(workbook, '통합이력', ['구분', '발전', '구역', '날짜', 'Tag No', '기기명·제목', '작업자', '등록 내용'],
        fullHistoryRows.map(row => [row.source, row.major, row.zone, excelDate(row.sortDate || row.date), row.tag, row.name, row.author, row.content]),
        [14, 10, 14, 18, 18, 28, 15, 60], [3]);

      addExcelSheet(workbook, '설비', ['발전', '호기·구역', '층', 'Tag No', '기기명', '모델', '신호범위', '도면 X', '도면 Y', '정비건수', '사진 URL', '등록일', '수정일'],
        currentInstruments.map(item => [instrumentMajor(item), item.unit || '', item.floor || '', item.tag_no || '', item.name || '', item.model || '', item.signal_range || '', item.coord_x ?? '', item.coord_y ?? '', (item.history_logs || []).length, item.photo_url || '', excelDate(item.created_at), excelDate(item.updated_at)]),
        [10, 16, 12, 18, 25, 20, 18, 10, 10, 10, 45, 18, 18], [11, 12]);

      addExcelSheet(workbook, '점검정비', ['발전', '호기·구역', '층', 'Tag No', '기기명', '작업일', '작업자', '점검·조치 내용', '사진 URL'],
        maintenanceRows, [10, 16, 12, 18, 25, 18, 15, 60, 45], [5]);

      const calibrationHeaders = [...new Set(unifiedData.calibrations.flatMap(record => Object.keys(record)))];
      addExcelSheet(workbook, '교정정보', calibrationHeaders.length ? calibrationHeaders : ['자료'],
        unifiedData.calibrations.map(record => calibrationHeaders.map(header => header.includes('일자') || header.endsWith('_at') ? excelDate(record[header]) : excelCellValue(record[header]))),
        (calibrationHeaders.length ? calibrationHeaders : ['자료']).map(header => Math.min(42, Math.max(12, String(header).length * 2 + 4))),
        calibrationHeaders.map((header, index) => header.includes('일자') || header.endsWith('_at') ? index : -1).filter(index => index >= 0));

      addExcelSheet(workbook, 'TMS', ['발전', 'Tag Name', '설비명', '정비이력', '등록일', '수정일'],
        unifiedData.tms.map(item => [item.major_category || '', item.tag_name || '', item.equipment_name || '', item.maintenance_history || '', excelDate(item.created_at), excelDate(item.updated_at)]),
        [10, 20, 28, 60, 18, 18], [4, 5]);

      addExcelSheet(workbook, '로직', ['발전', '설비명', '수정내용', '수정사유', '수정날짜', '등록일'],
        unifiedData.logic.map(item => [item.major_category || '', item.equipment_name || '', item.change_content || '', item.change_reason || '', excelDate(item.change_date), excelDate(item.created_at)]),
        [10, 28, 60, 45, 18, 18], [4, 5]);

      addExcelSheet(workbook, '자료실', ['발전', '제목', '설명', '자료종류', '파일명', '등록자', '등록일'],
        unifiedData.materials.map(item => [item.major_category || '', item.title || '', item.description || '', item.material_type || '', item.original_file_name || '', item.uploaded_by_name || '', excelDate(item.created_at)]),
        [10, 30, 60, 16, 35, 15, 18], [6]);

      addExcelSheet(workbook, '할일', ['발전·분류', '할 일', '등록자', '상태', '등록일', '완료일'],
        unifiedData.todos.map(item => [item.major_category || '', item.task_text || '', item.created_by_name || '', item.completed_at ? '완료' : '진행 중', excelDate(item.created_at), excelDate(item.completed_at)]),
        [14, 60, 15, 12, 18, 18], [4, 5]);

      addExcelSheet(workbook, 'AI점검', ['발전', '호기', '제목', '질문', 'AI 요약', '결과 요약', '상태', '점검항목', '완료항목', '사진 URL', '등록자', '등록일', '수정일', '완료일'],
        unifiedData.aiInspections.map(item => {
          const checklist = Array.isArray(item.checklist) ? item.checklist : [];
          return [item.major_category || '', item.unit || '', item.title || '', item.question || '', item.ai_summary || '', item.result_summary || '', item.status || '', checklist.length, checklist.filter(check => check.completed).length, excelCellValue(item.photo_urls), item.created_by_name || '', excelDate(item.created_at), excelDate(item.updated_at), excelDate(item.completed_at)];
        }), [10, 14, 28, 45, 60, 60, 12, 12, 12, 45, 15, 18, 18, 18], [11, 12, 13]);

      addExcelSheet(workbook, 'AI점검항목', ['점검표', '순번', '점검항목', '완료여부', '결과', '메모', '수정일'],
        inspectionItemRows, [28, 8, 60, 12, 18, 45, 18], [6]);

      const stamp = getLocalDateValue().replace(/-/g, '');
      XLSX.writeFile(workbook, `제주발전_관리자료_${stamp}.xlsx`, { compression: true, cellDates: true });
    } catch (error) {
      console.error('Excel 내보내기 오류:', error);
      alert(`Excel 파일을 만들지 못했습니다.\n${error?.message || '잠시 후 다시 시도해 주세요.'}`);
    } finally {
      button.disabled = false;
      button.innerHTML = originalLabel;
    }
  }

  document.getElementById('btnExportExcel').addEventListener('click', exportAllDataToExcel);

  window.openUnifiedHistoryRecord = function(rowIndex) {
    const row = window.currentUnifiedHistoryRows?.[rowIndex];
    if (!row) return;
    if (row.action === 'maintenance') {
      activeTargetId = row.instrumentId;
      openEditHistory(row.historyIndex, true);
    } else if (row.action === 'instrument') {
      activeTargetId = row.instrumentId;
      openEditInstModal(true);
    } else if (row.action === 'calibration') {
      activeTargetId = row.instrumentId;
      openCalibEditModal(true);
    } else if (row.action === 'tms') {
      switchMajor(row.major);
      switchSubTab('TMS(환경)');
      startTmsEdit(row.record);
    } else if (row.action === 'aiInspection') {
      openAiInspectionRecord(row.record);
    } else {
      const tabMap = { logic: '로직관리', materials: '자료실', todo: '할일' };
      if (tabMap[row.action]) {
        switchMajor(row.major);
        switchSubTab(tabMap[row.action]);
      }
    }
  };

  window.renderHistoryTable = async function() {
    const tbody = document.getElementById('historyTableBody');
    const filterText = (document.getElementById('tableFilterInput').value || '').trim().toLowerCase();
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b;">통합 관리이력을 불러오는 중입니다.</td></tr>';
    await loadUnifiedData();
    let rows = buildUnifiedHistoryRows();
    if (selectedMainMenu !== '정비이력') rows = rows.filter(row => row.major === selectedMajor);
    if (selectedHistorySource !== '전체') rows = rows.filter(row => row.source === selectedHistorySource);
    if (selectedHistoryZone !== '전체') rows = rows.filter(row => row.zone === selectedHistoryZone);
    if (filterText) {
      rows = rows.filter(row => [row.source, row.major, row.zone, row.date, row.tag, row.name, row.author, row.content]
        .some(value => String(value || '').toLowerCase().includes(filterText)));
    }
    const sourceLabel = selectedHistorySource === '전체' ? '전체 데이터' : selectedHistorySource;
    const zoneLabel = selectedHistoryZone === '전체' ? '전체 구역' : selectedHistoryZone;
    const scopeLabel = selectedMainMenu === '정비이력' ? '전체 발전소' : `${selectedMajor}발전`;
    document.getElementById('historyTableTitle').innerText = `📋 [${scopeLabel}] ${sourceLabel} · ${zoneLabel} (${rows.length}건)`;
    window.currentUnifiedHistoryRows = rows;
    tbody.replaceChildren();
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: #64748b;">조건에 맞는 등록 정보가 없습니다.</td></tr>`;
      return;
    }
    rows.forEach((row, rowIndex) => {
      const tr = document.createElement('tr');
      const values = [row.source, row.date, row.tag, row.name, row.author, row.content];
      values.forEach((value, index) => {
        const td = document.createElement('td');
        if (index === 0) {
          const badge = document.createElement('span');
          badge.className = `badge-category ${row.major === '내연' ? 'badge-engine' : 'badge-steam'}`;
          badge.textContent = row.source;
          const major = document.createElement('div');
          major.className = 'history-source';
          major.textContent = `${row.major}발전 · ${row.zone || '공통'}`;
          td.append(badge, major);
        } else {
          td.textContent = value || '-';
          if ([1, 2, 3, 4].includes(index)) td.style.whiteSpace = 'nowrap';
          if (index === 2) {
            td.style.fontWeight = 'bold';
            td.style.color = '#38bdf8';
          }
        }
        tr.appendChild(td);
      });
      const actionCell = document.createElement('td');
      if (row.action !== 'none') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'history-action-btn';
        button.textContent = ['maintenance', 'instrument', 'calibration', 'tms'].includes(row.action) ? '수정' : '열기';
        button.addEventListener('click', () => openUnifiedHistoryRecord(rowIndex));
        actionCell.appendChild(button);
      } else {
        actionCell.textContent = '-';
      }
      tr.appendChild(actionCell);
      tbody.appendChild(tr);
    });
  };

  async function fetchManuals() {
    const { data } = await supabaseClient.from('manuals').select('*');
    currentManuals = data || [];
  }

  window.startNewChat = function() {
    currentChatSessionId = 'session_' + Date.now();
    currentChatMessages = [];
    const chatBox = document.getElementById('aiChatBox');
    chatBox.innerHTML = `<div class="ai-msg ai-msg-bot">새로운 대화가 시작되었습니다. 앞 대화와 분리해 새로 답변합니다. 무엇을 도와드릴까요?</div>`;
  };

  window.switchAiTab = async function(tab) {
    const chatView = document.getElementById('aiChatView');
    const historyView = document.getElementById('aiHistoryView');
    const btnChat = document.getElementById('btnAiTabChat');
    const btnHistory = document.getElementById('btnAiTabHistory');
    if (tab === 'chat') {
      chatView.style.display = 'block';
      historyView.style.display = 'none';
      btnChat.classList.add('active');
      btnHistory.classList.remove('active');
    } else {
      chatView.style.display = 'none';
      historyView.style.display = 'block';
      btnChat.classList.remove('active');
      btnHistory.classList.add('active');
      await loadSavedAiHistory();
    }
  };

  async function loadSavedAiHistory() {
    const box = document.getElementById('aiSavedHistoryBox');
    box.innerHTML = '<div style="color: #94a3b8; font-size: 12px; text-align: center; padding: 20px;">불러오는 중...</div>';
    const workerName = currentUserInfo.name || localStorage.getItem('jeju_worker_name') || '작업자';
    const { data, error } = await supabaseClient
      .from('ai_chat_history')
      .select('*')
      .eq('user_name', workerName)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error || !data || data.length === 0) {
      box.innerHTML = `<div style="color: #64748b; font-size: 12px; text-align: center; padding: 20px;">
        저장된 본인의 질의 기록이 없습니다.<br>
        (질문 및 답변은 자동으로 저장됩니다)
      </div>`;
      return;
    }
    box.innerHTML = data.map(item => `
      <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; margin-bottom: 6px; font-size: 12px;">
        <div style="display: flex; justify-content: space-between; color: #64748b; font-size: 10px; margin-bottom: 4px;">
          <span>👤 ${item.user_name || '작업자'} (세션: ${item.session_id ? item.session_id.slice(-6) : '기본'})</span>
          <span>${item.created_at ? item.created_at.slice(0, 16).replace('T', ' ') : ''}</span>
        </div>
        <div style="color: #0284c7; font-weight: bold; margin-bottom: 2px;">Q: ${item.prompt}</div>
        <div style="color: #334155; white-space: pre-wrap; line-height: 1.3;">A: ${item.response}</div>
      </div>
    `).join('');
  }

  document.getElementById('btnOpenGemini').addEventListener('click', async () => {
    switchMainMenu('AI점검');
  });

  async function fetchMaterialMetadata() {
    const { data, error } = await supabaseClient
      .from('maintenance_materials')
      .select('title, description, material_type, original_file_name, major_category')
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error) currentMaterials = data || [];
  }

  const EQUIPMENT_SEARCH_ALIASES = [
    ['soot blower', 'sootblower', 'shoot blower', 'shootblower', '슈트 블로어', '슈트블로어', '수트 블로어', '수트블로어', '슈트 블로워', '그을음 제거기'],
    ['positioner', 'valve positioner', '포지셔너', '포지셔너', '밸브 포지셔너'],
    ['transmitter', '트랜스미터', '전송기'],
    ['pressure transmitter', 'pt', '압력 전송기', '압력전송기', '압력 트랜스미터'],
    ['temperature transmitter', 'tt', '온도 전송기', '온도전송기', '온도 트랜스미터'],
    ['flow transmitter', 'ft', '유량 전송기', '유량전송기', '유량 트랜스미터'],
    ['level transmitter', 'lt', '레벨 전송기', '레벨전송기', '수위 전송기'],
    ['control valve', 'cv', '컨트롤 밸브', '조절 밸브', '조절밸브', '제어 밸브'],
    ['solenoid valve', 'sv', '솔레노이드 밸브', '솔밸브', '전자 밸브'],
    ['limit switch', 'ls', '리미트 스위치', '리밋 스위치', '한계 스위치'],
    ['pressure gauge', 'pg', '압력 게이지', '압력계'],
    ['differential pressure', 'dp', '차압', '차압계'],
    ['thermocouple', 'tc', '열전대', '써모커플'],
    ['resistance temperature detector', 'rtd', '측온 저항체', '측온저항체'],
    ['actuator', '액추에이터', '액츄에이터', '구동기'],
    ['analyzer', 'analyser', '애널라이저', '분석기'],
    ['damper', '댐퍼', '담파'],
    ['pump', '펌프'],
    ['fan', '팬', '송풍기'],
    ['induced draft fan', 'idf', '유인 통풍기', '유인통풍기'],
    ['forced draft fan', 'fdf', '압입 통풍기', '압입통풍기'],
    ['boiler', '보일러'],
    ['burner', '버너'],
    ['continuous emission monitoring system', 'cems', 'tms', '굴뚝 자동측정기기', '굴뚝자동측정기기']
  ];

  const SEARCH_STOP_WORDS = new Set([
    '그거', '그것', '이거', '저거', '어떻게', '무엇', '뭐가', '왜', '설명', '알려줘',
    '확인', '질문', '대한', '관련', '방법', '검색', '찾아줘', '보여줘', '장비', '설비'
  ]);

  function normalizeEquipmentSearchText(value) {
    return String(value || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^0-9a-z가-힣]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function compactEquipmentSearchText(value) {
    return normalizeEquipmentSearchText(value).replace(/\s+/g, '');
  }

  function getEquipmentSearchTokens(value) {
    return normalizeEquipmentSearchText(value).split(' ')
      .filter(token => token.length >= 2 && !SEARCH_STOP_WORDS.has(token));
  }

  function aliasMatchesText(alias, normalized, compact, tokens) {
    const aliasNormalized = normalizeEquipmentSearchText(alias);
    const aliasCompact = aliasNormalized.replace(/\s+/g, '');
    if (!aliasCompact) return false;
    if (aliasCompact.length <= 3) return tokens.includes(aliasCompact);
    return compact.includes(aliasCompact) || normalized.includes(aliasNormalized);
  }

  function buildEquipmentSearchForms(value) {
    const normalized = normalizeEquipmentSearchText(value);
    const compact = normalized.replace(/\s+/g, '');
    const tokens = getEquipmentSearchTokens(value);
    const forms = new Set([normalized, compact, ...tokens].filter(Boolean));

    EQUIPMENT_SEARCH_ALIASES.forEach(group => {
      if (!group.some(alias => aliasMatchesText(alias, normalized, compact, tokens))) return;
      group.forEach(alias => {
        const aliasNormalized = normalizeEquipmentSearchText(alias);
        if (!aliasNormalized) return;
        forms.add(aliasNormalized);
        forms.add(aliasNormalized.replace(/\s+/g, ''));
      });
    });
    return forms;
  }

  function levenshteinDistance(left, right) {
    const a = String(left || '');
    const b = String(right || '');
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      for (let j = 1; j <= b.length; j += 1) {
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      previous = current;
    }
    return previous[b.length];
  }

  function searchSimilarity(left, right) {
    if (!left || !right) return 0;
    const maxLength = Math.max(left.length, right.length);
    if (maxLength < 4 || Math.abs(left.length - right.length) > Math.max(3, Math.floor(maxLength * .35))) return 0;
    return 1 - (levenshteinDistance(left, right) / maxLength);
  }

  function scoreEquipmentSearch(fields, searchText) {
    const queryNormalized = normalizeEquipmentSearchText(searchText);
    const queryCompact = queryNormalized.replace(/\s+/g, '');
    const queryTokens = getEquipmentSearchTokens(searchText);
    const queryForms = buildEquipmentSearchForms(searchText);
    if (!queryCompact) return 0;

    let totalScore = 0;
    (fields || []).forEach(rawField => {
      const fieldNormalized = normalizeEquipmentSearchText(rawField);
      const fieldCompact = fieldNormalized.replace(/\s+/g, '');
      if (!fieldCompact) return;
      const fieldTokens = getEquipmentSearchTokens(rawField);
      const fieldForms = buildEquipmentSearchForms(rawField);
      let fieldScore = 0;

      if (fieldCompact === queryCompact) fieldScore = Math.max(fieldScore, 120);
      if (queryCompact.length >= 2 && fieldCompact.includes(queryCompact)) fieldScore = Math.max(fieldScore, 95);
      if (fieldCompact.length >= 4 && queryCompact.includes(fieldCompact)) fieldScore = Math.max(fieldScore, 45);

      const sharedForms = [...queryForms].filter(form => form.length >= 2 && fieldForms.has(form));
      if (sharedForms.length) fieldScore = Math.max(fieldScore, 82 + Math.min(sharedForms.length, 5));

      const sharedTokens = queryTokens.filter(token => fieldTokens.includes(token));
      fieldScore += sharedTokens.length * 18;

      const fuzzyCandidates = new Set([fieldCompact, ...fieldTokens, ...fieldForms]);
      let bestSimilarity = 0;
      queryForms.forEach(queryForm => {
        if (queryForm.length < 4) return;
        fuzzyCandidates.forEach(fieldForm => {
          if (fieldForm.length < 4) return;
          bestSimilarity = Math.max(bestSimilarity, searchSimilarity(queryForm, fieldForm));
        });
      });
      if (bestSimilarity >= .72) fieldScore = Math.max(fieldScore, Math.round(bestSimilarity * 70));
      totalScore += fieldScore;
    });
    return totalScore;
  }

  function rankAiRecords(records, searchText, fieldGetter, limit = 8) {
    if (!compactEquipmentSearchText(searchText)) return [];

    return (records || []).map(record => {
      return { record, score: scoreEquipmentSearch(fieldGetter(record), searchText) };
    })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.record);
  }

  async function getCalibrationRecords() {
    const cacheAge = Date.now() - calibrationCacheLoadedAt;
    if (calibrationCache.length > 0 && cacheAge < 5 * 60 * 1000) return calibrationCache;
    const { data, error } = await supabaseClient
      .from('Instrumnet_calibration')
      .select('*')
      .limit(500);
    if (error) throw error;
    calibrationCache = data || [];
    calibrationCacheLoadedAt = Date.now();
    return calibrationCache;
  }

  function buildChatHistoryForApi() {
    return currentChatMessages.slice(-12).map(message => ({
      role: message.role,
      text: String(message.text || '').slice(0, 2500)
    }));
  }

  async function callGemini(userPrompt, extraContext = '', targetPhotos = []) {
    if (isAiRequestPending) return;
    isAiRequestPending = true;
    const sendButton = document.getElementById('btnSendAi');
    sendButton.disabled = true;
    appendAiMsg('user', userPrompt);
    appendAiMsg('bot', '⏳ 앞 대화와 관련 설비 자료를 함께 확인 중...');
    let photosToSend = [...targetPhotos];
    const contextSections = [];
    if (extraContext) contextSections.push(extraContext);

    const recentUserQuestions = currentChatMessages
      .filter(message => message.role === 'user')
      .slice(-3)
      .map(message => message.text);
    const searchText = [userPrompt, ...recentUserQuestions].join(' ');

    contextSections.push(`📍 [현재 화면 범위]\n발전구분: ${selectedMajor} | 메뉴: ${selectedSubTab} | 구역: ${selectedSection} | 층: ${selectedFloor}`);

    try {
      const calibList = await getCalibrationRecords();
      const matchedCalib = rankAiRecords(calibList, searchText, c => [
        c["Tag No"], c["기기명"], c["TYPE"], c["설치위치"], c["제작사"], c["모델명"]
      ]);
      if (matchedCalib.length > 0) {
        contextSections.push("📋 [질문과 관련된 교정 성적서]:\n" + matchedCalib.map(c =>
          `- [Tag: ${c["Tag No"] || '-'}] 기기명: ${c["기기명"] || '-'} | TYPE: ${c["TYPE"] || '-'} | 설치위치: ${c["설치위치"] || '-'} | 제작사: ${c["제작사"] || '-'} | 모델명: ${c["모델명"] || '-'} | 측정범위(RANGE): ${c["RANGE"] || '-'} | 점검일자: ${c["점검일자"] || '-'} | 점검자/감독자: ${c["점검자"] || '-'} / ${c["감독자"] || '-'}`
        ).join('\n'));
      }
    } catch (e) {
      console.warn("교정 데이터 조회 건너뜀:", e);
    }

    const matchedInsts = rankAiRecords(currentInstruments, searchText, inst => [
      inst.tag_no, inst.name, inst.model, inst.signal_range, inst.floor, inst.unit, inst.major_category
    ]);
    if (matchedInsts.length > 0) {
      contextSections.push("🔍 [질문과 관련된 등록 계측기]:\n" + matchedInsts.map(i =>
        `- Tag: ${i.tag_no || '-'}, 기기명: ${i.name || '-'}, 위치: ${i.major_category || '-'} ${i.unit || '-'} ${i.floor || '-'}, 모델: ${i.model || '-'}, 범위: ${i.signal_range || '-'}`
      ).join('\n'));
    }

    const matchedMaterials = rankAiRecords(currentMaterials, searchText, material => [
      material.title, material.description, material.material_type, material.original_file_name, material.major_category
    ], 5);
    if (matchedMaterials.length > 0) {
      contextSections.push("📁 [질문과 관련된 자료실 항목]:\n" + matchedMaterials.map(material =>
        `- ${material.title || material.original_file_name || '-'} | 구분: ${material.material_type || '-'} | 설명: ${material.description || '-'} | 파일명: ${material.original_file_name || '-'}`
      ).join('\n'));
    }

    const enrichedContext = contextSections.filter(Boolean).join('\n\n').slice(0, 16000);
    const history = buildChatHistoryForApi();

    try {
      const { data, error } = await supabaseClient.functions.invoke('gemini-chat', {
        body: { prompt: userPrompt, history, extraContext: enrichedContext, photosToSend, mode: 'chat' }
      });

      const lastMsg = document.querySelector('#aiChatBox .ai-msg-bot:last-child');
      if (!error && data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        const reply = cleanAiReplyText(data.candidates[0].content.parts[0].text);
        if (lastMsg && lastMsg.innerText.includes('⏳')) renderAiReply(lastMsg, reply);
        else appendAiMsg('bot', reply);
        currentChatMessages.push(
          { role: 'user', text: userPrompt },
          { role: 'model', text: reply }
        );
        currentChatMessages = currentChatMessages.slice(-12);

        const workerName = currentUserInfo.name || localStorage.getItem('jeju_worker_name') || '작업자';
        await supabaseClient.from('ai_chat_history').insert([{
          user_name: workerName,
          session_id: currentChatSessionId,
          prompt: userPrompt,
          response: reply,
          created_at: new Date().toISOString()
        }]);
      } else {
        const errMsg = error ? error.message : (data?.error ? JSON.stringify(data.error) : '응답 분석 오류');
        if (lastMsg && lastMsg.innerText.includes('⏳')) lastMsg.innerText = `❌ 서버 오류: ${errMsg}`;
      }
    } catch (err) {
      const lastMsg = document.querySelector('#aiChatBox .ai-msg-bot:last-child');
      if (lastMsg && lastMsg.innerText.includes('⏳')) lastMsg.innerText = `❌ 통신 실패: ${err.message}`;
    } finally {
      isAiRequestPending = false;
      sendButton.disabled = false;
    }
  }

  function inspectionItem(task = '') {
    return {
      id: (crypto.randomUUID ? crypto.randomUUID() : `item_${Date.now()}_${Math.random()}`),
      task: String(task || '').trim(), completed: false, status: '미확인', value: '', memo: ''
    };
  }

  function setInspectionStatus(elementId, message, type = '') {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.className = `inspection-status${type ? ` ${type}` : ''}`;
  }

  function renderInspectionItems() {
    const list = document.getElementById('aiInspectionList');
    list.replaceChildren();
    if (!currentInspectionItems.length) {
      const empty = document.createElement('div');
      empty.className = 'managed-empty';
      empty.textContent = '질문을 입력해 점검표를 생성하거나 항목을 직접 추가하세요.';
      list.appendChild(empty);
      return;
    }

    currentInspectionItems.forEach(item => {
      const row = document.createElement('div');
      row.className = `inspection-item${item.completed ? ' completed' : ''}`;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'inspection-check';
      checkbox.checked = Boolean(item.completed);
      checkbox.setAttribute('aria-label', `${item.task || '점검 항목'} 완료`);
      checkbox.addEventListener('change', () => {
        item.completed = checkbox.checked;
        row.classList.toggle('completed', item.completed);
      });

      const body = document.createElement('div');
      body.className = 'inspection-item-body';
      const taskInput = document.createElement('input');
      taskInput.className = 'inspection-task';
      taskInput.value = item.task;
      taskInput.placeholder = '점검할 내용을 입력하세요';
      taskInput.addEventListener('input', () => { item.task = taskInput.value; });

      const fields = document.createElement('div');
      fields.className = 'inspection-fields';
      const status = document.createElement('select');
      ['미확인', '정상', '이상'].forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        option.selected = item.status === value;
        status.appendChild(option);
      });
      status.addEventListener('change', () => { item.status = status.value; });
      const valueInput = document.createElement('input');
      valueInput.value = item.value || '';
      valueInput.placeholder = '측정값';
      valueInput.addEventListener('input', () => { item.value = valueInput.value; });
      const memoInput = document.createElement('input');
      memoInput.value = item.memo || '';
      memoInput.placeholder = '상태·메모';
      memoInput.addEventListener('input', () => { item.memo = memoInput.value; });
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'inspection-danger';
      deleteButton.textContent = '삭제';
      deleteButton.addEventListener('click', () => {
        currentInspectionItems = currentInspectionItems.filter(record => record.id !== item.id);
        renderInspectionItems();
      });
      fields.append(status, valueInput, memoInput, deleteButton);
      body.append(taskInput, fields);
      row.append(checkbox, body);
      list.appendChild(row);
    });
  }

  function parseInspectionReply(reply) {
    const text = cleanAiReplyText(reply);
    const checklistBlock = text.match(/\[CHECKLIST\]([\s\S]*?)\[\/CHECKLIST\]/i)?.[1] || '';
    const flowBlock = text.match(/\[FLOW\]([\s\S]*?)\[\/FLOW\]/i)?.[1] || '';
    let candidates = checklistBlock
      .split(/\r?\n/)
      .map(line => line.replace(/^\s*(?:[-*•☐□]|\d+[.)])\s*/, '').trim())
      .filter(Boolean);
    if (candidates.length < 2 && flowBlock) {
      candidates = flowBlock.split(/\r?\n|\s*(?:--+>|→|➡️?|➜)\s*/).map(value => value.trim()).filter(Boolean);
    }
    if (candidates.length < 2) {
      candidates = text.split(/\r?\n/)
        .map(line => line.match(/^\s*(?:[-*•☐□]|\d+[.)])\s*(.+)$/)?.[1]?.trim())
        .filter(Boolean);
    }
    const summaryBlock = text.match(/\[SUMMARY\]([\s\S]*?)\[\/SUMMARY\]/i)?.[1]?.trim();
    const summary = summaryBlock || text
      .replace(/\[CHECKLIST\][\s\S]*?\[\/CHECKLIST\]/gi, '')
      .replace(/\[FLOW\][\s\S]*?\[\/FLOW\]/gi, '')
      .replace(/\[SUMMARY\]|\[\/SUMMARY\]/gi, '')
      .trim()
      .slice(0, 700);
    return {
      summary: summary || '우선순위가 높은 항목부터 차례로 확인하세요.',
      items: [...new Set(candidates)].slice(0, 8)
    };
  }

  async function generateInspectionChecklist() {
    const question = document.getElementById('aiInspectionQuestion').value.trim();
    if (!question) {
      setInspectionStatus('aiInspectionGenerateStatus', '점검할 증상을 입력해 주세요.', 'error');
      return;
    }
    const button = document.getElementById('btnGenerateInspection');
    button.disabled = true;
    setInspectionStatus('aiInspectionGenerateStatus', '관련 설비·이력을 확인해 점검표를 만드는 중입니다.');
    const request = `다음 현장 증상에 대해 군더더기 없이 답하세요. 결론은 2문장 이내로 작성하고, 실제 확인할 점검 항목은 3~6개로 제한하세요. 반드시 아래 형식을 지키세요.\n[SUMMARY]짧은 결론[/SUMMARY]\n[FLOW]첫 단계 → 다음 단계 → 정상 확인[/FLOW]\n[CHECKLIST]\n- 점검 항목 1\n- 점검 항목 2\n[/CHECKLIST]\n현장 증상: ${question}`;
    try {
      const { data, error } = await supabaseClient.functions.invoke('gemini-chat', {
        body: {
          prompt: request,
          history: [],
          extraContext: `발전구분: ${selectedMajor} | 설비: ${lastEquipmentUnit[selectedMajor]} | 구역: ${selectedSection}`,
          photosToSend: [],
          mode: 'chat'
        }
      });
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (error || !reply) throw new Error(error?.message || 'AI 응답을 확인하지 못했습니다.');
      const parsed = parseInspectionReply(reply);
      currentInspectionSummary = parsed.summary;
      currentInspectionItems = parsed.items.length
        ? parsed.items.map(task => inspectionItem(task))
        : [inspectionItem('현장 전원·신호 상태 확인'), inspectionItem('배선 및 단자 상태 확인'), inspectionItem('조치 후 정상 동작 확인')];
      document.getElementById('aiInspectionSummary').textContent = currentInspectionSummary;
      renderInspectionItems();
      setInspectionStatus('aiInspectionGenerateStatus', `점검 항목 ${currentInspectionItems.length}개를 만들었습니다.`, 'success');
    } catch (error) {
      console.error('AI 점검표 생성 오류:', error);
      setInspectionStatus('aiInspectionGenerateStatus', `점검표를 만들지 못했습니다: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function saveInspection(complete = false) {
    const question = document.getElementById('aiInspectionQuestion').value.trim();
    const items = currentInspectionItems
      .map(item => ({ ...item, task: String(item.task || '').trim() }))
      .filter(item => item.task);
    if (!question || !items.length) {
      setInspectionStatus('aiInspectionSaveStatus', '질문과 점검 항목을 입력해 주세요.', 'error');
      return;
    }
    const { data: authData } = await supabaseClient.auth.getUser();
    const user = authData?.user;
    if (!user) {
      setInspectionStatus('aiInspectionSaveStatus', '로그인 상태를 확인해 주세요.', 'error');
      return;
    }
    setInspectionStatus('aiInspectionSaveStatus', complete ? '점검 결과를 관리이력에 저장하는 중입니다.' : '점검표를 임시 저장하는 중입니다.');
    for (const file of pendingInspectionPhotoFiles.slice(0, 5)) {
      const url = await uploadImageToStorage(file);
      if (url) currentInspectionPhotos.push(url);
    }
    pendingInspectionPhotoFiles = [];
    document.getElementById('aiInspectionPhotos').value = '';
    const now = new Date().toISOString();
    const resultLines = items.map((item, index) => `${index + 1}. ${item.task} · ${item.status}${item.value ? ` · ${item.value}` : ''}${item.memo ? ` · ${item.memo}` : ''}`);
    const payload = {
      major_category: selectedMajor,
      unit: lastEquipmentUnit[selectedMajor] || '',
      title: question.slice(0, 200),
      question,
      ai_summary: currentInspectionSummary,
      checklist: items,
      photo_urls: currentInspectionPhotos,
      result_summary: complete ? resultLines.join('\n') : '',
      status: complete ? '완료' : '진행중',
      created_by_name: currentUserInfo.name || localStorage.getItem('jeju_worker_name') || '작업자',
      updated_at: now,
      completed_at: complete ? now : null
    };
    const query = currentInspectionId
      ? supabaseClient.from('ai_inspections').update(payload).eq('id', currentInspectionId)
      : supabaseClient.from('ai_inspections').insert([payload]);
    const { data, error } = await query.select('id').single();
    if (error || !data?.id) {
      console.error('AI 점검 저장 오류:', error);
      setInspectionStatus('aiInspectionSaveStatus', '점검표를 저장하지 못했습니다.', 'error');
      return;
    }
    currentInspectionId = data.id;
    currentInspectionItems = items;
    invalidateUnifiedData();
    setInspectionStatus('aiInspectionSaveStatus', complete ? '점검 결과를 관리이력에 저장했습니다.' : '점검표를 임시 저장했습니다.', 'success');
  }

  function applyInspectionRecord(record) {
    currentInspectionId = record?.id || null;
    currentInspectionSummary = record?.ai_summary || '';
    currentInspectionItems = Array.isArray(record?.checklist) ? record.checklist.map(item => ({ ...inspectionItem(), ...item })) : [];
    currentInspectionPhotos = Array.isArray(record?.photo_urls) ? [...record.photo_urls] : [];
    document.getElementById('aiInspectionQuestion').value = record?.question || '';
    document.getElementById('aiInspectionSummary').textContent = currentInspectionSummary;
    renderInspectionItems();
    setInspectionStatus('aiInspectionSaveStatus', record ? `${record.status} 점검표를 불러왔습니다.` : '');
  }

  async function loadLatestInspection() {
    const { data, error } = await supabaseClient
      .from('ai_inspections')
      .select('*')
      .eq('major_category', selectedMajor)
      .eq('status', '진행중')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) applyInspectionRecord(data);
  }

  window.openAiInspectionRecord = function(record) {
    switchMajor(record.major_category || '기력');
    switchSubTab('AI점검');
    applyInspectionRecord(record);
  };

  function resetInspectionForm() {
    currentInspectionId = null;
    currentInspectionItems = [];
    currentInspectionSummary = '';
    currentInspectionPhotos = [];
    pendingInspectionPhotoFiles = [];
    document.getElementById('aiInspectionQuestion').value = '';
    document.getElementById('aiInspectionPhotos').value = '';
    document.getElementById('aiInspectionSummary').textContent = '';
    setInspectionStatus('aiInspectionGenerateStatus', '');
    setInspectionStatus('aiInspectionSaveStatus', '');
    renderInspectionItems();
  }

  document.getElementById('btnGenerateInspection').addEventListener('click', generateInspectionChecklist);
  document.getElementById('btnAddInspectionItem').addEventListener('click', () => {
    currentInspectionItems.push(inspectionItem(''));
    renderInspectionItems();
    document.querySelector('#aiInspectionList .inspection-item:last-child .inspection-task')?.focus();
  });
  document.getElementById('btnSaveInspectionDraft').addEventListener('click', () => saveInspection(false));
  document.getElementById('btnCompleteInspection').addEventListener('click', () => saveInspection(true));
  document.getElementById('btnNewInspection').addEventListener('click', resetInspectionForm);
  document.getElementById('aiInspectionPhotos').addEventListener('change', event => {
    pendingInspectionPhotoFiles = [...(event.target.files || [])].slice(0, 5);
    setInspectionStatus('aiInspectionGenerateStatus', pendingInspectionPhotoFiles.length ? `사진 ${pendingInspectionPhotoFiles.length}장을 선택했습니다.` : '');
  });

  window.triggerNewPhotoOcr = async function() {
    if (!pendingInstPhotoFile) {
      alert('⚠️ 먼저 촬영하거나 앨범에서 사진을 선택해 주세요.');
      return;
    }
    const btn = document.getElementById('btnExtractNewPhoto');
    const origText = btn.innerText;
    btn.innerText = '⏳ 사진에서 명판 및 상태 분석 중...';
    btn.disabled = true;
    try {
      await autoFillTagFromPhoto(pendingInstPhotoFile, 'insert');
    } finally {
      btn.innerText = origText;
      btn.disabled = false;
    }
  };

  window.extractCurrentPhotoInfo = async function() {
    const target = currentInstruments.find(i => i.id === activeTargetId);
    if (!target || !(target.photo_url || target.image_data)) {
      alert('⚠️ 현재 등록된 대표 사진이 없습니다.');
      return;
    }
    const extractBtn = document.getElementById('btnExtractCurrentPhoto');
    const origText = extractBtn ? extractBtn.innerText : '';
    if (extractBtn) {
      extractBtn.innerText = '⏳ 사진에서 명판 정보 정밀 추출 중...';
      extractBtn.style.opacity = '0.7';
      extractBtn.disabled = true;
    }
    try {
      await autoFillTagFromPhoto(target.photo_url || target.image_data, 'update');
    } finally {
      if (extractBtn) {
        extractBtn.innerText = origText;
        extractBtn.style.opacity = '1';
        extractBtn.disabled = false;
      }
    }
  };

  function populateEditUnitOptions(major, selectedUnit = '') {
    const select = document.getElementById('editUnit');
    const options = major === '내연'
      ? [
          ['1호기', '1호기'],
          ['2호기', '2호기']
        ]
      : [
          ['2호기', '2호기 보일러'],
          ['3호기', '3호기 보일러'],
          ['2호기_탈질', '2호기 탈질'],
          ['3호기_탈질', '3호기 탈질'],
          ['연료펌프룸', '연료펌프룸'],
          ['암모니아탱크', '암모니아탱크']
        ];
    select.replaceChildren();
    options.forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    });
    if (options.some(([value]) => value === selectedUnit)) select.value = selectedUnit;
  }

  document.getElementById('editMajor').addEventListener('change', event => {
    populateEditUnitOptions(event.target.value);
  });

  window.openEditInstModal = function(openedFromHistory = false) {
    const target = currentInstruments.find(i => i.id === activeTargetId);
    if (!target) return;
    instrumentEditOpenedFromHistory = openedFromHistory;
    const targetMajor = instrumentMajor(target);
    document.getElementById('editTagNo').value = target.tag_no || '';
    document.getElementById('editName').value = target.name || '';
    document.getElementById('editMajor').value = targetMajor;
    populateEditUnitOptions(targetMajor, target.unit || '');
    document.getElementById('editFloor').value = target.floor || '6층';
    document.getElementById('editModel').value = target.model || '';
    document.getElementById('editRange').value = target.signal_range || '';
    pendingEditInstPhotoFile = null;
    document.getElementById('editInstPhotoCam').value = '';
    document.getElementById('editInstPhotoGallery').value = '';
    const preview = document.getElementById('editInstPhotoPreview');
    const currentImg = target.photo_url || target.image_data;
    if (currentImg) {
      preview.src = currentImg;
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }
    document.getElementById('edit-inst-modal').style.display = 'block';
  };

  window.openCalibEditModal = async function(openedFromHistory = false) {
    const target = currentInstruments.find(i => i.id === activeTargetId);
    if (!target) return;
    calibrationEditOpenedFromHistory = openedFromHistory;

    const hud = document.getElementById('measure-info-hud');
    if (hud) {
      hud.style.display = 'block';
      hud.innerText = `⏳ [${target.tag_no}] 교정 성적서 데이터 조회 중...`;
    }

    const { data, error } = await supabaseClient
      .from('Instrumnet_calibration')
      .select('*')
      .eq('Tag No', target.tag_no)
      .maybeSingle();

    if (hud && !isMeasureMode) hud.style.display = 'none';

    if (error) {
      alert('⚠️ 교정 데이터 조회 실패: ' + error.message);
      return;
    }

    activeCalibRecord = data || { "Tag No": target.tag_no, "기기명": target.name, "모델명": target.model, "RANGE": target.signal_range };

    document.getElementById('calibTagNo').value = activeCalibRecord["Tag No"] || target.tag_no || '';
    document.getElementById('calibName').value = activeCalibRecord["기기명"] || target.name || '';
    document.getElementById('calibType').value = activeCalibRecord["TYPE"] || '';
    document.getElementById('calibRange').value = activeCalibRecord["RANGE"] || target.signal_range || '';
    document.getElementById('calibLocation').value = activeCalibRecord["설치위치"] || `${target.major_category || '기력'} ${target.unit || '2호기'} ${target.floor}`;
    document.getElementById('calibMaker').value = activeCalibRecord["제작사"] || '';
    document.getElementById('calibModel').value = activeCalibRecord["모델명"] || target.model || '';
    document.getElementById('calibDate').value = activeCalibRecord["점검일자"] || '';
    document.getElementById('calibInspector').value = activeCalibRecord["점검자"] || currentUserInfo.name || '';
    document.getElementById('calibSupervisor').value = activeCalibRecord["감독자"] || '';

    document.getElementById('info-modal').style.display = 'none';
    document.getElementById('edit-calib-modal').style.display = 'block';
  };

  document.getElementById('btnSaveCalibData').addEventListener('click', async () => {
    const tagNo = document.getElementById('calibTagNo').value.trim();
    if (!tagNo) {
      alert('⚠️ Tag No는 필수 입력값입니다.');
      return;
    }

    const payload = {
      "Tag No": tagNo,
      "기기명": document.getElementById('calibName').value.trim(),
      "TYPE": document.getElementById('calibType').value.trim(),
      "RANGE": document.getElementById('calibRange').value.trim(),
      "설치위치": document.getElementById('calibLocation').value.trim(),
      "제작사": document.getElementById('calibMaker').value.trim(),
      "모델명": document.getElementById('calibModel').value.trim(),
      "점검일자": document.getElementById('calibDate').value.trim(),
      "점검자": document.getElementById('calibInspector').value.trim(),
      "감독자": document.getElementById('calibSupervisor').value.trim()
    };

    alert('⏳ 교정 성적서 데이터를 Supabase에 저장 중...');

    let updateRes = null;
    if (activeCalibRecord && activeCalibRecord["구분"]) {
      updateRes = await supabaseClient.from('Instrumnet_calibration').update(payload).eq('구분', activeCalibRecord["구분"]);
    } else {
      updateRes = await supabaseClient.from('Instrumnet_calibration').upsert([payload], { onConflict: 'Tag No' });
    }

    if (!updateRes.error) {
      invalidateUnifiedData();
      const target = currentInstruments.find(i => i.id === activeTargetId);
      if (target) {
        target.signal_range = payload["RANGE"];
        target.model = payload["모델명"];
        await supabaseClient.from('instruments').update({ signal_range: payload["RANGE"], model: payload["모델명"] }).eq('id', target.id);
        if (!calibrationEditOpenedFromHistory) showDetail(target);
      }

      document.getElementById('edit-calib-modal').style.display = 'none';
      calibrationEditOpenedFromHistory = false;
      if (selectedSubTab === '관리이력') renderHistoryTable();
      alert('✅ [교정 성적서] 10개 항목이 성공적으로 수정·저장되었습니다!');
    } else {
      alert('❌ 교정 성적서 저장 실패:\n' + updateRes.error.message);
    }
  });

  document.getElementById('editInstPhotoCam').addEventListener('change', (e) => {
    pendingEditInstPhotoFile = e.target.files[0];
    previewImageFile(pendingEditInstPhotoFile, 'editInstPhotoPreview');
  });
  document.getElementById('editInstPhotoGallery').addEventListener('change', (e) => {
    pendingEditInstPhotoFile = e.target.files[0];
    previewImageFile(pendingEditInstPhotoFile, 'editInstPhotoPreview');
  });

  document.getElementById('btnSaveEditInst').addEventListener('click', async () => {
    const target = currentInstruments.find(i => i.id === activeTargetId);
    if (!target) return;
    const newTag = document.getElementById('editTagNo').value.trim();
    const newName = document.getElementById('editName').value.trim();
    const newMajor = document.getElementById('editMajor').value;
    const newUnit = document.getElementById('editUnit').value;
    const newFloor = normalizeFloor(document.getElementById('editFloor').value.trim());
    const newModel = document.getElementById('editModel').value.trim();
    const newRange = document.getElementById('editRange').value.trim();
    if (!newTag || !newName) {
      alert('⚠️ Tag No와 기기명은 필수 입력 항목입니다.');
      return;
    }
    alert('⏳ 계측기 정보 및 사진을 수정 저장 중...');
    let photoUrl = target.photo_url || target.image_data;
    if (pendingEditInstPhotoFile) {
      const uploaded = await uploadImageToStorage(pendingEditInstPhotoFile);
      if (uploaded) photoUrl = uploaded;
    }
    const updateFields = {
      tag_no: newTag,
      name: newName,
      major_category: newMajor,
      unit: newUnit,
      floor: newFloor,
      model: newModel,
      signal_range: newRange,
      photo_url: photoUrl,
      image_data: photoUrl
    };
    const { error } = await supabaseClient.from('instruments').update(updateFields).eq('id', target.id);
    if (!error) {
      Object.assign(target, updateFields);
      invalidateUnifiedData();
      document.getElementById('edit-inst-modal').style.display = 'none';
      if (!instrumentEditOpenedFromHistory) showDetail(target);
      instrumentEditOpenedFromHistory = false;
      renderFloorPins();
      render3DHotspots();
      if (selectedSubTab === '관리이력') renderHistoryTable();
      alert('✅ 계측기 정보와 사진이 성공적으로 수정되었습니다!');
    } else {
      alert('❌ 저장 실패: ' + error.message);
    }
  });

  function openOcrEditModal(target, parsed) {
    document.getElementById('ocrTagNo').value = parsed.tag_no || (target ? target.tag_no : '') || '';
    document.getElementById('ocrName').value = parsed.name || (target ? target.name : '') || '';
    document.getElementById('ocrModel').value = parsed.model || (target ? target.model : '') || '';
    document.getElementById('ocrRange').value = parsed.range || (target ? target.signal_range : '') || '';
    
    const statusBox = document.getElementById('ocrStatusGroup');
    const statusContent = document.getElementById('ocrStatusContent');
    if (parsed.status_content) {
      statusContent.value = parsed.status_content;
      statusBox.style.display = 'block';
    } else {
      statusBox.style.display = 'none';
    }

    document.getElementById('btnApplyOcrEdit').onclick = async () => {
      if (target) {
        const updateFields = {
          tag_no: document.getElementById('ocrTagNo').value.trim(),
          name: document.getElementById('ocrName').value.trim(),
          model: document.getElementById('ocrModel').value.trim(),
          signal_range: document.getElementById('ocrRange').value.trim()
        };

        if (parsed.status_content) {
          const logs = Array.isArray(target.history_logs) ? [...target.history_logs] : [];
          logs.unshift({
            date: new Date().toISOString().slice(0, 10),
            author: currentUserInfo.name || localStorage.getItem('jeju_worker_name') || 'AI 진단',
            content: parsed.status_content,
            photo: target.photo_url || target.image_data || null
          });
          updateFields.history_logs = logs;
          target.history_logs = logs;
        }

        const { error } = await supabaseClient.from('instruments').update(updateFields).eq('id', target.id);
        if (!error) {
          Object.assign(target, updateFields);
          invalidateUnifiedData();
          closeOcrEditModal();
          showDetail(target);
          renderFloorPins();
          render3DHotspots();
          if (selectedSubTab === '관리이력') renderHistoryTable();
        } else {
          alert('❌ 저장 실패: ' + error.message);
        }
      } else {
        document.getElementById('tagNo').value = document.getElementById('ocrTagNo').value.trim();
        document.getElementById('name').value = document.getElementById('ocrName').value.trim();
        document.getElementById('model').value = document.getElementById('ocrModel').value.trim();
        document.getElementById('range').value = document.getElementById('ocrRange').value.trim();
        closeOcrEditModal();
      }
      const hud = document.getElementById('measure-info-hud');
      if (hud) {
        hud.style.display = 'block';
        hud.innerText = '✅ 수정하신 정보가 반영되었습니다!';
        setTimeout(() => { if (!isMeasureMode) hud.style.display = 'none'; }, 2500);
      }
    };
    document.getElementById('ocr-edit-modal').style.display = 'block';
  }

  window.closeOcrEditModal = function() {
    document.getElementById('ocr-edit-modal').style.display = 'none';
  };

  async function autoFillTagFromPhoto(fileOrUrl, targetMode = 'insert') {
    if (!fileOrUrl) return;
    const hud = document.getElementById('measure-info-hud');
    if (hud) {
      hud.style.display = 'block';
      hud.innerText = '🔍 사진 속 명판·LCD 상태·정비 가이드를 정밀 분석 중입니다...';
    }

    let photoPayload = null;
    try {
      photoPayload = await prepareImagePayloadForOcr(fileOrUrl);
    } catch (prepErr) {
      console.warn("로컬 처리 건너뛰고 원본 전송:", prepErr);
      photoPayload = fileOrUrl;
    }

    try {
      const { data, error } = await supabaseClient.functions.invoke('gemini-chat', {
        body: { prompt: "명판 추출 및 상태 진단", photosToSend: [photoPayload], mode: "ocr_tag" }
      });

      let replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!replyText && error) throw new Error(error.message);

      replyText = replyText.replace(/```json/gi, '').replace(/```/g, '').trim();

      let parsed = null;
      try {
        parsed = JSON.parse(replyText);
      } catch (jsonErr) {
        const jsonMatch = replyText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          parsed = JSON.parse(replyText + '"}');
        }
      }

      if (!parsed) throw new Error('데이터 파싱 실패: ' + replyText);

      const tagVal = parsed.tag_no || parsed.tag || parsed.Tag || '';
      const nameVal = parsed.name || parsed.device_name || parsed.equipment_name || '';
      const modelVal = parsed.model || parsed.model_name || parsed.device_model || '';
      const rangeVal = parsed.range || parsed.signal_range || parsed.measuring_range || '';

      const displayStatus = parsed.status || parsed.display_text || parsed.lcd_text || parsed.error_code || '';
      const actionGuide = parsed.action_guide || parsed.guide || parsed.solution || parsed.recommendation || parsed.diagnosis || '';

      let combinedContent = '';
      if (displayStatus) combinedContent += `[디스플레이 상태]: ${displayStatus}\n`;
      if (actionGuide) combinedContent += `[정비 조치 가이드]:\n${actionGuide}\n`;

      if (targetMode === 'insert') {
        if (tagVal) document.getElementById('tagNo').value = tagVal;
        if (nameVal) document.getElementById('name').value = nameVal;
        if (modelVal) document.getElementById('model').value = modelVal;
        if (rangeVal) document.getElementById('range').value = rangeVal;

        const histTextarea = document.getElementById('initHistContent');
        if (combinedContent.trim()) {
          histTextarea.value = combinedContent.trim();
        } else if (!histTextarea.value) {
          histTextarea.value = '신규 설치 및 상태 점검 완료.';
        }

        if (hud) hud.innerText = `✅ [${tagVal || '기기정보'}] 명판 및 상태 점검 내용이 자동 입력되었습니다!`;
      } else if (targetMode === 'update') {
        const target = currentInstruments.find(i => i.id === activeTargetId);
        if (target) {
          openOcrEditModal(target, {
            tag_no: tagVal,
            name: nameVal,
            model: modelVal,
            range: rangeVal,
            status_content: combinedContent.trim()
          });
          if (hud) hud.innerText = `✅ [${tagVal || '기기정보'}] 추출 완료! 창에서 확인 및 적용하세요.`;
        }
      }
    } catch (err) {
      console.error('OCR 처리 에러:', err);
      if (hud) hud.innerText = '⚠️ 분석 처리 중 오류가 발생했습니다.';
      alert('⚠️ 명판 자동 추출 오류:\n' + err.message);
    }
    setTimeout(() => { if (!isMeasureMode && hud) hud.style.display = 'none'; }, 3500);
  }

  function cleanAiReplyText(text) {
    let cleaned = String(text || '').trim();
    const filler = /^(?:(?:네|예)[,.!]?\s*|(?:좋은 질문(?:입니다|이에요)|알겠습니다|물론입니다|도와드리겠습니다)[.!]?\s*|문의하신 (?:내용은|질문은)\s*)+/;
    cleaned = cleaned.replace(filler, '').trim();
    return cleaned || '답변을 생성하지 못했습니다. 질문을 다시 입력해 주세요.';
  }

  function appendAiText(container, text) {
    const value = String(text || '').trim();
    if (!value) return;
    const block = document.createElement('div');
    block.className = 'ai-answer-text';
    block.textContent = value;
    container.appendChild(block);
  }

  function appendAiFlow(container, flowText) {
    const steps = String(flowText || '')
      .split(/\r?\n|\s*(?:--+>|→|➡️?|➜)\s*/)
      .map(step => step.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 8);
    if (steps.length < 2) {
      appendAiText(container, flowText);
      return;
    }

    const title = document.createElement('div');
    title.className = 'ai-flow-title';
    title.textContent = '작업 순서';
    container.appendChild(title);

    const flow = document.createElement('div');
    flow.className = 'ai-flowchart';
    flow.setAttribute('role', 'list');
    flow.setAttribute('aria-label', '작업 순서 흐름도');
    steps.forEach((step, index) => {
      if (index > 0) {
        const arrow = document.createElement('span');
        arrow.className = 'ai-flow-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        flow.appendChild(arrow);
      }
      const stepBox = document.createElement('div');
      stepBox.className = 'ai-flow-step';
      stepBox.setAttribute('role', 'listitem');
      stepBox.textContent = step;
      flow.appendChild(stepBox);
    });
    container.appendChild(flow);
  }

  function renderAiReply(container, text) {
    const cleaned = cleanAiReplyText(text);
    container.replaceChildren();
    const pattern = /\[FLOW\]([\s\S]*?)\[\/FLOW\]/gi;
    let cursor = 0;
    let match;
    while ((match = pattern.exec(cleaned)) !== null) {
      appendAiText(container, cleaned.slice(cursor, match.index));
      appendAiFlow(container, match[1]);
      cursor = pattern.lastIndex;
    }
    appendAiText(container, cleaned.slice(cursor));
  }

  function appendAiMsg(role, text) {
    const box = document.getElementById('aiChatBox');
    const div = document.createElement('div');
    div.className = `ai-msg ${role === 'user' ? 'ai-msg-user' : 'ai-msg-bot'}`;
    if (role === 'user') div.textContent = text;
    else renderAiReply(div, text);
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  document.getElementById('btnSendAi').addEventListener('click', () => {
    const input = document.getElementById('aiUserInput');
    const p = input.value.trim();
    if (!p || isAiRequestPending) return;
    input.value = '';
    callGemini(p);
  });

  document.getElementById('aiUserInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) document.getElementById('btnSendAi').click();
  });

  function previewImageFile(file, previewElementId) {
    if (!file) return;
    const r = new FileReader();
    r.onload = function(e) {
      const p = document.getElementById(previewElementId);
      p.src = e.target.result;
      p.style.display = 'block';
    };
    r.readAsDataURL(file);
  }

  document.getElementById('instPhotoCam').addEventListener('change', (e) => {
    pendingInstPhotoFile = e.target.files[0];
    previewImageFile(pendingInstPhotoFile, 'photoPreview');
    document.getElementById('btnExtractNewPhoto').style.display = 'block';
  });
  document.getElementById('instPhotoGallery').addEventListener('change', (e) => {
    pendingInstPhotoFile = e.target.files[0];
    previewImageFile(pendingInstPhotoFile, 'photoPreview');
    document.getElementById('btnExtractNewPhoto').style.display = 'block';
  });
  document.getElementById('initHistPhotoCam').addEventListener('change', (e) => {
    pendingInitHistPhotoFile = e.target.files[0];
    previewImageFile(pendingInitHistPhotoFile, 'initHistPreview');
  });
  document.getElementById('initHistPhotoGallery').addEventListener('change', (e) => {
    pendingInitHistPhotoFile = e.target.files[0];
    previewImageFile(pendingInitHistPhotoFile, 'initHistPreview');
  });
  document.getElementById('histPhotoCam').addEventListener('change', (e) => {
    pendingHistPhotoFile = e.target.files[0];
    previewImageFile(pendingHistPhotoFile, 'histPhotoPreview');
  });
  document.getElementById('histPhotoGallery').addEventListener('change', (e) => {
    pendingHistPhotoFile = e.target.files[0];
    previewImageFile(pendingHistPhotoFile, 'histPhotoPreview');
  });

  async function handleUpdateMainPhoto(file) {
    if (!file) return;
    const uploadedUrl = await uploadImageToStorage(file);
    if (!uploadedUrl) return;
    const target = currentInstruments.find(i => i.id === activeTargetId);
    if (!target) return;
    target.photo_url = uploadedUrl;
    target.image_data = uploadedUrl;
    document.getElementById('infoMainImg').src = uploadedUrl;
    document.getElementById('infoMainImg').style.display = 'block';
    await supabaseClient.from('instruments').update({ photo_url: uploadedUrl, image_data: uploadedUrl }).eq('id', activeTargetId);
    renderFloorPins();
    render3DHotspots();
  }

  document.getElementById('updateMainPhotoCam').addEventListener('change', (e) => handleUpdateMainPhoto(e.target.files[0]));
  document.getElementById('updateMainPhotoGallery').addEventListener('change', (e) => handleUpdateMainPhoto(e.target.files[0]));

  async function getSignedInProfile(user) {
    if (!user?.id) return { name: '', role: 'member', isApproved: false, exists: false };
    const { data, error } = await supabaseClient
      .from('user_profiles')
      .select('name, role, is_approved')
      .eq('id', user.id)
      .maybeSingle();
    if (error || !data) return { name: '', role: 'member', isApproved: false, exists: false };
    return {
      name: data.name || '',
      role: data.role === 'admin' ? 'admin' : 'member',
      isApproved: data.is_approved === true,
      exists: true
    };
  }

  async function ensurePendingProfile(user, name = '', email = '') {
    if (!user?.id) return { name: '', role: 'member', isApproved: false, exists: false };
    const existing = await getSignedInProfile(user);
    if (existing.exists) return existing;
    const fallbackName = name || email.split('@')[0] || '팀원';
    const { error } = await supabaseClient.from('user_profiles').insert({
      id: user.id,
      email: email || user.email || '',
      name: fallbackName,
      role: 'member',
      is_approved: false
    });
    if (error) {
      console.warn('Failed to create pending user profile', error);
      return { name: fallbackName, role: 'member', isApproved: false, exists: false };
    }
    return { name: fallbackName, role: 'member', isApproved: false, exists: true };
  }

  async function blockUnapprovedUser(user, name, email, msgEl = null) {
    const profile = await ensurePendingProfile(user, name, email);
    if (profile.isApproved) return profile;
    await supabaseClient.auth.signOut({ scope: 'local' });
    if (msgEl) {
      msgEl.innerText = '⏳ 가입 신청은 완료됐지만 아직 최고관리자 승인이 필요합니다.';
      msgEl.style.display = 'block';
    }
    return null;
  }

  async function unlock(name, email = 'user@jeju.com', knownUser = null) {
    let user = knownUser;
    if (!user) {
      const { data } = await supabaseClient.auth.getUser();
      user = data?.user || null;
    }
    const profile = await getSignedInProfile(user);
    if (!profile.isApproved) {
      await supabaseClient.auth.signOut({ scope: 'local' });
      const msgEl = document.getElementById('loginMsg');
      if (msgEl) {
        msgEl.innerText = '⏳ 최고관리자 승인 후 이용할 수 있습니다.';
        msgEl.style.display = 'block';
      }
      return;
    }
    const savedName = localStorage.getItem('jeju_worker_name');
    const finalName = profile.name || savedName || name;
    isAdminMode = profile.role === 'admin';
    currentUserInfo = { id: user?.id || '', name: finalName, email, role: profile.role };
    const authOverlay = document.getElementById('auth-overlay');
    if (authOverlay) authOverlay.remove();
    document.getElementById('loginUserBadge').innerText = isAdminMode ? '👑 최고관리자' : `👤 ${finalName}`;
    selectedMajor = '기력';
    selectedSubTab = '2호기';
    selectedSection = '보일러';
    selectedFloor = 'ALL';
    
    document.getElementById('btn-major-steam').classList.add('active');
    document.getElementById('btn-major-engine').classList.remove('active');
    document.getElementById('sub-tabs-steam').style.display = 'flex';
    document.getElementById('sub-tabs-engine').style.display = 'none';
    document.getElementById('section-selector-row').style.display = 'flex';

    document.getElementById('overall-3d-view').style.display = 'block';
    document.getElementById('floor-room-view').style.display = 'none';
    document.getElementById('empty-engine-view').style.display = 'none';
    document.getElementById('history-table-view').style.display = 'none';
    document.getElementById('logic-management-view').style.display = 'none';
    document.getElementById('tms-management-view').style.display = 'none';
    document.getElementById('todo-management-view').style.display = 'none';
    document.getElementById('materials-management-view').style.display = 'none';
    document.getElementById('floor-bar').style.display = 'flex';

    switchSubTab('2호기');
    switchMainMenu('홈');
    await fetchManuals();
    fetchInstruments();
  }

  document.getElementById('linkToRegister').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-box').style.display = 'none';
    document.getElementById('register-box').style.display = 'block';
    setTimeout(() => document.getElementById('regName').focus(), 150);
  });
  document.getElementById('linkBackLogin2').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('register-box').style.display = 'none';
    document.getElementById('login-box').style.display = 'block';
  });

  document.getElementById('btnMemberLogin').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPassword').value.trim();
    const msgEl = document.getElementById('loginMsg');
    msgEl.style.display = 'none';
    if (!email || !pass) {
      msgEl.innerText = '⚠️ 사번(이메일)과 비밀번호를 모두 입력해 주세요.';
      msgEl.style.display = 'block';
      return;
    }
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email: email, password: pass });
    if (error || !data?.user) {
      msgEl.innerText = '❌ 로그인 실패: 승인되지 않은 사번이거나 비밀번호가 틀렸습니다.';
      msgEl.style.display = 'block';
      return;
    }
    const namePart = email.split('@')[0];
    const profile = await blockUnapprovedUser(data.user, namePart, email, msgEl);
    if (!profile) return;
    const finalName = profile.name || namePart;
    localStorage.setItem('jeju_worker_name', finalName);
    localStorage.setItem('jeju_login_email', email);
    unlock(finalName, email, data.user);
  });

  document.getElementById('btnAdminLogin').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPassword').value.trim();
    const msgEl = document.getElementById('loginMsg');
    msgEl.style.display = 'none';
    if (!email || !pass) {
      msgEl.innerText = '⚠️ 최고관리자 아이디와 비밀번호를 모두 입력해 주세요.';
      msgEl.style.display = 'block';
      return;
    }
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
    if (error || !data?.user) {
      msgEl.innerText = '❌ 최고관리자 로그인에 실패했습니다.';
      msgEl.style.display = 'block';
      return;
    }
    const profile = await getSignedInProfile(data.user);
    if (!profile.isApproved) {
      await supabaseClient.auth.signOut({ scope: 'local' });
      msgEl.innerText = '⏳ 최고관리자 승인 후 이용할 수 있습니다.';
      msgEl.style.display = 'block';
      return;
    }
    if (profile.role !== 'admin') {
      await supabaseClient.auth.signOut({ scope: 'local' });
      msgEl.innerText = '❌ 최고관리자 권한이 없는 계정입니다.';
      msgEl.style.display = 'block';
      return;
    }
    const name = profile.name || email.split('@')[0];
    localStorage.setItem('jeju_worker_name', name);
    localStorage.setItem('jeju_login_email', email);
    unlock(name, email, data.user);
  });

  function getPasskeyErrorMessage(error, action) {
    const code = error?.code || '';
    if (code === 'passkey_disabled') return '관리자가 Supabase 패스키 기능을 먼저 활성화해야 합니다.';
    if (code === 'webauthn_credential_exists') return '이 기기의 패스키가 이미 등록되어 있습니다.';
    if (code === 'webauthn_credential_not_found') return '등록된 패스키를 찾지 못했습니다. 비밀번호로 로그인한 뒤 다시 등록해 주세요.';
    if (code === 'webauthn_challenge_expired') return '인증 시간이 초과되었습니다. 다시 시도해 주세요.';
    if (error?.name === 'NotAllowedError') return '지문·화면잠금 인증이 취소되었거나 시간이 초과되었습니다.';
    return `${action}에 실패했습니다. 비밀번호 로그인을 이용하거나 잠시 후 다시 시도해 주세요.`;
  }

  document.getElementById('btnPasskeyLogin').addEventListener('click', async (e) => {
    e.preventDefault();
    const button = e.currentTarget;
    const msgEl = document.getElementById('loginMsg');
    msgEl.style.display = 'none';

    if (!window.PublicKeyCredential || typeof supabaseClient.auth.signInWithPasskey !== 'function') {
      msgEl.innerText = '이 브라우저에서는 지문·화면잠금 로그인을 지원하지 않습니다.';
      msgEl.style.display = 'block';
      return;
    }

    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPassword').value.trim();
    button.disabled = true;

    if (email && pass) {
      button.innerText = '본인 확인 중...';
      const { data: passwordData, error: passwordError } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
      if (passwordError || !passwordData?.user) {
        button.disabled = false;
        button.innerText = '🔐 내 아이디 지문등록·로그인';
        msgEl.innerText = '❌ 사번(이메일) 또는 비밀번호가 올바르지 않습니다.';
        msgEl.style.display = 'block';
        return;
      }

      const approvedProfile = await blockUnapprovedUser(passwordData.user, email.split('@')[0], email, msgEl);
      if (!approvedProfile) {
        button.disabled = false;
        button.innerText = '🔐 내 아이디 지문등록·로그인';
        return;
      }

      button.innerText = '지문 등록 중...';
      const { data: registerData, error: registerError } = await supabaseClient.auth.registerPasskey();
      button.disabled = false;
      button.innerText = '🔐 내 아이디 지문등록·로그인';

      if (registerError && registerError.code !== 'webauthn_credential_exists') {
        alert(`지문등록은 완료되지 않았지만 비밀번호 로그인은 완료되었습니다.\n${getPasskeyErrorMessage(registerError, '지문등록')}`);
      } else {
        const deviceName = registerData?.friendly_name ? ` (${registerData.friendly_name})` : '';
        alert(`✅ 지문 키가 등록되었습니다${deviceName}. 다음부터 아이디만 입력하고 이 버튼을 누르면 로그인됩니다.`);
      }

      const signedInEmail = passwordData.user.email || email;
      const name = approvedProfile.name || signedInEmail.split('@')[0];
      localStorage.setItem('jeju_worker_name', name);
      localStorage.setItem('jeju_login_email', signedInEmail);
      unlock(name, signedInEmail, passwordData.user);
      return;
    }

    if (!email) {
      button.disabled = false;
      msgEl.innerText = '⚠️ 본인 아이디(이메일)를 먼저 입력해 주세요.';
      msgEl.style.display = 'block';
      return;
    }

    button.innerText = '지문 확인 중...';
    const { data: passkeyData, error: passkeyError } = await supabaseClient.auth.signInWithPasskey();
    button.disabled = false;
    button.innerText = '🔐 내 아이디 지문등록·로그인';

    if (passkeyError || !passkeyData?.user) {
      msgEl.innerText = passkeyError?.code === 'passkey_disabled'
        ? `❌ ${getPasskeyErrorMessage(passkeyError, '지문·화면잠금 로그인')}`
        : '등록된 지문 키가 없습니다. 처음 한 번만 사번(이메일)과 비밀번호를 입력한 뒤 다시 눌러주세요.';
      msgEl.style.display = 'block';
      return;
    }

    const signedInEmail = passkeyData.user.email || '';
    if (!signedInEmail || signedInEmail.toLowerCase() !== email.toLowerCase()) {
      await supabaseClient.auth.signOut({ scope: 'local' });
      msgEl.innerText = '❌ 입력한 아이디와 선택한 패스키 계정이 다릅니다. 본인 아이디의 패스키를 선택해 주세요.';
      msgEl.style.display = 'block';
      return;
    }
    const name = signedInEmail.split('@')[0];
    const approvedProfile = await blockUnapprovedUser(passkeyData.user, name, signedInEmail, msgEl);
    if (!approvedProfile) return;
    const finalName = approvedProfile.name || name;
    localStorage.setItem('jeju_worker_name', finalName);
    localStorage.setItem('jeju_login_email', signedInEmail);
    unlock(finalName, signedInEmail, passkeyData.user);
  });

  document.getElementById('btnRegisterPasskey').addEventListener('click', async (e) => {
    const button = e.currentTarget;
    if (!window.PublicKeyCredential || typeof supabaseClient.auth.registerPasskey !== 'function') {
      alert('이 브라우저에서는 지문·화면잠금 등록을 지원하지 않습니다.');
      return;
    }

    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData.user) {
      alert('먼저 팀원 계정으로 로그인해 주세요.');
      return;
    }

    button.disabled = true;
    button.innerText = '등록 중...';
    const { data, error } = await supabaseClient.auth.registerPasskey();
    button.disabled = false;
    button.innerText = '🔐 지문등록';

    if (error) {
      alert(`❌ ${getPasskeyErrorMessage(error, '지문·화면잠금 등록')}`);
      return;
    }

    const deviceName = data?.friendly_name ? ` (${data.friendly_name})` : '';
    alert(`✅ 지문·화면잠금 로그인이 등록되었습니다${deviceName}.\n이제 브라우저 캐시를 삭제해도 다시 등록할 필요가 없습니다.`);
  });

  document.getElementById('btnRegisterSubmit').addEventListener('click', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPassword').value.trim();
    const regMsg = document.getElementById('regMsg');
    if (!name || !email || !pass) {
      regMsg.innerText = '⚠️ 빈칸을 모두 채워주세요.';
      regMsg.style.display = 'block';
      return;
    }
    if (pass.length < 6) {
      regMsg.innerText = '⚠️ 비밀번호는 최소 6자리 이상이어야 합니다.';
      regMsg.style.display = 'block';
      return;
    }
    regMsg.style.display = 'none';
    const { data, error } = await supabaseClient.auth.signUp({ email, password: pass });
    if (error) {
      regMsg.innerText = `❌ 가입 신청 실패: ${error.message}`;
      regMsg.style.display = 'block';
      return;
    }
    if (data.user) await ensurePendingProfile(data.user, name, email);
    if (data.session) await supabaseClient.auth.signOut({ scope: 'local' });
    alert(`✅ [${name}] 가입 신청이 완료되었습니다. 최고관리자 승인 후 로그인할 수 있습니다.`);
    document.getElementById('register-box').style.display = 'none';
    document.getElementById('login-box').style.display = 'block';
    document.getElementById('loginEmail').value = email;
    document.getElementById('regPassword').value = '';
  });

  document.getElementById('btnLogout').addEventListener('click', async () => {
    await supabaseClient.auth.signOut({ scope: 'local' });
    localStorage.removeItem('jeju_worker_name');
    location.reload();
  });

  const canvasWrap = document.getElementById('floor-canvas-wrap');
  const board = document.getElementById('floor-board');
  const notice = document.getElementById('noImgNotice');
  const viewer = document.getElementById('boilerViewer');
  const measureHud = document.getElementById('measure-info-hud');
  const btnMeasure = document.getElementById('btnToggleMeasure');

  function clearAllMeasureVisuals() {
    document.querySelectorAll('.measure-marker-2d, .measure-line, #temp-measure-marker-2d').forEach(e => e.remove());
    viewer.querySelectorAll('.measure-marker-3d, #temp-measure-marker').forEach(e => e.remove());
  }

  function updateMeasureHudPrompt() {
    if (!isMeasureMode) { measureHud.style.display = 'none'; return; }
    measureHud.style.display = 'block';
    if (isAdminMode) {
      measureHud.innerHTML = selectedFloor === 'ALL'
        ? `📍 <b>[최고관리자 모드]</b> 3D 모델 표면을 누르면 <b>좌표가 자동 복사</b>됩니다.`
        : `📍 <b>[최고관리자 모드]</b> 도면을 누르면 <b>2D 좌표가 자동 복사</b>됩니다.`;
      return;
    }
    const count = measurePoints.length;
    if (count === 0) {
      measureHud.innerHTML = selectedFloor === 'ALL'
        ? `📐 <b>[거리 계측 모드]</b> 3D 모델에서 첫 번째 지점(P1)을 터치하세요. (최대 10개)`
        : `📐 <b>[거리 계측 모드]</b> 도면에서 첫 번째 지점(P1)을 터치하세요. (최대 10개)`;
    } else {
      updateMeasureHudResult();
    }
  }

  function updateMeasureHudResult() {
    if (!isMeasureMode) return;
    measureHud.style.display = 'block';
    const count = measurePoints.length;
    if (count === 0) return;
    if (count === 1) {
      measureHud.innerHTML = `📍 <b>P1(${measurePoints[0].floor})</b> 선택됨.<br><span style="font-size:11px; color:#94a3b8;">두 번째 지점을 터치하면 거리가 자동 계산됩니다. (층 이동 가능)</span>`;
      return;
    }
    let total3D = 0;
    let totalH = 0;
    for (let i = 0; i < count - 1; i++) {
      const pA = measurePoints[i];
      const pB = measurePoints[i + 1];
      const dx = pB.x3d - pA.x3d;
      const dy = pB.y3d - pA.y3d;
      const dz = pB.z3d - pA.z3d;
      totalH += Math.hypot(dx, dz);
      total3D += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    if (count === 2) {
      const p1 = measurePoints[0];
      const p2 = measurePoints[1];
      const vDiff = Math.abs(p2.y3d - p1.y3d).toFixed(2);
      if (p1.floor === p2.floor) {
        measureHud.innerHTML = `📏 <b>[${p1.floor}] 수평 직선거리: <span style="color:#10b981;">${totalH.toFixed(2)} m</span></b><div style="font-size:11px; color:#94a3b8; margin-top:2px;">추가 지점 터치 시 연속 누적 측정 가능 (최대 10개)</div>`;
      } else {
        measureHud.innerHTML = `📏 <b>[${p1.floor} ↔ ${p2.floor}] 3D 입체거리: <span style="color:#f59e0b;">${total3D.toFixed(2)} m</span></b><div style="font-size:11px; color:#94a3b8; margin-top:2px;">(수평: ${totalH.toFixed(2)}m, 층고: ${vDiff}m)</div>`;
      }
    } else {
      measureHud.innerHTML = `📏 <b>[총 ${count}개 지점] 누적 3D 거리: <span style="color:#10b981;">${total3D.toFixed(2)} m</span></b> (수평: ${totalH.toFixed(2)}m)<div style="font-size:11px; color:#94a3b8; margin-top:2px;">${count < 10 ? `다음 지점(P${count + 1}) 터치 가능 (${count}/10)` : `최대 10개 지점 완료 | 터치 시 새로 시작`}</div>`;
    }
  }

  btnMeasure.addEventListener('click', () => {
    isMeasureMode = !isMeasureMode;
    measurePoints = [];
    clearAllMeasureVisuals();
    if (isMeasureMode) {
      btnMeasure.classList.add('active');
      btnMeasure.innerText = isAdminMode ? '📐 좌표 ON' : '📐 계측 ON';
      updateMeasureHudPrompt();
    } else {
      btnMeasure.classList.remove('active');
      btnMeasure.innerText = '📐 계측';
      measureHud.style.display = 'none';
    }
  });

  function renderMeasureVisuals3D() {
    viewer.querySelectorAll('.measure-marker-3d').forEach(e => e.remove());
    measurePoints.forEach((p) => {
      const marker = document.createElement('button');
      marker.className = 'measure-marker-3d';
      marker.slot = `hotspot-measure-${p.idx}`;
      marker.dataset.position = `${p.x3d} ${p.y3d} ${p.z3d}`;
      marker.innerText = `${p.idx}`;
      viewer.appendChild(marker);
    });
  }

  viewer.addEventListener('click', (event) => {
    if (!isMeasureMode) return;
    const rect = viewer.getBoundingClientRect();
    const hit = viewer.positionAndNormalFromPoint(event.clientX - rect.left, event.clientY - rect.top);
    if (hit) {
      if (isAdminMode) {
        const posStr = `${hit.position.x.toFixed(2)} ${hit.position.y.toFixed(2)} ${hit.position.z.toFixed(2)}`;
        let marker = viewer.querySelector('#temp-measure-marker');
        if (!marker) {
          marker = document.createElement('button');
          marker.id = 'temp-measure-marker';
          marker.slot = 'hotspot-measure-point';
          viewer.appendChild(marker);
        }
        marker.dataset.position = `${hit.position.x} ${hit.position.y} ${hit.position.z}`;
        measureHud.style.display = 'block';
        measureHud.innerHTML = `📍 3D 좌표: <b style="color:#38bdf8;">${posStr}</b> (복사됨)`;
        navigator.clipboard.writeText(posStr).catch(() => {});
        return;
      }
      if (measurePoints.length >= 10) {
        measurePoints = [];
        clearAllMeasureVisuals();
      }
      const nextIdx = measurePoints.length + 1;
      measurePoints.push({
        idx: nextIdx,
        floor: '3D',
        x: 0,
        y: 0,
        x3d: hit.position.x,
        y3d: hit.position.y,
        z3d: hit.position.z
      });
      renderMeasureVisuals3D();
      updateMeasureHudResult();
    }
  });

  viewer.addEventListener('camera-change', () => {
    const orbit = viewer.getCameraOrbit();
    if (!orbit) return;
    const pinScale = Math.max(0.5, Math.min(1.5, (380 / orbit.radius) * 1.0));
    document.querySelectorAll('.hotspot-pin').forEach(pin => pin.style.setProperty('--pin-scale', pinScale));
  });

  function renderMeasureMarkers2D() {
    document.querySelectorAll('.measure-marker-2d, .measure-line').forEach(el => el.remove());
    measurePoints.forEach((p) => {
      if (p.floor === selectedFloor) {
        const m = document.createElement('div');
        const colorClass = p.idx === 1 ? 'p-start' : (p.idx === measurePoints.length ? 'p-end' : 'p-mid');
        m.className = `measure-marker-2d ${colorClass}`;
        m.innerText = `${p.idx}`;
        m.style.left = `${p.x}px`;
        m.style.top = `${p.y}px`;
        board.appendChild(m);
      }
    });
    for (let i = 0; i < measurePoints.length - 1; i++) {
      const pA = measurePoints[i];
      const pB = measurePoints[i + 1];
      if (pA.floor === selectedFloor && pB.floor === selectedFloor) {
        const line = document.createElement('div');
        line.className = 'measure-line';
        const length = Math.hypot(pB.x - pA.x, pB.y - pA.y);
        const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x) * 180 / Math.PI;
        line.style.width = `${length}px`;
        line.style.left = `${pA.x}px`;
        line.style.top = `${pA.y}px`;
        line.style.transform = `rotate(${angle}deg)`;
        board.appendChild(line);
      }
    }
  }

  window.openFloorRoom = function(floor, imgFile, btn) {
    selectedFloor = normalizeFloor(floor);
    document.querySelectorAll('.floor-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    else {
      const label = selectedFloor === '지하층' ? '지하' : selectedFloor;
      [...document.querySelectorAll('#floor-floor-buttons .floor-btn')]
        .find(button => button.textContent.trim() === label)?.classList.add('active');
    }
    document.getElementById('overall-3d-view').style.display = 'none';
    document.getElementById('floor-room-view').style.display = 'block';
    updateFloorTitle();
    const testImg = new Image();
    testImg.src = `./${imgFile}`;
    testImg.onload = () => {
      board.style.backgroundImage = `url('./${imgFile}')`;
      notice.style.display = 'none';
    };
    testImg.onerror = () => {
      board.style.backgroundImage = 'none';
      notice.innerText = `⚠️ [${imgFile}] 파일 부재`;
      notice.style.display = 'block';
    };
    resetCanvasView();
    renderFloorPins();
    renderManagedEquipment();
    if (isMeasureMode) {
      updateMeasureHudPrompt();
      renderMeasureMarkers2D();
    }
  };

  window.exitToOverall = function() {
    selectedFloor = 'ALL';
    document.querySelectorAll('.floor-btn').forEach(b => b.classList.remove('active'));
    const btnAll = document.getElementById('btn-ALL');
    if (btnAll) btnAll.classList.add('active');
    document.getElementById('floor-room-view').style.display = 'none';
    document.getElementById('overall-3d-view').style.display = 'block';
    updateFloorTitle();
    render3DHotspots();
    if (isMeasureMode) {
      updateMeasureHudPrompt();
      renderMeasureVisuals3D();
    }
  };

  function updateTransform() {
    board.style.transform = `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${scale})`;
  }

  window.zoomCanvas = function(delta) {
    scale = Math.max(0.3, Math.min(3.5, scale + delta));
    updateTransform();
  };

  window.resetCanvasView = function() {
    scale = 0.65; panX = 0; panY = 0;
    updateTransform();
  };

  canvasWrap.addEventListener('touchstart', (e) => {
    if (e.target.closest('.floor-inst-pin')) return;
    if (e.touches.length === 1) {
      isDragging = true;
      dragStartX = e.touches[0].clientX - panX;
      dragStartY = e.touches[0].clientY - panY;
    } else if (e.touches.length === 2) {
      isDragging = false;
      initialPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      initialScale = scale;
    }
  }, { passive: false });

  canvasWrap.addEventListener('touchmove', (e) => {
    if (e.target.closest('.floor-inst-pin')) return;
    e.preventDefault();
    if (e.touches.length === 1 && isDragging) {
      panX = e.touches[0].clientX - dragStartX;
      panY = e.touches[0].clientY - dragStartY;
      updateTransform();
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (initialPinchDist > 0) {
        scale = Math.max(0.3, Math.min(3.5, initialScale * (dist / initialPinchDist)));
        updateTransform();
      }
    }
  }, { passive: false });

  canvasWrap.addEventListener('touchend', () => { isDragging = false; });

  canvasWrap.addEventListener('mousedown', (e) => {
    if (e.target.closest('.floor-inst-pin')) return;
    isDragging = true;
    dragStartX = e.clientX - panX;
    dragStartY = e.clientY - panY;
    canvasWrap.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    panX = e.clientX - dragStartX;
    panY = e.clientY - dragStartY;
    updateTransform();
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    canvasWrap.style.cursor = 'grab';
  });

  canvasWrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomCanvas(e.deltaY < 0 ? 0.15 : -0.15);
  }, { passive: false });

  board.addEventListener('click', (e) => {
    if (e.target.closest('.floor-inst-pin')) return;
    const rect = board.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / scale;
    const clickY = (e.clientY - rect.top) / scale;
    const curX = Math.round(Math.max(0, Math.min(1400, clickX)));
    const curY = Math.round(Math.max(0, Math.min(1000, clickY)));
    if (isMeasureMode) {
      if (isAdminMode) {
        let marker = board.querySelector('#temp-measure-marker-2d');
        if (!marker) {
          marker = document.createElement('div');
          marker.id = 'temp-measure-marker-2d';
          board.appendChild(marker);
        }
        marker.style.left = `${curX}px`;
        marker.style.top = `${curY}px`;
        measureHud.style.display = 'block';
        measureHud.innerHTML = `📍 2D 도면 좌표: <b style="color:#38bdf8;">X:${curX}, Y:${curY}</b> (복사됨)`;
        navigator.clipboard.writeText(`X:${curX} Y:${curY}`).catch(() => {});
        return;
      }
      if (measurePoints.length >= 10) {
        measurePoints = [];
        clearAllMeasureVisuals();
      }
      const p3d = get3DCoordFrom2D(selectedFloor, curX, curY);
      const nextIdx = measurePoints.length + 1;
      measurePoints.push({
        idx: nextIdx,
        floor: selectedFloor,
        x: curX,
        y: curY,
        ...p3d
      });
      renderMeasureMarkers2D();
      updateMeasureHudResult();
      return;
    }
    clickedFloorCoord = { x: curX, y: curY };
    document.getElementById('tagNo').value = '';
    document.getElementById('name').value = '';
    document.getElementById('model').value = '';
    document.getElementById('range').value = '';
    pendingInstPhotoFile = null;
    document.getElementById('instPhotoCam').value = '';
    document.getElementById('instPhotoGallery').value = '';
    document.getElementById('photoPreview').style.display = 'none';
    document.getElementById('btnExtractNewPhoto').style.display = 'none';
    pendingInitHistPhotoFile = null;
    document.getElementById('initHistPhotoCam').value = '';
    document.getElementById('initHistPhotoGallery').value = '';
    document.getElementById('initHistPreview').style.display = 'none';
    document.getElementById('initHistAuthor').value = currentUserInfo.name || localStorage.getItem('jeju_worker_name') || '';
    document.getElementById('initHistContent').value = '';
    
    const unitLabel = (selectedSubTab === '연료펌프룸' || selectedSubTab === '암모니아탱크') 
      ? `기력 ${selectedSubTab}` 
      : `${selectedMajor} ${selectedSubTab} (${selectedSection})`;
    document.getElementById('modalUnitText').innerText = unitLabel;
    document.getElementById('modalFloorText').innerText = selectedFloor;
    document.getElementById('modal').style.display = 'block';
  });

  document.getElementById('btnSaveInst').addEventListener('click', async () => {
    const tag = document.getElementById('tagNo').value.trim();
    const name = document.getElementById('name').value.trim();
    if (!tag || !name) {
      alert('Tag No와 기기명을 입력하세요.');
      return;
    }
    alert('⏳ 스토리지에 사진 업로드 및 데이터 저장 중...');
    const instPhotoUrl = await uploadImageToStorage(pendingInstPhotoFile);
    const initHistPhotoUrl = await uploadImageToStorage(pendingInitHistPhotoFile);
    const initialLogs = [];
    const initContent = document.getElementById('initHistContent').value.trim();
    const initAuthor = document.getElementById('initHistAuthor').value.trim() || currentUserInfo.name || '관리자';
    if (initContent) {
      initialLogs.push({
        date: new Date().toISOString().slice(0, 10),
        author: initAuthor,
        content: initContent,
        photo: initHistPhotoUrl
      });
      localStorage.setItem('jeju_worker_name', initAuthor);
      currentUserInfo.name = initAuthor;
      document.getElementById('loginUserBadge').innerText = `👤 ${initAuthor}`;
    }

    let targetUnit = selectedSubTab;
    if (selectedSubTab === '2호기' || selectedSubTab === '3호기') {
      if (selectedSection === '탈질') targetUnit = `${selectedSubTab}_탈질`;
    }

    const insertData = {
      tag_no: tag,
      name: name,
      model: document.getElementById('model').value.trim() || 'EMPTY',
      signal_range: document.getElementById('range').value.trim() || 'EMPTY',
      floor: normalizeFloor(selectedFloor),
      unit: targetUnit,
      major_category: selectedMajor,
      coord_x: clickedFloorCoord.x,
      coord_y: clickedFloorCoord.y,
      x_coord: clickedFloorCoord.x,
      y_coord: clickedFloorCoord.y,
      model_position: '0 0 0',
      history_logs: initialLogs,
      photo_url: instPhotoUrl,
      image_data: instPhotoUrl
    };
    let { error } = await supabaseClient.from('instruments').insert([insertData]);
    if (error && error.message && error.message.toLowerCase().includes('major_category')) {
      delete insertData.major_category;
      insertData.unit = `${selectedMajor}_${targetUnit}`;
      const fallback = await supabaseClient.from('instruments').insert([insertData]);
      error = fallback.error;
    }
    if (!error) {
      document.getElementById('modal').style.display = 'none';
      invalidateUnifiedData();
      alert(`✅ [${selectedMajor} ${selectedSubTab}] ${selectedFloor}에 등록되었습니다!`);
      fetchInstruments();
    } else {
      alert('❌ 저장 실패!\n' + error.message);
    }
  });

  function normalizeInstrumentRecord(item) {
    const floor = normalizeFloor(item.floor);
    let unit = item.unit || '2호기';
    let major = item.major_category || '기력';
    if (typeof unit === 'string' && unit.includes('_') && !unit.includes('탈질')) {
      const parts = unit.split('_');
      major = parts[0];
      unit = parts[1];
    }
    const coordX = parseFloat(item.coord_x ?? item.x_coord ?? 400) || 400;
    const coordY = parseFloat(item.coord_y ?? item.y_coord ?? 400) || 400;
    const image = item.photo_url || item.image_data || null;
    return {
      ...item,
      floor,
      unit,
      major_category: major,
      coord_x: coordX,
      coord_y: coordY,
      photo_url: image,
      image_data: image,
      history_logs: Array.isArray(item.history_logs) ? item.history_logs : []
    };
  }

  /* 💡 층수 및 설비 정보 정규화 로직이 적용된 fetchInstruments */
  async function fetchInstruments() {
    const { data, error } = await supabaseClient.from('instruments').select('*');
    if (!error) {
      currentInstruments = (data || []).map(normalizeInstrumentRecord);
      renderFloorPins();
      render3DHotspots();
      if (selectedSubTab === '관리이력') renderHistoryTable();
    }
  }

  function renderFloorPins() {
    board.querySelectorAll('.floor-inst-pin').forEach(el => el.remove());
    
    let currentMatchUnit = selectedSubTab;
    if ((selectedSubTab === '2호기' || selectedSubTab === '3호기') && selectedSection === '탈질') {
      currentMatchUnit = `${selectedSubTab}_탈질`;
    }

    currentInstruments.forEach(item => {
      if (instrumentMajor(item) !== selectedMajor) return;
      if (item.unit !== currentMatchUnit || item.floor !== selectedFloor) return;
      const pin = document.createElement('div');
      pin.id = `floor-pin-${item.id}`;
      pin.className = 'floor-inst-pin';
      pin.style.left = `${item.coord_x}px`;
      pin.style.top = `${item.coord_y}px`;
      const img = item.photo_url || item.image_data;
      pin.style.backgroundImage = img ? `url(${img})` : 'none';
      pin.innerHTML = img ? `<span>${item.tag_no}</span>` : `📍<span>${item.tag_no}</span>`;
      
      let pressTimer = null;
      let startClientX = 0;
      let startClientY = 0;
      let pressStartTime = 0;
      let isDraggingThisPin = false;

      pin.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); return false; };
      pin.onclick = (e) => { e.preventDefault(); e.stopPropagation(); };

      pin.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        e.preventDefault();
        e.stopPropagation();

        startClientX = e.clientX;
        startClientY = e.clientY;
        pressStartTime = Date.now();
        isDraggingThisPin = false;

        pin.classList.add('pin-pressing');
        measureHud.style.display = 'block';
        measureHud.innerText = `⏳ [${item.tag_no}] 1초간 누르고 있으면 이동 모드로 전환됩니다...`;

        pressTimer = setTimeout(() => {
          isDraggingThisPin = true;
          pin.classList.remove('pin-pressing');
          pin.classList.add('pin-dragging');
          try { pin.setPointerCapture(e.pointerId); } catch(err) {}
          if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
          measureHud.innerText = `📍 [${item.tag_no}] 이동 모드 활성화! 원하는 위치로 드래그하세요.`;
        }, 1000);
      });

      pin.addEventListener('pointermove', (e) => {
        if (isDraggingThisPin) {
          e.preventDefault();
          e.stopPropagation();
          const rect = board.getBoundingClientRect();
          const curX = Math.round(Math.max(0, Math.min(1400, (e.clientX - rect.left) / scale)));
          const curY = Math.round(Math.max(0, Math.min(1000, (e.clientY - rect.top) / scale)));
          pin.style.left = `${curX}px`;
          pin.style.top = `${curY}px`;
        } else if (pressTimer) {
          if (Math.hypot(e.clientX - startClientX, e.clientY - startClientY) > 8) {
            clearTimeout(pressTimer);
            pressTimer = null;
            pin.classList.remove('pin-pressing');
            if (!isMeasureMode) measureHud.style.display = 'none';
          }
        }
      });

      const handlePointerUp = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
        pin.classList.remove('pin-pressing');

        if (isDraggingThisPin) {
          isDraggingThisPin = false;
          try { pin.releasePointerCapture(e.pointerId); } catch(err) {}
          pin.classList.remove('pin-dragging');

          const fx = parseInt(pin.style.left);
          const fy = parseInt(pin.style.top);
          item.coord_x = fx;
          item.coord_y = fy;
          item.x_coord = fx;
          item.y_coord = fy;

          measureHud.innerText = `✅ [${item.tag_no}] 위치가 저장되었습니다.`;
          setTimeout(() => { if (!isMeasureMode) measureHud.style.display = 'none'; }, 2000);

          await supabaseClient.from('instruments').update({
            coord_x: fx, coord_y: fy, x_coord: fx, y_coord: fy
          }).eq('id', item.id);

          render3DHotspots();
          return;
        }

        const pressDuration = Date.now() - pressStartTime;
        const moveDist = Math.hypot(e.clientX - startClientX, e.clientY - startClientY);

        if (pressDuration < 400 && moveDist < 10) {
          if (!isMeasureMode) measureHud.style.display = 'none';
          showDetail(item);
        } else {
          if (!isMeasureMode) measureHud.style.display = 'none';
        }
      };

      pin.addEventListener('pointerup', handlePointerUp);
      pin.addEventListener('pointercancel', handlePointerUp);
      board.appendChild(pin);
    });
  }

  function instrumentsForCurrentFloor() {
    let matchUnit = selectedSubTab;
    if (selectedMajor === '기력' && (selectedSubTab === '2호기' || selectedSubTab === '3호기') && selectedSection === '탈질') {
      matchUnit = `${selectedSubTab}_탈질`;
    }
    return currentInstruments.filter(item =>
      instrumentMajor(item) === selectedMajor && item.unit === matchUnit && normalizeFloor(item.floor) === selectedFloor
    );
  }

  function renderManagedEquipment() {
    const list = document.getElementById('managedEquipmentList');
    const count = document.getElementById('managedEquipmentCount');
    const query = (document.getElementById('managedEquipmentSearch').value || '').trim();
    const records = instrumentsForCurrentFloor().filter(item => !query || scoreEquipmentSearch([
      item.tag_no, item.name, item.model, item.signal_range
    ], query) > 0);
    count.textContent = `${records.length}대`;
    list.replaceChildren();
    if (!records.length) {
      const empty = document.createElement('div');
      empty.className = 'managed-empty';
      empty.textContent = query ? '검색 결과가 없습니다.' : '이 층에 등록된 관리 설비가 없습니다.';
      list.appendChild(empty);
      return;
    }
    records.forEach(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'managed-item';
      const tag = document.createElement('strong');
      tag.textContent = item.tag_no || '-';
      const name = document.createElement('span');
      name.textContent = item.name || '기기명 없음';
      button.append(tag, name);
      button.addEventListener('click', () => {
        const pin = document.getElementById(`floor-pin-${item.id}`);
        if (pin) {
          pin.classList.add('pin-highlight');
          setTimeout(() => pin.classList.remove('pin-highlight'), 2400);
        }
        showDetail(item);
      });
      list.appendChild(button);
    });
  }

  window.toggleManagedEquipment = function() {
    const view = document.getElementById('floor-room-view');
    const button = document.getElementById('btnToggleManagedEquipment');
    const open = !view.classList.contains('managed-open');
    view.classList.toggle('managed-open', open);
    button.classList.toggle('active', open);
    button.textContent = open ? '관리 설비 닫기' : '관리 설비';
    if (open) renderManagedEquipment();
  };

  document.getElementById('managedEquipmentSearch').addEventListener('input', renderManagedEquipment);

  function render3DHotspots() {
    viewer.querySelectorAll('.hotspot-pin').forEach(el => el.remove());
    if (selectedMajor === '기력' && selectedSection !== '보일러') return;

    currentInstruments.forEach(item => {
      if (instrumentMajor(item) !== selectedMajor) return;
      if (item.unit !== selectedSubTab) return;
      let pos = item.model_position;
      // 내연은 도면 좌표를 X/Z에, 층 EL을 Y에 매핑해 과거의 잘못된 3D 좌표도 자동 보정한다.
      if (selectedMajor === '내연') {
        const p3d = get3DCoordFrom2D(item.floor, item.coord_x, item.coord_y, selectedMajor);
        pos = `${p3d.x3d.toFixed(2)} ${p3d.y3d.toFixed(2)} ${p3d.z3d.toFixed(2)}`;
      } else if (!pos || pos === '0 0 0') {
        const floorKey = normalizeFloor(item.floor);
        const h = floor3DHeights[floorKey] !== undefined ? floor3DHeights[floorKey] : 26;
        const bounds = floorCorners2D[floorKey] || floorCorners2D['1층'];
        const u = (item.coord_x - bounds.c1.x) / (bounds.c4.x - bounds.c1.x || 1);
        const v = (item.coord_y - bounds.c1.y) / (bounds.c4.y - bounds.c1.y || 1);
        const x3d = 19.96 + (u * (30.93 - 19.96)) + (v * (1.65 - 19.96));
        const z3d = -11.43 + (u * (6.89 - (-11.43))) + (v * (-0.47 - (-11.43)));
        pos = `${x3d.toFixed(2)} ${h} ${z3d.toFixed(2)}`;
      }
      const btn = document.createElement('button');
      btn.className = 'hotspot-pin';
      btn.slot = `hotspot-${item.id}`;
      btn.dataset.position = pos;
      const img = item.photo_url || item.image_data;
      btn.style.backgroundImage = img ? `url(${img})` : 'none';
      const floorLabel = (item.floor || '').replace('층', 'F');
      btn.innerHTML = `<span>${floorLabel}</span>`;
      btn.onclick = (e) => {
        e.stopPropagation();
        showDetail(item);
      };
      viewer.appendChild(btn);
    });
  }

  function showDetail(item) {
    activeTargetId = item.id;
    document.getElementById('infoTitle').innerText = `[${item.tag_no}] ${item.name}`;
    const mainImg = document.getElementById('infoMainImg');
    const img = item.photo_url || item.image_data;
    mainImg.style.display = img ? 'block' : 'none';
    if (img) mainImg.src = img;
    document.getElementById('infoBody').innerHTML = `
      <div><b>Tag-name:</b> <span style="color:#38bdf8; font-weight:bold;">${item.tag_no || '-'}</span></div>
      <div><b>설비 구분:</b> <span style="color:#38bdf8; font-weight:bold;">${selectedMajor} ${item.unit || '2호기'}</span></div>
      <div><b>도면 층:</b> <span style="color:#0284c7; font-weight:bold;">${item.floor}</span></div>
      <div><b>모델명:</b> ${item.model || '-'}</div>
      <div><b>측정범위:</b> ${item.signal_range || '-'}</div>
    `;
    renderHistoryListModal(item);
    document.getElementById('btnAddHistBtn').onclick = () => {
      editingHistoryIndex = null;
      historyEditOpenedFromTable = false;
      document.getElementById('info-modal').style.display = 'none';
      document.getElementById('histModalTitle').innerText = '📋 새 점검/정비 이력 추가';
      document.getElementById('histTargetTag').innerText = `[${item.tag_no}] ${item.name}`;
      document.getElementById('histDate').value = new Date().toISOString().slice(0, 10);
      document.getElementById('histAuthor').value = currentUserInfo.name || localStorage.getItem('jeju_worker_name') || '';
      document.getElementById('histContent').value = '';
      pendingHistPhotoFile = null;
      document.getElementById('histPhotoCam').value = '';
      document.getElementById('histPhotoGallery').value = '';
      document.getElementById('histPhotoPreview').style.display = 'none';
      document.getElementById('history-modal').style.display = 'block';
    };
    document.getElementById('btnDeletePin').onclick = async () => {
      if (!confirm('해당 계측기와 모든 이력을 삭제하시겠습니까?')) return;
      await supabaseClient.from('instruments').delete().eq('id', item.id);
      document.getElementById('info-modal').style.display = 'none';
      fetchInstruments();
    };
    document.getElementById('info-modal').style.display = 'block';
  }

  function renderHistoryListModal(item) {
    const logs = Array.isArray(item.history_logs) ? item.history_logs : [];
    const listEl = document.getElementById('infoHistoryList');
    if (logs.length === 0) {
      listEl.innerHTML = '<div style="color:#94a3b8; font-size:11px;">등록된 점검 이력이 없습니다.</div>';
      return;
    }
    listEl.innerHTML = logs.map((h, idx) => `
      <div class="history-item">
        <div class="history-item-header">
          <span>${h.date} | 👤 ${h.author}</span>
          <div class="history-actions">
            <button class="btn-hist-action btn-hist-edit" onclick="openEditHistory(${idx})">✏️ 수정</button>
            <button class="btn-hist-action btn-hist-del" onclick="deleteHistoryItem(${idx})">🗑️ 삭제</button>
          </div>
        </div>
        <div style="color:#111; font-weight:bold; font-size:12px; margin-top:2px; white-space: pre-line;">${h.content}</div>
        ${h.photo ? `<img src="${h.photo}" class="hist-img" title="클릭 시 전체화면 확대" onclick="openImageLightbox('${h.photo}')">` : ''}
      </div>
    `).join('');
  }

  window.closeHistoryEditor = function() {
    document.getElementById('history-modal').style.display = 'none';
    if (!historyEditOpenedFromTable) {
      const target = currentInstruments.find(i => i.id === activeTargetId);
      if (target) showDetail(target);
    }
    historyEditOpenedFromTable = false;
  };

  window.openEditHistory = function(idx, openedFromTable = false) {
    const target = currentInstruments.find(i => i.id === activeTargetId);
    if (!target || !target.history_logs[idx]) return;
    const h = target.history_logs[idx];
    editingHistoryIndex = idx;
    historyEditOpenedFromTable = openedFromTable;
    document.getElementById('info-modal').style.display = 'none';
    document.getElementById('histModalTitle').innerText = '✏️ 점검/정비 이력 수정';
    document.getElementById('histTargetTag').innerText = `[${target.tag_no}] ${target.name}`;
    document.getElementById('histDate').value = h.date || new Date().toISOString().slice(0, 10);
    document.getElementById('histAuthor').value = h.author || '';
    document.getElementById('histContent').value = h.content || '';
    pendingHistPhotoFile = null;
    const preview = document.getElementById('histPhotoPreview');
    preview.style.display = h.photo ? 'block' : 'none';
    if (h.photo) preview.src = h.photo;
    document.getElementById('histPhotoCam').value = '';
    document.getElementById('histPhotoGallery').value = '';
    document.getElementById('history-modal').style.display = 'block';
  };

  window.deleteHistoryItem = async function(idx) {
    if (!confirm('해당 점검 이력을 삭제하시겠습니까?')) return;
    const target = currentInstruments.find(i => i.id === activeTargetId);
    if (!target) return;
    target.history_logs.splice(idx, 1);
    const { error } = await supabaseClient.from('instruments').update({ history_logs: target.history_logs }).eq('id', activeTargetId);
    if (!error) {
      invalidateUnifiedData();
      renderHistoryListModal(target);
      alert('✅ 삭제 완료');
      if (selectedSubTab === '관리이력') renderHistoryTable();
    }
  };

  document.getElementById('btnSaveHist').addEventListener('click', async () => {
    const text = document.getElementById('histContent').value.trim();
    const workerName = document.getElementById('histAuthor').value.trim();
    if (!workerName || !text) {
      alert('작업자와 내용을 입력하세요.');
      return;
    }
    alert('⏳ 스토리지에 사진 업로드 및 이력 저장 중...');
    const histPhotoUrl = await uploadImageToStorage(pendingHistPhotoFile);
    localStorage.setItem('jeju_worker_name', workerName);
    currentUserInfo.name = workerName;
    document.getElementById('loginUserBadge').innerText = `👤 ${workerName}`;
    const target = currentInstruments.find(i => i.id === activeTargetId);
    if (!target) return;
    const logs = Array.isArray(target.history_logs) ? [...target.history_logs] : [];
    let finalPhotoUrl = histPhotoUrl;
    if (!finalPhotoUrl && editingHistoryIndex !== null && logs[editingHistoryIndex]) {
      finalPhotoUrl = logs[editingHistoryIndex].photo;
    }
    const entryData = {
      date: document.getElementById('histDate').value,
      author: workerName,
      content: text,
      photo: finalPhotoUrl
    };
    if (editingHistoryIndex !== null) logs[editingHistoryIndex] = entryData;
    else logs.unshift(entryData);
    const { error } = await supabaseClient.from('instruments').update({ history_logs: logs }).eq('id', activeTargetId);
    if (!error) {
      const returnToHistoryTable = historyEditOpenedFromTable;
      target.history_logs = logs;
      document.getElementById('history-modal').style.display = 'none';
      invalidateUnifiedData();
      if (!returnToHistoryTable) {
        renderHistoryListModal(target);
        document.getElementById('info-modal').style.display = 'block';
      }
      alert(editingHistoryIndex !== null ? '✅ 수정 완료' : '✅ 등록 완료');
      editingHistoryIndex = null;
      historyEditOpenedFromTable = false;
      if (selectedSubTab === '관리이력') renderHistoryTable();
    }
  });

  const searchModal = document.getElementById('search-modal');
  const searchInput = document.getElementById('searchInput');
  const searchResultsList = document.getElementById('searchResultsList');

  document.getElementById('btnOpenSearch').addEventListener('click', async () => {
    searchInput.value = '';
    searchModal.style.display = 'block';
    searchResultsList.innerHTML = '<div style="color:#94a3b8;font-size:12px;text-align:center;padding:20px;">전체 등록 정보를 불러오는 중입니다.</div>';
    await loadUnifiedData();
    renderSearchResults('');
    setTimeout(() => searchInput.focus(), 100);
  });

  searchInput.addEventListener('input', (e) => renderSearchResults(e.target.value.trim()));

  function renderSearchResults(query) {
    searchResultsList.replaceChildren();
    if (!query) {
      const guide = document.createElement('div');
      guide.style.cssText = 'color:#94a3b8; font-size:12px; text-align:center; padding:20px;';
      guide.textContent = '검색어를 입력하세요.';
      searchResultsList.appendChild(guide);
      return;
    }

    const ranked = buildUnifiedHistoryRows()
      .map(row => ({
        row,
        score: scoreEquipmentSearch([
          row.source, row.major, row.zone, row.date, row.tag, row.name, row.author, row.content
        ], query)
      }))
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score || String(a.row.tag || '').localeCompare(String(b.row.tag || ''), 'ko'))
      .slice(0, 50);

    if (!ranked.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:#ef4444; font-size:12px; text-align:center; padding:20px;';
      empty.textContent = '검색 결과가 없습니다. 다른 한글·영문 표현이나 Tag 일부를 입력해 보세요.';
      searchResultsList.appendChild(empty);
      return;
    }

    ranked.forEach(({ row }) => {
      const result = document.createElement('div');
      result.className = 'search-result-item';
      result.tabIndex = 0;
      result.setAttribute('role', 'button');
      result.addEventListener('click', () => openUnifiedSearchResult(row));
      result.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openUnifiedSearchResult(row);
        }
      });

      const content = document.createElement('div');
      const main = document.createElement('div');
      main.className = 'search-item-main';
      main.textContent = `${row.source} · ${row.tag !== '-' ? `[${row.tag}] ` : ''}${row.name || '-'}`;
      const sub = document.createElement('div');
      sub.className = 'search-item-sub';
      const summary = String(row.content || '-');
      sub.textContent = `${row.author !== '-' ? `${row.author} · ` : ''}${summary.length > 150 ? `${summary.slice(0, 150)}…` : summary}`;
      content.append(main, sub);

      const badge = document.createElement('div');
      badge.className = 'search-item-badge';
      badge.textContent = `${row.major} · ${row.date}`;
      result.append(content, badge);
      searchResultsList.appendChild(result);
    });
  }

  function openUnifiedSearchResult(row) {
    searchModal.style.display = 'none';
    if (row.instrumentId) {
      jumpToInstrument(row.instrumentId);
      return;
    }
    if (row.action === 'tms') {
      switchMajor(row.major);
      switchSubTab('TMS(환경)');
      startTmsEdit(row.record);
      return;
    }
    if (row.action === 'aiInspection') {
      openAiInspectionRecord(row.record);
      return;
    }
    switchMajor(row.major);
    switchSubTab('관리이력');
    document.getElementById('tableFilterInput').value = row.tag !== '-' ? row.tag : row.name;
    renderHistoryTable();
  }

  window.jumpToInstrument = function(instId) {
    const item = currentInstruments.find(i => i.id === instId);
    if (!item) return;
    searchModal.style.display = 'none';
    const major = item.major_category || '기력';
    switchMajor(major);

    let unitClean = item.unit || '2호기';
    let isAm = false;
    if (unitClean.includes('탈질')) {
      isAm = true;
      unitClean = unitClean.replace('_탈질', '');
    }
    switchSubTab(unitClean);

    if (major === '기력' && (unitClean === '2호기' || unitClean === '3호기')) {
      switchSection(isAm ? '탈질' : '보일러');
    }

    const floorFileNameMap = {
      'IDF': 'assets/floor-plans/idf/IDF_FRONT.PNG',
      '1층': 'assets/floor-plans/boiler/floor_1f.jpg', '2층': 'assets/floor-plans/boiler/floor_2f.jpg', '2.5층': 'assets/floor-plans/boiler/floor_2_5f.jpg',
      '3층': 'assets/floor-plans/boiler/floor_3f.jpg', '3.1/3층': 'assets/floor-plans/boiler/floor_3_1_3f.jpg', '3.2/3층': 'assets/floor-plans/boiler/floor_3_2_3f.jpg',
      '4층': 'assets/floor-plans/boiler/floor_4f.jpg', '4.5층': 'assets/floor-plans/boiler/floor_4_5f.jpg', '5층': 'assets/floor-plans/boiler/floor_5f.jpg',
      '5.5층': 'assets/floor-plans/boiler/floor_5_5f.jpg', '6층': 'assets/floor-plans/boiler/floor_6f.jpg', '7층': 'assets/floor-plans/boiler/floor_7f.jpg',
      '탈질 1층': 'assets/floor-plans/denitrification/am_floor_1f.jpg', '탈질 3층': 'assets/floor-plans/denitrification/am_floor_3f.jpg',
      '탈질 3.1/3층': 'assets/floor-plans/denitrification/am_floor_3_1_3f.jpg', '탈질 4.5층': 'assets/floor-plans/denitrification/am_4_5f.jpg',
      '암모니아 탱크 구역': 'assets/floor-plans/ammonia-tank/am_tank_floor.jpg', '연료펌프 1층': 'assets/floor-plans/fuel-pump-room/fuel_floor_1f.jpg'
    };

    const targetFloor = normalizeFloor(item.floor);
    const engineFloorFileNameMap = {
      '지하층': 'assets/floor-plans/engine/engine_floor_b1.jpg',
      '1층': 'assets/floor-plans/engine/engine_floor_1f.jpg',
      '2층': 'assets/floor-plans/engine/engine_floor_2f.jpg',
      '3층': 'assets/floor-plans/engine/engine_floor_3f.jpg'
    };
    const targetFile = major === '내연'
      ? (engineFloorFileNameMap[targetFloor] || 'assets/floor-plans/engine/engine_floor_3f.jpg')
      : (floorFileNameMap[targetFloor] || 'assets/floor-plans/boiler/floor_1f.jpg');
    switchViewMode('floor');
    openFloorRoom(targetFloor, targetFile, null);
    scale = 1.0;
    panX = (700 - item.coord_x) * scale;
    panY = (500 - item.coord_y) * scale;
    updateTransform();
    setTimeout(() => {
      const pinEl = document.getElementById(`floor-pin-${item.id}`);
      if (pinEl) {
        pinEl.classList.add('pin-highlight');
        setTimeout(() => pinEl.classList.remove('pin-highlight'), 3500);
      }
      showDetail(item);
    }, 200);
  };

  localStorage.removeItem('jeju_admin_bio_auth');
  sessionStorage.removeItem('jeju_admin_auth');
  const rememberedLoginEmail = localStorage.getItem('jeju_login_email');
  if (rememberedLoginEmail) document.getElementById('loginEmail').value = rememberedLoginEmail;

  supabaseClient.auth.getUser().then(async ({ data, error }) => {
    if (error || !data.user) return;
    const email = data.user.email || 'user@jeju.com';
    const savedName = localStorage.getItem('jeju_worker_name') || email.split('@')[0];
    const profile = await blockUnapprovedUser(data.user, savedName, email, document.getElementById('loginMsg'));
    if (!profile) return;
    unlock(savedName, email, data.user);
  });
