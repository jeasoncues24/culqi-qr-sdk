/**
 * Se lanza cuando la solicitud a Culqi falla por un problema de red
 * (fallo de DNS, conexión rechazada, timeout, etc.) antes de recibir
 * cualquier respuesta HTTP.
 */
export class CulqiNetworkError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "CulqiNetworkError";
  }
}
