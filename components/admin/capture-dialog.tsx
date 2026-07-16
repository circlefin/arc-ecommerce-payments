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

export function CaptureDialog({
  order,
  onCapture,
  disabled,
  pending,
}: {
  order: Order;
  onCapture: (amount: number) => void;
  disabled: boolean;
  pending: boolean;
}) {
  const remaining = (order.total ?? 0) - (order.capturedAmount ?? 0);
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(remaining.toFixed(2));
  const parsed = parseFloat(value);
  const valid =
    !Number.isNaN(parsed) && parsed > 0 && parsed <= remaining + 0.001;

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
            "Partial capture"
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Partial capture - {order.id}</DialogTitle>
          <DialogDescription>
            Enter an amount to capture now. Remaining authorized:{" "}
            <span className="font-medium">
              {formatPrice(remaining, order.currency)}
            </span>
            . You can capture again later up to the remaining balance.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="capture-amount">Amount ({order.currency})</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {order.currency === "USDC" ? "$" : "€"}
            </span>
            <Input
              id="capture-amount"
              className="pl-7"
              type="number"
              step="0.01"
              min="0.01"
              max={remaining.toFixed(2)}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          {!valid && value !== "" && (
            <p className="text-xs text-destructive">
              Enter an amount between 0.01 and{" "}
              {formatPrice(remaining, order.currency)}.
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
              onCapture(parsed);
            }}
          >
            Capture {valid ? formatPrice(parsed, order.currency) : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
