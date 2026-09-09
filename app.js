const ADMIN_MASTER_PASS = 'dydy423156!!##';
const SUPABASE_URL = 'https://euohxdxddvyldtfdvpkk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_p3OXbhWhj04w_eFGMpu83w_ZbybQ_t_';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentInstruments = [];
let currentUserInfo = { name: '', email: '' };
let selectedUnit = '2호기';
let selectedFloor = 'ALL';
let activeTargetId = null;
let editingHistoryIndex = null;
let clickedFloorCoord = { x: 0, y: 0 };
let isMeasureMode = false;

let currentInstPhotoBase64 = '';
let initHistPhotoBase64 = '';
let currentHistPhotoBase64 = '';

let scale = 0.65;
let panX = 0, panY = 0;
let isDragging = false;
let dragStartX = 0, dragStartY = 0;
let initialPinchDist = 0;
let initialScale = 0.65;

let activeDraggingPin = null;
let activeDraggingItem = null;
let isPinMoving = false;

// WebAuthn 제어 변수
let bioAbortController = null;
let isBioProcessing = false;

const floor3DHeights = {
  '1층': 8.14, '2층': 11.50, '2.5층': 14.50, '3층': 17.50, '3.1/3층': 20.50,
  '3.2/3층': 23.50, '4층': 26.50, '4.5층': 29.50, '5층': 32.50, '5.5층': 35.50,
  '6층': 38.50, '7층': 44.80
};

const floorCorners2D = {
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

/* --- 전역 모달 제어 함수 --- */
window.closeModal = function(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.style.display = 'none';
};

/* --- WebAuthn 생체인식 인코딩 유틸 --- */
function bufferToBase64URL(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64URLToBuffer(base64url) {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// 1. 지문 등록
const btnRegisterBio = document.getElementById('btnRegisterBio');
if (btnRegisterBio) {
  btnRegisterBio.addEventListener('click', async () => {
    if (isBioProcessing) {
      alert('⏳ 이미 생체 인증 요청이 진행 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    if (!window.PublicKeyCredential) {
      alert('⚠️ 브라우저/기기가 WebAuthn 생체인식을 지원하지 않습니다.');
      return;
    }

    try {
      const isAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!isAvailable) {
        alert('⚠️ 기기에 등록된 지문 또는 화면 잠금(PIN/패턴)이 없습니다.\n스마트폰 설정에서 지문을 먼저 등록해 주세요.');
        return;
      }
    } catch (e) {
      console.warn(e);
    }

    if (bioAbortController) bioAbortController.abort();
    bioAbortController = new AbortController();
    isBioProcessing = true;

    const workerName = currentUserInfo.name || localStorage.getItem('jeju_worker_name') || '작업자';

    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      const userId = new TextEncoder().encode('jeju_' + workerName);

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: {
            name: '제주 보일러 계측관리',
            id: window.location.hostname
          },
          user: {
            id: userId,
            name: workerName,
            displayName: workerName
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' },
            { alg: -257, type: 'public-key' }
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'preferred',
            residentKey: 'preferred'
          },
          timeout: 60000
        },
        signal: bioAbortController.signal
      });

      if (credential) {
        const rawIdString = bufferToBase64URL(credential.rawId);
        localStorage.setItem('jeju_bio_credential_id', rawIdString);
        localStorage.setItem('jeju_bio_user_name', workerName);
        alert(`✅ [${workerName}] 님의 생체인증이 등록되었습니다!\n로그아웃 후 지문 버튼으로 즉시 로그인할 수 있습니다.`);
      }
    } catch (err) {
      console.error('생체 등록 상세:', err);
      if (err.name === 'NotAllowedError') {
        alert('⚠️ 인증이 취소되었거나 화면 잠금이 해제되지 않았습니다.');
      } else if (err.name !== 'AbortError') {
        alert(`❌ 지문 등록 실패: ${err.message}`);
      }
    } finally {
      isBioProcessing = false;
      bioAbortController = null;
    }
  });
}

// 2. 지문 로그인
const btnBioLogin = document.getElementById('btnBioLogin');
if (btnBioLogin) {
  btnBioLogin.addEventListener('click', async () => {
    if (isBioProcessing) return;

    const credIdString = localStorage.getItem('jeju_bio_credential_id');
    const savedName = localStorage.getItem('jeju_bio_user_name') || '작업자';
    const msgEl = document.getElementById('bioLoginMsg');
    if (msgEl) msgEl.style.display = 'none';

    if (!credIdString) {
      if (msgEl) {
        msgEl.innerText = '⚠️ 등록된 지문 정보가 없습니다. 먼저 사번 로그인 후 우측 상단의 [지문] 버튼으로 등록해 주세요.';
        msgEl.style.display = 'block';
      }
      return;
    }

    if (bioAbortController) bioAbortController.abort();
    bioAbortController = new AbortController();
    isBioProcessing = true;

    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: window.location.hostname,
          allowCredentials: [{
            id: base64URLToBuffer(credIdString),
            type: 'public-key'
          }],
          userVerification: 'preferred',
          timeout: 60000
        },
        signal: bioAbortController.signal
      });

      if (assertion) {
        unlock(savedName, `${savedName}@jeju.com`);
      }
    } catch (err) {
      console.error('생체 로그인 상세:', err);
      if (err.name !== 'AbortError' && msgEl) {
        msgEl.innerText = '⚠️ 생체 인증이 취소되었거나 실패했습니다. 사번으로 로그인하세요.';
        msgEl.style.display = 'block';
      }
    } finally {
      isBioProcessing = false;
      bioAbortController = null;
    }
  });
}

