/**
 * crypto.js - Web Crypto API 기반 암호화 모듈 (ES Module)
 *
 * 보안 설계:
 *  - PBKDF2(SHA-256, 310,000회) 로 마스터 비밀번호에서 AES-GCM 키 도출
 *  - AES-GCM(256-bit) 으로 페이로드 암호화 → 무결성 자동 보장(인증 태그 내장)
 *  - 잘못된 마스터 비밀번호 입력 시 decrypt()가 'WRONG_PASSWORD' 에러를 throw
 */

const PBKDF2_ITERATIONS = 310_000; // OWASP 2023 권장값
const SALT_BYTES = 16;             // 128-bit salt
const IV_BYTES   = 12;             // 96-bit IV (AES-GCM 권장)

// ── 인코딩 헬퍼 ──────────────────────────────────────────────────────────────

/**
 * Uint8Array 또는 ArrayBuffer → Base64 문자열
 * (스택 오버플로 방지를 위해 루프 사용)
 */
export function bufToB64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Base64 문자열 → Uint8Array
 */
export function b64ToBuf(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

/**
 * 마스터 비밀번호 + salt → AES-GCM CryptoKey (PBKDF2)
 * @param {string}     masterPassword
 * @param {Uint8Array} salt
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(masterPassword, salt) {
  const rawKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterPassword),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name:       'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash:       'SHA-256',
    },
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── 공개 API ─────────────────────────────────────────────────────────────────

/**
 * 평문 객체를 마스터 비밀번호로 암호화합니다.
 *
 * @param {string} masterPassword  마스터 비밀번호
 * @param {object} plainObj        암호화할 데이터 (JSON 직렬화 가능한 객체)
 * @returns {Promise<{salt: string, iv: string, ciphertext: string}>}
 *          모두 Base64 인코딩된 값
 */
export async function encrypt(masterPassword, plainObj) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv   = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key  = await deriveKey(masterPassword, salt);

  const encoded   = new TextEncoder().encode(JSON.stringify(plainObj));
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  return {
    salt:       bufToB64(salt),
    iv:         bufToB64(iv),
    ciphertext: bufToB64(cipherBuf),
  };
}

/**
 * 암호화된 데이터를 마스터 비밀번호로 복호화합니다.
 *
 * AES-GCM은 인증 태그를 내장하므로, 잘못된 키나 변조된 데이터는
 * subtle.decrypt() 단계에서 자동으로 거부됩니다.
 *
 * @param {string} masterPassword
 * @param {{ salt: string, iv: string, ciphertext: string }} encryptedData
 * @returns {Promise<object>} 복호화된 평문 객체
 * @throws {Error} message === 'WRONG_PASSWORD' : 잘못된 비밀번호 또는 데이터 변조
 * @throws {Error} message === 'INVALID_DATA'   : 데이터 파싱 실패
 */
export async function decrypt(masterPassword, encryptedData) {
  const { salt, iv, ciphertext } = encryptedData;

  if (!salt || !iv || !ciphertext) {
    throw new Error('INVALID_DATA');
  }

  const saltBuf   = b64ToBuf(salt);
  const ivBuf     = b64ToBuf(iv);
  const cipherBuf = b64ToBuf(ciphertext);

  const key = await deriveKey(masterPassword, saltBuf);

  let plainBuf;
  try {
    plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuf },
      key,
      cipherBuf
    );
  } catch {
    // AES-GCM 인증 실패 = 잘못된 비밀번호 또는 데이터 무결성 침해
    throw new Error('WRONG_PASSWORD');
  }

  try {
    return JSON.parse(new TextDecoder().decode(plainBuf));
  } catch {
    throw new Error('INVALID_DATA');
  }
}
