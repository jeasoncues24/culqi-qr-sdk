import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors/validation-error.js";
import { CreateOrderRequest } from "../../src/orders/order-types.js";
import {
  WALLET_MAX_AMOUNT,
  WALLET_MIN_AMOUNT,
  validateOrderRequest,
} from "../../src/orders/validate-order-request.js";

const FUTURE_TIMESTAMP = Math.floor(Date.now() / 1000) + 3600; 

function validRequest(overrides: Partial<CreateOrderRequest> = {}): CreateOrderRequest {
  return {
    amount: 1000,
    currency_code: "PEN",
    description: "Test purchase",
    order_number: "ORDER-001",
    expiration_date: FUTURE_TIMESTAMP,
    client_details: {
      first_name: "Juan",
      last_name: "Perez",
      email: "juan@example.com",
      phone_number: "+51999999999",
    },
    ...overrides,
  };
}

describe("validateOrderRequest", () => {
  describe("amount", () => {
    it("accepts the minimum wallet amount", () => {
      expect(() => validateOrderRequest(validRequest({ amount: WALLET_MIN_AMOUNT }))).not.toThrow();
    });

    it("accepts the maximum wallet amount", () => {
      expect(() => validateOrderRequest(validRequest({ amount: WALLET_MAX_AMOUNT }))).not.toThrow();
    });

    it("rejects amount below minimum", () => {
      expect(() => validateOrderRequest(validRequest({ amount: WALLET_MIN_AMOUNT - 1 })))
        .toThrow(ValidationError);
    });

    it("rejects amount above maximum", () => {
      expect(() => validateOrderRequest(validRequest({ amount: WALLET_MAX_AMOUNT + 1 })))
        .toThrow(ValidationError);
    });

    it("rejects zero", () => {
      expect(() => validateOrderRequest(validRequest({ amount: 0 }))).toThrow(ValidationError);
    });

    it("rejects negative amount", () => {
      expect(() => validateOrderRequest(validRequest({ amount: -100 }))).toThrow(ValidationError);
    });

    it("rejects decimal amount", () => {
      expect(() => validateOrderRequest(validRequest({ amount: 10.5 }))).toThrow(ValidationError);
    });

    it("rejects NaN", () => {
      expect(() => validateOrderRequest(validRequest({ amount: NaN }))).toThrow(ValidationError);
    });

    it("rejects Infinity", () => {
      expect(() => validateOrderRequest(validRequest({ amount: Infinity }))).toThrow(ValidationError);
    });

    it("rejects -Infinity", () => {
      expect(() => validateOrderRequest(validRequest({ amount: -Infinity }))).toThrow(ValidationError);
    });

    it("rejects unsafe integer", () => {
      expect(() =>
        validateOrderRequest(validRequest({ amount: Number.MAX_SAFE_INTEGER + 1 }))
      ).toThrow(ValidationError);
    });

    it("sets field to 'amount' on error", () => {
      try {
        validateOrderRequest(validRequest({ amount: -1 }));
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).field).toBe("amount");
      }
    });
  });

  describe("currency_code", () => {
    it("accepts PEN", () => {
      expect(() => validateOrderRequest(validRequest())).not.toThrow();
    });

    it("rejects non-PEN currency", () => {
      // @ts-expect-error testing invalid input
      expect(() => validateOrderRequest(validRequest({ currency_code: "USD" }))).toThrow(ValidationError);
    });
  });

  describe("description", () => {
    it("accepts a normal description", () => {
      expect(() => validateOrderRequest(validRequest({ description: "Purchase of item X" }))).not.toThrow();
    });

    it("rejects empty string", () => {
      expect(() => validateOrderRequest(validRequest({ description: "" }))).toThrow(ValidationError);
    });

    it("rejects whitespace-only string", () => {
      expect(() => validateOrderRequest(validRequest({ description: "   " }))).toThrow(ValidationError);
    });

    it("rejects description over 250 chars", () => {
      expect(() =>
        validateOrderRequest(validRequest({ description: "a".repeat(251) }))
      ).toThrow(ValidationError);
    });

    it("accepts exactly 250 chars", () => {
      expect(() =>
        validateOrderRequest(validRequest({ description: "a".repeat(250) }))
      ).not.toThrow();
    });
  });

  describe("order_number", () => {
    it("rejects empty string", () => {
      expect(() => validateOrderRequest(validRequest({ order_number: "" }))).toThrow(ValidationError);
    });

    it("rejects order_number over 100 chars", () => {
      expect(() =>
        validateOrderRequest(validRequest({ order_number: "a".repeat(101) }))
      ).toThrow(ValidationError);
    });

    it("accepts exactly 100 chars", () => {
      expect(() =>
        validateOrderRequest(validRequest({ order_number: "a".repeat(100) }))
      ).not.toThrow();
    });
  });

  describe("expiration_date", () => {
    it("accepts a future timestamp", () => {
      expect(() => validateOrderRequest(validRequest({ expiration_date: FUTURE_TIMESTAMP }))).not.toThrow();
    });

    it("rejects a past timestamp", () => {
      const past = Math.floor(Date.now() / 1000) - 1;
      expect(() => validateOrderRequest(validRequest({ expiration_date: past }))).toThrow(ValidationError);
    });

    it("rejects current timestamp (now)", () => {
      const now = Math.floor(Date.now() / 1000);
      expect(() => validateOrderRequest(validRequest({ expiration_date: now }))).toThrow(ValidationError);
    });

    it("rejects NaN", () => {
      expect(() => validateOrderRequest(validRequest({ expiration_date: NaN }))).toThrow(ValidationError);
    });

    it("rejects decimal timestamp", () => {
      expect(() =>
        validateOrderRequest(validRequest({ expiration_date: FUTURE_TIMESTAMP + 0.5 }))
      ).toThrow(ValidationError);
    });
  });

  describe("client_details", () => {
    it("rejects empty first_name", () => {
      expect(() =>
        validateOrderRequest(validRequest({ client_details: { ...validRequest().client_details, first_name: "" } }))
      ).toThrow(ValidationError);
    });

    it("rejects empty last_name", () => {
      expect(() =>
        validateOrderRequest(validRequest({ client_details: { ...validRequest().client_details, last_name: "" } }))
      ).toThrow(ValidationError);
    });

    it("rejects invalid email", () => {
      expect(() =>
        validateOrderRequest(validRequest({ client_details: { ...validRequest().client_details, email: "not-an-email" } }))
      ).toThrow(ValidationError);
    });

    it("rejects email without domain", () => {
      expect(() =>
        validateOrderRequest(validRequest({ client_details: { ...validRequest().client_details, email: "user@" } }))
      ).toThrow(ValidationError);
    });

    it("accepts valid email", () => {
      expect(() =>
        validateOrderRequest(validRequest({ client_details: { ...validRequest().client_details, email: "user@example.com" } }))
      ).not.toThrow();
    });

    it("rejects empty phone_number", () => {
      expect(() =>
        validateOrderRequest(validRequest({ client_details: { ...validRequest().client_details, phone_number: "" } }))
      ).toThrow(ValidationError);
    });

    it("includes field path on client_details error", () => {
      try {
        validateOrderRequest(validRequest({ client_details: { ...validRequest().client_details, email: "bad" } }));
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).field).toBe("client_details.email");
      }
    });
  });

  describe("metadata", () => {
    it("accepts undefined metadata", () => {
      const req = validRequest();
      delete req.metadata;
      expect(() => validateOrderRequest(req)).not.toThrow();
    });

    it("accepts valid string-valued metadata", () => {
      expect(() =>
        validateOrderRequest(validRequest({ metadata: { key: "value" } }))
      ).not.toThrow();
    });

    it("rejects non-string metadata values", () => {
      expect(() =>
        // @ts-expect-error testing invalid input
        validateOrderRequest(validRequest({ metadata: { key: 123 } }))
      ).toThrow(ValidationError);
    });

    it("rejects more than 10 metadata keys", () => {
      const metadata: Record<string, string> = {};
      for (let i = 0; i < 11; i++) metadata[`key${i}`] = "value";
      expect(() => validateOrderRequest(validRequest({ metadata }))).toThrow(ValidationError);
    });

    it("accepts exactly 10 metadata keys", () => {
      const metadata: Record<string, string> = {};
      for (let i = 0; i < 10; i++) metadata[`key${i}`] = "value";
      expect(() => validateOrderRequest(validRequest({ metadata }))).not.toThrow();
    });

    it("rejects array as metadata", () => {
      // @ts-expect-error testing invalid input
      expect(() => validateOrderRequest(validRequest({ metadata: [] }))).toThrow(ValidationError);
    });
  });
});
