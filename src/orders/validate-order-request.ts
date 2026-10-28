import { ValidationError } from "../errors/validation-error.js";
import { CreateOrderRequest } from "./order-types.js";

/**
 * Monto mínimo para pagos con billetera Yape/Plin en centavos (S/ 6.00).
 * Este límite es específico para billeteras móviles; las órdenes generales pueden tener límites distintos.
 */
export const WALLET_MIN_AMOUNT = 600;

/**
 * Monto máximo para pagos con billetera Yape/Plin en centavos (S/ 500.00).
 */
export const WALLET_MAX_AMOUNT = 50_000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DESCRIPTION_LENGTH = 250;
const MAX_ORDER_NUMBER_LENGTH = 100;
const MAX_METADATA_KEYS = 10;

/**
 * Valida un CreateOrderRequest antes de enviarlo a Culqi.
 *
 * Lanza un {@link ValidationError} en la primera falla de validación.
 * La propiedad `field` del error identifica qué campo falló.
 *
 * Este validador aplica las restricciones conocidas para pagos con billetera Yape/Plin.
 * Si vas a crear órdenes para otros métodos de pago con límites diferentes,
 * puede que necesites ajustar o saltarte estas restricciones.
 */
export function validateOrderRequest(req: CreateOrderRequest): void {
  validateAmount(req.amount);
  validateCurrencyCode(req.currency_code);
  validateDescription(req.description);
  validateOrderNumber(req.order_number);
  validateExpirationDate(req.expiration_date);
  validateClientDetails(req);
  if (req.metadata !== undefined) {
    validateMetadata(req.metadata);
  }
}

function validateAmount(amount: unknown): void {
  if (typeof amount !== "number") {
    throw new ValidationError("amount debe ser un número", "amount");
  }
  if (!Number.isFinite(amount)) {
    throw new ValidationError("amount debe ser un número finito", "amount");
  }
  if (!Number.isInteger(amount)) {
    throw new ValidationError(
      "amount debe ser un entero en centavos (ej: 1000 para S/ 10.00)",
      "amount"
    );
  }
  if (!Number.isSafeInteger(amount)) {
    throw new ValidationError("amount está fuera del rango de enteros seguros", "amount");
  }
  if (amount < WALLET_MIN_AMOUNT) {
    throw new ValidationError(
      `amount debe ser al menos ${WALLET_MIN_AMOUNT} centavos (S/ ${(WALLET_MIN_AMOUNT / 100).toFixed(2)}) para pagos con billetera`,
      "amount"
    );
  }
  if (amount > WALLET_MAX_AMOUNT) {
    throw new ValidationError(
      `amount no debe superar ${WALLET_MAX_AMOUNT} centavos (S/ ${(WALLET_MAX_AMOUNT / 100).toFixed(2)}) para pagos con billetera`,
      "amount"
    );
  }
}

function validateCurrencyCode(code: unknown): void {
  if (code !== "PEN") {
    throw new ValidationError('currency_code debe ser "PEN"', "currency_code");
  }
}

function validateDescription(description: unknown): void {
  if (typeof description !== "string") {
    throw new ValidationError("description debe ser un string", "description");
  }
  if (description.trim().length === 0) {
    throw new ValidationError("description no puede estar vacía", "description");
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ValidationError(
      `description no debe superar ${MAX_DESCRIPTION_LENGTH} caracteres`,
      "description"
    );
  }
}

function validateOrderNumber(orderNumber: unknown): void {
  if (typeof orderNumber !== "string") {
    throw new ValidationError("order_number debe ser un string", "order_number");
  }
  if (orderNumber.trim().length === 0) {
    throw new ValidationError("order_number no puede estar vacío", "order_number");
  }
  if (orderNumber.length > MAX_ORDER_NUMBER_LENGTH) {
    throw new ValidationError(
      `order_number no debe superar ${MAX_ORDER_NUMBER_LENGTH} caracteres`,
      "order_number"
    );
  }
}

function validateExpirationDate(expirationDate: unknown): void {
  if (typeof expirationDate !== "number") {
    throw new ValidationError("expiration_date debe ser un número", "expiration_date");
  }
  if (!Number.isFinite(expirationDate) || !Number.isInteger(expirationDate)) {
    throw new ValidationError(
      "expiration_date debe ser un timestamp Unix (entero en segundos)",
      "expiration_date"
    );
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (expirationDate <= nowSeconds) {
    throw new ValidationError(
      "expiration_date debe ser un timestamp Unix futuro",
      "expiration_date"
    );
  }
}

function validateClientDetails(req: CreateOrderRequest): void {
  const { client_details } = req;
  if (client_details === null || typeof client_details !== "object") {
    throw new ValidationError("client_details debe ser un objeto", "client_details");
  }

  if (
    typeof client_details.first_name !== "string" ||
    client_details.first_name.trim().length === 0
  ) {
    throw new ValidationError(
      "client_details.first_name debe ser un string no vacío",
      "client_details.first_name"
    );
  }

  if (
    typeof client_details.last_name !== "string" ||
    client_details.last_name.trim().length === 0
  ) {
    throw new ValidationError(
      "client_details.last_name debe ser un string no vacío",
      "client_details.last_name"
    );
  }

  if (
    typeof client_details.email !== "string" ||
    !EMAIL_RE.test(client_details.email)
  ) {
    throw new ValidationError(
      "client_details.email debe ser una dirección de email válida",
      "client_details.email"
    );
  }

  if (
    typeof client_details.phone_number !== "string" ||
    client_details.phone_number.trim().length === 0
  ) {
    throw new ValidationError(
      "client_details.phone_number debe ser un string no vacío",
      "client_details.phone_number"
    );
  }
}

function validateMetadata(metadata: unknown): void {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    throw new ValidationError("metadata debe ser un objeto plano", "metadata");
  }
  const keys = Object.keys(metadata);
  if (keys.length > MAX_METADATA_KEYS) {
    throw new ValidationError(
      `metadata no debe tener más de ${MAX_METADATA_KEYS} claves`,
      "metadata"
    );
  }
  for (const key of keys) {
    const value = (metadata as Record<string, unknown>)[key];
    if (typeof value !== "string") {
      throw new ValidationError(
        `los valores de metadata deben ser strings (la clave "${key}" tiene tipo "${typeof value}")`,
        `metadata.${key}`
      );
    }
  }
}
