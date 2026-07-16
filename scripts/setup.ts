/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * One-command onchain setup for the store. Idempotent end to end:
 *
 *   1. Ensure the deployer, operator, and merchant Developer-Controlled wallets
 *      (creates any that are missing, persists their ids/addresses to .env.local
 *      so reruns reuse them).
 *   2. Deploy AuthCaptureEscrow + ERC3009PaymentCollector via Circle's Smart
 *      Contract Platform if they are not already deployed (gates on deployer gas).
 *   3. Seed the operator with a little Arc gas (USDC) from the deployer, since
 *      the operator submits + sponsors every checkout transaction.
 *
 * Run:  npm run setup            (loads .env.local for CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET)
 *       npm run setup -- --force (redeploy fresh contract instances)
 *
 * Roles: operator submits ops + sponsors gas; merchant is the funds receiver.
 * One merchant receiver serves both USDC and EURC.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { createPublicClient, encodeFunctionData, erc20Abi, http, formatEther, maxUint256, parseEther, type Address } from "viem";
import { arcTestnet } from "viem/chains";
import escrow from "../contracts/artifacts/AuthCaptureEscrow.json";
import collector from "../contracts/artifacts/ERC3009PaymentCollector.json";
import refundCollector from "../contracts/artifacts/OperatorRefundCollector.json";

const BLOCKCHAIN = "ARC-TESTNET";
const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";
const FAUCET = "https://faucet.circle.com";
const EXPLORER = "https://testnet.arcscan.app";
const ENV_PATH = resolve(process.cwd(), ".env.local");
const FORCE = process.argv.includes("--force");

/** Top up the operator to this much gas when it is below the floor. */
const OPERATOR_GAS_FLOOR = parseEther("0.5");
const OPERATOR_GAS_SEED = "2";

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const wrap = (code: string) => (s: string) =>
  useColor ? `\x1b[${code}m${s}\x1b[0m` : s;
const c = {
  bold: wrap("1"),
  dim: wrap("2"),
  red: wrap("31"),
  green: wrap("32"),
  yellow: wrap("33"),
  cyan: wrap("36"),
};