/* --- 대분류 호기 전환 함수 (전역 등록) --- */
window.switchUnit = function(unit) {
  selectedUnit = unit;
  const tab2 = document.getElementById('tab-unit-2');
  const tab3 = document.getElementById('tab-unit-3');
  if (tab2) tab2.classList.toggle('active', unit === '2호기');
  if (tab3) tab3.classList.toggle('active', unit === '3호기');
  updateFloorTitle();
  renderFloorPins();
  render3DHotspots();
};

function updateFloorTitle() {
  const floorTag = document.getElementById('currentFloorTag');
  const roomTitle = document.getElementById('roomTitleText');
  if (selectedFloor === 'ALL') {
    if (floorTag) floorTag.innerText = `기력 ${selectedUnit} 전체`;
  } else {
    if (floorTag) floorTag.innerText = `기력 ${selectedUnit} ${selectedFloor}`;
    if (roomTitle) roomTitle.innerText = `📍 [기력 ${selectedUnit} - ${selectedFloor}] 도면 공간`;
  }
}

function compressImage(file, callback) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const MAX_SIZE = 300;
      let width = img.width;
      let height = img.height;
      if (width > height && width > MAX_SIZE) {
        height *= MAX_SIZE / width;
        width = MAX_SIZE;
      } else if (height > MAX_SIZE) {
        width *= MAX_SIZE / height;
        height = MAX_SIZE;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL('image/jpeg', 0.65));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// 사진 첨부 이벤트 리스너 연결
const instCam = document.getElementById('instPhotoCam');
const instGal = document.getElementById('instPhotoGallery');
if (instCam) instCam.addEventListener('change', (e) => handleInstPhoto(e.target.files[0]));
if (instGal) instGal.addEventListener('change', (e) => handleInstPhoto(e.target.files[0]));

function handleInstPhoto(file) {
  compressImage(file, (base64) => {
    currentInstPhotoBase64 = base64;
    const preview = document.getElementById('photoPreview');
    if (preview) {
      preview.src = base64;
      preview.style.display = 'block';
    }
  });
}

const initCam = document.getElementById('initHistPhotoCam');
const initGal = document.getElementById('initHistPhotoGallery');
if (initCam) initCam.addEventListener('change', (e) => handleInitHistPhoto(e.target.files[0]));
if (initGal) initGal.addEventListener('change', (e) => handleInitHistPhoto(e.target.files[0]));

function handleInitHistPhoto(file) {
  compressImage(file, (base64) => {
    initHistPhotoBase64 = base64;
    const preview = document.getElementById('initHistPreview');
    if (preview) {
      preview.src = base64;
      preview.style.display = 'block';
    }
  });
}

const histCam = document.getElementById('histPhotoCam');
const histGal = document.getElementById('histPhotoGallery');
if (histCam) histCam.addEventListener('change', (e) => handleHistPhoto(e.target.files[0]));
if (histGal) histGal.addEventListener('change', (e) => handleHistPhoto(e.target.files[0]));

function handleHistPhoto(file) {
  compressImage(file, (base64) => {
    currentHistPhotoBase64 = base64;
    const preview = document.getElementById('histPhotoPreview');
    if (preview) {
      preview.src = base64;
      preview.style.display = 'block';
    }
  });
}

const updateCam = document.getElementById('updateMainPhotoCam');
const updateGal = document.getElementById('updateMainPhotoGallery');
if (updateCam) updateCam.addEventListener('change', (e) => handleUpdateMainPhoto(e.target.files[0]));
if (updateGal) updateGal.addEventListener('change', (e) => handleUpdateMainPhoto(e.target.files[0]));

function handleUpdateMainPhoto(file) {
  compressImage(file, async (base64) => {
    const target = currentInstruments.find(i => i.id === activeTargetId);
    if (!target) return;
    target.photo_url = base64;
    target.image_data = base64;
    const mainImg = document.getElementById('infoMainImg');
    if (mainImg) {
      mainImg.src = base64;
      mainImg.style.display = 'block';
    }

    await supabaseClient.from('instruments').update({
      photo_url: base64,
      image_data: base64
    }).eq('id', activeTargetId);

    renderFloorPins();
    render3DHotspots();
    alert('✅ 기기 대표 사진이 업데이트되었습니다.');
  });
}

function unlock(name, email = 'user@jeju.com') {
  const savedName = localStorage.getItem('jeju_worker_name');
  const finalName = savedName || name;
  currentUserInfo = { name: finalName, email };
  const authOverlay = document.getElementById('auth-overlay');
  const userBadge = document.getElementById('loginUserBadge');
  if (authOverlay) authOverlay.style.display = 'none';
  if (userBadge) userBadge.innerText = `👤 ${finalName}`;
  fetchInstruments();
}

// 관리자 & 팀원 로그인 폼 이벤트
const btnGoAdmin = document.getElementById('btnGoAdmin');
if (btnGoAdmin) {
  btnGoAdmin.addEventListener('click', () => {
    document.getElementById('login-box').style.display = 'none';
    document.getElementById('admin-login-box').style.display = 'block';
  });
}

