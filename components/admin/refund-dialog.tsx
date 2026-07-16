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

"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { type Order } from "@/lib/orders";
import { formatPrice } from "@/lib/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function RefundDialog({
  order,
  onRefund,
  disabled,
  pending,
}: {
  order: Order;
  onRefund: (amount: number) => void;
  disabled: boolean;
  pending: boolean;
}) {
  const maxRefund =
    (order.capturedAmount ?? order.total) - (order.refundedAmount ?? 0);
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(maxRefund.toFixed(2));
  const parsed = parseFloat(value);
  const valid =
    !Number.isNaN(parsed) && parsed > 0 && parsed <= maxRefund + 0.001;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          {pending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Submitting via operator...
            </>
          ) : (
            "Partial refund"
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Partial refund - {order.id}</DialogTitle>
          <DialogDescription>
            Enter the amount to refund to the shopper. Max refundable:{" "}
            <span className="font-medium">
              {formatPrice(maxRefund, order.currency)}
            </span>
            .
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="refund-amount">Amount ({order.currency})</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {order.currency === "USDC" ? "$" : "€"}
            </span>
            <Input
              id="refund-amount"
              className="pl-7"
              type="number"
              step="0.01"
              min="0.01"
              max={maxRefund.toFixed(2)}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          {!valid && value !== "" && (
            <p className="text-xs text-destructive">
              Enter an amount between 0.01 and{" "}
              {formatPrice(maxRefund, order.currency)}.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              setOpen(false);
              onRefund(parsed);
            }}
          >
            Refund {valid ? formatPrice(parsed, order.currency) : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
