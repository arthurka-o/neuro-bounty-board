# Reclaim Protocol — Reference for Bounty Board Integration

This doc contains the relevant Reclaim Protocol information for our project. Distilled from their official docs (https://docs.reclaimprotocol.org/).

---

## What Reclaim Does

Reclaim Protocol uses zkTLS to let users prove facts from any HTTPS website without sharing credentials. A user logs into a site (e.g., Twitch), Reclaim's attestor network observes the encrypted HTTPS response via MPC-TLS, and produces a signed proof that the response contained specific data (e.g., "subscribed: true"). The proof is verifiable on-chain.

**Not web scraping.** The attestor is an opaque TLS proxy — it never terminates the TLS session, never sees plaintext credentials, never holds session keys. End-to-end encryption is maintained.

---

## Core Concepts

### Providers

A "provider" is a structured set of instructions that tells the attestor:
- What URL to hit
- What JSON path / regex to extract from the response
- What assertion to verify (e.g., `subscriptionStatus == "active"`)
- Public parameters (user-supplied, like email) vs secret parameters (auth details, hidden from attestor)

Providers are created in the Reclaim Dev Center (https://dev.reclaimprotocol.org/) using their DevTool. No manual schema management needed.

**We need two providers:**
1. **Twitch Subscription** — hits Twitch's subscription endpoint, extracts subscription status for the Neuro-sama channel
2. **Discord Role** — hits Discord's guild member endpoint, extracts role membership for the Neuro-sama server

### Proofs

A proof contains:
- `claimInfo` — the verified claim data, includes a `context` field
- Attestor signatures
- The cryptographic proof itself

The `context` field inside `claimInfo` can embed arbitrary data (e.g., a wallet address, a message). This is set client-side before proof generation and is tamper-resistant.

### Verifier App

Uses App Clips (iOS) or Instant Apps (Android) — no full app install required. Users scan a QR code or follow a link, log into the target site, and the proof is generated.

---

## Credentials Needed

Three values from Reclaim Dev Center (https://dev.reclaimprotocol.org/):
- `APP_ID` — your application ID
- `APP_SECRET` — your application secret (**shown only once at creation, save immediately**)
- `PROVIDER_ID` — the ID of the provider (one per data source, so we'll have two: Twitch and Discord)

---

## JS SDK (Frontend)

Package: `@reclaimprotocol/js-sdk`

Install: `pnpm add @reclaimprotocol/js-sdk`

### Requesting a Proof

```javascript
import { ReclaimProofRequest } from '@reclaimprotocol/js-sdk';

// Initialize with credentials + provider
const reclaimProofRequest = await ReclaimProofRequest.init(
    APP_ID,
    APP_SECRET,
    PROVIDER_ID
);

// Set context — binds proof to a specific user/wallet (tamper-resistant)
const address = "0xUserWalletAddress";
const message = "voter-registration";
reclaimProofRequest.setContext(address, message);

// Set callback URL — your backend endpoint that receives the proof
reclaimProofRequest.setAppCallbackUrl('https://yourbackend.com/reclaim-callback', true);

// Optional: redirect user after verification
reclaimProofRequest.setRedirectUrl("https://yourapp.com/verification/success");

// Generate the verification URL (user visits this or scans QR)
const proofRequestUrl = await reclaimProofRequest.getRequestUrl();

// Store provider version for later verification
const { providerId, providerVersion } = reclaimProofRequest.getProviderVersion();
```

### Verifying a Proof (Backend/Callback)

```javascript
import { verifyProof } from '@reclaimprotocol/js-sdk';

const proofs = await request.json();
const { isVerified, data } = await verifyProof(proofs, { providerId: PROVIDER_ID });

// Extract verified data
const { context, extractedParameters } = data[0];
// context.address = the wallet address set during init
// context.message = the message set during init
// extractedParameters = the actual verified data from the provider
```

### Security Options

- **Expected parameters** — pre-set values that must match: `reclaimProofRequest.setParams({ name: "John Doe" })`
- **TEE validation** — `{ acceptTeeAttestation: true }` in init options
- **Cancel callbacks** — `setCancelCallbackUrl()` for handling user cancellation

---

## On-Chain Verification (Solidity)

Package: `@reclaimprotocol/verifier-solidity-sdk`

### Contract Integration

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@reclaimprotocol/verifier-solidity-sdk/contracts/Reclaim.sol";
import "@reclaimprotocol/verifier-solidity-sdk/contracts/Addresses.sol";

contract VoterRegistry {
    address public reclaimAddress;

    constructor() {
        reclaimAddress = Addresses.ETHEREUM; // or Addresses.ETHEREUM_SEPOLIA for testnet
    }

    function verifyProof(Reclaim.Proof memory proof) public view {
        Reclaim(reclaimAddress).verifyProof(proof);
        // proof is valid — extract data and proceed
    }
}
```

### Extracting Context Fields

The SDK provides a utility to extract fields from the proof's context string:

```solidity
function extractFieldFromContext(string memory data, string memory target)
    public pure returns (string memory)
```

Target format: `'"FieldName":"'` (include quotes and colon exactly as shown).

Example: to extract a Twitch user ID from context, use `'"twitchUserId":"'`.

This is useful for our sybil resistance — extract the Twitch/Discord user ID from the proof context, hash it, and check uniqueness on-chain.

---

## Deployed Contract Addresses

### Ethereum Mainnet
| Contract | Address |
|----------|---------|
| Reclaim | `0xA2bFF333d2E5468cF4dc6194EB4B5DdeFA2625C0` |

Note: Ethereum mainnet only has the Reclaim verifier. Semaphore contracts we deploy ourselves.

### Ethereum Sepolia (Testnet)
| Contract | Address |
|----------|---------|
| Reclaim | `0xAe94FB09711e1c6B057853a515483792d8e474d0` |
| Semaphore | `0x4C3532e0b42963421d4Ac61CcFd1b0d1c9e2EFdE` |
| SemaphoreVerifier | `0xB68aCB36334311CEc471EE2541173EDc155FdA71` |

Note: Sepolia has Reclaim-deployed Semaphore contracts too, but we'll likely deploy our own Semaphore instance to manage our own group.

---

## Integration Flow for Our Project

1. **Dev Center setup** — register app, create Twitch sub provider + Discord role provider
2. **Frontend** — user clicks "Verify", JS SDK generates proof request URL, user completes verification
3. **Callback** — proof lands at our backend/frontend, we verify it off-chain with `verifyProof()`
4. **On-chain** — submit proof to our `VoterRegistry.sol`, which calls `Reclaim(reclaimAddress).verifyProof(proof)`, extracts the Twitch/Discord user ID, checks uniqueness, and adds the user's Semaphore identity commitment to the voter group

### Key Decision: Where to Verify

Two options:
- **On-chain only** — user submits proof directly to smart contract via a transaction. Simpler, fully trustless, but user pays gas for verification.
- **Off-chain verify + on-chain register** — backend verifies proof, then submits a transaction to add the user to the Semaphore group. User doesn't pay gas for proof verification, but requires trusting the backend (or having the backend sign an attestation).

For a trustless system, on-chain verification is the right call. The user pays gas once for registration, then votes for free (Semaphore proofs are verified on-chain per vote anyway).

---

## Wagmi Integration

Reclaim provides a wagmi example for submitting proofs on-chain from a React frontend:
- Repo: https://github.com/reclaimprotocol/reclaim-wagmi-example
- Uses `writeContract` from wagmi to call `verifyProof` on the deployed Reclaim contract
- Proof object from the JS SDK callback is passed directly as the contract function argument

---

## External Links

- Docs: https://docs.reclaimprotocol.org/
- Dev Center: https://dev.reclaimprotocol.org/
- JS SDK: https://www.npmjs.com/package/@reclaimprotocol/js-sdk
- Solidity SDK: https://www.npmjs.com/package/@reclaimprotocol/verifier-solidity-sdk
- Wagmi example: https://github.com/reclaimprotocol/reclaim-wagmi-example
- GitHub: https://github.com/reclaimprotocol
