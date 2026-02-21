/**
 * background.js - Manifest V3 Service Worker
 *
 * [핵심 역할] chrome.storage.session 메시지 브로커
 *   chrome.storage.session 은 기본적으로 Content Script 에서 접근 불가
 *   (TRUSTED_CONTEXTS_ONLY 기본값).
 *   Content Script 가 GET_PASSWORD 메시지를 보내면, 신뢰 컨텍스트인
 *   Service Worker 가 session 을 읽어 hostname 에 맞는 비밀번호를 응답함.
 */

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    console.log('[TistoryAutoFill] 설치 완료 — 팝업에서 초기 설정을 진행해 주세요.');
  } else if (reason === chrome.runtime.OnInstalledReason.UPDATE) {
    console.log('[TistoryAutoFill] 업데이트 완료 — 세션 초기화.');
    chrome.storage.session.clear();
  }
});

chrome.runtime.onStartup.addListener(() => {
  // chrome.storage.session 은 브라우저 재시작 시 자동 파기되지만 명시적으로 보장
  chrome.storage.session.clear();
  console.log('[TistoryAutoFill] 브라우저 시작 — 세션 초기화 완료.');
});

/**
 * Content Script → Background 메시지 핸들러
 *
 * Content Script 가 chrome.storage.session 에 직접 접근하면
 * "Access to storage is not allowed from this context" 오류 발생.
 *
 * 해결: Content Script 는 메시지만 보내고,
 *       신뢰 컨텍스트인 Service Worker 가 session 을 조회하여 응답.
 *
 * 요청: { type: 'GET_PASSWORD' }
 * 응답: { password: string | null }
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'GET_PASSWORD') return false;

  chrome.storage.session.get('tistorySession', (result) => {
    if (chrome.runtime.lastError) {
      console.error('[TistoryAutoFill] session 조회 오류:', chrome.runtime.lastError.message);
      sendResponse({ password: null });
      return;
    }

    const session = result?.tistorySession;
    if (!session?.entries?.length) {
      sendResponse({ password: null }); // 잠금 상태 or 빈 목록
      return;
    }

    // sender.url 에서 hostname 추출 — background 에서 직접 검증 (보안 강화)
    let senderHost = '';
    try {
      senderHost = sender.url ? new URL(sender.url).hostname : '';
    } catch {
      sendResponse({ password: null });
      return;
    }

    // 현재 페이지 hostname 과 일치하는 entry 탐색
    // 예: senderHost = "6kitt-hack.tistory.com"
    //     entry.id   = "6kitt-hack"  → 매칭
    const entry = session.entries.find(
      (e) => `${e.id}.tistory.com` === senderHost
    );

    sendResponse({ password: entry?.password ?? null });
  });

  return true; // 비동기 sendResponse 유지를 위해 true 반환 필수
});
