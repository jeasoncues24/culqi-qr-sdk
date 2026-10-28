/**
 * Ejemplo de integración de @jcues28/culqi-qr-sdk con Express
 *
 * Flujo que cubre este ejemplo:
 *
 *   1. POST /checkout      → crea una orden en Culqi y devuelve el QR
 *   2. GET  /qr/:orderId   → página HTML que muestra el QR para que el cliente lo escanee
 *   3. POST /webhooks/culqi → recibe el evento de Culqi cuando el cliente paga
 *
 * Requisitos:
 *   - Node.js 18+
 *   - Archivo .env con CULQI_SECRET_KEY y PUBLIC_URL (ver .env.example)
 *   - ngrok (u otro túnel) si quieres probar webhooks en local
 *
 * Para correr:
 *   npm install
 *   cp .env.example .env   # completa tus credenciales
 *   npm run dev
 */

import express from "express";
import QRCode from "qrcode";
import {
  CulqiApiError,
  CulqiClient,
  CulqiNetworkError,
  ValidationError,
  isOrderPaid,
  parseWebhookEvent,
} from "@jcues28/culqi-qr-sdk";

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

const CULQI_SECRET_KEY = process.env.CULQI_SECRET_KEY;
const PORT = process.env.PORT ?? "3000";
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;

if (!CULQI_SECRET_KEY) {
  console.error("ERROR: La variable de entorno CULQI_SECRET_KEY es obligatoria.");
  console.error("Copia .env.example a .env y completa tus credenciales.");
  process.exit(1);
}

const culqi = new CulqiClient({ secretKey: CULQI_SECRET_KEY });

// ---------------------------------------------------------------------------
// Base de datos en memoria (solo para el ejemplo — en producción usa una BD real)
// ---------------------------------------------------------------------------

/**
 * Simula una tabla de órdenes de tu sistema.
 * Clave: tu order_number interno. Valor: datos de la orden.
 *
 * En un sistema real esto sería una fila en PostgreSQL, MongoDB, etc.
 */
const ordersDB = new Map();

// ---------------------------------------------------------------------------
// Servidor Express
// ---------------------------------------------------------------------------

const app = express();

// Necesitamos el body como texto plano para el webhook (antes de parsear JSON).
// Por eso NO usamos express.json() de forma global.