const linkBackLogin = document.getElementById('linkBackLogin');
if (linkBackLogin) {
  linkBackLogin.addEventListener('click', () => {
    document.getElementById('admin-login-box').style.display = 'none';
    document.getElementById('login-box').style.display = 'block';
  });
}

const linkToRegister = document.getElementById('linkToRegister');
if (linkToRegister) {
  linkToRegister.addEventListener('click', () => {
    document.getElementById('login-box').style.display = 'none';
    document.getElementById('register-box').style.display = 'block';
    setTimeout(() => {
      const regName = document.getElementById('regName');
      if (regName) regName.focus();
    }, 150);
  });
}

const linkBackLogin2 = document.getElementById('linkBackLogin2');
if (linkBackLogin2) {
  linkBackLogin2.addEventListener('click', () => {
    document.getElementById('register-box').style.display = 'none';
    document.getElementById('login-box').style.display = 'block';
  });
}

const btnAdminSubmit = document.getElementById('btnAdminSubmit');
if (btnAdminSubmit) {
  btnAdminSubmit.addEventListener('click', () => {
    const inputPass = document.getElementById('adminPassInput').value.trim();
    if (inputPass === ADMIN_MASTER_PASS) {
      sessionStorage.setItem('jeju_admin_auth', 'true');
      const defaultName = localStorage.getItem('jeju_worker_name') || '관리자';
      unlock(defaultName, 'admin@jeju.com');
    } else {
      document.getElementById('adminErrorMsg').style.display = 'block';
    }
  });
}

const btnMemberLogin = document.getElementById('btnMemberLogin');
if (btnMemberLogin) {
  btnMemberLogin.addEventListener('click', () => {
    const email = document.getElementById('loginEmail').value.trim();
    if (!email) {
      alert('사번(이메일)을 입력해 주세요.');
      return;
    }
    const namePart = email.split('@')[0];
    localStorage.setItem('jeju_worker_name', namePart);
    unlock(namePart, email);
  });
}

const btnRegisterSubmit = document.getElementById('btnRegisterSubmit');
if (btnRegisterSubmit) {
  btnRegisterSubmit.addEventListener('click', async () => {
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPassword').value.trim();
    const regMsg = document.getElementById('regMsg');

    if (!name || !email || !pass) {
      if (regMsg) {
        regMsg.innerText = '⚠️ 이름, 사번(이메일), 비밀번호를 모두 입력해 주세요.';
        regMsg.style.display = 'block';
      }
      return;
    }
    if (pass.length < 6) {
      if (regMsg) {
        regMsg.innerText = '⚠️ 비밀번호는 최소 6자리 이상이어야 합니다.';
        regMsg.style.display = 'block';
      }
      return;
    }

    if (regMsg) regMsg.style.display = 'none';
    localStorage.setItem('jeju_worker_name', name);

    try {
      await supabaseClient.auth.signUp({ email, password: pass });
    } catch (e) {
      console.warn('Auth fallback:', e);
    }

    alert(`🎉 [${name}] 팀원님, 환영합니다!\n성공적으로 등록되었습니다.`);
    unlock(name, email);
  });
}

const btnLogout = document.getElementById('btnLogout');
if (btnLogout) {
  btnLogout.addEventListener('click', () => {
    sessionStorage.removeItem('jeju_admin_auth');
    location.reload();
  });
}

/* --- 뷰어 및 캔버스 요소 제어 --- */
const canvasWrap = document.getElementById('floor-canvas-wrap');
const board = document.getElementById('floor-board');
const notice = document.getElementById('noImgNotice');
const viewer = document.getElementById('boilerViewer');
const measureHud = document.getElementById('measure-info-hud');
const btnMeasure = document.getElementById('btnToggleMeasure');

function updateMeasureHudPrompt() {
  if (!isMeasureMode || !measureHud) {
    if (measureHud) measureHud.style.display = 'none';
    return;
  }
  measureHud.style.display = 'block';
  if (selectedFloor === 'ALL') {
    measureHud.innerText = `📐 [기력 ${selectedUnit}] 3D 모델 표면 터치 시 좌표가 측정·복사됩니다.`;
  } else {
    measureHud.innerText = `📐 [기력 ${selectedUnit} - ${selectedFloor} 도면] 터치 지점의 2D 도면 좌표가 측정·복사됩니다.`;
  }
}

if (btnMeasure) {
  btnMeasure.addEventListener('click', () => {
    isMeasureMode = !isMeasureMode;
    if (isMeasureMode) {
      btnMeasure.classList.add('active');
      btnMeasure.innerText = '📐 계측 ON';
      updateMeasureHudPrompt();
    } else {
      btnMeasure.classList.remove('active');
      btnMeasure.innerText = '📐 계측';
      if (measureHud) measureHud.style.display = 'none';
      const tempMarker = viewer ? viewer.querySelector('#temp-measure-marker') : null;
      if (tempMarker) tempMarker.remove();
      const marker2d = board ? board.querySelector('#temp-measure-marker-2d') : null;
      if (marker2d) marker2d.remove();
    }
  });
}

