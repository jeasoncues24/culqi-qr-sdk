/**
 * Se lanza cuando Culqi devuelve una respuesta HTTP con código de error (4xx, 5xx).
 *
 * El campo `details` contiene el cuerpo de la respuesta tal como lo devuelve Culqi.
 * No registres este error en logs de entornos donde el cuerpo pueda contener datos personales.
 */
export class CulqiApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "CulqiApiError";
  }
}
