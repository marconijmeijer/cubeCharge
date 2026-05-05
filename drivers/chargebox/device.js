// ...existing code from chargebox.device.js...
const Homey = require('homey');
const CubeChargeAPI = require('../../lib/cubecharge-api');

class ChargeBoxDevice extends Homey.Device {
  async onInit() {
    this.api = new CubeChargeAPI({
      apiKey: this.getStoreValue('apiKey') || this.getData().apiKey,
    });

    this.registerCapabilityListener('onoff', async (value) => {
      if (value) {
        await this.api.startCharging(this.getData().id);
      } else {
        await this.api.stopCharging(this.getData().id);
      }
      return Promise.resolve();
    });
  }
}

module.exports = ChargeBoxDevice;