// ---------------------------------------------------------------------------
// RUTA 1: Crear una orden de pago
//
// El frontend llama a este endpoint cuando el usuario hace click en "Pagar".
// Devuelve la URL donde mostrar el QR al cliente.
// ---------------------------------------------------------------------------
app.post("/checkout", express.json(), async (req, res) => {
  const { amount, description, customerEmail, customerFirstName, customerLastName, customerPhone } =
    req.body;

  // Generamos un ID único para esta orden en nuestro sistema.
  // En producción usarías el ID real de tu pedido.
  const orderNumber = `PEDIDO-${Date.now()}`;

  // La orden vence en 30 minutos.
  const expirationDate = Math.floor(Date.now() / 1000) + 30 * 60;

  let culqiOrder;
  try {
    culqiOrder = await culqi.createOrder({
      amount,               // en centavos: 2000 = S/ 20.00
      currency_code: "PEN",
      description,
      order_number: orderNumber,
      expiration_date: expirationDate,
      confirm: true,        // la orden queda disponible para pago inmediatamente
      client_details: {
        first_name: customerFirstName,
        last_name: customerLastName,
        email: customerEmail,
        phone_number: customerPhone,
      },
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      // Error en los datos enviados por el frontend.
      return res.status(400).json({
        error: "datos_invalidos",
        field: err.field,
        message: err.message,
      });
    }
    if (err instanceof CulqiApiError) {
      // Culqi rechazó la solicitud (credenciales inválidas, monto fuera de rango, etc.).
      console.error(`Culqi rechazó la orden [HTTP ${err.status}]:`, err.details);
      return res.status(502).json({
        error: "culqi_error",
        message: "No se pudo crear la orden de pago. Intenta de nuevo.",
      });
    }
    if (err instanceof CulqiNetworkError) {
      console.error("Error de red al contactar Culqi:", err.message);
      return res.status(503).json({
        error: "red_no_disponible",
        message: "Servicio de pagos temporalmente no disponible.",
      });
    }
    throw err; // Error inesperado — lo deja subir al manejador global.
  }

  // Guardamos la orden en nuestra BD con estado "pendiente".
  // IMPORTANTE: el estado en nuestra BD lo maneja SOLO el webhook, nunca el frontend.
  ordersDB.set(orderNumber, {
    orderNumber,
    culqiOrderId: culqiOrder.id,
    amount: culqiOrder.amount,
    description: culqiOrder.description,
    paymentCode: culqiOrder.payment_code, // valor del QR
    status: "pendiente",                  // estado interno nuestro
    createdAt: new Date().toISOString(),
    paidAt: null,
  });

  console.log(`Orden creada: ${orderNumber} (Culqi ID: ${culqiOrder.id})`);

  // Devolvemos la URL donde el frontend debe redirigir al cliente para ver el QR.
  return res.status(201).json({
    orderNumber,
    qrPageUrl: `${PUBLIC_URL}/qr/${culqiOrder.id}`,
  });
});

// ---------------------------------------------------------------------------
// RUTA 2: Página con el QR para que el cliente escanee
//
// En una app real esto sería una página de tu frontend (React, etc.).
// Lo incluimos acá para que el ejemplo sea autocontenido.
// ---------------------------------------------------------------------------
app.get("/qr/:culqiOrderId", async (req, res) => {
  const { culqiOrderId } = req.params;

  // Consultamos el estado actual de la orden directamente en Culqi.
  let order;
  try {
    order = await culqi.getOrder(culqiOrderId);
  } catch (err) {
    if (err instanceof CulqiApiError && err.status === 404) {
      return res.status(404).send("Orden no encontrada.");
    }
    console.error("Error al consultar la orden:", err);
    return res.status(500).send("Error al cargar la orden.");
  }

  if (order.state === "paid") {
    return res.send(paidPage(order));
  }

  if (order.state === "expired") {
    return res.send(expiredPage(order));
  }

  if (!order.payment_code) {
    return res.status(422).send("Esta orden no tiene código de pago generado.");
  }

  // Generamos la imagen QR a partir del payment_code de Culqi.
  const qrDataUrl = await QRCode.toDataURL(order.payment_code, { width: 300 });

  return res.send(qrPage(order, qrDataUrl));
});

// ---------------------------------------------------------------------------
// RUTA 3: Webhook de Culqi
//
// Culqi llama a este endpoint cuando el estado de una orden cambia.
// Debes configurar esta URL en tu panel de Culqi:
//   https://mipanel.culqi.com → Desarrolladores → Webhooks
//   URL: {PUBLIC_URL}/webhooks/culqi
//
// IMPORTANTE: Siempre responde 200 rápido. Si tardas o fallas, Culqi reintenta.
// ---------------------------------------------------------------------------
app.post("/webhooks/culqi", express.text({ type: "*/*" }), async (req, res) => {
  // Respondemos 200 inmediatamente para evitar reintentos por timeout.
  // El procesamiento real ocurre después.
  res.status(200).send("ok");

  let event;
  try {
    event = parseWebhookEvent(req.body);
  } catch (err) {
    // Payload inválido — lo registramos pero ya respondimos 200.
    console.warn("Webhook recibido con payload inválido:", err);
    return;
  }

  console.log(`Webhook recibido: type=${event.type}, orderId=${event.data.id}, state=${event.data.state}`);

  if (!isOrderPaid(event)) {
    // El evento no es un pago completado (puede ser expiración, etc.).
    // No hacemos nada, pero lo registramos.
    console.log(`Evento ignorado: la orden ${event.data.id} está en estado "${event.data.state}"`);
    return;
  }

  // El evento dice que la orden fue pagada.
  // ANTES de procesar, verificamos el estado real consultando la API de Culqi.
  // Esto protege contra payloads falsos o reintentos de eventos ya procesados.
  let confirmedOrder;
  try {
    confirmedOrder = await culqi.getOrder(event.data.id);
  } catch (err) {
    console.error(`No se pudo verificar la orden ${event.data.id} en Culqi:`, err);
    return;
  }

  if (confirmedOrder.state !== "paid") {
    console.warn(
      `Descartado: el webhook dijo "paid" pero la API de Culqi devuelve "${confirmedOrder.state}" para ${confirmedOrder.id}`
    );
    return;
  }

  // Buscamos la orden en nuestra BD por order_number.
  const internalOrder = ordersDB.get(confirmedOrder.order_number);

  if (!internalOrder) {
    // La orden no está en nuestra BD — puede ser de otro sistema o una prueba.
    console.warn(`Webhook para orden desconocida: ${confirmedOrder.order_number}`);
    return;
  }

  if (internalOrder.status === "pagado") {
    // Ya procesamos este pago antes — idempotencia.
    console.log(`Orden ${confirmedOrder.order_number} ya estaba marcada como pagada. Ignorando.`);
    return;
  }

  // Aquí va tu lógica de negocio real:
  //   - Actualizar el estado del pedido en tu BD
  //   - Enviar email de confirmación al cliente
  //   - Activar la suscripción
  //   - Notificar al área de despacho
  //   - etc.

  internalOrder.status = "pagado";
  internalOrder.paidAt = new Date().toISOString();
  ordersDB.set(confirmedOrder.order_number, internalOrder);

  console.log(`✓ Pago confirmado: ${confirmedOrder.order_number} (S/ ${confirmedOrder.amount / 100})`);
});

// ---------------------------------------------------------------------------
// RUTA extra: Consultar estado de una orden (útil para polling desde el frontend)
// ---------------------------------------------------------------------------
app.get("/orders/:orderNumber/status", (req, res) => {
  const order = ordersDB.get(req.params.orderNumber);
  if (!order) return res.status(404).json({ error: "Orden no encontrada" });
  return res.json({ orderNumber: order.orderNumber, status: order.status });
});

// ---------------------------------------------------------------------------
// Manejador global de errores
// ---------------------------------------------------------------------------
app.use((err, _req, res, _next) => {
  console.error("Error no manejado:", err);
  res.status(500).json({ error: "Error interno del servidor" });
});

// ---------------------------------------------------------------------------
// Arranque del servidor
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\nServidor corriendo en http://localhost:${PORT}`);
  console.log(`\nEndpoints disponibles:`);
  console.log(`  POST http://localhost:${PORT}/checkout`);
  console.log(`  GET  http://localhost:${PORT}/qr/:culqiOrderId`);
  console.log(`  POST http://localhost:${PORT}/webhooks/culqi`);
  console.log(`  GET  http://localhost:${PORT}/orders/:orderNumber/status`);
  console.log(`\nWebhook URL para configurar en el panel de Culqi:`);
  console.log(`  ${PUBLIC_URL}/webhooks/culqi`);
  console.log(`\nPara probar localmente con ngrok:`);
  console.log(`  ngrok http ${PORT}`);
  console.log(`  Luego actualiza PUBLIC_URL en tu .env con la URL de ngrok\n`);
});

