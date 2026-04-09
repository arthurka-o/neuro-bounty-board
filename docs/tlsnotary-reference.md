# TLSNotary — Reference for Bounty Board Integration

Replaces `reclaim-reference.md`. Based on hands-on implementation work in the `TLSNotary-test` repo (forked from `pse-org/tlsn-extension`).

---

## What TLSNotary Does

TLSNotary uses Multi-Party Computation TLS (MPC-TLS) to let users prove facts from any HTTPS website without sharing credentials. The user's browser (Prover) and an independent Verifier jointly execute the TLS handshake via garbled circuits. The Verifier never sees plaintext but can attest that specific data came from a specific server. The user then selectively discloses parts of the transcript while keeping the rest cryptographically committed but hidden.

**Key difference from Reclaim:** TLSNotary is fully client-side (browser extension). No phone app, no QR code, no attestor network. The proof is generated locally and returned immediately.

---

## Components

| Component | Role | Trust Level |
|-----------|------|-------------|
| **Browser Extension** (Prover) | Runs the MPC-TLS protocol, generates proofs | User's own device — fully trusted |
| **Verifier Server** | MPC counterpart, co-executes TLS handshake, signs attestation | Trusted — mitigated by M-of-N (see architecture doc) |
| **WebSocket Proxy** | Bridges browser WebSocket to TCP for TLS connections | Zero trust — forwards ciphertext it can't read |
| **Plugin** | JavaScript code defining what to prove (runs in QuickJS sandbox inside extension) | Auditable — code is public |

---

## Our Twitch Subscription Plugin

**Source:** `twitch_sub.plugin.ts` (to be brought into this repo)

### What It Proves

- User is subscribed to a specific Twitch channel
- Subscription tier (1000 = T1, 2000 = T2, 3000 = T3)
- Whether sub was purchased with Prime

### Twitch API Endpoint

- **URL:** `POST https://gql.twitch.tv/gql`
- **Auth headers:** `Authorization: OAuth <token>`, `Client-ID: <id>` (intercepted automatically from browser requests)
- **Query:** Custom raw GraphQL (no persisted query hash needed):

```graphql
query {
  user(login: "CHANNEL_NAME") {
    displayName
    self {
      subscriptionBenefit {
        tier
        purchasedWithPrime
      }
    }
  }
}
```

- **Response size:** ~200 bytes (vs ~17KB from persisted `ChannelPage_SubscribeButton_User` query)
- **Not subscribed:** `subscriptionBenefit` is `null`
- **Subscribed:** `{ tier: "1000", purchasedWithPrime: false }`

### Required Headers for MPC-TLS

```
content-type: text/plain;charset=UTF-8
authorization: OAuth <token>        ← intercepted, NOT revealed in proof
client-id: <value>                  ← intercepted, NOT revealed in proof
Host: gql.twitch.tv
Accept-Encoding: identity           ← REQUIRED: TLSNotary can't handle compressed responses
Connection: close                   ← REQUIRED: clean TLS session end
```

### Selective Disclosure (Handlers)

The proof reveals only:

| Direction | Part | Action | What it proves |
|-----------|------|--------|----------------|
| SENT | START_LINE | REVEAL | `POST /gql HTTP/1.1` — proves target endpoint |
| SENT | BODY | REVEAL | The GraphQL query — proves which channel was queried |
| RECV | START_LINE | REVEAL | `HTTP/1.1 200 OK` — proves successful response |
| RECV | HEADERS (date) | REVEAL | Timestamp — proves when the proof was generated |
| RECV | BODY | REVEAL | Subscription data (~200 bytes, entire body is safe to reveal with custom query) |

Auth headers (`Authorization`, `Client-ID`) are **committed but NOT revealed** — the verifier attests they existed but can't read them.

### Plugin SDK API

The plugin runs in a QuickJS WASM sandbox with these capabilities:

```typescript
// State management (React-like)
useState<T>(key: string, defaultValue: T): T
setState(key: string, value: any): void  // triggers UI re-render

// Side effects
useEffect(callback: () => void, deps: any[]): void

// Header interception from managed browser windows
useHeaders(filter: (headers: InterceptedRequestHeader[]) => InterceptedRequestHeader[]): InterceptedRequestHeader[]

// Window management
openWindow(url: string): void

// MPC-TLS proof generation
prove(requestOptions, proverOptions): Promise<ProofResult>

// Complete plugin execution
doneWithOverlay(result: string): void

// UI (DOM JSON — only onclick events supported, no oninput/onchange)
div(options, children): DomJson
button(options, children): DomJson
```

### Build Command

```bash
npx esbuild twitch_sub.plugin.ts \
  --bundle --format=esm \
  --define:__VERIFIER_URL__=\"http://localhost:7047\" \
  --define:__PROXY_URL__=\"ws://localhost:7047/proxy?token=\" \
  --outfile=twitch_sub.js
```

For PSE public proxy: `--define:__PROXY_URL__=\"wss://notary.pse.dev/proxy?token=\"`

