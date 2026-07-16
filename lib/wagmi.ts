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

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { ARC_TESTNET, ARC_RPC_URL } from "@/lib/arc/chain";

/**
 * wagmi + RainbowKit config. Shoppers connect their own wallet via
 * WalletConnect; the app only ever targets Arc Testnet. `ssr: true` is required
 * for the Next.js App Router.
 *
 * A WalletConnect project ID (https://cloud.reown.com) is needed for the
 * QR-code / mobile connectors. `getDefaultConfig` rejects an empty id, so when
 * the env var is unset we fall back to a placeholder: the build and injected
 * wallets (MetaMask, etc.) keep working; only WalletConnect itself needs the
 * real id set in `.env.local`.
 */
const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "WALLETCONNECT_PROJECT_ID";

export const wagmiConfig = getDefaultConfig({
  appName: "Arc eCommerce",
  projectId,
  chains: [ARC_TESTNET],
  transports: {
    [ARC_TESTNET.id]: http(ARC_RPC_URL),
  },
  ssr: true,
});
