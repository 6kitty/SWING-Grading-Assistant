/**
 * content.js - 티스토리 보호글 비밀번호 자동 입력 v1.2
 *
 * [Bug 3 Fix] chrome.storage.session 직접 접근 → chrome.runtime.sendMessage 교체
 *   chrome.storage.session 은 Content Script 에서 접근 불가 (TRUSTED_CONTEXTS_ONLY).
 *   background.js 의 GET_PASSWORD 핸들러가 session 을 대신 조회하고
 *   현재 hostname 에 맞는 비밀번호를 반환함.
 *
 * [Bug 2 Fix] 다중 블로그 지원
 *   background.js 에서 entries 배열을 조회하여 hostname 매칭 후 응답.
 *   content.js 는 응답받은 password 만 사용하면 됨.
 *
 * 감지 전략:
 *   type="password" + (id 또는 name) 이 /^entry\d+password$/ 패턴
 *   → entry156password, entry71password 등 모두 포착
 */

(async function () {
  'use strict';

  // ── 1. Background 에 비밀번호 요청 (메시지 브로커 패턴) ─────────────────────
  let password;
  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GET_PASSWORD' }, (res) => {
        if (chrome.runtime.lastError) {
          // 확장 프로그램 리로드 직후 등 연결 실패 케이스
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(res);
        }
      });
    });

    if (!response?.password) return; // 잠금 상태 or 매칭 블로그 없음
    password = response.password;

  } catch (err) {
    // 확장 프로그램이 비활성화 상태거나 재로드 중인 경우 무시
    console.debug('[TistoryAutoFill] 메시지 전송 실패 (정상 케이스 가능):', err.message);
    return;
  }

  // ── 2. 보호글 입력창 탐지 ────────────────────────────────────────────────────
  /** 티스토리 보호글 고유 패턴: entry{포스팅번호}password */
  const ENTRY_PW_RE = /^entry\d+password$/;

  function findPasswordInput() {
    for (const el of document.querySelectorAll('input[type="password"]')) {
      if (ENTRY_PW_RE.test(el.id ?? '') || ENTRY_PW_RE.test(el.name ?? '')) {
        return el;
      }
    }
    return null;
  }

  // ── 3. 자동 입력 + 버튼 클릭 제출 ──────────────────────────────────────────
  /**
   * 비밀번호 입력 후 확인 버튼 클릭
   *
   * [제출 방식] button.click()
   *   - onclick="{reloadEntry(N);}" 핸들러가 page world 에서 실행됨
   *   - Content Script 의 Isolated World 문제 없이 reloadEntry() 호출 가능
   *   - Enter KeyboardEvent 의 keyCode 합성 문제를 우회
   *
   * <div class="textbox focus-wrap">
   *   <input id="entry156password" type="password" ...>
   *   <button type="button" class="media_btn" onclick="{reloadEntry(156);}">확인</button>
   * </div>
   */
  function autoFillAndSubmit(pwInput) {
    if (pwInput.value) return false; // 중복 실행 방지

    pwInput.value = password;
    pwInput.dispatchEvent(new Event('input',  { bubbles: true }));
    pwInput.dispatchEvent(new Event('change', { bubbles: true }));

    setTimeout(() => {
      const parent = pwInput.parentElement;

      // ① 우선: 부모 요소 내 버튼 클릭 (티스토리 기본 구조)
      const btn =
        parent?.querySelector('button[type="button"]') ??
        parent?.querySelector('button') ??
        document.querySelector('button.media_btn');

      if (btn) {
        btn.click(); // onclick → reloadEntry(N) (page world 에서 실행)
        return;
      }

      // ② 폴백: onkeydown Enter 이벤트 (버튼을 찾지 못한 경우)
      pwInput.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter',
          keyCode: 13, which: 13,
          bubbles: true, cancelable: true,
        })
      );
    }, 500);

    return true;
  }

  // ── 4. 즉시 시도 → 실패 시 MutationObserver 대기 ────────────────────────────

  const input = findPasswordInput();
  if (input) {
    autoFillAndSubmit(input);
    return;
  }

  // 동적 DOM 변경 대비 (SPA 등)
  const observer = new MutationObserver((_, obs) => {
    const found = findPasswordInput();
    if (found) {
      obs.disconnect();
      autoFillAndSubmit(found);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 10_000);
})();
