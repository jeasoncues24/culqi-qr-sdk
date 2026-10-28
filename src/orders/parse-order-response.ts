import { CulqiApiError } from "../errors/culqi-api-error.js";
import { CulqiOrder } from "./order-types.js";

/**
 * Verifica que el cuerpo de la respuesta de Culqi tiene la forma mínima esperada
 * de un objeto orden y lo devuelve tipado como CulqiOrder.
 *
 * No valida todos los campos — solo los que son imprescindibles para que
 * el resto del SDK funcione correctamente (id, object, state).
 * Si Culqi añade campos nuevos en el futuro, simplemente estarán disponibles
 * en el objeto devuelto sin romper nada.
 *
 * @throws {CulqiApiError} si la respuesta no tiene la forma esperada de una orden.
 */
export function parseOrderResponse(body: unknown, httpStatus: number): CulqiOrder {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new CulqiApiError(
      "La respuesta de Culqi no tiene el formato esperado (se esperaba un objeto)",
      httpStatus,
      body
    );
  }

  const obj = body as Record<string, unknown>;

  if (typeof obj["id"] !== "string" || obj["id"].trim().length === 0) {
    throw new CulqiApiError(
      'La respuesta de Culqi no contiene el campo "id" esperado',
      httpStatus,
      body
    );
  }

  if (obj["object"] !== "order") {
    throw new CulqiApiError(
      `La respuesta de Culqi tiene object="${obj["object"]}" en lugar de "order"`,
      httpStatus,
      body
    );
  }

  if (typeof obj["state"] !== "string") {
    throw new CulqiApiError(
      'La respuesta de Culqi no contiene el campo "state" esperado',
      httpStatus,
      body
    );
  }

  return body as CulqiOrder;
}
