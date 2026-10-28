import { describe, expect, it, vi } from "vitest";
import { CulqiClient } from "../../src/client/culqi-client.js";
import { CulqiApiError } from "../../src/errors/culqi-api-error.js";
import { CulqiNetworkError } from "../../src/errors/culqi-network-error.js";
import { ValidationError } from "../../src/errors/validation-error.js";
import { CreateOrderRequest } from "../../src/orders/order-types.js";

const FUTURE_TIMESTAMP = Math.floor(Date.now() / 1000) + 3600;

function validPayload(): CreateOrderRequest {
  return {
    amount: 1000,
    currency_code: "PEN",
    description: "Test",
    order_number: "ORD-001",
    expiration_date: FUTURE_TIMESTAMP,
    client_details: {
      first_name: "Juan",
      last_name: "Perez",
      email: "juan@example.com",
      phone_number: "+51999999999",
    },
  };
}

function mockFetch(status: number, body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

function mockFetchJson(body: unknown): typeof fetch {
  return mockFetch(200, body);
}

describe("CulqiClient constructor", () => {
  it("throws if secretKey is empty", () => {
    expect(() => new CulqiClient({ secretKey: "" })).toThrow();
  });

  it("throws if secretKey is whitespace only", () => {
    expect(() => new CulqiClient({ secretKey: "   " })).toThrow();
  });

  it("constructs successfully with a valid key", () => {
    expect(() => new CulqiClient({ secretKey: "sk_test_abc" })).not.toThrow();
  });
});

describe("CulqiClient.createOrder", () => {
  describe("request construction", () => {
    it("sends POST to /orders with Authorization header", async () => {
      const fetcher = mockFetchJson({
        id: "ord_test_1",
        object: "order",
        amount: 1000,
        currency_code: "PEN",
        description: "Test",
        order_number: "ORD-001",
        state: "pending",
        expiration_date: FUTURE_TIMESTAMP,
        creation_date: Math.floor(Date.now() / 1000),
      });
      const client = new CulqiClient({ secretKey: "sk_test_abc", fetcher });

      await client.createOrder(validPayload());

      expect(fetcher).toHaveBeenCalledOnce();
      const [url, init] = (fetcher as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/orders$/);
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer sk_test_abc");
      expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    });

    it("serializes the payload as JSON", async () => {
      const payload = validPayload();
      const fetcher = mockFetchJson({
        id: "ord_test_2", object: "order", amount: 1000, currency_code: "PEN",
        description: "Test", order_number: "ORD-001", state: "pending",
        expiration_date: FUTURE_TIMESTAMP, creation_date: 0,
      });
      const client = new CulqiClient({ secretKey: "sk_test_abc", fetcher });

      await client.createOrder(payload);

      const [, init] = (fetcher as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toMatchObject({ amount: 1000, currency_code: "PEN" });
    });

    it("uses custom baseUrl when provided", async () => {
      const fetcher = mockFetchJson({
        id: "ord_test_3", object: "order", amount: 1000, currency_code: "PEN",
        description: "Test", order_number: "ORD-001", state: "pending",
        expiration_date: FUTURE_TIMESTAMP, creation_date: 0,
      });
      const client = new CulqiClient({
        secretKey: "sk_test_abc",
        baseUrl: "https://mock.example.com/v2",
        fetcher,
      });

      await client.createOrder(validPayload());

      const [url] = (fetcher as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
      expect(url).toBe("https://mock.example.com/v2/orders");
    });

    it("strips trailing slashes from baseUrl", async () => {
      const fetcher = mockFetchJson({
        id: "ord_test_4", object: "order", amount: 1000, currency_code: "PEN",
        description: "Test", order_number: "ORD-001", state: "pending",
        expiration_date: FUTURE_TIMESTAMP, creation_date: 0,
      });
      const client = new CulqiClient({
        secretKey: "sk_test_abc",
        baseUrl: "https://mock.example.com/v2///",
        fetcher,
      });

      await client.createOrder(validPayload());

      const [url] = (fetcher as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
      expect(url).toBe("https://mock.example.com/v2/orders");
    });
  });

  describe("validation", () => {
    it("throws ValidationError for invalid payload before making HTTP call", async () => {
      const fetcher = vi.fn() as unknown as typeof fetch;
      const client = new CulqiClient({ secretKey: "sk_test_abc", fetcher });

      await expect(
        client.createOrder({ ...validPayload(), amount: -1 })
      ).rejects.toThrow(ValidationError);

      expect(fetcher).not.toHaveBeenCalled();
    });
  });

  describe("successful response", () => {
    it("returns the parsed order on success", async () => {
      const order = {
        id: "ord_test_ok",
        object: "order" as const,
        amount: 1000,
        currency_code: "PEN",
        description: "Test",
        order_number: "ORD-001",
        state: "pending",
        payment_code: "QR-ABC",
        expiration_date: FUTURE_TIMESTAMP,
        creation_date: Math.floor(Date.now() / 1000),
      };
      const client = new CulqiClient({ secretKey: "sk_test_abc", fetcher: mockFetchJson(order) });

      const result = await client.createOrder(validPayload());

      expect(result).toEqual(order);
    });
  });

  describe("error handling", () => {
    it("throws CulqiApiError on 400 response", async () => {
      const client = new CulqiClient({
        secretKey: "sk_test_abc",
        fetcher: mockFetch(400, { object: "error", message: "Invalid amount" }),
      });

      await expect(client.createOrder(validPayload())).rejects.toThrow(CulqiApiError);
    });

    it("throws CulqiApiError on 401 response", async () => {
      const client = new CulqiClient({
        secretKey: "sk_test_abc",
        fetcher: mockFetch(401, { object: "error", message: "Unauthorized" }),
      });

      const err = await client.createOrder(validPayload()).catch((e) => e);
      expect(err).toBeInstanceOf(CulqiApiError);
      expect((err as CulqiApiError).status).toBe(401);
    });

    it("throws CulqiApiError on 500 response", async () => {
      const client = new CulqiClient({
        secretKey: "sk_test_abc",
        fetcher: mockFetch(500, { object: "error", message: "Internal server error" }),
      });

      await expect(client.createOrder(validPayload())).rejects.toThrow(CulqiApiError);
    });

    it("throws CulqiNetworkError when fetch throws (network failure)", async () => {
      const fetcher = vi.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch;
      const client = new CulqiClient({ secretKey: "sk_test_abc", fetcher });

      await expect(client.createOrder(validPayload())).rejects.toThrow(CulqiNetworkError);
    });

    it("throws CulqiApiError when response body is not JSON", async () => {
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("Unexpected token")),
      }) as unknown as typeof fetch;
      const client = new CulqiClient({ secretKey: "sk_test_abc", fetcher });

      await expect(client.createOrder(validPayload())).rejects.toThrow(CulqiApiError);
    });

    it("does not include the secret key in CulqiApiError message or details", async () => {
      const SECRET = "sk_test_super_secret_key";
      const client = new CulqiClient({
        secretKey: SECRET,
        fetcher: mockFetch(400, { message: "bad request" }),
      });

      const err = await client.createOrder(validPayload()).catch((e) => e);
      expect(err).toBeInstanceOf(CulqiApiError);
      expect(err.message).not.toContain(SECRET);
      expect(JSON.stringify(err.details ?? "")).not.toContain(SECRET);
    });
  });
});

describe("CulqiClient.getOrder", () => {
  const PAID_ORDER = {
    id: "ord_test_paid",
    object: "order" as const,
    amount: 1000,
    currency_code: "PEN",
    description: "Test",
    order_number: "ORD-001",
    state: "paid",
    expiration_date: FUTURE_TIMESTAMP,
    creation_date: Math.floor(Date.now() / 1000),
    paid_at: Math.floor(Date.now() / 1000),
  };

  it("hace GET a /orders/{id} con cabecera Authorization", async () => {
    const fetcher = mockFetchJson(PAID_ORDER);
    const client = new CulqiClient({ secretKey: "sk_test_abc", fetcher });

    await client.getOrder("ord_test_paid");

    const [url, init] = (fetcher as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/orders/ord_test_paid");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer sk_test_abc");
  });

  it("codifica caracteres especiales en el ID de la orden", async () => {
    const fetcher = mockFetchJson(PAID_ORDER);
    const client = new CulqiClient({ secretKey: "sk_test_abc", fetcher });

    await client.getOrder("ord test/123");

    const [url] = (fetcher as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain("ord%20test%2F123");
  });

  it("devuelve la orden parseada en caso de éxito", async () => {
    const client = new CulqiClient({ secretKey: "sk_test_abc", fetcher: mockFetchJson(PAID_ORDER) });

    const result = await client.getOrder("ord_test_paid");

    expect(result).toEqual(PAID_ORDER);
    expect(result.state).toBe("paid");
  });

  it("lanza ValidationError si el orderId está vacío", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const client = new CulqiClient({ secretKey: "sk_test_abc", fetcher });

    await expect(client.getOrder("")).rejects.toThrow(ValidationError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("lanza CulqiApiError con status 404 si la orden no existe", async () => {
    const client = new CulqiClient({
      secretKey: "sk_test_abc",
      fetcher: mockFetch(404, { object: "error", message: "Order not found" }),
    });

    const err = await client.getOrder("ord_inexistente").catch((e) => e);
    expect(err).toBeInstanceOf(CulqiApiError);
    expect((err as CulqiApiError).status).toBe(404);
  });

  it("lanza CulqiNetworkError si fetch falla", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch;
    const client = new CulqiClient({ secretKey: "sk_test_abc", fetcher });

    await expect(client.getOrder("ord_test_paid")).rejects.toThrow(CulqiNetworkError);
  });

  it("lanza CulqiApiError si la respuesta no es JSON válido", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    }) as unknown as typeof fetch;
    const client = new CulqiClient({ secretKey: "sk_test_abc", fetcher });

    await expect(client.getOrder("ord_test_paid")).rejects.toThrow(CulqiApiError);
  });
});
