export interface CulqiClientDetails {
  first_name: string;
  last_name: string;
  /** Debe ser una dirección de email válida. */
  email: string;
  /** Formato E.164 recomendado, ej: "+51999999999". */
  phone_number: string;
}

export interface CreateOrderRequest {
  /**
   * Monto en la unidad mínima de la moneda (centavos para PEN).
   * Para pagos con billetera Yape/Plin: mínimo 600 (S/ 6.00), máximo 50 000 (S/ 500.00).
   * Debe ser un entero positivo.
   */
  amount: number;
  /** Solo se admite "PEN". */
  currency_code: "PEN";
  /** Descripción breve de la compra. Máximo 250 caracteres. */
  description: string;
  /**
   * Identificador único de la orden en tu sistema. Máximo 100 caracteres.
   * Se usa para conciliación — Culqi rechazará números de orden duplicados.
   */
  order_number: string;
  client_details: CulqiClientDetails;
  /**
   * Timestamp Unix (segundos) en que vence la orden.
   * Debe ser una fecha futura.
   */
  expiration_date: number;
  /**
   * Cuando es true, la orden queda disponible para pago de inmediato.
   * Cuando es false u omitido, la orden se crea en estado no pagable.
   *
   * IMPORTANTE: Confirmar una orden NO significa que se recibió un pago.
   * Espera el evento webhook `order.status.changed` con state "paid"
   * antes de dar por completada cualquier compra.
   */
  confirm?: boolean;
  /**
   * Metadata arbitraria clave-valor para conciliación.
   * Los valores deben ser strings. Máximo 10 claves.
   */
  metadata?: Record<string, string>;
}

/** Estados válidos que puede tener una orden, según la API de Culqi. */
export type OrderState =
  | "pending"
  | "paid"
  | "expired"
  | "deleted"
  | (string & Record<never, never>); // Permite compatibilidad futura con nuevos estados.

export interface CulqiOrder {
  id: string;
  object: "order";
  amount: number;
  currency_code: string;
  description: string;
  order_number: string;
  state: OrderState;
  /** Código QR generado por Culqi para pagos con billetera. */
  payment_code?: string;
  expiration_date: number;
  /** Timestamp Unix de creación de la orden. */
  creation_date: number;
  /** Monto después de descontar comisiones (puede estar ausente hasta que se capture el pago). */
  net_amount?: number;
  /** Comisión total cobrada por Culqi. */
  total_fee?: number;
  /** Timestamp Unix en que se pagó la orden (solo presente en estado "paid"). */
  paid_at?: number;
  metadata?: Record<string, string>;
}
