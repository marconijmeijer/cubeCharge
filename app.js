const Homey = require('homey');

class CubeChargeApp extends Homey.App {
  async onInit() {
    this.log('CubeCharge Homey app is running');
  }
}

module.exports = CubeChargeApp;
