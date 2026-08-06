import 'dotenv/config';
import app from './app.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Kuramanime API running at http://localhost:${PORT}`);
  console.log(`   Base URL: ${process.env.KUMA_BASE_URL || 'https://v19.kuramanime.ing'}`);
  if (process.env.KUMA_PROXY) {
    console.log(`   Proxy: ${process.env.KUMA_PROXY}`);
  }
});