if (viewer) {
  viewer.addEventListener('click', (event) => {
    if (!isMeasureMode) return;
    const rect = viewer.getBoundingClientRect();
    const hit = viewer.positionAndNormalFromPoint(event.clientX - rect.left, event.clientY - rect.top);
    if (hit) {
      const posStr = `${hit.position.x.toFixed(2)} ${hit.position.y.toFixed(2)} ${hit.position.z.toFixed(2)}`;
      let marker = viewer.querySelector('#temp-measure-marker');
      if (!marker) {
        marker = document.createElement('button');
        marker.id = 'temp-measure-marker';
        marker.className = 'measure-marker';
        marker.slot = 'hotspot-measure-point';
        viewer.appendChild(marker);
      }
      marker.dataset.position = `${hit.position.x} ${hit.position.y} ${hit.position.z}`;
      if (measureHud) {
        measureHud.innerHTML = `📍 3D 좌표: <b style="color:#38bdf8;">${posStr}</b> (복사됨)`;
      }
      navigator.clipboard.writeText(posStr).catch(() => {});
    } else {
      if (measureHud) measureHud.innerText = '⚠️ 모델 표면 위를 터치해 주세요.';
    }
  });

  viewer.addEventListener('camera-change', () => {
    const orbit = viewer.getCameraOrbit();
    if (!orbit) return;
    const dist = orbit.radius;
    const pinScale = Math.max(0.5, Math.min(1.5, (380 / dist) * 1.0));
    document.querySelectorAll('.hotspot-pin').forEach(pin => {
      pin.style.setProperty('--pin-scale', pinScale);
    });
  });
}

/* --- 전역 층별 도면 오픈 및 줌 함수 --- */
window.openFloorRoom = function(floor, imgFile, btn) {
  selectedFloor = floor;
  document.querySelectorAll('.floor-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  document.getElementById('overall-3d-view').style.display = 'none';
  document.getElementById('floor-room-view').style.display = 'block';
  updateFloorTitle();

  const testImg = new Image();
  testImg.src = `./${imgFile}`;
  testImg.onload = () => {
    board.style.backgroundImage = `url('./${imgFile}')`;
    if (notice) notice.style.display = 'none';
  };
  testImg.onerror = () => {
    board.style.backgroundImage = 'none';
    if (notice) {
      notice.innerText = `⚠️ [${imgFile}] 파일을 찾을 수 없습니다.`;
      notice.style.display = 'block';
    }
  };

  resetCanvasView();
  renderFloorPins();
  updateMeasureHudPrompt();
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
  updateMeasureHudPrompt();
};

function updateTransform() {
  if (board) {
    board.style.transform = `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${scale})`;
  }
}

window.zoomCanvas = function(delta) {
  scale = Math.max(0.3, Math.min(3.5, scale + delta));
  updateTransform();
};

window.resetCanvasView = function() {
  scale = 0.65;
  panX = 0;
  panY = 0;
  updateTransform();
};

// 캔버스 팬/줌 이벤트
if (canvasWrap) {
  canvasWrap.addEventListener('touchstart', (e) => {
    if (isPinMoving || e.target.closest('.floor-inst-pin')) return;
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
    if (isPinMoving || e.target.closest('.floor-inst-pin')) return;
    e.preventDefault();
    if (e.touches.length === 1 && isDragging) {
      panX = e.touches[0].clientX - dragStartX;
      panY = e.touches[0].clientY - dragStartY;
      updateTransform();
    } else if (e.touches.length === 2) {
      const currentDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (initialPinchDist > 0) {
        scale = Math.max(0.3, Math.min(3.5, initialScale * (currentDist / initialPinchDist)));
        updateTransform();
      }
    }
  }, { passive: false });

  canvasWrap.addEventListener('touchend', () => { isDragging = false; });

  canvasWrap.addEventListener('mousedown', (e) => {
    if (isPinMoving || e.target.closest('.floor-inst-pin')) return;
    isDragging = true;
    dragStartX = e.clientX - panX;
    dragStartY = e.clientY - panY;
    canvasWrap.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (isPinMoving || !isDragging) return;
    panX = e.clientX - dragStartX;
    panY = e.clientY - dragStartY;
    updateTransform();
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    if (canvasWrap) canvasWrap.style.cursor = 'grab';
  });

  canvasWrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomCanvas(e.deltaY < 0 ? 0.15 : -0.15);
  }, { passive: false });
}