function upsertEnv(updates: Record<string, string>): void {
  const lines = existsSync(ENV_PATH)
    ? readFileSync(ENV_PATH, "utf8").split("\n")
    : [];
  for (const [key, value] of Object.entries(updates)) {
    const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
    const line = `${key}=${value}`;
    if (idx >= 0) lines[idx] = line;
    else lines.push(line);
  }
  writeFileSync(ENV_PATH, lines.join("\n").replace(/\n+$/, "") + "\n");
  console.log(c.dim(`  wrote ${Object.keys(updates).join(", ")} -> .env.local`));
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}, set it in .env.local (see .env.example).`);
  return v;
}

const apiKey = env("CIRCLE_API_KEY");
const entitySecret = env("CIRCLE_ENTITY_SECRET");
const scp = initiateSmartContractPlatformClient({ apiKey, entitySecret });
const wallets = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
const rpc = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.NEXT_PUBLIC_ARC_RPC_URL),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reuse the wallet set if one exists, else create + persist it. */
async function ensureWalletSet(): Promise<string> {
  const existing = process.env.DEPLOYER_WALLET_SET_ID;
  if (existing) return existing;
  const set = await wallets.createWalletSet({ name: "arc-ecommerce" });
  const id = set.data?.walletSet?.id;
  if (!id) throw new Error("Failed to create wallet set.");
  upsertEnv({ DEPLOYER_WALLET_SET_ID: id });
  return id;
}

/** Ensure one EOA wallet on Arc. Persists its id (+ address if `addrKey` given). */
async function ensureWallet(
  label: string,
  idKey: string,
  walletSetId: string,
  addrKey?: string,
): Promise<{ id: string; address: Address }> {
  const existing = process.env[idKey];
  if (existing) {
    const w = (await wallets.getWallet({ id: existing })).data?.wallet;
    if (!w?.address) throw new Error(`${idKey} ${existing} not found.`);
    console.log(c.dim(`${label} wallet (reused): ${w.id}  ${w.address}`));
    return { id: w.id, address: w.address as Address };
  }
  const created = await wallets.createWallets({
    blockchains: [BLOCKCHAIN as never],
    accountType: "EOA",
    count: 1,
    walletSetId,
  });
  const w = created.data?.wallets?.[0];
  if (!w?.address) throw new Error(`Failed to create ${label} wallet.`);
  console.log(c.cyan(`Created ${label} wallet: ${w.id}  ${w.address}`));
  upsertEnv(addrKey ? { [idKey]: w.id, [addrKey]: w.address } : { [idKey]: w.id });
  return { id: w.id, address: w.address as Address };
}

/**
 * Request testnet USDC from the Circle faucet API, then poll until the balance
 * lands on-chain (up to ~2 minutes). Falls back gracefully: if the API returns
 * an error (e.g. the account requires mainnet upgrade), the caller decides
 * whether to exit or print a manual instruction.
 *
 * Note: POST /v1/faucet/drips requires a mainnet-enabled Circle account. If
 * your account is sandbox-only you will get a 4xx and the script falls back to
 * the manual faucet link.
 */
async function fundFromFaucet(address: Address): Promise<void> {
  console.log(c.cyan(`  Requesting testnet USDC from Circle faucet API...`));
  const res = await fetch("https://api.circle.com/v1/faucet/drips", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ address, blockchain: BLOCKCHAIN, native: true }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Faucet API returned ${res.status}: ${text.slice(0, 200)}`);
  }
  console.log(c.dim(`  Faucet request accepted. Waiting for funds to arrive...`));
  for (let i = 0; i < 30; i++) {
    await sleep(4000);
    const bal = await rpc.getBalance({ address });
    if (bal > BigInt(0)) {
      console.log(c.green(`  Funded: ${formatEther(bal)} USDC`));
      return;
    }
    console.log(c.dim(`  ...${(i + 1) * 4}s`));
  }
  throw new Error("Faucet accepted the request but balance did not arrive within 2 minutes.");
}

/** The wallet's native USDC tokenId (needed for gas transfers). */
async function nativeTokenId(walletId: string): Promise<string> {
  const res = await wallets.getWalletTokenBalance({ id: walletId });
  const native = res.data?.tokenBalances?.find((b) => b.token?.isNative);
  if (!native?.token?.id) throw new Error("No native USDC token found on the deployer wallet.");
  return native.token.id;
}

