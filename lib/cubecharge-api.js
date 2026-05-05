const axios = require('axios');

const DEFAULT_API_BASE_URL = 'https://portal.cubecharging.com/api/v1/CubeCharging';
const DEFAULT_REQUEST_TIMEOUT = 45000;

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
    this.baseUrl = baseUrl || DEFAULT_API_BASE_URL;
    this.apiKey = apiKey;
    this.log = typeof log === 'function' ? log : null;
  }

  getAuthorizationHeaders() {
    return { 'Authorization': `Bearer ${this.apiKey}` };
  }

  logRequest(label, details) {
    if (this.log) {
      this.log(label, details);
    }
  }

  logResponse(label, response) {
    this.logRequest(label, {
      status: response.status,
      responseKeys: getObjectKeys(response.data),
    });
  }

  logAxiosError(label, error) {
    if (!this.log) {
      return;
    }

    this.log(label, {
      message: error.message,
      code: error.code,
      status: error.response && error.response.status,
      responseKeys: error.response ? getObjectKeys(error.response.data) : [],
      responseData: error.response && error.response.data,
    });
  }

  async getChargeBoxes() {
    const url = `${this.baseUrl}/chargebox/details`;
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

  async startCharging({ chargeBoxId, connectorId, idTag }) {
    const url = `${this.baseUrl}/chargebox/remote-start`;
    const body = {
      chargeBoxId,
      connectorId: Number(connectorId),
      idTag: String(idTag),
    };

    this.logRequest('CubeChargeAPI startCharging request', {
      method: 'POST',
      url,
      body,
      bearerIncluded: Boolean(this.apiKey),
    });

    try {
      const response = await axios.post(url, body, {
        headers: {
          ...this.getAuthorizationHeaders(),
          'Content-Type': 'application/json',
        },
        timeout: DEFAULT_REQUEST_TIMEOUT,
      });

      this.logResponse('CubeChargeAPI startCharging response', response);
      return response;
    } catch (error) {
      this.logAxiosError('CubeChargeAPI startCharging failed', error);
      throw error;
    }
  }

  async stopCharging({ chargeBoxId, connectorId, transactionId }) {
    const url = `${this.baseUrl}/chargebox/remote-stop`;
    const body = { chargeBoxId };

    if (transactionId !== undefined && transactionId !== null) {
      body.transactionId = Number(transactionId);
    } else if (connectorId !== undefined && connectorId !== null) {
      body.connectorId = Number(connectorId);
    }

    this.logRequest('CubeChargeAPI stopCharging request', {
      method: 'POST',
      url,
      body,
      bearerIncluded: Boolean(this.apiKey),
      stopMode: body.transactionId !== undefined ? 'transactionId' : 'connectorId',
    });

    try {
      const response = await axios.post(url, body, {
        headers: {
          ...this.getAuthorizationHeaders(),
          'Content-Type': 'application/json',
        },
        timeout: DEFAULT_REQUEST_TIMEOUT,
      });

      this.logResponse('CubeChargeAPI stopCharging response', response);
      return response;
    } catch (error) {
      this.logAxiosError('CubeChargeAPI stopCharging failed', error);
      throw error;
    }
  }

  async createWebhookSubscription({ targetUrl, events, chargeBoxIds }) {
    const url = `${this.baseUrl}/webhook/subscription`;
    const body = {
      targetUrl,
      events,
    };

    if (Array.isArray(chargeBoxIds) && chargeBoxIds.length > 0) {
      body.chargeBoxIds = chargeBoxIds;
    }

    if (this.log) {
      this.log('CubeChargeAPI createWebhookSubscription request', {
        method: 'POST',
        url,
        eventCount: events.length,
        chargeBoxFilterCount: body.chargeBoxIds ? body.chargeBoxIds.length : 0,
        bearerIncluded: Boolean(this.apiKey),
      });
    }

    const res = await axios.post(url, body, {
      headers: {
        ...this.getAuthorizationHeaders(),
        'Content-Type': 'application/json',
      },
    });

    return res.data;
  }

  async updateWebhookSubscription({ subscriptionId, targetUrl, events, chargeBoxIds }) {
    const url = `${this.baseUrl}/webhook/subscription/${subscriptionId}`;
    const body = {
      targetUrl,
      events,
    };

    if (Array.isArray(chargeBoxIds) && chargeBoxIds.length > 0) {
      body.chargeBoxIds = chargeBoxIds;
    }

    const res = await axios.put(url, body, {
      headers: {
        ...this.getAuthorizationHeaders(),
        'Content-Type': 'application/json',
      },
    });

    return res.data;
  }

  async getWebhookSubscriptions() {
    const res = await axios.get(`${this.baseUrl}/webhook/subscription`, {
      headers: this.getAuthorizationHeaders(),
    });

    return Array.isArray(res.data) ? res.data : [];
  }
}

module.exports = CubeChargeAPI;