// 도면 클릭 시 신규 등록 모달
if (board) {
  board.addEventListener('click', (e) => {
    if (isPinMoving || e.target.closest('.floor-inst-pin')) return;
    const rect = board.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / scale;
    const clickY = (e.clientY - rect.top) / scale;
    const curX = Math.round(Math.max(0, Math.min(1400, clickX)));
    const curY = Math.round(Math.max(0, Math.min(1000, clickY)));

    if (isMeasureMode) {
      let marker2d = board.querySelector('#temp-measure-marker-2d');
      if (!marker2d) {
        marker2d = document.createElement('div');
        marker2d.id = 'temp-measure-marker-2d';
        marker2d.className = 'measure-marker-2d';
        board.appendChild(marker2d);
      }
      marker2d.style.left = `${curX}px`;
      marker2d.style.top = `${curY}px`;
      const coordMsg = `X: ${curX}, Y: ${curY}`;
      if (measureHud) {
        measureHud.innerHTML = `📍 2D 도면 좌표: <b style="color:#38bdf8;">${coordMsg}</b> (복사됨)`;
      }
      navigator.clipboard.writeText(`X:${curX} Y:${curY}`).catch(() => {});
      return;
    }

    clickedFloorCoord = { x: curX, y: curY };
    document.getElementById('tagNo').value = '';
    document.getElementById('name').value = '';
    document.getElementById('model').value = '';
    document.getElementById('range').value = '';
    currentInstPhotoBase64 = '';
    const camIn = document.getElementById('instPhotoCam');
    const galIn = document.getElementById('instPhotoGallery');
    if (camIn) camIn.value = '';
    if (galIn) galIn.value = '';
    const prev = document.getElementById('photoPreview');
    if (prev) prev.style.display = 'none';

    initHistPhotoBase64 = '';
    const iCam = document.getElementById('initHistPhotoCam');
    const iGal = document.getElementById('initHistPhotoGallery');
    if (iCam) iCam.value = '';
    if (iGal) iGal.value = '';
    const iPrev = document.getElementById('initHistPreview');
    if (iPrev) iPrev.style.display = 'none';

    document.getElementById('initHistAuthor').value = currentUserInfo.name || localStorage.getItem('jeju_worker_name') || '';
    document.getElementById('initHistContent').value = '';
    document.getElementById('modalUnitText').innerText = selectedUnit;
    document.getElementById('modalFloorText').innerText = selectedFloor;
    document.getElementById('modal').style.display = 'block';
  });
}

// 신규 계측기 저장
const btnSaveInst = document.getElementById('btnSaveInst');
if (btnSaveInst) {
  btnSaveInst.addEventListener('click', async () => {
    const tag = document.getElementById('tagNo').value.trim();
    const name = document.getElementById('name').value.trim();
    if (!tag || !name) {
      alert('Tag No와 기기명을 입력하세요.');
      return;
    }

    const initialLogs = [];
    const initContent = document.getElementById('initHistContent').value.trim();
    const initAuthor = document.getElementById('initHistAuthor').value.trim() || currentUserInfo.name || '관리자';

    if (initContent) {
      initialLogs.push({
        date: new Date().toISOString().slice(0, 10),
        author: initAuthor,
        content: initContent,
        photo: initHistPhotoBase64 || null
      });
      localStorage.setItem('jeju_worker_name', initAuthor);
      currentUserInfo.name = initAuthor;
      const ub = document.getElementById('loginUserBadge');
      if (ub) ub.innerText = `👤 ${initAuthor}`;
    }

    const insertData = {
      tag_no: tag,
      name: name,
      model: document.getElementById('model').value.trim() || 'EMPTY',
      signal_range: document.getElementById('range').value.trim() || 'EMPTY',
      floor: selectedFloor,
      unit: selectedUnit,
      coord_x: clickedFloorCoord.x,
      coord_y: clickedFloorCoord.y,
      x_coord: clickedFloorCoord.x,
      y_coord: clickedFloorCoord.y,
      model_position: '0 0 0',
      history_logs: initialLogs,
      photo_url: currentInstPhotoBase64 || null,
      image_data: currentInstPhotoBase64 || null
    };

    let { error } = await supabaseClient.from('instruments').insert([insertData]);

    if (error && error.message && error.message.toLowerCase().includes('unit')) {
      delete insertData.unit;
      insertData.floor = `${selectedUnit}_${selectedFloor}`;
      const fallback = await supabaseClient.from('instruments').insert([insertData]);
      error = fallback.error;
    }

    if (!error) {
      document.getElementById('modal').style.display = 'none';
      alert(`✅ [기력 ${selectedUnit}] ${selectedFloor}에 등록되었습니다!`);
      fetchInstruments();
    } else {
      alert('❌ 저장 실패!\n' + error.message);
    }
  });
}

// DB 계측기 데이터 가져오기
async function fetchInstruments() {
  const { data, error } = await supabaseClient.from('instruments').select('*');
  if (!error) {
    currentInstruments = (data || []).map(item => {
      let f = item.floor;
      let u = item.unit || '2호기';

      if (typeof f === 'string' && f.includes('_')) {
        const parts = f.split('_');
        u = parts[0];
        f = parts[1];
      }

      if (f !== null && f !== undefined) {
        f = String(f);
        if (!f.includes('층')) f += '층';
      } else {
        f = '6층';
      }

      let cx = parseFloat(item.coord_x ?? item.x_coord ?? 400);
      let cy = parseFloat(item.coord_y ?? item.y_coord ?? 400);
      if (isNaN(cx) || cx === 0) cx = 400;
      if (isNaN(cy) || cy === 0) cy = 400;

      const img = item.photo_url || item.image_data || null;

      return {
        ...item,
        floor: f,
        unit: u,
        coord_x: cx,
        coord_y: cy,
        photo_url: img,
        image_data: img,
        history_logs: Array.isArray(item.history_logs) ? item.history_logs : []
      };
    });
    renderFloorPins();
    render3DHotspots();
  }
}

