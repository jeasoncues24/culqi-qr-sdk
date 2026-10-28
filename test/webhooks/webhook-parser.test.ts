import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors/validation-error.js";
import { isOrderPaid, parseWebhookEvent } from "../../src/webhooks/webhook-parser.js";
import { ORDER_STATUS_CHANGED } from "../../src/webhooks/webhook-types.js";

const FUTURE_TIMESTAMP = Math.floor(Date.now() / 1000) + 3600;

function validOrderPayload(stateOverride = "paid") {
  return {
    id: "ord_test_123",
    object: "order",
    amount: 1000,
    currency_code: "PEN",
    description: "Test",
    order_number: "ORD-001",
    state: stateOverride,
    expiration_date: FUTURE_TIMESTAMP,
    creation_date: Math.floor(Date.now() / 1000),
  };
}

function validEventBody(type = ORDER_STATUS_CHANGED, state = "paid") {
  return JSON.stringify({
    type,
    data: validOrderPayload(state),
  });
}

describe("parseWebhookEvent", () => {
  it("parses a valid paid event", () => {
    const event = parseWebhookEvent(validEventBody());
    expect(event.type).toBe(ORDER_STATUS_CHANGED);
    expect(event.data.id).toBe("ord_test_123");
    expect(event.data.state).toBe("paid");
  });

  it("parses a pending event", () => {
    const event = parseWebhookEvent(validEventBody(ORDER_STATUS_CHANGED, "pending"));
    expect(event.data.state).toBe("pending");
  });

  it("throws ValidationError for invalid JSON", () => {
    expect(() => parseWebhookEvent("{not valid json}")).toThrow(ValidationError);
  });

  it("throws ValidationError for JSON array", () => {
    expect(() => parseWebhookEvent("[]")).toThrow(ValidationError);
  });

  it("throws ValidationError for JSON null", () => {
    expect(() => parseWebhookEvent("null")).toThrow(ValidationError);
  });

  it("throws ValidationError if type field is missing", () => {
    const body = JSON.stringify({ data: validOrderPayload() });
    expect(() => parseWebhookEvent(body)).toThrow(ValidationError);
  });

  it("throws ValidationError if data field is missing", () => {
    const body = JSON.stringify({ type: ORDER_STATUS_CHANGED });
    expect(() => parseWebhookEvent(body)).toThrow(ValidationError);
  });

  it("throws ValidationError if data.id is missing", () => {
    const body = JSON.stringify({
      type: ORDER_STATUS_CHANGED,
      data: { state: "paid" },
    });
    expect(() => parseWebhookEvent(body)).toThrow(ValidationError);
  });

  it("accepts unknown event types for forward-compatibility", () => {
    const body = JSON.stringify({
      type: "order.new.event.future",
      data: { id: "ord_test_xyz", state: "unknown" },
    });
    expect(() => parseWebhookEvent(body)).not.toThrow();
  });
});

describe("isOrderPaid", () => {
  it("returns true for order.status.changed with state paid", () => {
    const event = parseWebhookEvent(validEventBody(ORDER_STATUS_CHANGED, "paid"));
    expect(isOrderPaid(event)).toBe(true);
  });

  it("returns false for order.status.changed with state pending", () => {
    const event = parseWebhookEvent(validEventBody(ORDER_STATUS_CHANGED, "pending"));
    expect(isOrderPaid(event)).toBe(false);
  });

  it("returns false for order.status.changed with state expired", () => {
    const event = parseWebhookEvent(validEventBody(ORDER_STATUS_CHANGED, "expired"));
    expect(isOrderPaid(event)).toBe(false);
  });

  it("returns false for unknown event type even if data.state is paid", () => {
    const event = parseWebhookEvent(
      JSON.stringify({ type: "order.some.other.event", data: { id: "ord_1", state: "paid" } })
    );
    expect(isOrderPaid(event)).toBe(false);
  });
});
