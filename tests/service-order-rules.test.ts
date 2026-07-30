import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { ServiceOrderStatus } from "../src/generated/prisma/client.ts";
import {
  assertNonNegativeMoney,
  assertServiceOrderTransition,
  parseServiceOrderItems,
  parseServiceOrderServices,
} from "../src/lib/service-orders/rules.ts";

describe("service order rules", () => {
  test("permits only valid operational status transitions", () => {
    assert.doesNotThrow(() =>
      assertServiceOrderTransition(
        ServiceOrderStatus.OPEN,
        ServiceOrderStatus.IN_PROGRESS,
      ),
    );
    assert.doesNotThrow(() =>
      assertServiceOrderTransition(
        ServiceOrderStatus.WAITING,
        ServiceOrderStatus.IN_PROGRESS,
      ),
    );
    assert.throws(
      () =>
        assertServiceOrderTransition(
          ServiceOrderStatus.CANCELLED,
          ServiceOrderStatus.FINISHED,
        ),
      /não permitida/,
    );
    assert.throws(
      () =>
        assertServiceOrderTransition(
          ServiceOrderStatus.FINISHED,
          ServiceOrderStatus.CANCELLED,
        ),
      /não permitida/,
    );
  });

  test("normalizes services and rejects malformed or excessive input", () => {
    assert.deepEqual(
      parseServiceOrderServices(
        JSON.stringify([" Alinhamento ", "Alinhamento", "Balanceamento"]),
      ),
      ["Alinhamento", "Balanceamento"],
    );
    assert.throws(() => parseServiceOrderServices("{"), /inválida/);
    assert.throws(() => parseServiceOrderServices("[]"), /inválida/);
    assert.throws(
      () => parseServiceOrderServices(JSON.stringify(["x".repeat(301)])),
      /inválida/,
    );
  });

  test("merges duplicate products and rejects unsafe quantities", () => {
    assert.deepEqual(
      parseServiceOrderItems(
        JSON.stringify([
          { productId: "product-a", quantity: 1 },
          { productId: "product-a", quantity: 2 },
          { productId: "product-b", quantity: 1 },
        ]),
      ),
      [
        { productId: "product-a", quantity: 3 },
        { productId: "product-b", quantity: 1 },
      ],
    );
    assert.throws(
      () =>
        parseServiceOrderItems(
          JSON.stringify([{ productId: "product-a", quantity: 0 }]),
        ),
      /inválida/,
    );
    assert.throws(() => parseServiceOrderItems("{"), /inválida/);
  });

  test("accepts valid money and rejects negative or non-finite values", () => {
    assert.equal(assertNonNegativeMoney(10.129), 10.13);
    assert.throws(() => assertNonNegativeMoney(-0.01), /inválido/);
    assert.throws(() => assertNonNegativeMoney(Number.NaN), /inválido/);
  });
});
