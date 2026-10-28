import { describe, expect, it } from "vitest";
import { CulqiApiError } from "../../src/errors/culqi-api-error.js";
import { parseOrderResponse } from "../../src/orders/parse-order-response.js";

const VALID_ORDER = {
  id: "ord_test_123",
  object: "order",
  amount: 1000,
  currency_code: "PEN",
  description: "Test",
  order_number: "ORD-001",
  state: "pending",
  expiration_date: 9999999999,
  creation_date: 1000000,
};

describe("parseOrderResponse", () => {
  it("devuelve la orden si el body es válido", () => {
    const result = parseOrderResponse(VALID_ORDER, 200);
    expect(result.id).toBe("ord_test_123");
    expect(result.state).toBe("pending");
  });

  it("lanza CulqiApiError si el body es null", () => {
    expect(() => parseOrderResponse(null, 200)).toThrow(CulqiApiError);
  });

  it("lanza CulqiApiError si el body es un array", () => {
    expect(() => parseOrderResponse([], 200)).toThrow(CulqiApiError);
  });

  it("lanza CulqiApiError si el body es un string", () => {
    expect(() => parseOrderResponse("ok", 200)).toThrow(CulqiApiError);
  });

  it('lanza CulqiApiError si falta el campo "id"', () => {
    const { id: _id, ...sinId } = VALID_ORDER;
    expect(() => parseOrderResponse(sinId, 200)).toThrow(CulqiApiError);
  });

  it('lanza CulqiApiError si "id" es un string vacío', () => {
    expect(() => parseOrderResponse({ ...VALID_ORDER, id: "" }, 200)).toThrow(CulqiApiError);
  });

  it('lanza CulqiApiError si "object" no es "order"', () => {
    expect(() => parseOrderResponse({ ...VALID_ORDER, object: "charge" }, 200)).toThrow(CulqiApiError);
  });

  it('lanza CulqiApiError si falta el campo "state"', () => {
    const { state: _state, ...sinState } = VALID_ORDER;
    expect(() => parseOrderResponse(sinState, 200)).toThrow(CulqiApiError);
  });

  it("incluye el httpStatus en el CulqiApiError", () => {
    try {
      parseOrderResponse(null, 502);
    } catch (err) {
      expect(err).toBeInstanceOf(CulqiApiError);
      expect((err as CulqiApiError).status).toBe(502);
    }
  });

  it("permite campos adicionales desconocidos sin lanzar error", () => {
    const conCamposExtra = { ...VALID_ORDER, campo_nuevo: "valor", otro: 123 };
    expect(() => parseOrderResponse(conCamposExtra, 200)).not.toThrow();
  });
});
