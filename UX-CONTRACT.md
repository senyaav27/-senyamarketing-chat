# Chat interaction contract

Business source: user brief in this task; security implementation src/app.js and migrations/001.sql.
Visual source: DESIGN.md and public/widget.js.

| Capability | Canonical owner                       | Source of truth           | Allowed variants                                                                                   | Verification      |
| ---------- | ------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------- | ----------------- |
| Form       | widget.js composer/contact form       | User brief and src/app.js | Inline errors; preserve draft; contact accepts one phone or username, name optional; skip persists | test/browser.js   |
| Scrollbar  | widget.js Shadow stylesheet           | User brief and src/app.js | Every owned scroller inherits visible scrollbar colors                                             | test/browser.js   |
| Toast      | widget.js setStatus and contact-error | User brief and src/app.js | Inline live region, no transient-only errors                                                       | test/browser.js   |
| Dialog     | widget.js toggle                      | User brief and src/app.js | Non-modal, Escape closes, restore focus, no trap or page inert                                     | test/browser.js   |
| Async      | widget.js pending + api               | User brief and src/app.js | Persist before sending; idempotent client IDs; explicit retry; no auto-send stale drafts           | test/flow.test.js |
| Badge      | widget.js badge/markSeen              | User brief and src/app.js | Count unseen owner replies; seen only while open and page visible                                  | test/browser.js   |

No tables, CRUD lists, selects, dates, uploads, AI or navigation framework. No sibling screens existed. Both forms reuse the same request and status conventions. Session bearer secret remains in localStorage for return visits. Only hashed secret stored server-side. Conversation number does not authorize access. Contacts and chat content follow configurable retention. Privacy link comes solely from owner config; no legal wording invented.