// 2D 핀 렌더링 & 2초 롱프레스 이동
function renderFloorPins() {
  if (!board) return;
  board.querySelectorAll('.floor-inst-pin').forEach(el => el.remove());
  currentInstruments.forEach(item => {
    if (item.unit !== selectedUnit || item.floor !== selectedFloor) return;
    const pin = document.createElement('div');
    pin.id = `floor-pin-${item.id}`;
    pin.className = 'floor-inst-pin';
    pin.style.left = `${item.coord_x}px`;
    pin.style.top = `${item.coord_y}px`;

    const img = item.photo_url || item.image_data;
    if (img) {
      pin.style.backgroundImage = `url(${img})`;
      pin.innerHTML = `<span>${item.tag_no}</span>`;
    } else {
      pin.innerHTML = `📍<span>${item.tag_no}</span>`;
    }

    let pressTimer = null;
    let startClientX = 0;
    let startClientY = 0;
    let isLongPressed = false;

    pin.oncontextmenu = (e) => {
      e.preventDefault();
      return false;
    };

    pin.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.stopPropagation();

      startClientX = e.clientX;
      startClientY = e.clientY;
      isLongPressed = false;

      pin.classList.add('pin-pressing');
      if (measureHud) {
        measureHud.style.display = 'block';
        measureHud.innerText = `⏳ [${item.tag_no}] 2초간 누르고 있으면 이동할 수 있습니다...`;
      }

      pressTimer = setTimeout(() => {
        isLongPressed = true;
        isPinMoving = true;
        activeDraggingPin = pin;
        activeDraggingItem = item;

        pin.classList.remove('pin-pressing');
        pin.classList.add('pin-dragging');
        pin.setPointerCapture(e.pointerId);

        if (navigator.vibrate) navigator.vibrate([80, 50, 80]);
        if (measureHud) {
          measureHud.innerText = `📍 [${item.tag_no}] 이동 모드 활성화! 원하는 위치로 드래그하세요.`;
        }
      }, 2000);
    });

    pin.addEventListener('pointermove', (e) => {
      if (isLongPressed && isPinMoving) {
        e.preventDefault();
        e.stopPropagation();
        const rect = board.getBoundingClientRect();
        const curX = Math.round(Math.max(0, Math.min(1400, (e.clientX - rect.left) / scale)));
        const curY = Math.round(Math.max(0, Math.min(1000, (e.clientY - rect.top) / scale)));
        pin.style.left = `${curX}px`;
        pin.style.top = `${curY}px`;
      } else if (pressTimer) {
        const dist = Math.hypot(e.clientX - startClientX, e.clientY - startClientY);
        if (dist > 10) {
          clearTimeout(pressTimer);
          pressTimer = null;
          pin.classList.remove('pin-pressing');
          if (!isMeasureMode && measureHud) measureHud.style.display = 'none';
        }
      }
    });

    const handlePointerUpOrCancel = async (e) => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
      pin.classList.remove('pin-pressing');

      if (isLongPressed && isPinMoving) {
        e.stopPropagation();
        try {
          pin.releasePointerCapture(e.pointerId);
        } catch (err) {}
        pin.classList.remove('pin-dragging');
        isPinMoving = false;

        const finalX = parseInt(pin.style.left);
        const finalY = parseInt(pin.style.top);

        item.coord_x = finalX;
        item.coord_y = finalY;
        item.x_coord = finalX;
        item.y_coord = finalY;

        if (measureHud) {
          measureHud.innerText = `✅ [${item.tag_no}] 새 위치(X:${finalX}, Y:${finalY})로 변경되었습니다.`;
          setTimeout(() => {
            if (!isMeasureMode && measureHud) measureHud.style.display = 'none';
          }, 2500);
        }

        await supabaseClient.from('instruments').update({
          coord_x: finalX,
          coord_y: finalY,
          x_coord: finalX,
          y_coord: finalY
        }).eq('id', item.id);

        render3DHotspots();
        activeDraggingPin = null;
        activeDraggingItem = null;
      } else {
        if (!isMeasureMode && measureHud) measureHud.style.display = 'none';
        showDetail(item);
      }
    };

    pin.addEventListener('pointerup', handlePointerUpOrCancel);
    pin.addEventListener('pointercancel', handlePointerUpOrCancel);

    board.appendChild(pin);
  });
}

// 3D 핫스팟 렌더링
function render3DHotspots() {
  if (!viewer) return;
  viewer.querySelectorAll('.hotspot-pin').forEach(el => el.remove());
  currentInstruments.forEach(item => {
    if (item.unit !== selectedUnit) return;

    let pos = item.model_position;
    if (!pos || pos === '0 0 0') {
      const h = floor3DHeights[item.floor] !== undefined ? floor3DHeights[item.floor] : 26;

      const bounds = floorCorners2D[item.floor] || floorCorners2D['1층'];
      const minX = bounds.c1.x;
      const maxX = bounds.c4.x;
      const minY = bounds.c1.y;
      const maxY = bounds.c4.y;

      const spanX = maxX - minX || 1;
      const spanY = maxY - minY || 1;
      const u = (item.coord_x - minX) / spanX;
      const v = (item.coord_y - minY) / spanY;

      const P1 = { x: 19.96, z: -11.43 };
      const P2 = { x: 30.93, z: 6.89 };
      const P3 = { x: 1.65,  z: -0.47 };
      const P4 = { x: 12.61, z: 17.85 };

      const x3d = P1.x + (u * (P2.x - P1.x)) + (v * (P3.x - P1.x));
      const z3d = P1.z + (u * (P2.z - P1.z)) + (v * (P3.z - P1.z));

      pos = `${x3d.toFixed(2)} ${h} ${z3d.toFixed(2)}`;
    }

    const btn = document.createElement('button');
    btn.className = 'hotspot-pin';
    btn.slot = `hotspot-${item.id}`;
    btn.dataset.position = pos;

    const img = item.photo_url || item.image_data;
    if (img) {
      btn.style.backgroundImage = `url(${img})`;
      btn.innerHTML = `<span>${item.floor} (${item.tag_no})</span>`;
    } else {
      btn.innerHTML = `📍<span>${item.floor} (${item.tag_no})</span>`;
    }

    btn.onclick = (e) => {
      e.stopPropagation();
      showDetail(item);
    };
    viewer.appendChild(btn);
  });
}

