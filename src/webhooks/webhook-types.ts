import { CulqiOrder } from "../orders/order-types.js";

/**
 * Único tipo de evento de webhook documentado por Culqi para pagos de órdenes.
 * Se dispara cuando el estado de una orden cambia (ej: de "pending" a "paid" o "expired").
 */
export const ORDER_STATUS_CHANGED = "order.status.changed" as const;
export type OrderStatusChangedEvent = typeof ORDER_STATUS_CHANGED;

export type CulqiWebhookEventType = OrderStatusChangedEvent;

/**
 * Payload recibido en el cuerpo de una solicitud webhook de Culqi.
 *
 * NOTA: La forma exacta del payload de webhook no está completamente documentada
 * en la documentación pública de Culqi al momento de escribir esto. El campo `data`
 * está modelado basándose en la estructura del objeto orden — verifica con eventos
 * reales en tu panel de Culqi antes de depender de campos específicos.
 */
export interface CulqiWebhookEvent {
  /** Identificador del tipo de evento. */
  type: CulqiWebhookEventType;
  /** El objeto orden en el momento del evento. */
  data: CulqiOrder;
}

/**
 * Un evento webhook parseado y tipado luego de la verificación.
 * Usa este tipo en tu handler de webhooks después de llamar a `parseWebhookEvent`.
 */
export type ParsedWebhookEvent = CulqiWebhookEvent;
