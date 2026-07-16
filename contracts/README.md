# Contracts - Commerce Payments Protocol (pinned)

The escrow + ERC-3009 token collector this app deploys to Arc Testnet. Arc
addresses and ABIs are pinned to a protocol commit so the app builds against a
single, fixed version.

## Provenance

- **Source:** https://github.com/base/commerce-payments
- **Pinned commit:** `3f77761cf8b174fdc456a275a9c64919eda44234`
- **Compiler:** solc `0.8.29`, `evm_version = "cancun"`, `via_ir = true`,
  `optimizer_runs = 100000` (the repo's `[profile.deploy]`).

## What we deploy

| Contract | Constructor args | Creation size |
|----------|------------------|---------------|
| `AuthCaptureEscrow` | none (deploys its own `TokenStore`) | ~12.0 KB |
| `ERC3009PaymentCollector` | `(authCaptureEscrow, multicall3)` | ~4.2 KB |

`ERC3009PaymentCollector` is the token collector used here: the shopper signs an
ERC-3009 `transferWithAuthorization` and the operator relays it. The Permit2 /
SpendPermission / PreApproval collectors are not deployed.

## Arc EVM compatibility (verified 2026-06-10)

Arc Testnet targets the **Osaka** hardfork - newer than Cancun - so it supports
PUSH0, transient storage (TSTORE/TLOAD), and MCOPY. The escrow uses solady's
`ReentrancyGuardTransient` (override forces transient storage on all chains);
this runs fine on Arc. **Deploy compiled with `cancun`, no source changes.**

> The Circle SCP skill's "compile with `evmVersion: paris` to avoid PUSH0 on
> Arc" note is **stale** for current (Osaka) Arc. Do not downgrade - a paris
> compile also fails because the unused SpendPermission/Permit2 collectors
> require the `transient` keyword.

## Dependency on Arc

- **Multicall3** `0xcA11bde05977b3631167028862bE2a173976CA11` - confirmed present
  on Arc Testnet; passed to the collector constructor.

## Artifacts

`artifacts/*.json` hold `{ abi, bytecode }` for each contract, consumed by
`scripts/setup.ts` (deploy) and `lib/contracts/index.ts` (app-side ABIs).
Regenerate by building the pinned source with `FOUNDRY_PROFILE=deploy forge build
--evm-version cancun` and copying `out/<C>.sol/<C>.json`.