// 상세 정보 모달 오픈
function showDetail(item) {
  activeTargetId = item.id;
  document.getElementById('infoTitle').innerText = `[${item.tag_no}] ${item.name}`;

  const mainImg = document.getElementById('infoMainImg');
  const img = item.photo_url || item.image_data;
  if (img) {
    mainImg.src = img;
    mainImg.style.display = 'block';
  } else {
    mainImg.style.display = 'none';
  }

  document.getElementById('infoBody').innerHTML = `
    <div><b>호기:</b> <span style="color:#38bdf8; font-weight:bold;">기력 ${item.unit || '2호기'}</span></div>
    <div><b>배치:</b> <span style="color:#0284c7; font-weight:bold;">${item.floor}</span></div>
    <div><b>모델명:</b> ${item.model || '-'}</div>
    <div><b>측정범위:</b> ${item.signal_range || '-'}</div>
  `;

  renderHistoryList(item);

  const btnAddHist = document.getElementById('btnAddHistBtn');
  if (btnAddHist) {
    btnAddHist.onclick = () => {
      editingHistoryIndex = null;
      document.getElementById('info-modal').style.display = 'none';
      document.getElementById('histModalTitle').innerText = '📋 새 점검/정비 이력 추가';
      document.getElementById('histTargetTag').innerText = `[${item.tag_no}] ${item.name}`;
      document.getElementById('histDate').value = new Date().toISOString().slice(0, 10);
      document.getElementById('histAuthor').value = currentUserInfo.name || localStorage.getItem('jeju_worker_name') || '';
      document.getElementById('histContent').value = '';
      currentHistPhotoBase64 = '';
      const hCam = document.getElementById('histPhotoCam');
      const hGal = document.getElementById('histPhotoGallery');
      if (hCam) hCam.value = '';
      if (hGal) hGal.value = '';
      const hPrev = document.getElementById('histPhotoPreview');
      if (hPrev) hPrev.style.display = 'none';
      document.getElementById('history-modal').style.display = 'block';
    };
  }

  const btnDelPin = document.getElementById('btnDeletePin');
  if (btnDelPin) {
    btnDelPin.onclick = async () => {
      if (!confirm('해당 계측기와 모든 이력을 완전히 삭제하시겠습니까?')) return;
      await supabaseClient.from('instruments').delete().eq('id', item.id);
      document.getElementById('info-modal').style.display = 'none';
      fetchInstruments();
    };
  }

  document.getElementById('info-modal').style.display = 'block';
}

