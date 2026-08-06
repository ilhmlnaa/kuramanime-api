import 'dotenv/config';
import app from './app.js';
import { closeStreamBrowser } from './services/streamAuth.js';

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Kuramanime API running at http://localhost:${PORT}`);
  console.log(`   Base URL: ${process.env.KUMA_BASE_URL || 'https://v19.kuramanime.ing'}`);
  if (process.env.KUMA_PROXY) {
    console.log(`   Proxy: ${process.env.KUMA_PROXY}`);
  }
});

// Graceful shutdown: tutup browser Playwright biar tidak nyangkut
async function shutdown(signal) {
  console.log(`\n${signal} received — shutting down...`);
  server.close();
  await closeStreamBrowser().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
