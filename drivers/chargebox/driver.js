// ...existing code from chargebox.driver.js...
const Homey = require('homey');
const CubeChargeAPI = require('../../lib/cubecharge-api');

class ChargeBoxDriver extends Homey.Driver {
  async onPair(session) {
    let apiKey;
    let devicesPromise;
    let devicesError;

    session.setHandler('save_api_key', async data => {
      apiKey = data && data.apiKey;
      devicesPromise = null;
      devicesError = null;

      if (!apiKey) {
        throw new Error('Missing CubeCharging API key.');
      }

      return true;
    });

    const loadDevices = async () => {
      if (!apiKey) {
        throw new Error('Enter your CubeCharging API key first.');
      }

      if (!devicesPromise) {
        devicesPromise = (async () => {
          const api = new CubeChargeAPI({
            apiKey,
            log: this.log.bind(this),
          });

          const boxes = await api.getChargeBoxes();

          return boxes.map(box => {
            const chargeBoxId = box.chargeBoxId || box.id;

            if (!chargeBoxId) {
              throw new Error('Charge box response is missing chargeBoxId.');
            }

            return {
              name: box.description || chargeBoxId,
              data: { id: String(chargeBoxId) },
              store: { apiKey },
            };
          });
        })().catch(error => {
          devicesPromise = null;
          throw error;
        });
      }

      return devicesPromise;
    };

    session.setHandler('load_devices', async () => {
      devicesError = null;

      try {
        await loadDevices();
        return true;
      } catch (error) {
        devicesError = error;
        throw error;
      }
    });

    session.setHandler('list_devices', async () => {
      if (devicesError) {
        const error = devicesError;
        devicesError = null;
        throw error;
      }

      return loadDevices();
    });
  }
}

module.exports = ChargeBoxDriver;
