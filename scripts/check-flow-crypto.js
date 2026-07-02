const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const passphrase = "test-flow-passphrase";

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: "spki",
    format: "pem",
  },
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem",
    cipher: "aes-256-cbc",
    passphrase,
  },
});

process.env.FLOW_PRIVATE_KEY_B64 = Buffer.from(privateKey, "utf8").toString("base64");
process.env.FLOW_KEY_PASSPHRASE = passphrase;

const { decryptRequest, encryptResponse } = require("../lib/flowCrypto");
const { handleFlow } = require("../lib/flowHandler");

function encryptMetaPayload(payload) {
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const encryptedFlowData = Buffer.concat([encrypted, cipher.getAuthTag()]);

  const encryptedAesKey = crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    aesKey
  );

  return {
    body: {
      encrypted_flow_data: encryptedFlowData.toString("base64"),
      encrypted_aes_key: encryptedAesKey.toString("base64"),
      initial_vector: iv.toString("base64"),
    },
    aesKey,
    iv,
  };
}

function decryptFlowResponse(encryptedResponse, aesKey, iv) {
  const flippedIv = Buffer.from(iv.map((byte) => byte ^ 0xff));
  const responseData = Buffer.from(encryptedResponse, "base64");
  const encrypted = responseData.subarray(0, -16);
  const authTag = responseData.subarray(-16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, flippedIv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

async function main() {
  const flowJsonPath = path.join(__dirname, "..", "flow-agendamiento.json");
  const flowJson = fs.readFileSync(flowJsonPath, "utf8");
  assert.doesNotMatch(flowJson, /Ã|Â|�/, "flow-agendamiento.json contiene mojibake");
  assert.doesNotThrow(() => JSON.parse(flowJson), "flow-agendamiento.json debe ser JSON valido");

  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(server, /redactFlowData/, "server.js debe redactar datos del Flow antes de loguear");
  ["numero_documento", "documento", "correo", "slot"].forEach((field) => {
    assert.match(server, new RegExp(field), `redactFlowData debe cubrir ${field}`);
  });

  const pingPayload = {
    version: "3.0",
    action: "ping",
    flow_token: "flow_crypto_test",
  };

  const encryptedRequest = encryptMetaPayload(pingPayload);
  const decrypted = decryptRequest(encryptedRequest.body);

  assert.deepStrictEqual(decrypted.payload, pingPayload, "decryptRequest debe recuperar el payload original");
  assert.strictEqual(decrypted.aesKey.length, 32, "decryptRequest debe recuperar AES-256");
  assert.strictEqual(decrypted.iv.length, 12, "decryptRequest debe recuperar el IV");

  const response = await handleFlow(decrypted.payload);
  assert.deepStrictEqual(response, { data: { status: "active" } }, "ping debe responder active");

  const encryptedResponse = encryptResponse(response, decrypted.aesKey, decrypted.iv);
  const roundTripResponse = decryptFlowResponse(encryptedResponse, encryptedRequest.aesKey, encryptedRequest.iv);

  assert.deepStrictEqual(roundTripResponse, response, "encryptResponse debe usar el IV invertido esperado por Meta");
}

main()
  .then(() => {
    console.log("check-flow-crypto OK");
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
