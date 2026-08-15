import 'dotenv/config';
import app from './app.js';
import { closeStreamBrowser } from './services/streamAuth.js';
import { closeCacheStore } from './services/cacheStore.js';

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Kuramanime API running at http://localhost:${PORT}`);
  console.log(`   Base URL: ${process.env.KUMA_BASE_URL || 'https://v19.kuramanime.ing'}`);
  if (process.env.KUMA_PROXY) {
    console.log(`   Proxy: ${process.env.KUMA_PROXY}`);
  }
});

async function shutdown(signal) {
  console.log(`\n${signal} received — shutting down...`);
  server.close();
  await Promise.all([
    closeStreamBrowser().catch(() => {}),
    closeCacheStore().catch(() => {}),
  ]);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
