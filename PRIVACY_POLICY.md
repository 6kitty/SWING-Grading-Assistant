# Privacy Policy — SWING Grading Assistant

**Last updated: February 21, 2026**

---

## Overview

SWING Grading Assistant ("the Extension") is a Chrome browser extension that automates password entry for password-protected posts on Tistory blogs. This Privacy Policy describes what data the Extension collects, how it is stored, and how it is used.

**The Extension does not transmit any user data to any external server. All data is stored and processed exclusively on your local device.**

---

## Data Collected

The Extension collects only two types of user-provided data:

| Data | Description |
|---|---|
| **Tistory Blog ID** | The subdomain identifier of a Tistory blog (e.g., `myblog` from `myblog.tistory.com`). Used solely to match the correct password to the correct blog when auto-filling. |
| **Post Password** | The password for a specific password-protected Tistory post. This is a post-level access password set by the blog author — **not** a Tistory account login credential. |

No personally identifiable information (PII), browsing history, keystrokes, or any other data is collected.

---

## How Data Is Stored

### Encryption at Rest — `chrome.storage.local`

Post passwords and blog IDs are **never stored in plaintext**. Before being saved to local storage, they are encrypted using the following scheme:

- **Key Derivation:** PBKDF2 with SHA-256, 310,000 iterations (OWASP 2023 recommendation)
- **Encryption:** AES-GCM with a 256-bit key and a 96-bit random IV
- **Integrity:** AES-GCM's built-in authentication tag automatically detects tampering

Only the encrypted output — `{ salt, iv, ciphertext }` in Base64 — is written to `chrome.storage.local`. The plaintext password never touches disk.

### Encryption Key (Master Password)

The master password is the key used to derive the AES-GCM encryption key. It is:

- **Never stored anywhere** — not on any server, not in `chrome.storage.local`, not in any file
- Held in memory only during the active browser session via `chrome.storage.session`
- Automatically discarded when the browser is closed

### Session State — `chrome.storage.session`

After the user unlocks the Extension with their master password, the decrypted blog ID and post password are temporarily held in `chrome.storage.session` so that content scripts can perform auto-fill. This storage:

- Exists **in memory only** and is automatically cleared when the browser closes
- Is never written to disk
- Is scoped to the Extension and inaccessible to web pages or other extensions

---

## Data Transmission

**No data is ever transmitted off your device.**

The Extension operates entirely within your browser. It does not make any network requests, connect to any backend server, use any analytics service, or share any data with third parties.

---

## Data Access & Sharing

| Party | Access |
|---|---|
| Extension developer | No access — data never leaves your device |
| Third-party services | None used |
| Other browser extensions | No access — storage is Extension-scoped |
| Web pages | No access — content scripts run in an Isolated World |

---

## User Control

You have full control over your data at all times:

- **Lock:** Clears the in-memory session immediately, requiring master password re-entry
- **Delete entry:** Removes a specific blog ID and its associated password, re-encrypting the remaining data
- **Reset all:** Permanently deletes all encrypted data from `chrome.storage.local` and clears the session

There is no account, no cloud sync, and no recovery mechanism. If you forget your master password, the encrypted data cannot be decrypted and must be reset.

---

## Permissions

The Extension requests the following Chrome permissions:

| Permission | Purpose |
|---|---|
| `storage` | Read/write encrypted data to `chrome.storage.local` and temporary session data to `chrome.storage.session` |
| `scripting` | Inject the content script that detects password-protected post forms on Tistory pages |
| `host_permissions: *://*.tistory.com/*` | Limit content script execution exclusively to Tistory domains |

No other permissions are requested or used.

---

## Changes to This Policy

If this policy is updated, the "Last updated" date at the top of this document will be revised. Continued use of the Extension after any changes constitutes acceptance of the updated policy.

---

## Contact

If you have questions about this Privacy Policy, please open an issue on the project's GitHub repository.