function renderHistoryList(item) {
  const logs = Array.isArray(item.history_logs) ? item.history_logs : [];
  const listEl = document.getElementById('infoHistoryList');
  if (!listEl) return;
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
      <div style="color:#111; font-weight:bold; font-size:12px; margin-top:2px;">${h.content}</div>
      ${h.photo ? `<img src="${h.photo}" class="hist-img">` : ''}
    </div>
  `).join('');
}

// 점검 이력 수정/삭제 전역 바인딩
window.openEditHistory = function(idx) {
  const target = currentInstruments.find(i => i.id === activeTargetId);
  if (!target || !target.history_logs[idx]) return;
  const h = target.history_logs[idx];
  editingHistoryIndex = idx;

  document.getElementById('info-modal').style.display = 'none';
  document.getElementById('histModalTitle').innerText = '✏️ 점검/정비 이력 수정';
  document.getElementById('histTargetTag').innerText = `[${target.tag_no}] ${target.name}`;
  document.getElementById('histDate').value = h.date || new Date().toISOString().slice(0, 10);
  document.getElementById('histAuthor').value = h.author || '';
  document.getElementById('histContent').value = h.content || '';

  currentHistPhotoBase64 = h.photo || '';
  const preview = document.getElementById('histPhotoPreview');
  if (preview) {
    if (currentHistPhotoBase64) {
      preview.src = currentHistPhotoBase64;
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }
  }
  const hCam = document.getElementById('histPhotoCam');
  const hGal = document.getElementById('histPhotoGallery');
  if (hCam) hCam.value = '';
  if (hGal) hGal.value = '';
  document.getElementById('history-modal').style.display = 'block';
};

window.deleteHistoryItem = async function(idx) {
  if (!confirm('해당 점검 이력을 삭제하시겠습니까?')) return;
  const target = currentInstruments.find(i => i.id === activeTargetId);
  if (!target) return;

  target.history_logs.splice(idx, 1);
  const { error } = await supabaseClient.from('instruments').update({ history_logs: target.history_logs }).eq('id', activeTargetId);
  if (!error) {
    renderHistoryList(target);
    alert('✅ 이력이 삭제되었습니다.');
  } else {
    alert('❌ 삭제 실패: ' + error.message);
  }
};

const btnSaveHist = document.getElementById('btnSaveHist');
if (btnSaveHist) {
  btnSaveHist.addEventListener('click', async () => {
    const text = document.getElementById('histContent').value.trim();
    const workerName = document.getElementById('histAuthor').value.trim();
    if (!workerName) {
      alert('작업자 성명을 입력하세요.');
      return;
    }
    if (!text) {
      alert('점검/조치 내용을 입력하세요.');
      return;
    }

    localStorage.setItem('jeju_worker_name', workerName);
    currentUserInfo.name = workerName;
    const ub = document.getElementById('loginUserBadge');
    if (ub) ub.innerText = `👤 ${workerName}`;

    const target = currentInstruments.find(i => i.id === activeTargetId);
    if (!target) return;
    const logs = Array.isArray(target.history_logs) ? [...target.history_logs] : [];

    const entryData = {
      date: document.getElementById('histDate').value,
      author: workerName,
      content: text,
      photo: currentHistPhotoBase64 || null
    };

    if (editingHistoryIndex !== null) {
      logs[editingHistoryIndex] = entryData;
    } else {
      logs.unshift(entryData);
    }

    const { error } = await supabaseClient.from('instruments').update({ history_logs: logs }).eq('id', activeTargetId);
    if (!error) {
      target.history_logs = logs;
      document.getElementById('history-modal').style.display = 'none';
      renderHistoryList(target);
      document.getElementById('info-modal').style.display = 'block';
      alert(editingHistoryIndex !== null ? '✅ 점검 이력이 수정되었습니다.' : '✅ 새 점검 이력이 저장되었습니다.');
      editingHistoryIndex = null;
    } else {
      alert('❌ 이력 저장 실패: ' + error.message);
    }
  });
}

/* --- 통합 검색 기능 --- */
const searchModal = document.getElementById('search-modal');
const searchInput = document.getElementById('searchInput');
const searchResultsList = document.getElementById('searchResultsList');
const btnOpenSearch = document.getElementById('btnOpenSearch');

if (btnOpenSearch) {
  btnOpenSearch.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    renderSearchResults('');
    if (searchModal) searchModal.style.display = 'block';
    setTimeout(() => {
      if (searchInput) searchInput.focus();
    }, 100);
  });
}

if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    renderSearchResults(e.target.value.trim());
  });
}

function renderSearchResults(query) {
  if (!searchResultsList) return;
  if (!query) {
    searchResultsList.innerHTML = '<div style="color: #94a3b8; font-size: 12px; text-align: center; padding: 20px;">검색어를 입력하세요.</div>';
    return;
  }
  const filtered = currentInstruments.filter(item => {
    const q = query.toLowerCase();
    const tag = (item.tag_no || '').toLowerCase();
    const name = (item.name || '').toLowerCase();
    const model = (item.model || '').toLowerCase();
    return tag.includes(q) || name.includes(q) || model.includes(q);
  });

  if (filtered.length === 0) {
    searchResultsList.innerHTML = '<div style="color: #ef4444; font-size: 12px; text-align: center; padding: 20px;">일치하는 계측기가 없습니다.</div>';
    return;
  }

  searchResultsList.innerHTML = filtered.map(item => `
    <div class="search-result-item" onclick="jumpToInstrument(${item.id})">
      <div>
        <div class="search-item-main">[${item.tag_no}] ${item.name}</div>
        <div class="search-item-sub">모델: ${item.model || '-'} | 범위: ${item.signal_range || '-'}</div>
      </div>
      <div class="search-item-badge">기력 ${item.unit || '2호기'} ${item.floor}</div>
    </div>
  `).join('');
}

window.jumpToInstrument = function(instId) {
  const item = currentInstruments.find(i => i.id === instId);
  if (!item) return;

  if (searchModal) searchModal.style.display = 'none';

  if (selectedUnit !== (item.unit || '2호기')) {
    switchUnit(item.unit || '2호기');
  }

  const floorFileNameMap = {
    '1층': 'floor_1f.jpg', '2층': 'floor_2f.jpg', '2.5층': 'floor_2_5f.jpg',
    '3층': 'floor_3f.jpg', '3.1/3층': 'floor_3_1_3f.jpg', '3.2/3층': 'floor_3_2_3f.jpg',
    '4층': 'floor_4f.jpg', '4.5층': 'floor_4_5f.jpg', '5층': 'floor_5f.jpg',
    '5.5층': 'floor_5_5f.jpg', '6층': 'floor_6f.jpg', '7층': 'floor_7f.jpg'
  };
  const imgFile = floorFileNameMap[item.floor] || 'floor_1f.jpg';

  const floorBtns = document.querySelectorAll('.floor-btn');
  floorBtns.forEach(b => {
    if (b.innerText === item.floor) b.classList.add('active');
    else b.classList.remove('active');
  });

  openFloorRoom(item.floor, imgFile, null);

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

// 자동 로그인 복구
if (sessionStorage.getItem('jeju_admin_auth') === 'true') {
  const savedWorker = localStorage.getItem('jeju_worker_name') || '관리자';
  unlock(savedWorker, 'admin@jeju.com');
}
