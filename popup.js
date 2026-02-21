/**
 * popup.js - 팝업 UI 로직 (ES Module) v1.2
 *
 * [다중 블로그 지원]
 * 저장 구조:
 *   chrome.storage.local  → encryptedData: { salt, iv, ciphertext }
 *                           ciphertext 복호화 → { entries: [{id, password}] }
 *
 *   chrome.storage.session → tistorySession: { masterPassword, entries }
 *                            masterPassword 는 세션 내 재암호화(추가/삭제)에 사용
 *
 * 패널 흐름:
 *   [저장 없음]          → setup
 *   [저장 있음 + 잠금]   → unlock
 *   [저장 있음 + 해제]   → main (entry 목록)
 *   [블로그 추가 클릭]   → add
 */

import { encrypt, decrypt } from './crypto.js';

// ── DOM 헬퍼 ────────────────────────────────────────────────────────────────

const $   = (id) => document.getElementById(id);
const val = (id) => $(id).value.trim();

// ── 스토리지 래퍼 ────────────────────────────────────────────────────────────

const storage = {
  local: {
    get:   (key) => new Promise((res) => chrome.storage.local.get(key,   (r) => res(r[key]))),
    set:   (obj) => new Promise((res) => chrome.storage.local.set(obj,   res)),
    clear: ()    => new Promise((res) => chrome.storage.local.clear(     res)),
  },
  session: {
    get:   (key) => new Promise((res) => chrome.storage.session.get(key, (r) => res(r[key]))),
    set:   (obj) => new Promise((res) => chrome.storage.session.set(obj, res)),
    clear: ()    => new Promise((res) => chrome.storage.session.clear(   res)),
  },
};

// ── 패널 관리 ────────────────────────────────────────────────────────────────

const PANELS = ['setup', 'unlock', 'main', 'add'];

function showPanel(name) {
  PANELS.forEach((p) => $(`panel-${p}`).classList.toggle('hidden', p !== name));
}

function setStatus(id, msg, type = '') {
  const el = $(id);
  el.textContent = msg;
  el.className   = `status ${type}`;
}

function showLoading(on) {
  $('loading-overlay').classList.toggle('hidden', !on);
}

function clearInputs(...ids) {
  ids.forEach((id) => { $(id).value = ''; });
}

// ── XSS 방어 ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ── 엔트리 목록 렌더링 ────────────────────────────────────────────────────────

