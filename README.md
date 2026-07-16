# Arc eCommerce Payments

An onchain eCommerce demo on [Circle Arc](https://www.circle.com/arc) that uses the [Commerce Payments Protocol](https://github.com/base/commerce-payments) (Coinbase x Shopify) as its payment processor. Shoppers browse a normal storefront, add items to a cart, connect a wallet, and pay in USDC or EURC. They sign once, never touch gas, and never see a seed phrase or a hex address. Behind that familiar checkout, the protocol's escrow contract recreates the card-network authorize then capture lifecycle on-chain: funds are reserved at checkout and only captured when the merchant fulfills the order.

A single token transfer cannot express what real commerce needs, reserving funds at checkout, capturing when an order ships, partial captures, voids, and refunds. The Commerce Payments Protocol solves this by placing an escrow between the payer and the merchant. This app demonstrates all six of its operations (authorize, capture, charge, void, reclaim, refund) across both currencies, with an operator service that sponsors gas so the shopper pays nothing beyond the purchase itself.

The escrow and its ERC-3009 token collector are not natively deployed on Arc Testnet, so `npm run setup` bootstraps them through Circle's [Smart Contract Platform](https://developers.circle.com/contracts). One command provisions the operator and merchant wallets, deploys both pinned contracts, and writes the wallet and contract addresses back into your environment.



## Table of Contents

- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [How It Works](#how-it-works)
- [Commerce Payments Protocol Integration](#commerce-payments-protocol-integration)
- [Payment Operations](#payment-operations)
- [Order Lifecycle](#order-lifecycle)
- [Currencies (USDC and EURC)](#currencies-usdc-and-eurc)
- [Authentication and Roles](#authentication-and-roles)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Local Development with Webhooks (ngrok)](#local-development-with-webhooks-ngrok)
- [SCP Webhook Registration](#scp-webhook-registration)



## Prerequisites

- **Node.js v20+** - install via [nvm](https://github.com/nvm-sh/nvm). Next.js 16 and React 19 require a recent runtime.
- **A wallet for the shopper** - MetaMask, Coinbase Wallet, Rainbow, or any injected EVM wallet, connected through RainbowKit / WalletConnect. The app prompts a switch to **Arc Testnet** (Chain ID `5042002`) when needed.
- **Arc Testnet USDC** - obtain from the [Circle faucet](https://faucet.circle.com). USDC is Arc's native gas token, so the deployer wallet needs a balance to deploy, and shoppers need a balance to pay. EURC is available from the same faucet if you want to test the EURC path.
- **A Circle Console account** - the operator/merchant backend runs on Circle's [Developer-Controlled Wallets](https://developers.circle.com/wallets/dev-controlled) and [Smart Contract Platform](https://developers.circle.com/contracts). You need an API key and a registered entity secret.
- **A WalletConnect (Reown) project ID** *(optional)* - required only for QR and mobile connectors. Injected browser wallets work without one. Get it from [cloud.reown.com](https://cloud.reown.com).
- **Supabase** - a hosted project or the local CLI stack, used for authentication and order persistence.



## Getting Started

1. Clone the repository and install dependencies:
  ```bash
   git clone https://github.com/akelani-circle/arc-ecommerce-payments.git
   cd arc-ecommerce-payments
   npm install
  ```
2. Set up environment variables:
  ```bash
   cp .env.example .env.local
  ```
   Open `.env.local` and fill in your Supabase keys, your Circle API key and entity secret, and (optionally) your WalletConnect project ID. The Arc Testnet RPC URL is pre-filled. See [Environment Variables](#environment-variables) for the full list. The wallet IDs and the deployed contract addresses are written automatically by the setup script, so leave those blank.
  > **Register your entity secret first.** Circle's Developer-Controlled Wallets require a one-time entity secret registration before the SDK can sign anything. Follow [the registration guide](https://developers.circle.com/wallets/dev-controlled/register-entity-secret) and store the recovery file **outside** the repository. Set `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET` in `.env.local` afterward.
3. Set up the onchain side in one command:
  ```bash
   npm run setup
  ```
   The setup script (`scripts/setup.ts`) is idempotent end to end:
  1. Ensures the three Developer-Controlled wallets the store needs - **deployer**, **operator** (submits + sponsors gas), and **merchant** (funds receiver) - creating any that are missing and writing their ids/addresses to `.env.local` so reruns reuse them.
  2. Deploys `AuthCaptureEscrow` (no constructor args, deploys its own `TokenStore`) and `ERC3009PaymentCollector` (escrow + Multicall3 addresses) via the Smart Contract Platform, then writes `NEXT_PUBLIC_ESCROW_ADDRESS` and `NEXT_PUBLIC_TOKEN_COLLECTOR_ADDRESS` back. Skipped if both are already set.
  3. Seeds the operator with a little Arc gas (USDC) from the deployer, since the operator pays for every checkout transaction.
    cause Arc uses USDC as native gas, the deployer must hold some before contracts can deploy. If it is empty the script prints its address and the [faucet](https://faucet.circle.com) link, then exits - fund it and re-run. To deploy a fresh pair of contracts, force it:
    `bash m run setup -- --force` 
    The protocol source is pinned to a specific commit and compiled with the Cancun EVM target. Arc Testnet runs a newer hardfork, so no source changes are needed. Provenance and the compatibility notes live in `[contracts/README.md](contracts/README.md)`.
4. Start the development server:
  ```bash
   npm run dev
  ```
   The app runs at `http://localhost:3000`. A demo admin account is seeded automatically on boot (see [Authentication and Roles](#authentication-and-roles)).



## How It Works

- Built with the [Next.js 16](https://nextjs.org) App Router, [React 19](https://react.dev), and TypeScript, styled with [Tailwind CSS v4](https://tailwindcss.com) and [shadcn/ui](https://ui.shadcn.com).
- Shopper wallets connect through [wagmi](https://wagmi.sh) + [viem](https://viem.sh) + [RainbowKit](https://www.rainbowkit.com) on Arc Testnet. The operator and merchant backend runs on [Circle Developer-Controlled Wallets](https://developers.circle.com/wallets/dev-controlled).
- Payments are processed by the Commerce Payments Protocol escrow, deployed to Arc through the Smart Contract Platform and called by ABI. The operator builds and signs a `PaymentInfo` intent and submits each operation.
- Checkout is gasless for the shopper. The shopper signs an off-chain ERC-3009 `receiveWithAuthorization` (EIP-712) in their own wallet, and the operator relays it on-chain and sponsors the gas.
- Both USDC and EURC are supported end to end. Every price renders in the selected currency, and each order settles in the token it was paid in.
- Authentication and order history run on [Supabase](https://supabase.com) with server-controlled role claims. A route guard gates the account, admin, and checkout areas.
- Arc uses USDC as its native gas token, so no separate ETH is needed for transaction fees.



## Commerce Payments Protocol Integration

The protocol places an escrow contract between payer and merchant. The shared key across every operation is `PaymentInfo`, a signed intent describing the payer, receiver, token, amount, operator, fee, and deadlines (`lib/payments/types.ts`). The operator has bounded power: it submits transactions and earns a fee, but it cannot redirect funds.

The token collector is the piece that pulls funds into escrow. This app uses the ERC-3009 collector: the shopper signs an off-chain `receiveWithAuthorization` (the collector is the authorized recipient, so only it can redeem the signature) and the operator submits it, which keeps the authorize step gasless for the shopper. Both USDC and EURC support ERC-3009 for EOA wallets, so no ERC-1271 smart-account signatures are needed.

### Deployed contracts (Arc Testnet)


| Contract                  | Address                                                                                                                        | Purpose                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `AuthCaptureEscrow`       | `[0xa5b4fa1890619cf03b8d6b11e0c680345b1881d8](https://testnet.arcscan.app/address/0xa5b4fa1890619cf03b8d6b11e0c680345b1881d8)` | The escrow that holds reserved funds and releases them on capture                    |
| `ERC3009PaymentCollector` | `[0x01e39d4a0b8ffeac8ae1618dbf316d15a8ee867c](https://testnet.arcscan.app/address/0x01e39d4a0b8ffeac8ae1618dbf316d15a8ee867c)` | Pulls USDC/EURC into escrow from the shopper's signed ERC-3009 authorization         |
| Multicall3                | `[0xcA11bde05977b3631167028862bE2a173976CA11](https://testnet.arcscan.app/address/0xcA11bde05977b3631167028862bE2a173976CA11)` | Canonical helper, a constructor dependency of the collector (already present on Arc) |


These are the addresses produced by `npm run setup`. Your own deployment will have different addresses, written into `.env.local` and read centrally from `lib/contracts/index.ts`. `npm run setup` also deploys an `OperatorRefundCollector` (pinned to `NEXT_PUBLIC_REFUND_COLLECTOR_ADDRESS`) used by the refund path below.

> **Implementation status.** All six operations are wired end-to-end. The shopper signs the ERC-3009 authorization at checkout; the operator relays **Authorize** or **Charge** on-chain sponsoring gas. The admin queue submits **Capture**, **Void**, and **Refund** via `POST /api/admin/orders/[id]/`*. **Refund** requires no signature from the merchant: it routes through the `OperatorRefundCollector`, which pulls the refund amount from the operator wallet (via a standing USDC + EURC allowance granted in `npm run setup`) back to the payer. Captured funds have already left the escrow to the merchant, so the operator fronts refunds out of its own balance rather than clawing back from the merchant. **Reclaim** is shopper-triggered from `/account` via `POST /api/account/reclaim` once `authorizationExpiry` has passed.



## Payment Operations

The protocol exposes six operations, all keyed off the same `PaymentInfo`. The demo exercises each one across both currencies.


| Operation     | What it does                                                        | In the store                                              |
| ------------- | ------------------------------------------------------------------- | --------------------------------------------------------- |
| **Authorize** | Reserves funds in escrow                                            | Checkout for goods. Order shows "Payment reserved"        |
| **Capture**   | Releases escrowed funds to the merchant, supports multiple partials | Merchant fulfills the order                               |
| **Charge**    | Authorize and capture in one atomic step                            | In-stock and digital items at checkout                    |
| **Void**      | Cancels an authorization and returns funds to the payer             | Shopper cancels before fulfillment, or merchant cancels   |
| **Reclaim**   | Payer self-recovers funds after the authorization expires           | Auto-release if the order has not shipped by the deadline |
| **Refund**    | Returns captured funds to the payer, full or partial                | Merchant refunds a paid order, in the order's currency    |




## Order Lifecycle


| Step | Operation                                                    | Order state                        |
| ---- | ------------------------------------------------------------ | ---------------------------------- |
| 1    | Shopper signs the ERC-3009 authorization, operator relays it | Reserved (Authorize)               |
| 2    | Merchant fulfills                                            | Paid (Capture)                     |
| -    | In-stock or digital item at checkout                         | Paid (Charge, single step)         |
| -    | Shopper or merchant cancels before fulfillment               | Canceled (Void)                    |
| -    | Authorization expires before fulfillment                     | Expired (Reclaim available)        |
| -    | Merchant refunds a paid order                                | Refunded (Refund, full or partial) |


The merchant admin shows each order's currency, the operator fee, and the net amount to the merchant.

## Currencies (USDC and EURC)

Prices render in the shopper's chosen currency via a toggle, and every order settles in the token it was paid in. There is no FX or swapping at settlement.


| Field    | Value                                                     |
| -------- | --------------------------------------------------------- |
| Chain ID | `5042002` (hex `0x4CEF52`), ships as `arcTestnet` in viem |
| RPC      | `https://rpc.testnet.arc.network`                         |
| Explorer | [testnet.arcscan.app](https://testnet.arcscan.app)        |
| Faucet   | [faucet.circle.com](https://faucet.circle.com)            |
| USDC     | `0x3600000000000000000000000000000000000000` (6 decimals) |
| EURC     | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` (6 decimals) |


USDC is Arc's native gas token, which uses 18 decimals for native gas and 6 decimals for the ERC-20. The operator sponsors gas, so shoppers never pay it.

## Authentication and Roles

Authentication is traditional email and password through Supabase, with email confirmation disabled for the demo, so sign-up returns an active session immediately. Routes are guarded by `proxy.ts` and re-verified server-side in protected layouts as defense in depth.

Authorization is keyed off `app_metadata.role`, not the email address. `app_metadata` is server-controlled and not user-editable, which makes it a real authorization boundary.


| Route                          | Access                                                    |
| ------------------------------ | --------------------------------------------------------- |
| `/`, `/products/[id]`          | public                                                    |
| `/auth/login`, `/auth/sign-up` | public, redirect away if signed in                        |
| `/checkout`                    | signed-in shoppers with a non-empty cart (admins bounced) |
| `/account`                     | signed-in regular users (admins bounced to `/admin`)      |
| `/admin`                       | `app_metadata.role === "admin"` only                      |




### Demo admin (auto-seeded)

A single admin account is bootstrapped on server boot (`instrumentation.ts` runs `lib/supabase/seed-admin.ts`). It is idempotent: created if missing, otherwise its `admin` role claim is ensured. This requires `SUPABASE_SECRET_KEY` (the service-role key) and is skipped with a warning if that is unset.


| Field    | Value             |
| -------- | ----------------- |
| Email    | `admin@admin.com` |
| Password | `123456`          |


These credentials are hardcoded on purpose. This is a demo where zero setup matters more than secrecy. Disable email confirmation in the Supabase dashboard under **Authentication, Sign In / Providers, Email, "Confirm email" off.**

## Environment Variables

All variables live in `.env.local`. The setup script writes the wallet IDs/addresses and the contract addresses automatically, so you only fill in the credentials.


| Variable                                                             | Purpose                                      | How to get it                                                                |
| -------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`  | Auth and orders                              | Supabase project settings, or `npm run db:status` for local                  |
| `SUPABASE_SECRET_KEY`                                                | Admin auto-seed, server only                 | Service-role key. Never expose to the browser                                |
| `NEXT_PUBLIC_ARC_RPC_URL`                                            | Wallet and reads                             | Defaults to `https://rpc.testnet.arc.network`                                |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`                               | RainbowKit QR / mobile                       | [cloud.reown.com](https://cloud.reown.com). Injected wallets work without it |
| `CIRCLE_API_KEY` / `CIRCLE_ENTITY_SECRET`                            | Operator backend, setup script               | Circle Console. Backend only, never commit                                   |
| `DEPLOYER_WALLET_SET_ID` / `DEPLOYER_WALLET_ID`                      | Setup script                                 | Written automatically on first setup                                         |
| `OPERATOR_WALLET_ID` / `OPERATOR_ADDRESS`                            | Operator (submits ops, sponsors gas)         | Written automatically by `npm run setup`                                     |
| `MERCHANT_WALLET_ID` / `MERCHANT_ADDRESS`                            | Merchant (funds receiver)                    | Written automatically by `npm run setup`                                     |
| `NEXT_PUBLIC_ESCROW_ADDRESS` / `NEXT_PUBLIC_TOKEN_COLLECTOR_ADDRESS` | On-chain settlement                          | Written automatically by `npm run setup`                                     |
| `WEBHOOK_SECRET`                                                     | HMAC-SHA256 verification for SCP push events | Any strong random string; register it with the Circle SCP webhook API        |




### Local Supabase (optional)

The Supabase CLI is wired into npm scripts for running Postgres and auth locally:

```bash
npm run db:start     # start the local stack
npm run db:status    # print local URLs and keys (use these in .env.local)
npm run db:stop      # stop the stack
npm run db:reset     # reset the local database
```



## Project Structure

```
app/
  page.tsx                  public storefront (catalog + currency toggle)
  products/[id]/page.tsx    product detail (statically generated per product)
  checkout/page.tsx         wallet-connect checkout
  account/                  authenticated order history (layout guards session)
  admin/                    admin-only console (layout guards role claim)
  auth/login, auth/sign-up  email auth screens
  layout.tsx                root layout (theme + web3 providers)
components/
  storefront.tsx            catalog grid + USDC/EURC toggle
  product-detail.tsx        detail view + add to cart
  checkout/checkout.tsx     wallet connect + checkout flow
  cart-provider.tsx         localStorage cart, cookie count mirror, cross-tab sync
  cart-button.tsx           header cart popover
  add-to-cart-button.tsx
  site-header.tsx           role-aware header
  web3-provider.tsx         wagmi + react-query + RainbowKit
  theme-provider.tsx, mode-toggle.tsx   light/dark
  login-form.tsx, sign-up-form.tsx, logout-button.tsx
  ui/                       shadcn primitives
contracts/
  README.md                 protocol provenance + Arc/Cancun compatibility notes
  artifacts/                pinned ABI + bytecode (AuthCaptureEscrow, ERC3009PaymentCollector)
lib/
  products.ts               catalog data + currency formatting
  orders.ts                 order lifecycle states + placeholder history
  arc/chain.ts              Arc Testnet constants (chain id, RPC, explorer, faucet)
  arc/tokens.ts             USDC/EURC config, ERC-20 + ERC-3009 ABI / EIP-712
  arc/public-client.ts      shared read-only viem client for Arc (server-side reads)
  contracts/index.ts        deployed addresses + ABIs (single source of truth)
  payments/types.ts         PaymentInfo + the six operations + signed authorization
  payments/payment-info.ts  builds PaymentInfo for an order (pure)
  payments/authorization.ts ERC-3009 typed-data + payer-agnostic nonce
  payments/intent-store.ts  short-lived server hold of the built PaymentInfo
  operator/operations.ts    operator service (all six operations wired)
  operator/config.ts        operator + merchant addresses (server-only)
  checkout/submit.ts        real checkout: intent -> sign -> relay
  circle/client.ts          Developer-Controlled Wallets client (backend-only)
  supabase/                 client (browser), server (RSC), proxy (session), seed-admin
  use-hydrated.ts           hydration-safe client flag
  wagmi.ts                  RainbowKit config (Arc Testnet, WalletConnect)
scripts/
  setup.ts                  ensures wallets, deploys escrow + collectors, seeds operator gas, grants refund allowance
app/api/
  checkout/intent/          builds + holds PaymentInfo, returns what the shopper signs
  checkout/authorize/       relays the signed authorization (Authorize or Charge)
  admin/orders/[id]/
    capture/                POST - operator submits escrow.capture, updates DB
    void/                   POST - operator submits escrow.void, updates DB
    refund/                 POST - operator submits escrow.refund via OperatorRefundCollector
  account/reclaim/          POST - shopper: operator submits escrow.reclaim after expiry
  webhooks/payments/        POST - SCP event push -> order status updates
instrumentation.ts          boots admin seeding on server start
proxy.ts                    route guard entry + matcher config
```



## Local Development with Webhooks (ngrok)

The SCP webhook endpoint (`/api/webhooks/payments`) must be publicly reachable for Circle to push contract events to it. During local development you need a tunnel - [ngrok](https://ngrok.com) is the easiest option.

1. **Install ngrok:**
  ```bash
   # macOS
   brew install ngrok

   # Linux / Windows - download from https://ngrok.com/download and add to PATH
  ```
2. **Authenticate once** (free account required):
  ```bash
   ngrok config add-authtoken <your-ngrok-authtoken>
  ```
   Get your token from [dashboard.ngrok.com/authtokens](https://dashboard.ngrok.com/authtokens).
3. **Start a tunnel** while the dev server is running on port 3000:
  ```bash
   ngrok http 3000
  ```
   ngrok prints a public HTTPS URL such as `https://abc123.ngrok-free.app`. Every request to that URL is forwarded to your local `localhost:3000`.
4. **Register the webhook** using your ngrok URL (see [SCP Webhook Registration](#scp-webhook-registration) below). Restart ngrok when you need a new session - the URL changes each time on the free plan, so re-register accordingly.
  > **Tip:** The [ngrok paid plans](https://ngrok.com/pricing) offer stable custom domains if you need a persistent URL across sessions.



## SCP Webhook Registration

`POST /api/webhooks/payments` receives Circle Smart Contract Platform event-monitoring push notifications for the escrow contract and updates order status without polling.

To register it after deployment:

```bash
curl -X POST https://api.circle.com/v1/w3s/contracts/event-monitors \
  -H "Authorization: Bearer $CIRCLE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contractAddress": "'$NEXT_PUBLIC_ESCROW_ADDRESS'",
    "endpointUrl": "https://<your-public-domain>/api/webhooks/payments",
    "secret": "<your-WEBHOOK_SECRET>"
  }'
```

Set `WEBHOOK_SECRET=<your-WEBHOOK_SECRET>` in `.env.local`, then uncomment the HMAC-SHA256 signature verification block at the top of `app/api/webhooks/payments/route.ts`. Circle signs each push request with the shared secret; the handler verifies it before processing.

## **Legal disclaimer**

Sample apps provided for demonstration and educational purposes only, intended for Arc testnet use only, and not production-ready. See ++[Arc.io](http://Arc.io)++ for more.