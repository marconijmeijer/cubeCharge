const Homey = require('homey');
const CubeChargeAPI = require('./lib/cubecharge-api');
const {
  WEBHOOK_EVENTS,
  getApiKeyHash,
  getHeader,
  getChargeBoxId,
  isSupportedEvent,
  toSignaturePayload,
  verifyCubeSignature,
} = require('./lib/cubecharge-webhooks');

const WEBHOOK_SUBSCRIPTIONS_SETTING = 'cubecharge_webhook_subscriptions';

class CubeChargeApp extends Homey.App {
  async onInit() {
    this.log('CubeCharge Homey app is running');
    await this.registerCubeChargeWebhook();
  }

  async registerCubeChargeWebhook() {
    const webhookId = Homey.env.WEBHOOK_ID;
    const webhookSecret = Homey.env.WEBHOOK_SECRET;

    if (!webhookId || !webhookSecret) {
      this.log('CubeCharge webhook listener not registered: missing WEBHOOK_ID or WEBHOOK_SECRET in env.json');
      return;
    }

    const homeyId = await this.homey.cloud.getHomeyId();
    this.webhookUrl = `https://webhooks.athom.com/webhook/${webhookId}?homey=${homeyId}`;
    this.cubeChargeWebhook = await this.homey.cloud.createWebhook(webhookId, webhookSecret, {});
    this.cubeChargeWebhook.on('message', args => {
      this.handleCubeChargeWebhook(args).catch(error => {
        this.error('Failed to process CubeCharging webhook', error);
      });
    });

    this.log('CubeCharge webhook listener registered', {
      webhookUrl: this.webhookUrl,
    });
  }

  getWebhookSubscriptions() {
    return this.homey.settings.get(WEBHOOK_SUBSCRIPTIONS_SETTING) || {};
  }

  setWebhookSubscriptions(subscriptions) {
    this.homey.settings.set(WEBHOOK_SUBSCRIPTIONS_SETTING, subscriptions);
  }

  async ensureCubeChargeWebhookSubscription({ apiKey }) {
    if (!this.webhookUrl) {
      this.log('Skipping CubeCharging webhook subscription: Homey webhook listener is not registered');
      return null;
    }

    const apiKeyHash = getApiKeyHash(apiKey);
    const subscriptions = this.getWebhookSubscriptions();
    const existing = subscriptions[apiKeyHash];
    const api = new CubeChargeAPI({
      apiKey,
      log: this.log.bind(this),
    });

    if (existing && existing.id) {
      try {
        const updated = await api.updateWebhookSubscription({
          subscriptionId: existing.id,
          targetUrl: this.webhookUrl,
          events: WEBHOOK_EVENTS,
          chargeBoxIds: [],
        });

        subscriptions[apiKeyHash] = {
          ...existing,
          id: updated.id || existing.id,
          targetUrl: updated.targetUrl || this.webhookUrl,
          events: WEBHOOK_EVENTS,
          active: updated.active !== undefined ? updated.active : existing.active,
          updatedAt: updated.updatedAt || new Date().toISOString(),
        };
        this.setWebhookSubscriptions(subscriptions);

        this.log('Updated CubeCharging webhook subscription', {
          subscriptionId: subscriptions[apiKeyHash].id,
          eventCount: WEBHOOK_EVENTS.length,
        });

        return subscriptions[apiKeyHash];
      } catch (error) {
        this.error('Failed to update CubeCharging webhook subscription, creating a new one', error);
      }
    }

    const created = await api.createWebhookSubscription({
      targetUrl: this.webhookUrl,
      events: WEBHOOK_EVENTS,
      chargeBoxIds: [],
    });

    subscriptions[apiKeyHash] = {
      id: created.id,
      targetUrl: created.targetUrl || this.webhookUrl,
      events: WEBHOOK_EVENTS,
      active: created.active !== undefined ? created.active : true,
      secret: created.secret,
      createdAt: created.createdAt || new Date().toISOString(),
      updatedAt: created.updatedAt || new Date().toISOString(),
    };
    this.setWebhookSubscriptions(subscriptions);

    this.log('Created CubeCharging webhook subscription', {
      subscriptionId: created.id,
      eventCount: WEBHOOK_EVENTS.length,
      hasSignatureSecret: Boolean(created.secret),
    });

    return subscriptions[apiKeyHash];
  }

  getWebhookSecrets() {
    const subscriptions = this.getWebhookSubscriptions();

    return Object.values(subscriptions)
      .map(subscription => subscription && subscription.secret)
      .filter(Boolean);
  }

  verifyWebhookSignature(args) {
    const signature = getHeader(args.headers, 'X-CubeSignature');
    const payload = toSignaturePayload(args);
    const secrets = this.getWebhookSecrets();

    if (!signature || secrets.length === 0) {
      this.log('CubeCharging webhook signature verification skipped: signature or stored secret missing');
      return true;
    }

    if (!payload) {
      this.log('CubeCharging webhook signature verification skipped: raw payload unavailable from Homey webhook');
      return true;
    }

    return secrets.some(secret => verifyCubeSignature({ payload, signature, secret }));
  }

  async handleCubeChargeWebhook(args) {
    if (!this.verifyWebhookSignature(args)) {
      this.error('Rejected CubeCharging webhook with invalid signature');
      return;
    }

    const payload = args.body || {};
    const eventType = payload.eventType || getHeader(args.headers, 'X-CubeEvent');
    const chargeBoxId = getChargeBoxId(payload);

    if (!isSupportedEvent(eventType)) {
      this.log('Ignored unsupported CubeCharging webhook event', { eventType });
      return;
    }

    if (!chargeBoxId) {
      this.error('Ignored CubeCharging webhook without chargeBoxId', { eventType });
      return;
    }

    const driver = this.homey.drivers.getDriver('chargebox');
    const devices = driver.getDevices();
    const device = devices.find(item => String(item.getData().id) === String(chargeBoxId));

    if (!device) {
      this.log('Ignored CubeCharging webhook for unknown charge box', {
        eventType,
        chargeBoxId,
      });
      return;
    }

    await device.onCubeChargeWebhook({
      eventType,
      payload,
      headers: args.headers || {},
    });
  }
}

module.exports = CubeChargeApp;
