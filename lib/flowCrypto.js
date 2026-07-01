const crypto = require("crypto");

// Carga la llave privada en base64 desde FLOW_PRIVATE_KEY_B64.
function getPrivateKey() {
  const b64 = process.env.FLOW_PRIVATE_KEY_B64;
  if (!b64) throw new Error("FLOW_PRIVATE_KEY_B64 no esta configurada");
  return Buffer.from(b64, "base64").toString("utf-8");
}

// Descifra la peticion enviada por Meta:
// 1) RSA-OAEP-SHA256 para recuperar la llave AES de sesion.
// 2) AES-GCM para descifrar los datos del Flow.
function decryptRequest(body) {
  const { encrypted_flow_data, encrypted_aes_key, initial_vector } = body;

  const aesKey = crypto.privateDecrypt(
    {
      key: getPrivateKey(),
      passphrase: process.env.FLOW_KEY_PASSPHRASE || undefined,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(encrypted_aes_key, "base64")
  );

  const flowData = Buffer.from(encrypted_flow_data, "base64");
  const iv = Buffer.from(initial_vector, "base64");
  const TAG_LENGTH = 16;
  const encryptedData = flowData.subarray(0, -TAG_LENGTH);
  const authTag = flowData.subarray(-TAG_LENGTH);

  const algorithm = aesKey.length === 32 ? "aes-256-gcm" : "aes-128-gcm";
  const decipher = crypto.createDecipheriv(algorithm, aesKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]);

  return { aesKey, iv, payload: JSON.parse(decrypted.toString("utf-8")) };
}

// Cifra la respuesta con la misma llave AES pero invirtiendo el IV (XOR 0xFF),
// tal como exige el protocolo de WhatsApp Flows. Devuelve base64.
function encryptResponse(response, aesKey, iv) {
  const flippedIv = Buffer.from(iv.map((b) => b ^ 0xff));
  const algorithm = aesKey.length === 32 ? "aes-256-gcm" : "aes-128-gcm";
  const cipher = crypto.createCipheriv(algorithm, aesKey, flippedIv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(response), "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([encrypted, authTag]).toString("base64");
}

module.exports = { decryptRequest, encryptResponse };
