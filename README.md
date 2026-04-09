# Neuro Bounty Board

Trustless bounty board for the Neuro-sama community. Post bounties, fund game integrations and tools, settle disputes with anonymous Twitch subscriber voting.

## How it works

1. **Sponsor posts a bounty** — describes the work, locks reward in escrow
2. **Devs apply** — sponsor picks one, dev stakes a bond and gets to work
3. **Dev submits** — sponsor reviews and approves, funds get released
4. **Dispute?** — verified Twitch subscribers vote anonymously on who's right

No one holds anyone's money. Rewards are locked in a smart contract that executes exactly as written — transparent and verifiable by anyone.

Dispute voting uses [TLSNotary](https://tlsnotary.org/) to prove Twitch subscription status and [Semaphore](https://semaphore.pse.dev/) for anonymous zero-knowledge votes. One vote per Twitch account, no one can see who voted what.

## Architecture

pnpm monorepo with three packages:

```
packages/contracts/   — Solidity smart contracts (Foundry)
packages/frontend/    — Next.js + Tailwind + wagmi/RainbowKit
packages/subgraph/    — Subgraph for indexing on-chain events
```

**Chain:** Base mainnet  
**Currency:** EURC (Circle's Euro stablecoin) — displayed as `€` in the UI  
**Contracts:** BountyEscrow (escrow + lifecycle) and DisputeResolver (voting + TLSNotary verification), both UUPS upgradeable

See [docs/SPEC.md](docs/SPEC.md) for the full architecture spec.

## Running locally

Prerequisites: Node.js 22+, [pnpm](https://pnpm.io/), [Foundry](https://book.getfoundry.sh/)

```bash
# Install dependencies
pnpm install

# Run frontend
cd packages/frontend
pnpm dev

# Compile contracts
cd packages/contracts
forge build
```

## Deployed contracts (Base)

| Contract                | Address                                      |
| ----------------------- | -------------------------------------------- |
| BountyEscrow (proxy)    | `0x1005c4231E5A687F41A15277cEc416d4A9D3649e` |
| DisputeResolver (proxy) | `0xF7bBF83bdA864b7298eeBfB509c887033226FaB4` |

## License

MIT
