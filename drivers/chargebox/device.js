// ...existing code from chargebox.device.js...
const Homey = require('homey');
const CubeChargeAPI = require('../../lib/cubecharge-api');

const CONNECTOR_STATUS_CAPABILITY = 'cube_connector_status';

function formatConnectorStatus(status, connectorId) {
  if (!status) {
    return 'Unknown';
  }

  if (connectorId === undefined || connectorId === null) {
    return String(status);
  }

  return `Connector ${connectorId}: ${status}`;
}

class ChargeBoxDevice extends Homey.Device {
  async onInit() {
    const apiKey = this.getStoreValue('apiKey') || this.getData().apiKey;

    if (!this.hasConnectorStatusCapability()) {
      await this.addCapability(CONNECTOR_STATUS_CAPABILITY);
    }

    await this.setSettings({
      charge_box_id: String(this.getData().id),
    });

    await this.setCapabilityValue(
      CONNECTOR_STATUS_CAPABILITY,
      this.getStoreValue('connectorStatusLabel') || 'Unknown',
    );

    this.api = new CubeChargeAPI({
      apiKey,
      log: this.log.bind(this),
    });

    if (apiKey) {
      this.homey.app.ensureCubeChargeWebhookSubscription({ apiKey }).catch(error => {
        this.error('Failed to ensure CubeCharging webhook subscription', error);
      });
    }

    this.registerCapabilityListener('onoff', async (value) => {
      if (value) {
        throw new Error('Use the CubeCharging Flow card to start charging with connectorId and idTag.');
      } else {
        await this.stopCharging();
      }
      return Promise.resolve();
    });
  }

  async startCharging({ connectorId, idTag }) {
    const chargeBoxId = this.getData().id;

    if (connectorId === undefined || connectorId === null || Number.isNaN(Number(connectorId))) {
      throw new Error('Cannot start charging: connectorId is required.');
    }

    if (!idTag) {
      throw new Error('Cannot start charging: idTag is required.');
    }

    this.log('Starting CubeCharging session', {
      chargeBoxId,
      connectorId: Number(connectorId),
      idTagProvided: Boolean(idTag),
    });

    await this.api.startCharging({
      chargeBoxId,
      connectorId,
      idTag,
    });
  }

  async stopCharging() {
    const chargeBoxId = this.getData().id;
    const transactionId = this.getStoreValue('activeTransactionId');
    const connectorId = this.getStoreValue('activeConnectorId')
      || this.getStoreValue('connectorStatusConnectorId');

    this.log('Stopping CubeCharging session', {
      chargeBoxId,
      hasTransactionId: transactionId !== undefined && transactionId !== null,
      transactionId,
      connectorId,
    });

    if (transactionId === undefined && connectorId === undefined) {
      throw new Error('Cannot stop charging: no active connectorId or transactionId known yet.');
    }

    await this.api.stopCharging({
      chargeBoxId,
      transactionId,
      connectorId,
    });
  }

  async onCubeChargeWebhook({ eventType, payload }) {
    this.log('Received CubeCharging webhook event', {
      eventType,
      chargeBoxId: payload.chargeBoxId,
      connectorId: payload.connectorId,
      transactionId: payload.transactionId,
    });

    await this.setStoreValue('lastWebhookEventType', eventType);
    await this.setStoreValue('lastWebhookEventAt', new Date().toISOString());
    await this.setStoreValue('lastWebhookPayload', payload);

    if (eventType === 'Session_started') {
      await this.setActiveSession(payload);
      await this.updateConnectorStatus({
        connectorId: payload.connectorId,
        status: 'Charging',
        eventType,
      });
      await this.setCapabilityValue('onoff', true);
      return;
    }

    if (eventType === 'Session_stopped') {
      await this.clearActiveSession();
      await this.updateConnectorStatus({
        connectorId: payload.connectorId,
        status: 'Available',
        eventType,
      });
      await this.setCapabilityValue('onoff', false);
      return;
    }

    if (eventType === 'Status_changed' && payload.status) {
      if (payload.status === 'Charging') {
        await this.setActiveSession(payload);
      } else if (['Available', 'Finishing', 'Unavailable', 'Faulted'].includes(payload.status)) {
        await this.clearActiveSession();
      }

      await this.updateConnectorStatus({
        connectorId: payload.connectorId,
        status: payload.status,
        eventType,
      });

      if (payload.status === 'Charging') {
        await this.setCapabilityValue('onoff', true);
      } else if (['Available', 'Finishing', 'Unavailable', 'Faulted'].includes(payload.status)) {
        await this.setCapabilityValue('onoff', false);
      }
      return;
    }

    if (eventType === 'Status_progress') {
      await this.setActiveSession(payload);
      await this.updateConnectorStatus({
        connectorId: payload.connectorId,
        status: 'Charging',
        eventType,
      });
    }
  }

  async setActiveSession(payload) {
    if (payload.connectorId !== undefined && payload.connectorId !== null) {
      await this.setStoreValue('activeConnectorId', payload.connectorId);
    }

    if (payload.transactionId !== undefined && payload.transactionId !== null) {
      await this.setStoreValue('activeTransactionId', payload.transactionId);
    }
  }

  async clearActiveSession() {
    await this.setStoreValue('activeTransactionId', null);
    await this.setStoreValue('activeConnectorId', null);
  }

  async updateConnectorStatus({ status, connectorId, eventType }) {
    const statusLabel = formatConnectorStatus(status, connectorId);

    await this.setStoreValue('connectorStatus', status);
    await this.setStoreValue('connectorStatusConnectorId', connectorId);
    await this.setStoreValue('connectorStatusLabel', statusLabel);
    await this.setCapabilityValue(CONNECTOR_STATUS_CAPABILITY, statusLabel);

    await this.driver.triggerStatusUpdated(this, {
      status: String(status),
      connector_id: connectorId === undefined || connectorId === null ? null : Number(connectorId),
      charge_box_id: String(this.getData().id),
      event_type: eventType || 'unknown',
    });
  }

  hasConnectorStatusCapability() {
    return this.getCapabilities().includes(CONNECTOR_STATUS_CAPABILITY);
  }
}

module.exports = ChargeBoxDevice;
