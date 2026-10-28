# @jcues28/culqi-qr-sdk

![version](https://img.shields.io/badge/versión-0.1.0-blue)
![estado](https://img.shields.io/badge/estado-alpha-orange)
![licencia](https://img.shields.io/badge/licencia-MIT-green)
![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)

SDK de TypeScript para integrar pagos mediante órdenes QR de Culqi en un backend Node.js. Diseñado principalmente para billeteras móviles **Yape** y **Plin** en Perú.

Te permite crear órdenes de pago, consultar su estado y procesar los eventos webhook de Culqi sin tener que implementar la integración desde cero.

---

## Requisitos

- Node.js 20 o superior (se requiere `fetch` nativo)
- TypeScript 5.x (opcional — el paquete incluye builds ESM y CommonJS con declaraciones de tipos)

> **Obtén tus credenciales ingresando a tu panel de Culqi → Desarrolladores → API Keys.**
>
> Usa claves `sk_test_` para pruebas y claves `sk_live_` para transacciones reales.
>
> Nunca expongas la clave secreta en el frontend ni la commitees en tu repositorio.

---

## Instalación

```bash
npm install @jcues28/culqi-qr-sdk
```

---

## Configuración

```ts
import { CulqiClient } from "@jcues28/culqi-qr-sdk";

const culqi = new CulqiClient({
  secretKey: process.env.CULQI_SECRET_KEY, // sk_test_... o sk_live_...
});
```

Configura tu clave secreta como variable de entorno:

```bash
# .env — nunca commitees este archivo
CULQI_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxx
```

---

## Crear una orden de pago

```ts
import { CulqiClient } from "@jcues28/culqi-qr-sdk";

const culqi = new CulqiClient({ secretKey: process.env.CULQI_SECRET_KEY });

const orden = await culqi.createOrder({
  amount: 2000,            // en centavos: 2000 = S/ 20.00
  currency_code: "PEN",
  description: "Pedido #42 — Tienda X",
  order_number: "PEDIDO-42",   // tu identificador único
  expiration_date: Math.floor(Date.now() / 1000) + 3600, // vence en 1 hora
  confirm: true,           // la orden queda disponible para pago inmediatamente
  client_details: {
    first_name: "Juan",
    last_name: "Perez",
    email: "juan@example.com",
    phone_number: "+51999999999",
  },
});

// orden.payment_code contiene el valor del QR para mostrarlo al cliente.
// orden.state será "pending" — aún no se recibió ningún pago.
console.log(orden.id, orden.payment_code);
```

> **Importante:** una orden creada es una **intención de pago**, no un pago confirmado. No marques ninguna compra como pagada hasta recibir el evento webhook `order.status.changed` con `state: "paid"` y verificarlo consultando la API.

---

## Límites para Yape y Plin

| Límite | Centavos | Soles |
|--------|----------|-------|
| Mínimo | 600 | S/ 6.00 |
| Máximo | 50 000 | S/ 500.00 |

El SDK aplica estos límites localmente antes de enviar cualquier solicitud a la API.

---

## Consultar una orden

Úsalo para verificar el estado real de una orden antes de marcar una compra como pagada:

```ts
const orden = await culqi.getOrder("ord_test_xxxxxxxxxxxx");

console.log(orden.state); // "pending" | "paid" | "expired" | "deleted"
```

---

## Manejo de errores

El SDK diferencia tres tipos de error para que puedas reaccionar de forma específica a cada situación:

```ts
import {
  ValidationError,
  CulqiApiError,
  CulqiNetworkError,
} from "@jcues28/culqi-qr-sdk";

try {
  const orden = await culqi.createOrder(payload);
} catch (err) {
  if (err instanceof ValidationError) {
    // Los datos enviados no pasaron la validación local.
    // err.field indica qué campo falló.
    console.error(`Campo inválido "${err.field}": ${err.message}`);

  } else if (err instanceof CulqiApiError) {
    // Culqi devolvió una respuesta de error (4xx, 5xx).
    // err.status tiene el código HTTP. err.details tiene el cuerpo de la respuesta.
    console.error(`Error de Culqi [HTTP ${err.status}]:`, err.details);

  } else if (err instanceof CulqiNetworkError) {
    // No se pudo conectar con la API (DNS, timeout, sin internet).
    console.error("Error de red:", err.message);

  } else {
    throw err; // Error inesperado — lo relanzamos.
  }
}
```

---

## Integración de webhooks

Culqi envía un evento `order.status.changed` cada vez que el estado de una orden cambia (por ejemplo, de `"pending"` a `"paid"`).

Debes configurar la URL de tu endpoint en el panel de Culqi → Desarrolladores → Webhooks.

```ts
import { parseWebhookEvent, isOrderPaid } from "@jcues28/culqi-qr-sdk";

// Ejemplo con Express
app.post("/webhooks/culqi", express.text({ type: "*/*" }), async (req, res) => {
  // Responde 200 de inmediato para evitar reintentos por timeout.
  res.status(200).send("ok");

  let evento;
  try {
    evento = parseWebhookEvent(req.body);
  } catch {
    console.warn("Webhook con payload inválido recibido.");
    return;
  }

  if (!isOrderPaid(evento)) return; // ignoramos eventos que no sean pagos completados

  // Verificamos el estado real en la API antes de procesar.
  // Nunca confíes solo en el payload del webhook.
  const ordenConfirmada = await culqi.getOrder(evento.data.id);

  if (ordenConfirmada.state === "paid") {
    // Aquí va tu lógica de negocio:
    // actualizar tu BD, enviar email de confirmación, activar suscripción, etc.
    await marcarOrdenComoPagada(ordenConfirmada.order_number);
  }
});
```

### Seguridad en webhooks

> **Estado actual (octubre 2025):** La documentación pública de Culqi no describe un mecanismo de firma criptográfica para webhooks. El SDK implementa el patrón de defensa más robusto disponible: verificar el estado de cada orden directamente en la API antes de procesar cualquier pago.

Hasta que Culqi publique un mecanismo de firma documentado, estas son las medidas de seguridad a aplicar:

1. **Verifica siempre el estado** de la orden llamando a `getOrder(id)` — nunca confíes únicamente en el payload del webhook.
2. **Diseña tu handler para ser idempotente** — Culqi puede reintentar el mismo evento si falla la entrega. Verifica que la orden no esté ya procesada antes de actuar.
3. **Restringe acceso por IP** si Culqi publica sus rangos de salida (revisa su documentación oficial).
4. **Responde 200 rápidamente** — responde antes de hacer cualquier procesamiento asíncrono para evitar reintentos por timeout.

Cuando Culqi publique un mecanismo de firma, `parseWebhookEvent` será actualizado para aceptar una clave de firma y verificarla antes de devolver el evento.

---

## Validar una solicitud sin hacer la llamada HTTP

Podés ejecutar el validador de forma independiente antes de crear la orden:

```ts
import { validateOrderRequest, ValidationError } from "@jcues28/culqi-qr-sdk";

try {
  validateOrderRequest(payload);
} catch (err) {
  if (err instanceof ValidationError) {
    console.error(err.field, err.message);
  }
}
```

---

## ESM y CommonJS

El paquete incluye ambos formatos:

```ts
// ESM
import { CulqiClient } from "@jcues28/culqi-qr-sdk";

// CommonJS
const { CulqiClient } = require("@jcues28/culqi-qr-sdk");
```

---

## Ejemplo completo

En `examples/express/` encontrás un servidor Express funcional que cubre el flujo completo:

1. `POST /checkout` — crea la orden y devuelve la URL del QR
2. `GET  /qr/:orderId` — página HTML que muestra el QR al cliente
3. `POST /webhooks/culqi` — recibe el evento, verifica con `getOrder` y procesa el pago

```bash
cd examples/express
npm install
cp .env.example .env   # completá tus credenciales
npm run dev
```

Para probar webhooks en local necesitás un túnel como [ngrok](https://ngrok.com):

```bash
ngrok http 3000
# Copiá la URL HTTPS y actualizá PUBLIC_URL en tu .env
```

---

## Limitaciones conocidas

- Los límites de billetera (S/ 6.00 – S/ 500.00) se aplican a todas las órdenes. Si necesitás procesar órdenes para otros métodos de pago fuera de esos rangos, el validador actual no es apropiado.
- La verificación de firma de webhooks no está implementada porque Culqi no la documenta públicamente. Verificá siempre el estado de la orden vía la API.
- `payment_code` es el valor del QR, no una imagen. Para renderizarlo usá una librería como [`qrcode`](https://www.npmjs.com/package/qrcode) (el ejemplo de Express lo muestra).
- `confirm: true` en la creación de la orden no significa que el pago fue recibido. Son conceptos distintos.

---

## Scripts

```bash
npm test           # corre los tests con Vitest
npm run typecheck  # verificación de tipos con TypeScript en modo strict
npm run build      # genera los bundles ESM, CJS y declaraciones de tipos en dist/
```

---

## Licencia

MIT
