const logger = require("../core/logger");

function simpleLoopWorker(task, interval = 30000) {
  let stopped = false;

  async function loop() {
    while (!stopped) {
      try {
        await task();
      } catch (err) {
        logger.error("Worker task gagal", { error: err });
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }

  loop();

  return {
    stop() {
      stopped = true;
      logger.warn("Worker dihentikan");
    },
  };
}

module.exports = { simpleLoopWorker };