function renderEntryList(entries) {
  $('entry-count').textContent = entries.length;
  const list = $('entry-list');

  if (entries.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
        </div>
        등록된 블로그가 없습니다.<br>아래 버튼으로 추가하세요.
      </div>`;
    return;
  }

  // 글로브 + 잠금 SVG 아이콘 (공통)
  const globeSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
  const trashSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;

  list.innerHTML = entries
    .map(
      (e, i) => `
      <div class="entry-item">
        <div class="entry-icon">${globeSvg}</div>
        <div class="entry-info">
          <span class="entry-id">${escapeHtml(e.id)}.tistory.com</span>
          <span class="entry-pw">• • • • • • • •</span>
        </div>
        <button class="btn-delete" data-index="${i}" title="${escapeHtml(e.id)} 삭제">${trashSvg}</button>
      </div>`
    )
    .join('');

  // 삭제 버튼 이벤트 바인딩
  list.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', () => handleDeleteEntry(Number(btn.dataset.index)));
  });
}

// ── entries 영속화 (재암호화 + 양쪽 저장소 갱신) ─────────────────────────────

async function persistEntries(masterPassword, entries) {
  const encryptedData = await encrypt(masterPassword, { entries });
  await storage.local.set({ encryptedData });
  // session 도 갱신하여 content.js 에 전달될 데이터 최신화
  await storage.session.set({
    tistorySession: { masterPassword, entries },
  });
}

// ── 초기화 ───────────────────────────────────────────────────────────────────

async function init() {
  const encryptedData = await storage.local.get('encryptedData');

  if (!encryptedData) {
    showPanel('setup');
    return;
  }

  const session = await storage.session.get('tistorySession');
  if (session?.entries) {
    renderEntryList(session.entries);
    showPanel('main');
  } else {
    showPanel('unlock');
  }
}

// ── 핸들러: 초기 설정 저장 ────────────────────────────────────────────────────

async function handleSetupSave() {
  const master     = $('setup-master').value;        // trim 금지 (비밀번호)
  const masterConf = val('setup-master-confirm');

  if (!master)                return setStatus('setup-status', '마스터 비밀번호를 입력하세요.', 'error');
  if (master.length < 8)      return setStatus('setup-status', '마스터 비밀번호는 8자 이상이어야 합니다.', 'error');
  if (master !== masterConf)  return setStatus('setup-status', '비밀번호가 일치하지 않습니다.', 'error');

  showLoading(true);
  try {
    const entries = [];
    await persistEntries(master, entries);

    clearInputs('setup-master', 'setup-master-confirm');
    setStatus('setup-status', '저장 완료!', 'success');

    setTimeout(() => {
      renderEntryList(entries);
      showPanel('main');
    }, 800);
  } catch (err) {
    console.error('[TistoryAutoFill] 설정 저장 오류:', err);
    setStatus('setup-status', `저장 실패: ${err.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

// ── 핸들러: 잠금 해제 ────────────────────────────────────────────────────────

async function handleUnlock() {
  const master = $('unlock-master').value;

  if (!master) return setStatus('unlock-status', '마스터 비밀번호를 입력하세요.', 'error');

  showLoading(true);
  try {
    const encryptedData = await storage.local.get('encryptedData');
    if (!encryptedData) {
      setStatus('unlock-status', '저장된 데이터가 없습니다.', 'error');
      return;
    }

    // 복호화 실패 시 'WRONG_PASSWORD' 에러 throw
    const plain = await decrypt(master, encryptedData);
    const entries = plain.entries ?? [];

    await storage.session.set({
      tistorySession: { masterPassword: master, entries },
    });

    clearInputs('unlock-master');
    renderEntryList(entries);
    showPanel('main');

  } catch (err) {
    if (err.message === 'WRONG_PASSWORD') {
      setStatus('unlock-status', '마스터 비밀번호가 올바르지 않습니다.', 'error');
    } else if (err.message === 'INVALID_DATA') {
      setStatus('unlock-status', '저장된 데이터가 손상되었습니다. 초기화가 필요합니다.', 'error');
    } else {
      setStatus('unlock-status', `오류: ${err.message}`, 'error');
    }
    console.error('[TistoryAutoFill] 잠금 해제 오류:', err);
  } finally {
    showLoading(false);
  }
}

// ── 핸들러: 잠금 ──────────────────────────────────────────────────────────────

async function handleLock() {
  await storage.session.clear();
  showPanel('unlock');
}

// ── 핸들러: 설정 초기화 ──────────────────────────────────────────────────────

async function handleReset() {
  const confirmed = window.confirm(
    '⚠️ 모든 설정을 초기화하시겠습니까?\n\n저장된 암호화 데이터가 완전히 삭제됩니다.'
  );
  if (!confirmed) return;

  await Promise.all([storage.local.clear(), storage.session.clear()]);
  showPanel('setup');
}

// ── 핸들러: 블로그 추가 ──────────────────────────────────────────────────────

async function handleAddEntry() {
  const blogId = val('add-blog-id');
  const blogPw = $('add-blog-pw').value;

  if (!blogId) return setStatus('add-status', '티스토리 ID를 입력하세요.', 'error');
  if (!blogPw) return setStatus('add-status', '보호글 비밀번호를 입력하세요.', 'error');

  const session = await storage.session.get('tistorySession');

  // 세션 만료 체크 (브라우저 재시작 후 팝업을 다시 열었을 때 등)
  if (!session?.masterPassword) {
    setStatus('add-status', '세션이 만료되었습니다. 팝업을 닫고 다시 잠금 해제하세요.', 'error');
    return;
  }

  // 중복 ID 체크
  if (session.entries.some((e) => e.id === blogId)) {
    return setStatus('add-status', `이미 등록된 ID입니다: ${blogId}`, 'error');
  }

  showLoading(true);
  try {
    const newEntries = [...session.entries, { id: blogId, password: blogPw }];
    await persistEntries(session.masterPassword, newEntries);

    clearInputs('add-blog-id', 'add-blog-pw');
    setStatus('add-status', '추가 완료!', 'success');

    setTimeout(() => {
      renderEntryList(newEntries);
      showPanel('main');
    }, 800);
  } catch (err) {
    console.error('[TistoryAutoFill] 추가 오류:', err);
    setStatus('add-status', `저장 실패: ${err.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

// ── 핸들러: 블로그 삭제 ──────────────────────────────────────────────────────

async function handleDeleteEntry(index) {
  const session = await storage.session.get('tistorySession');
  if (!session?.masterPassword) return;

  const entry = session.entries[index];
  if (!entry) return;

  if (!window.confirm(`'${entry.id}.tistory.com' 을 삭제하시겠습니까?`)) return;

  showLoading(true);
  try {
    const newEntries = session.entries.filter((_, i) => i !== index);
    await persistEntries(session.masterPassword, newEntries);
    renderEntryList(newEntries);
  } catch (err) {
    console.error('[TistoryAutoFill] 삭제 오류:', err);
  } finally {
    showLoading(false);
  }
}

// ── 이벤트 바인딩 ─────────────────────────────────────────────────────────────

$('btn-setup-save').addEventListener('click', handleSetupSave);
$('btn-unlock').addEventListener('click', handleUnlock);
$('btn-unlock-reset').addEventListener('click', handleReset);
$('btn-lock').addEventListener('click', handleLock);
$('btn-goto-add').addEventListener('click', () => {
  setStatus('add-status', '', '');
  clearInputs('add-blog-id', 'add-blog-pw');
  showPanel('add');
});
$('btn-add-cancel').addEventListener('click', () => showPanel('main'));
$('btn-add-save').addEventListener('click', handleAddEntry);

// Enter 키 지원
$('unlock-master').addEventListener('keydown',     (e) => { if (e.key === 'Enter') handleUnlock(); });
$('setup-master-confirm').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSetupSave(); });
$('add-blog-pw').addEventListener('keydown',      (e) => { if (e.key === 'Enter') handleAddEntry(); });

// ── 실행 ─────────────────────────────────────────────────────────────────────
init();
