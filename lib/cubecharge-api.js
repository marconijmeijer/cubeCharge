const axios = require('axios');

function getObjectKeys(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value)
    : [];
}

function normalizeChargeBoxes(responseBody) {
  if (Array.isArray(responseBody)) {
    return responseBody;
  }

  const responseKeys = getObjectKeys(responseBody);
  const collectionKeys = [
    'data',
    'items',
    'results',
    'result',
    'chargeBoxes',
    'chargeboxes',
    'charge_boxes',
    'boxes',
  ];

  for (const key of collectionKeys) {
    if (Array.isArray(responseBody && responseBody[key])) {
      return responseBody[key];
    }
  }

  if (responseBody && responseBody.data && typeof responseBody.data === 'object') {
    return normalizeChargeBoxes(responseBody.data);
  }

  if (
    responseKeys.length > 0
    && responseKeys.every(key => responseBody[key] && typeof responseBody[key] === 'object')
  ) {
    return Object.values(responseBody);
  }

  throw new Error(
    `Unexpected charge box list response. Top-level keys: ${responseKeys.join(', ') || 'none'}`,
  );
}

class CubeChargeAPI {
  constructor({ baseUrl, apiKey, log }) {
    this.baseUrl = baseUrl || 'https://portal.cubecharging.com/api/v1/CubeCharging/chargebox';
    this.apiKey = apiKey;
    this.log = typeof log === 'function' ? log : null;
  }

  getAuthorizationHeaders() {
    return { 'Authorization': `Bearer ${this.apiKey}` };
  }

  async getChargeBoxes() {
    const url = `${this.baseUrl}/details`;
    const headers = this.getAuthorizationHeaders();

    if (this.log) {
      this.log('CubeChargeAPI getChargeBoxes request', {
        method: 'GET',
        url,
        bearerIncluded: Boolean(headers.Authorization),
      });
    }

    const res = await axios.get(url, {
      headers,
    });
    return normalizeChargeBoxes(res.data);
  }

  async startCharging(boxId) {
    return axios.post(`${this.baseUrl}/remote-start`, { chargeBoxId: boxId }, {
      headers: this.getAuthorizationHeaders(),
    });
  }

  async stopCharging(boxId) {
    return axios.post(`${this.baseUrl}/remote-stop`, { chargeBoxId: boxId }, {
      headers: this.getAuthorizationHeaders(),
    });
  }
}

module.exports = CubeChargeAPI;
