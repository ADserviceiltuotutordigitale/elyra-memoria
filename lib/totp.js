import "server-only";
import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer) {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return output;
}

function base32Decode(str) {
  let bits = "";
  for (const char of str.toUpperCase().replace(/=+$/, "")) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

// Segreto TOTP: 160 bit (20 byte), la dimensione raccomandata da RFC 4226
// per HMAC-SHA1 — coincide con quanto si aspettano le app di autenticazione
// reali come Google Authenticator.
export function generaSegreto() {
  return base32Encode(crypto.randomBytes(20));
}

// RFC 4226 (HOTP): HMAC-SHA1 sul contatore, troncamento dinamico, 6 cifre.
function generaCodice(secret, counter) {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const codice =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(codice % 1000000).padStart(6, "0");
}

// RFC 6238 (TOTP): il contatore HOTP è il numero di intervalli da 30
// secondi passati dall'epoca. Tolleranza di ±1 intervallo per la
// differenza di orologio tra telefono e server.
export function verificaCodice(secret, codice) {
  if (!codice) return false;
  const counterAttuale = Math.floor(Date.now() / 1000 / 30);
  for (let delta = -1; delta <= 1; delta++) {
    if (generaCodice(secret, counterAttuale + delta) === codice) return true;
  }
  return false;
}

export function generaOtpauthUri(secret, email) {
  const label = encodeURIComponent(`Elyra:${email}`);
  const issuer = encodeURIComponent("Elyra Memoria");
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}
