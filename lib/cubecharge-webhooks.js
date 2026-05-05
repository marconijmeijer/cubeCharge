const crypto = require('crypto');

const WEBHOOK_EVENTS = [
  'Session_started',
  'Session_stopped',
  'Status_changed',
  'Session_progress',
  'Status_progress',
];

function getApiKeyHash(apiKey) {
  return crypto
    .createHash('sha256')
    .update(String(apiKey))
    .digest('hex');
}

function getHeader(headers, name) {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }

  const lowerName = name.toLowerCase();
  const key = Object.keys(headers).find(header => header.toLowerCase() === lowerName);

  return key ? headers[key] : undefined;
}

function getChargeBoxId(payload) {
  return payload && (payload.chargeBoxId || payload.chargeboxId || payload.charge_box_id || payload.id);
}

function isSupportedEvent(eventType) {
  return WEBHOOK_EVENTS.includes(eventType);
}

function toSignaturePayload(args) {
  if (typeof args.rawBody === 'string' || Buffer.isBuffer(args.rawBody)) {
    return args.rawBody;
  }

  if (typeof args.body === 'string') {
    return args.body;
  }

  return null;
}

function verifyCubeSignature({ payload, signature, secret }) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64');

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  return (
    signatureBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  );
}

module.exports = {
  WEBHOOK_EVENTS,
  getApiKeyHash,
  getHeader,
  getChargeBoxId,
  isSupportedEvent,
  toSignaturePayload,
  verifyCubeSignature,
};
