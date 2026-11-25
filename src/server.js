// Process entry point: start the HTTP server and shut down cleanly on SIGTERM/SIGINT
// (systemd sends SIGTERM on `systemctl restart`).
import { config } from './config.js';
import { createApp } from './app.js';

const app = createApp(config);
const server = app.listen(config.port, config.host, () => {
  console.log(
    `RxLens listening on http://${config.host}:${config.port} (env=${config.env}, server=${config.serverName}, apiKey=${config.openFda.apiKey ? 'set' : 'not set'})`,
  );
});

function shutdown(signal) {
  console.log(`${signal} received, closing server…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
