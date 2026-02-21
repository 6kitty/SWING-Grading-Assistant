# 🔐 Tistory AutoFill — 티스토리 보호글 비밀번호 자동 입력기

> **Chrome Extension (Manifest V3)** | 브라우저 내장 Web Crypto API로 비밀번호를 암호화 보관하고, 티스토리 보호글 페이지 진입 시 자동으로 비밀번호를 입력·제출하는 보안 중심 확장 프로그램

[![Chrome Extension](https://img.shields.io/badge/Chrome_Extension-MV3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Web Crypto API](https://img.shields.io/badge/Web_Crypto_API-AES--GCM-00C853?style=for-the-badge&logo=opensourceinitiative&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
[![No Dependencies](https://img.shields.io/badge/Dependencies-Zero-FF6B35?style=for-the-badge)]()

---

## 📸 Preview

> _스크린샷 / 데모 GIF를 여기에 삽입하세요_

| 초기 설정 | 잠금 해제 | 활성화 상태 |
|:---:|:---:|:---:|
| ![setup](docs/setup.png) | ![unlock](docs/unlock.png) | ![main](docs/main.png) |

---

## ✨ Key Features — 왜 이 확장 프로그램인가?

| Feature | 사용자 가치 |
|---|---|
| 🔒 **마스터 비밀번호 기반 암호화** | 비밀번호를 평문으로 저장하지 않습니다. PBKDF2로 도출한 키로 AES-GCM 암호화하여 기기 도난·악성 확장 프로그램으로부터 보호 |
| ⚡ **1-Click 자동 입력 & 제출** | 보호글 페이지 진입 즉시 비밀번호 입력 → 0.5초 후 자동 제출. 매번 비밀번호를 찾아 입력하는 번거로움 제거 |
| 🧠 **세션 기반 잠금/해제** | 브라우저가 열려 있는 동안만 복호화 상태 유지(`storage.session`). 브라우저 종료 = 자동 잠금 |
| 🔍 **패턴 매칭 DOM 탐지** | 티스토리 고유 ID 패턴(`entry{N}password`) + MutationObserver로 동적 DOM 변경까지 감지 |
| 🚫 **Zero External Dependency** | 외부 라이브러리 전혀 없음. 순수 Vanilla JS + 브라우저 내장 API만 사용 |

---

## 🏗️ Architecture — 시스템 구조

### 전체 데이터 흐름

```
사용자 (마스터 비밀번호 입력)
        │
        ▼
  ┌─────────────┐   PBKDF2(310,000 iter)   ┌──────────────┐
  │  popup.js   │ ──────────────────────▶  │  crypto.js   │
  │  (UI Layer) │ ◀── AES-GCM Key ───────  │ (Crypto Mod) │
  └─────────────┘                          └──────────────┘
        │                                         │
        │ [암호화된 데이터]                         │
        ▼                                         │
  chrome.storage.local          chrome.storage.session
  { salt, iv, ciphertext }  ◀──── { masterPassword, entries }
  (영구 저장, 평문 없음)           (세션 종료 시 파기)
                                         │
                           GET_PASSWORD 메시지 (hostname 포함)
                        ┌────────────────────────────────┐
                        │         background.js           │
                        │   (Service Worker 메시지 브로커)  │
                        └────────────────────────────────┘
                                         │
                              hostname 매칭 → password 응답
                                         │
                                         ▼
                                   content.js
                                  (티스토리 DOM 탐지)
                                         │
                              entry{N}password 패턴 감지
                                         │
                                  비밀번호 자동 입력
                                  + button.click() → Enter 이벤트 폴백
```

### 저장소 분리 설계

```
chrome.storage.local (영구, 암호화 전용)
└── encryptedData
    ├── salt       : Base64 (PBKDF2 salt, 128-bit)
    ├── iv         : Base64 (AES-GCM nonce, 96-bit)
    └── ciphertext : Base64 (암호화된 JSON payload)

chrome.storage.session (휘발성, 복호화 상태)
└── tistorySession
    ├── masterPassword : string (세션 내 재암호화용)
    └── entries        : [{id, password}] (다중 블로그 목록)
```

### 파일 역할 분리

```
tistory-autofill/
├── manifest.json     # MV3 선언: permissions, host_permissions, CSP
├── background.js     # Service Worker: 브라우저 시작 시 세션 초기화 +
│                     #   Content Script용 GET_PASSWORD 메시지 브로커
├── crypto.js         # 암호화 모듈 (ES Module): PBKDF2 + AES-GCM
├── popup.html        # 4-State UI: setup / unlock / main / add
├── popup.css         # 스타일 (그라디언트 + 로딩 오버레이)
├── popup.js          # UI 이벤트 핸들러 + crypto.js 연동
└── content.js        # 티스토리 DOM 감지 + 자동 입력
```

---

## 🛠️ Tech Stack

### Core

| Category | Technology | Reason |
|---|---|---|
| **Runtime** | Chrome Extension MV3 | 최신 보안 표준, Service Worker 기반 |
| **Language** | Vanilla JS (ES2022) | 외부 의존성 Zero, 번들러 불필요 |
| **Crypto** | Web Crypto API | 브라우저 네이티브 — Node.js 없이 PBKDF2·AES-GCM 구현 |
| **Module** | ES Modules (`type="module"`) | popup.js ↔ crypto.js 간 명확한 의존성 관리 |

### Cryptographic Spec

```
Key Derivation : PBKDF2 / SHA-256 / 310,000 iterations (OWASP 2023 권장)
Encryption     : AES-GCM / 256-bit key / 96-bit random IV
Salt           : 128-bit CSPRNG (crypto.getRandomValues)
Authentication : AES-GCM 내장 인증 태그 — 변조 탐지 자동 포함
```

---

## 🧩 Technical Decisions & Challenges

### 1. 왜 `AES-GCM`인가? — 인증 암호화의 선택

> **Problem:** 암호화만으로는 부족합니다. 저장된 암호문이 변조되었을 때 감지할 수단이 필요했습니다.

**Decision:** AES-GCM (Galois/Counter Mode)은 암호화와 **인증 태그(MAC)를 동시에 제공**합니다.
잘못된 마스터 비밀번호로 복호화를 시도하면 `crypto.subtle.decrypt()`가 `DOMException`을 throw — 추가 검증 로직 없이 오류를 자동 탐지합니다.

```js
// crypto.js
try {
  plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, key, cipherBuf);
} catch {
  // 키가 틀리면 여기서 자동 차단됨 — 별도 해시 비교 불필요
  throw new Error('WRONG_PASSWORD');
}
```

---

### 2. Content Script의 고립된 실행 환경 — 제출 방식 선택

> **Problem:** 티스토리 보호글의 제출 버튼은 `onclick="{reloadEntry(2);}"` 형태로 **페이지 전역 함수**를 호출합니다. 그러나 Content Script는 **Isolated World**에서 실행되어 페이지의 JS 변수·함수에 직접 접근할 수 없습니다.

```html
<!-- 티스토리 실제 HTML -->
<button type="button" class="media_btn" onclick="{reloadEntry(156);return false;}">확인</button>
```

**Root Cause 분석:**

| 실행 환경 | 접근 가능 | 접근 불가 |
|---|---|---|
| Page Script | window.reloadEntry() | chrome.* API |
| **Content Script** | **chrome.* API, DOM** | **window.reloadEntry()** |

**Solution:** `button.click()`을 통해 버튼 자체를 클릭 — 버튼의 `onclick` 핸들러는 **page world에서 실행**되므로 `reloadEntry(N)`이 정상 호출됩니다. 버튼을 찾지 못한 경우 `onkeydown` Enter 이벤트를 폴백으로 dispatch합니다.

```js
// content.js — ① 우선: 버튼 직접 클릭 (page world에서 reloadEntry 실행)
const btn = parent?.querySelector('button[type="button"]') ?? document.querySelector('button.media_btn');
if (btn) {
  btn.click(); // onclick → reloadEntry(N) ✅
  return;
}

// ② 폴백: onkeydown Enter 이벤트 (버튼을 찾지 못한 경우)
pwInput.dispatchEvent(
  new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true })
);
```

---

### 3. 티스토리 보호글 선택자 정형화 — 패턴 매칭 전략

> **Problem:** 티스토리 보호글의 비밀번호 `input`은 포스팅마다 ID가 달라집니다.

```html
<!-- 포스팅 2번 -->  <input id="entry2password"  name="entry2password"  type="password">
<!-- 포스팅 71번 --> <input id="entry71password" name="entry71password" type="password">
```

**단순 `input[type="password"]` 선택 시 문제점:** 로그인 폼, 댓글 폼 등 다른 비밀번호 입력창과 충돌할 수 있습니다.

**Solution:** `type="password"` + ID/name이 `/^entry\d+password$/` 패턴인 요소의 **합집합(OR)** 으로 특정합니다.

```js
const ENTRY_PW_RE = /^entry\d+password$/;

function findPasswordInput() {
  for (const el of document.querySelectorAll('input[type="password"]')) {
    if (ENTRY_PW_RE.test(el.id) || ENTRY_PW_RE.test(el.name)) return el;
  }
  return null;
}
```

---

### 4. PBKDF2 310,000회 반복의 UX 영향 — 로딩 오버레이 해결

> **Problem:** OWASP 권장 PBKDF2 반복 횟수(310,000)는 메인 스레드에서 1~2초 블로킹을 유발합니다.

**Solution:** `async/await`로 논블로킹 처리 + 반투명 로딩 오버레이로 UX 보완

```js
showLoading(true);
try {
  const encryptedData = await encrypt(master, payload); // 비동기 — UI 블로킹 없음
  await storage.local.set({ encryptedData });
} finally {
  showLoading(false);
}
```

---

## 🚀 Getting Started — 로컬 설치 및 실행

### Prerequisites
- Google Chrome 102 이상 (`chrome.storage.session` API 요구)

### Installation

```bash
# 1. 저장소 클론
git clone https://github.com/your-username/tistory-autofill.git
cd tistory-autofill

# 2. (빌드 불필요 — 순수 Vanilla JS)
```

### Chrome에 로드하기

```
1. Chrome 주소창에 입력: chrome://extensions
2. 우측 상단 [개발자 모드] 토글 활성화
3. [압축 해제된 확장 프로그램을 로드합니다] 클릭
4. 'tistory-autofill' 폴더 선택
```

### 초기 설정 (최초 1회)

```
1. Chrome 우측 상단 퍼즐 아이콘 → [티스토리 보호글 자동 입력] 클릭
2. 마스터 비밀번호 설정 (8자 이상)
3. 티스토리 ID 입력 (예: myblog → myblog.tistory.com)
4. 보호글 비밀번호 입력
5. [암호화하여 저장] 클릭
```

---

## 🔒 Security Considerations

```
✅ 평문 비밀번호는 chrome.storage.local에 저장되지 않음
✅ 마스터 비밀번호는 어디에도 저장되지 않음 (키 도출 후 즉시 GC)
✅ 브라우저 종료 시 chrome.storage.session 자동 파기
✅ AES-GCM 인증 태그로 저장 데이터 무결성 검증
✅ 각 저장 시마다 새로운 Salt + IV 생성 (재사용 없음)
⚠️  마스터 비밀번호 분실 시 복구 불가 (의도된 설계)
```

---

## 📁 Project Structure

```
tistory-autofill/
│
├── manifest.json      # MV3 설정: permissions(storage, scripting)
│                      #           host_permissions(*.tistory.com)
│
├── background.js      # Service Worker
│                      # 브라우저 시작 이벤트 → session.clear()
│                      # GET_PASSWORD 메시지 핸들러 (Content Script 브로커)
│                      # sender.url hostname 검증 → 매칭 entry.password 응답
│
├── crypto.js          # ES Module — 암호화 전담 모듈
│   ├── encrypt()      # plainObj → { salt, iv, ciphertext }
│   ├── decrypt()      # { salt, iv, ciphertext } → plainObj
│   ├── bufToB64()     # ArrayBuffer → Base64
│   └── b64ToBuf()     # Base64 → Uint8Array
│
├── popup.html         # 4개 패널 (setup / unlock / main / edit)
├── popup.css          # 스타일 (그라디언트, 스피너, 상태 메시지)
├── popup.js           # UI 이벤트 + crypto.js import
│                      # storage 래퍼, 입력값 유효성 검증
│                      # 다중 블로그 entries CRUD + XSS 방어
│
└── content.js         # 자동 입력 로직
    ├── 메시지 브로커  # GET_PASSWORD → background.js에서 비밀번호 수신
    ├── DOM 탐지       # /^entry\d+password$/ 패턴 매칭 + MutationObserver
    └── 자동 제출      # button.click() 우선, Enter 이벤트 폴백
```

---

## 🗺️ Roadmap

- [ ] 다중 블로그 계정 지원 (ID별 보호글 비밀번호 분리)
- [ ] 아이콘 및 브랜드 에셋 추가
- [ ] Chrome Web Store 배포
- [ ] Firefox 포팅 (WebExtensions API 호환)

---

## 👤 Author

**Your Name**
- GitHub: [@your-username](https://github.com/your-username)
- Blog: [your-blog.tistory.com](https://your-blog.tistory.com)

---

<p align="center">
  Made with 🔐 and Vanilla JS — No frameworks were harmed in the making of this extension.
</p>