/** Move native USDC (= Arc gas) from one wallet to an address; wait until settled. */
async function seedGas(fromWalletId: string, to: Address, amount: string): Promise<void> {
  const tokenId = await nativeTokenId(fromWalletId);
  const res = await wallets.createTransaction({
    idempotencyKey: randomUUID(),
    walletId: fromWalletId,
    tokenId,
    destinationAddress: to,
    amount: [amount],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const id = res.data?.id;
  if (!id) throw new Error("Gas seed transfer returned no transaction id.");
  await wallets.getTransaction({ id, waitForState: "COMPLETE" });
}

/** Deploy one contract and poll until it has an onchain address. */
async function deploy(
  name: string,
  artifact: { abi: unknown; bytecode: string },
  walletId: string,
  constructorParameters: unknown[],
): Promise<Address> {
  console.log(c.cyan(`\nDeploying ${name}...`));
  const res = await scp.deployContract({
    idempotencyKey: randomUUID(),
    name,
    description: `Commerce Payments Protocol ${name} on Arc Testnet`,
    blockchain: BLOCKCHAIN as never,
    walletId,
    abiJson: JSON.stringify(artifact.abi),
    bytecode: artifact.bytecode,
    constructorParameters: constructorParameters as never,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const contractId = res.data?.contractId;
  if (!contractId) throw new Error(`${name}: no contractId returned.`);
  console.log(c.dim(`  contractId=${contractId} tx=${res.data?.transactionId ?? "?"}`));

  for (let i = 0; i < 60; i++) {
    await sleep(4000);
    const ct = (await scp.getContract({ id: contractId })).data?.contract;
    const status = ct?.status;
    if (status === "COMPLETE" && ct?.contractAddress) {
      console.log(`  ${c.green("deployed")} ${c.bold(ct.contractAddress)}`);
      console.log(c.dim(`  ${EXPLORER}/address/${ct.contractAddress}`));
      return ct.contractAddress as Address;
    }
    if (status === "FAILED") {
      throw new Error(
        `${name} deployment FAILED: ${ct?.deploymentErrorReason ?? "?"} - ${ct?.deploymentErrorDetails ?? ""}`,
      );
    }
    console.log(c.dim(`  ...${status ?? "pending"} (${(i + 1) * 4}s)`));
  }
  throw new Error(`${name}: deployment timed out.`);
}

/** Deploy the escrow + collectors if missing; returns the refund collector address. */
async function ensureContracts(deployerId: string, deployerAddr: Address): Promise<Address> {
  const haveAll =
    process.env.NEXT_PUBLIC_ESCROW_ADDRESS &&
    process.env.NEXT_PUBLIC_TOKEN_COLLECTOR_ADDRESS &&
    process.env.NEXT_PUBLIC_REFUND_COLLECTOR_ADDRESS;
  if (haveAll && !FORCE) {
    console.log(c.green("\nContracts already deployed:"));
    console.log(`  NEXT_PUBLIC_ESCROW_ADDRESS=${process.env.NEXT_PUBLIC_ESCROW_ADDRESS}`);
    console.log(`  NEXT_PUBLIC_TOKEN_COLLECTOR_ADDRESS=${process.env.NEXT_PUBLIC_TOKEN_COLLECTOR_ADDRESS}`);
    console.log(`  NEXT_PUBLIC_REFUND_COLLECTOR_ADDRESS=${process.env.NEXT_PUBLIC_REFUND_COLLECTOR_ADDRESS}`);
    console.log(c.dim("  (redeploy fresh instances with: npm run setup -- --force)"));
    return process.env.NEXT_PUBLIC_REFUND_COLLECTOR_ADDRESS as Address;
  }

  let balance = await rpc.getBalance({ address: deployerAddr });
  console.log(`\nDeployer ${c.bold(deployerAddr)}  gas: ${formatEther(balance)} USDC`);
  if (balance === BigInt(0)) {
    try {
      await fundFromFaucet(deployerAddr);
      balance = await rpc.getBalance({ address: deployerAddr });
    } catch (err) {
      console.log(c.yellow(`\n  Auto-fund failed: ${err instanceof Error ? err.message : err}`));
      console.log(c.yellow("  Fund the deployer manually, then re-run:"));
      console.log(`    ${FAUCET}  ->  send Arc Testnet USDC to ${c.bold(deployerAddr)}`);
      process.exit(1);
    }
  }

  let escrowAddr = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as Address | undefined;
  let collectorAddr = process.env.NEXT_PUBLIC_TOKEN_COLLECTOR_ADDRESS as Address | undefined;

  if (!escrowAddr || FORCE) {
    escrowAddr = await deploy("AuthCaptureEscrow", escrow, deployerId, []);
    collectorAddr = undefined; // must redeploy collector against new escrow
  }
  if (!collectorAddr || FORCE) {
    collectorAddr = await deploy("ERC3009PaymentCollector", collector, deployerId, [
      escrowAddr,
      MULTICALL3,
    ]);
  }

  const refundCollectorAddr = await deploy("OperatorRefundCollector", refundCollector, deployerId, [
    escrowAddr,
  ]);

  upsertEnv({
    NEXT_PUBLIC_ESCROW_ADDRESS: escrowAddr,
    NEXT_PUBLIC_TOKEN_COLLECTOR_ADDRESS: collectorAddr,
    NEXT_PUBLIC_REFUND_COLLECTOR_ADDRESS: refundCollectorAddr,
  });

  return refundCollectorAddr;
}

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

// Re-approve only when the standing allowance has run low. USDC/EURC decrement
// the allowance on each refund's transferFrom, so this tops it back up rather
// than spending two transactions on every `npm run setup`.
const APPROVAL_REFRESH_THRESHOLD = maxUint256 / BigInt(2);

/** Approve the OperatorRefundCollector to spend the operator's USDC and EURC. */
async function ensureRefundApprovals(
  operatorWalletId: string,
  operatorAddr: Address,
  refundAddr: Address,
): Promise<void> {
  console.log(c.cyan("\nApproving OperatorRefundCollector to spend operator USDC + EURC..."));
  const approveCalldata = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [refundAddr, maxUint256],
  });

  for (const [symbol, tokenAddr] of [
    ["USDC", USDC_ADDRESS],
    ["EURC", EURC_ADDRESS],
  ] as const) {
    const allowance = await rpc.readContract({
      address: tokenAddr,
      abi: erc20Abi,
      functionName: "allowance",
      args: [operatorAddr, refundAddr],
    });
    if (allowance >= APPROVAL_REFRESH_THRESHOLD) {
      console.log(c.dim(`  ${symbol} already approved.`));
      continue;
    }
    const res = await wallets.createContractExecutionTransaction({
      idempotencyKey: randomUUID(),
      walletId: operatorWalletId,
      contractAddress: tokenAddr,
      callData: approveCalldata,
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    } as never);
    const txId = (res.data as { id?: string } | undefined)?.id;
    if (!txId) throw new Error(`approve ${symbol}: no transaction id returned`);
    await wallets.getTransaction({ id: txId, waitForState: "COMPLETE" } as never);
    console.log(c.green(`  ${symbol} approved.`));
  }
}

/** Make sure the operator can pay gas; seed from the deployer when it can. */
async function ensureOperatorGas(deployer: { id: string; address: Address }, operator: Address): Promise<void> {
  const opBalance = await rpc.getBalance({ address: operator });
  console.log(`\nOperator ${c.bold(operator)}  gas: ${formatEther(opBalance)} USDC`);
  if (opBalance >= OPERATOR_GAS_FLOOR) return;

  let deployerBalance = await rpc.getBalance({ address: deployer.address });
  if (deployerBalance <= parseEther(OPERATOR_GAS_SEED) + OPERATOR_GAS_FLOOR) {
    console.log(c.dim("  Deployer balance too low to seed operator; requesting from faucet..."));
    try {
      await fundFromFaucet(deployer.address);
      deployerBalance = await rpc.getBalance({ address: deployer.address });
    } catch (err) {
      console.log(c.yellow(`\n  Auto-fund failed: ${err instanceof Error ? err.message : err}`));
      console.log(c.yellow("  Operator needs gas and the deployer is too low to seed it. Fund either:"));
      console.log(`    ${FAUCET}  ->  send Arc Testnet USDC to ${c.bold(operator)}`);
      process.exit(1);
    }
  }
  console.log(c.cyan(`  Seeding operator with ${OPERATOR_GAS_SEED} USDC from deployer...`));
  await seedGas(deployer.id, operator, OPERATOR_GAS_SEED);
  console.log(c.green("  operator funded."));
}

async function main() {
  const walletSetId = await ensureWalletSet();
  const deployer = await ensureWallet("Deployer", "DEPLOYER_WALLET_ID", walletSetId);
  const operator = await ensureWallet("Operator", "OPERATOR_WALLET_ID", walletSetId, "OPERATOR_ADDRESS");
  await ensureWallet("Merchant", "MERCHANT_WALLET_ID", walletSetId, "MERCHANT_ADDRESS");

  const refundCollectorAddr = await ensureContracts(deployer.id, deployer.address);
  await ensureOperatorGas(deployer, operator.address);
  await ensureRefundApprovals(operator.id, operator.address, refundCollectorAddr);

  console.log(c.green(c.bold("\nSetup complete. The store is ready to take payments.")));
}

main().catch((err) => {
  console.error(c.red("\nSetup failed:"), err instanceof Error ? err.message : err);
  process.exit(1);
});
