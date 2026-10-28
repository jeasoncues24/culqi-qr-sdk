import { ValidationError } from "../errors/validation-error.js";
import { CulqiWebhookEvent, ORDER_STATUS_CHANGED } from "./webhook-types.js";

/**
 * Opciones para `parseWebhookEvent`.
 *
 * Actualmente no hay opciones obligatorias porque Culqi no documenta un mecanismo
 * de firma criptográfica para webhooks. Esta interfaz está diseñada para recibir
 * `signingSecret` en cuanto Culqi lo publique, sin cambiar la firma actual.
 *
 * @example
 * // Hoy (sin firma):
 * parseWebhookEvent(rawBody)
 *
 * // Cuando Culqi publique firma (futuro):
 * parseWebhookEvent(rawBody, { signingSecret: process.env.CULQI_WEBHOOK_SECRET, signature: req.headers["x-culqi-signature"] })
 */
export interface ParseWebhookEventOptions {
  /**
   * Clave secreta de firma de webhooks.
   * RESERVADO — Culqi no documenta este mecanismo públicamente aún.
   * Cuando lo publique, pasar aquí el secreto y la firma permitirá verificación
   * criptográfica dentro de `parseWebhookEvent`.
   *
   * @internal
   */
  signingSecret?: never;
}

/**
 * Parsea y valida mínimamente el cuerpo de una solicitud webhook de Culqi.
 *
 * Esta función NO verifica una firma criptográfica porque la documentación pública
 * de Culqi no describe un mecanismo de firma de webhooks al momento de escribir esto.
 * Si Culqi añade verificación de firma en el futuro, esta función aceptará las opciones
 * correspondientes a través de `ParseWebhookEventOptions` sin romper la API actual.
 *
 * **Guía de seguridad hasta que Culqi publique verificación de firma:**
 * - Siempre consulta la orden en la API de Culqi (`getOrder(id)`) para confirmar
 *   su estado actual antes de dar por completada una compra.
 * - Nunca confíes solo en el payload del webhook para confirmar un pago.
 * - Diseña tu handler para ser idempotente: Culqi puede reintentar eventos si falla la entrega.
 * - Restringe el acceso a tu endpoint de webhook por IP si Culqi publica sus rangos IP de salida.
 * - Responde 200 antes de cualquier procesamiento asíncrono para evitar reintentos por timeout.
 *
 * @param rawBody - El cuerpo de la solicitud como string (antes de parsear el JSON).
 * @param _options - Reservado para verificación de firma futura. Ignorado actualmente.
 * @throws {ValidationError} si el cuerpo no es JSON válido o le faltan campos obligatorios.
 */
export function parseWebhookEvent(
  rawBody: string,
  _options?: ParseWebhookEventOptions
): CulqiWebhookEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new ValidationError("El cuerpo del webhook no es JSON válido", "body");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ValidationError("El cuerpo del webhook debe ser un objeto JSON", "body");
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj["type"] !== "string" || obj["type"].trim().length === 0) {
    throw new ValidationError('El evento webhook no tiene el campo obligatorio "type"', "type");
  }

  if (typeof obj["data"] !== "object" || obj["data"] === null) {
    throw new ValidationError('El evento webhook no tiene el campo obligatorio "data"', "data");
  }

  const data = obj["data"] as Record<string, unknown>;
  if (typeof data["id"] !== "string") {
    throw new ValidationError('El campo "data" del webhook no tiene el campo obligatorio "id"', "data.id");
  }

  // Tipos de evento desconocidos se devuelven tal cual para compatibilidad futura,
  // de modo que los integradores puedan manejarlos sin necesidad de actualizar el paquete.
  return {
    type: obj["type"] as CulqiWebhookEvent["type"],
    data: obj["data"] as CulqiWebhookEvent["data"],
  };
}

/**
 * Devuelve true si el evento representa una orden pagada exitosamente.
 *
 * Úsalo como guardia rápida en tu handler de webhooks, pero SIEMPRE verifica
 * el estado de la orden consultando la API de Culqi antes de entregar la compra.
 */
export function isOrderPaid(event: CulqiWebhookEvent): boolean {
  return (
    event.type === ORDER_STATUS_CHANGED &&
    event.data.state === "paid"
  );
}
