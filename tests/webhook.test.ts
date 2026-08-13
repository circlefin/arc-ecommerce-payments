import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";

import { handleWebhook } from "../app/api/webhooks/payments/route";

const SECRET = "test-webhook-secret";

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(body).digest("hex");
}

function request(body: string, signature?: string): NextRequest {
  const headers = new Headers();

  if (signature !== undefined) {
    headers.set("x-scp-signature", signature);
  }

  return new NextRequest("http://localhost/api/webhooks/payments", {
    method: "POST",
    headers,
    body,
  });
}

function responseStatus(response: Response): number {
  return response.status;
}

test("missing signature returns 401 and does not process the event", async () => {
  process.env.WEBHOOK_SECRET = SECRET;

  let supabaseTouched = false;

  const supabase = {
    from() {
      supabaseTouched = true;
      throw new Error("Supabase must not be touched");
    },
  } as never;

  const body = JSON.stringify({
    contractAddress: "0x123",
    eventName: "Authorized",
    data: {
      salt: "123",
    },
  });

  const response = await handleWebhook(request(body), supabase);

  assert.equal(responseStatus(response), 401);
  assert.equal(supabaseTouched, false);
});

test("empty signature returns 401 and does not process the event", async () => {
  process.env.WEBHOOK_SECRET = SECRET;

  let supabaseTouched = false;

  const supabase = {
    from() {
      supabaseTouched = true;
      throw new Error("Supabase must not be touched");
    },
  } as never;

  const body = JSON.stringify({
    contractAddress: "0x123",
    eventName: "Authorized",
    data: {
      salt: "123",
    },
  });

  const response = await handleWebhook(request(body, ""), supabase);

  assert.equal(responseStatus(response), 401);
  assert.equal(supabaseTouched, false);
});

test("invalid signature returns 401 and does not process the event", async () => {
  process.env.WEBHOOK_SECRET = SECRET;

  let supabaseTouched = false;

  const supabase = {
    from() {
      supabaseTouched = true;
      throw new Error("Supabase must not be touched");
    },
  } as never;

  const body = JSON.stringify({
    contractAddress: "0x123",
    eventName: "Authorized",
    data: {
      salt: "123",
    },
  });

  const response = await handleWebhook(
    request(body, sign(`${body}-tampered`)),
    supabase,
  );

  assert.equal(responseStatus(response), 401);
  assert.equal(supabaseTouched, false);
});

test("signature is verified against the raw request body", async () => {
  process.env.WEBHOOK_SECRET = SECRET;

  const body = JSON.stringify(
    {
      contractAddress: "0x123",
      eventName: "Authorized",
      data: {
        salt: "123",
      },
    },
    null,
    2,
  );

  const validSignature = sign(body);

  let fromCalls = 0;

  const supabase = {
    from() {
      fromCalls += 1;

      return {
        select() {
          return {
            filter() {
              return {
                single: async () => ({
                  data: null,
                  error: new Error("stop after signature verification"),
                }),
              };
            },
          };
        },
      };
    },
  } as never;

  const response = await handleWebhook(
    request(body, validSignature),
    supabase,
  );

  assert.equal(response.status, 404);
  assert.equal(fromCalls, 1);
});

test("duplicate event is ignored before the order is patched", async () => {
  process.env.WEBHOOK_SECRET = SECRET;

  const body = JSON.stringify({
    contractAddress: "0x123",
    eventName: "Captured",
    data: {
      salt: "123",
      amount: "1000000",
      transactionHash: "0xduplicate",
      blockNumber: 123,
    },
  });

  let orderUpdates = 0;
  let lifecycleInserts = 0;

  const supabase = {
    from(table: string) {
      if (table === "orders") {
        return {
          select() {
            return {
              filter() {
                return {
                  single: async () => ({
                    data: {
                      id: "order-1",
                      status: "Reserved",
                      total: 1,
                      currency: "USDC",
                      captured_amount: 0,
                      refunded_amount: 0,
                    },
                    error: null,
                  }),
                };
              },
            };
          },

          update() {
            orderUpdates += 1;

            return {
              eq: async () => ({
                error: null,
              }),
            };
          },
        };
      }
      if (table === "lifecycle_events") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      maybeSingle: async () => ({
                        data: {
                          id: "existing-event",
                        },
                        error: null,
                      }),
                    };
                  },
                };
              },
            };
          },

          insert: async () => {
            lifecycleInserts += 1;
            return { error: null };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  } as never;

  const response = await handleWebhook(
    request(body, sign(body)),
    supabase,
  );

  assert.equal(response.status, 200);
  assert.equal(orderUpdates, 0);
  assert.equal(lifecycleInserts, 0);
});