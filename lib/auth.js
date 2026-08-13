// Il cancello (Parte 3): firma e verifica del cookie di sessione, e
// confronto a tempo costante per password e segreto API. Web Crypto
// (non il modulo "crypto" di Node) perché deve girare anche nel
// middleware, che gira su Edge runtime.

const SESSION_COOKIE = "elyra_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 giorni

function textToBytes(str) {
  return new TextEncoder().encode(str);
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// Confronto a tempo costante: stessa lunghezza richiesta, nessuna uscita
// anticipata durante lo XOR. Vale sia per la password sia per i segreti.
export function constantTimeEqual(a, b) {
  const bytesA = textToBytes(a ?? "");
  const bytesB = textToBytes(b ?? "");
  if (bytesA.length !== bytesB.length) return false;
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) {
    diff |= bytesA[i] ^ bytesB[i];
  }
  return diff === 0;
}

async function hmacSign(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    textToBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, textToBytes(message));
  return bytesToHex(new Uint8Array(signature));
}

// Cookie = "<scadenza-unix>.<firma-hmac>". La firma copre la scadenza,
// quindi non si può fabbricare un cookie a mano né allungarne la vita
// senza conoscere AUTH_SECRET.
export async function createSessionCookieValue(secret) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const signature = await hmacSign(String(expiresAt), secret);
  return `${expiresAt}.${signature}`;
}

export async function verifySessionCookieValue(value, secret) {
  if (!value) return false;
  const [expiresAtStr, signature] = value.split(".");
  if (!expiresAtStr || !signature) return false;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expectedSignature = await hmacSign(expiresAtStr, secret);
  const a = hexToBytes(signature.padEnd(64, "0").slice(0, 64));
  const b = hexToBytes(expectedSignature);
  if (signature.length !== expectedSignature.length) return false;
  let diff = 0;
  for (let i = 0; i < b.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_MAX_AGE = SESSION_MAX_AGE_SECONDS;