### Proof Output Structure

```json
[
  { "type": "SENT", "part": "START_LINE", "value": "POST /gql HTTP/1.1\r\n" },
  { "type": "SENT", "part": "BODY", "value": "{\"query\":\"query { user(login: \\\"vedal987\\\") ... }\"}" },
  { "type": "RECV", "part": "START_LINE", "value": "HTTP/1.1 200 OK\r\n" },
  { "type": "RECV", "part": "HEADERS", "value": "Date: Wed, 08 Apr 2026 15:10:01 GMT\r\n" },
  { "type": "RECV", "part": "BODY", "value": "{\"data\":{\"user\":{\"displayName\":\"vedal987\",\"self\":{\"subscriptionBenefit\":{\"tier\":\"1000\",\"purchasedWithPrime\":false}}}},...}" }
]
```

---

## Signature Scheme

TLSNotary supports **both secp256k1 and P-256** (confirmed via `k256` and `p256` crate dependencies in `tlsn-attestation`). The choice is a configuration option on the verifier.

| Curve | EVM Cost | Mechanism |
|-------|----------|-----------|
| secp256k1 | ~3,000 gas | Native `ecrecover` precompile |
| P-256 | ~100k-300k gas | RIP-7212 precompile (available on Base) |

**Recommendation:** Configure verifier to use secp256k1 for cheapest on-chain verification.

---

## Infrastructure for Production

### What We Host

1. **WebSocket Proxy** — dumb pipe, forwards ciphertext. PSE runs a public one at `wss://notary.pse.dev/proxy?token=<host>`, or we run our own.
2. **Verifier Server(s)** — Rust binary from `packages/verifier/`. For M-of-N trust model, recruit independent operators.
3. **Frontend** — triggers extension flow, submits proofs to smart contract.

### What We Don't Host

- The Prover — runs in user's browser extension
- Proof verification — happens on-chain in Solidity

### Running the Verifier

```bash
cd packages/verifier
cargo run                    # Development (port 7047)
cargo build --release        # Production binary
```

Endpoints:
- `GET /health` — health check
- `WS /session` — create verification session
- `WS /verifier?sessionId=<id>` — MPC-TLS verification
- `WS /proxy?token=<host>` — WebSocket-to-TCP proxy

---

## Constraints and Limitations

- **TLS 1.2 only** — TLSNotary doesn't support TLS 1.3 yet. Twitch currently serves TLS 1.2. Risk: if Twitch drops 1.2, this breaks.
- **`Accept-Encoding: identity`** — must disable compression; TLSNotary can't handle gzip/brotli responses.
- **`Connection: close`** — needed for clean TLS session termination.
- **Browser extension required** — users must install the TLSNotary Chrome extension.
- **WASM thread pool** — the extension's WASM runtime has a 128-thread limit. After many proof attempts without reloading the extension, it can overflow. This is an upstream issue.
- **Plugin SDK limitations** — only `onclick` events on UI elements (no text inputs). Channel selection must use buttons, not free-form input.

---

## What to Bring Into This Repo

### Files from TLSNotary-test

| File | Purpose | Destination |
|------|---------|-------------|
| `packages/plugins/src/twitch_sub.plugin.ts` | The plugin source | `packages/tlsnotary/plugin/twitch_sub.plugin.ts` (or similar) |

### Modifications Made to TLSNotary-test (for reference, not to copy)

These changes were made to the upstream demo infrastructure to test our plugin. They don't need to come over — our frontend will invoke the extension directly via `window.tlsn.execCode()`.

| File | Change |
|------|--------|
| `packages/plugins/build.js` | Added `'twitch_sub'` to build array |
| `packages/plugins/src/registry.ts` | Added twitch_sub metadata entry |
| `packages/demo/build-plugins.js` | Added `'twitch_sub'` to copy list |
| `packages/demo/src/plugins.ts` | Added custom `parseResult` for twitch_sub |

### Extension Integration

The frontend talks to the extension via `window.tlsn.execCode()`:

```typescript
// Check if extension is installed
window.addEventListener('extension_loaded', () => { /* ready */ });

// Execute plugin code
const result = await window.tlsn.execCode(pluginJsCode, {
  requestId: 'unique-id',
  sessionData: { channelName: 'vedal987' },
});
```

The plugin JS is loaded as a string and executed in the extension's QuickJS sandbox. The result is the proof JSON shown above.

---

## Comparison: Reclaim vs TLSNotary

| Aspect | Reclaim | TLSNotary |
|--------|---------|-----------|
| Cost | Per-proof fees | Free (PSE public good) |
| Trust model | Reclaim's attestor network | Self-hosted or M-of-N verifiers |
| UX | QR code scan + phone app | Browser extension only |
| Proof generation | Attestor network (remote) | Client-side (local) |
| On-chain verification | `IReclaim.verifyProof()` (provided) | Must build ourselves (see architecture doc) |
| TLS support | 1.2 + 1.3 | 1.2 only |
| Maturity | Production | Alpha (v0.1.0-alpha.15) |
