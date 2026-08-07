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

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePositiveTokenAmount } from "../lib/payments/token-amount";

describe("parsePositiveTokenAmount", () => {
  it("parses positive decimal amounts exactly", () => {
    assert.deepEqual(parsePositiveTokenAmount("1", 6), {
      units: BigInt(1_000_000),
      display: 1,
    });
    assert.deepEqual(parsePositiveTokenAmount("1.250000", 6), {
      units: BigInt(1_250_000),
      display: 1.25,
    });
    assert.deepEqual(parsePositiveTokenAmount("0.000001", 6), {
      units: BigInt(1),
      display: 0.000001,
    });
  });

  it("rejects values that would be rounded or fail parseUnits", () => {
    for (const value of [
      "1e3",
      "0.0000001",
      "1.0000001",
      " 1",
      "1 ",
      "+1",
      ".5",
      "1.",
    ]) {
      assert.equal(parsePositiveTokenAmount(value, 6), null, value);
    }
  });

  it("rejects empty and non-positive amounts", () => {
    for (const value of ["", "0", "0.000000"]) {
      assert.equal(parsePositiveTokenAmount(value, 6), null, value);
    }
  });
});