// ---------------------------------------------------------------------------
// Plantillas HTML mínimas
// ---------------------------------------------------------------------------

function qrPage(order, qrDataUrl) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pagar con Yape o Plin</title>
  <style>
    body { font-family: sans-serif; max-width: 400px; margin: 40px auto; text-align: center; padding: 0 16px; }
    img { border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; }
    .amount { font-size: 2rem; font-weight: bold; color: #1a1a1a; margin: 16px 0; }
    .desc { color: #666; margin-bottom: 24px; }
    .steps { text-align: left; background: #f9f9f9; border-radius: 8px; padding: 16px; margin-top: 24px; }
    .steps li { margin: 8px 0; }
    .badge { display: inline-block; background: #7c3aed; color: white; padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; margin: 4px; }
  </style>
</head>
<body>
  <h2>Escanea para pagar</h2>
  <span class="badge">Yape</span>
  <span class="badge">Plin</span>
  <div class="amount">S/ ${(order.amount / 100).toFixed(2)}</div>
  <p class="desc">${order.description}</p>
  <img src="${qrDataUrl}" alt="Código QR de pago" width="300" height="300">
  <div class="steps">
    <strong>¿Cómo pagar?</strong>
    <ol>
      <li>Abre <strong>Yape</strong> o <strong>Plin</strong> en tu celular</li>
      <li>Toca el ícono de QR</li>
      <li>Escanea este código</li>
      <li>Confirma el pago en tu app</li>
    </ol>
  </div>
  <p style="color:#999; font-size:0.8rem; margin-top:16px">
    Este código vence el ${new Date(order.expiration_date * 1000).toLocaleString("es-PE")}
  </p>
</body>
</html>`;
}

function paidPage(order) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Pago exitoso</title>
  <style>
    body { font-family: sans-serif; max-width: 400px; margin: 80px auto; text-align: center; }
    .icon { font-size: 4rem; }
    .amount { font-size: 2rem; font-weight: bold; color: #16a34a; }
  </style>
</head>
<body>
  <div class="icon">✅</div>
  <h2>¡Pago recibido!</h2>
  <div class="amount">S/ ${(order.amount / 100).toFixed(2)}</div>
  <p>${order.description}</p>
</body>
</html>`;
}

function expiredPage(order) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Código vencido</title>
  <style>
    body { font-family: sans-serif; max-width: 400px; margin: 80px auto; text-align: center; }
    .icon { font-size: 4rem; }
  </style>
</head>
<body>
  <div class="icon">⏱️</div>
  <h2>Este código venció</h2>
  <p>La orden <strong>${order.order_number}</strong> expiró.</p>
  <p><a href="/">Volver al inicio</a></p>
</body>
</html>`;
}
