import { CulqiApiError } from "../errors/culqi-api-error.js";
import { CulqiNetworkError } from "../errors/culqi-network-error.js";
import { ValidationError } from "../errors/validation-error.js";
import { CreateOrderRequest, CulqiOrder } from "../orders/order-types.js";
import { parseOrderResponse } from "../orders/parse-order-response.js";
import { validateOrderRequest } from "../orders/validate-order-request.js";

export interface CulqiClientOptions {
  /**
   * Tu clave secreta de Culqi (comienza con "sk_test_" o "sk_live_").
   * Mantenla solo en el servidor. Nunca la expongas al navegador ni a clientes móviles.
   */
  secretKey: string;
  /**
   * Permite sobreescribir la URL base (útil para pruebas con un servidor mock).
   * Por defecto usa "https://api.culqi.com/v2".
   */
  baseUrl?: string;
  /**
   * Permite sobreescribir la implementación de fetch (útil para pruebas unitarias).
   * Por defecto usa el `fetch` global.
   */
  fetcher?: typeof fetch;
}

export class CulqiClient {
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: CulqiClientOptions) {
    if (typeof options.secretKey !== "string" || options.secretKey.trim().length === 0) {
      throw new Error("La clave secreta de Culqi es obligatoria y debe ser un string no vacío");
    }

    this.secretKey = options.secretKey;
    this.baseUrl = (options.baseUrl ?? "https://api.culqi.com/v2").replace(/\/+$/, "");
    this.fetcher = options.fetcher ?? fetch;
  }

  /**
   * Consulta una orden existente por su ID.
   *
   * Úsalo para verificar el estado real de una orden después de recibir un webhook,
   * antes de marcar una compra como pagada en tu sistema.
   *
   * @throws {CulqiApiError} si Culqi devuelve 404 (orden no existe) u otro error HTTP.
   * @throws {CulqiNetworkError} si la solicitud no puede llegar a Culqi.
   */
  async getOrder(orderId: string): Promise<CulqiOrder> {
    if (typeof orderId !== "string" || orderId.trim().length === 0) {
      throw new ValidationError("orderId debe ser un string no vacío", "orderId");
    }

    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/orders/${encodeURIComponent(orderId)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
        },
      });
    } catch (err) {
      throw new CulqiNetworkError(
        "No se pudo conectar con la API de Culqi. Verifica tu conexión a internet.",
        err
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new CulqiApiError(
        `Culqi devolvió una respuesta que no es JSON válido (HTTP ${response.status})`,
        response.status
      );
    }

    if (!response.ok) {
      throw new CulqiApiError(
        `No se pudo obtener la orden "${orderId}" (HTTP ${response.status})`,
        response.status,
        body
      );
    }

    return parseOrderResponse(body, response.status);
  }

  /**
   * Crea una orden de pago en Culqi.
   *
   * Valida la solicitud localmente antes de enviarla a la API.
   *
   * @throws {ValidationError} si la solicitud no pasa la validación local.
   * @throws {CulqiApiError} si Culqi devuelve una respuesta HTTP de error.
   * @throws {CulqiNetworkError} si la solicitud no puede llegar a Culqi (DNS, timeout, etc.).
   *
   * IMPORTANTE: Una orden creada exitosamente NO significa que se recibió un pago.
   * Una orden representa una intención de pago. La confirmación real del pago llega
   * de forma asíncrona a través del evento webhook `order.status.changed`.
   */
  async createOrder(payload: CreateOrderRequest): Promise<CulqiOrder> {
    validateOrderRequest(payload);

    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new CulqiNetworkError(
        "No se pudo conectar con la API de Culqi. Verifica tu conexión a internet.",
        err
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new CulqiApiError(
        `Culqi devolvió una respuesta que no es JSON válido (HTTP ${response.status})`,
        response.status
      );
    }

    if (!response.ok) {
      throw new CulqiApiError(
        `Culqi rechazó la orden (HTTP ${response.status})`,
        response.status,
        body
      );
    }

    return parseOrderResponse(body, response.status);
  }
}

// Re-exportamos para consumidores que importen solo desde el módulo cliente.
export { ValidationError, CulqiApiError, CulqiNetworkError };
