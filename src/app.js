import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  }
  next();
});

// API Routes
app.use('/api', routes);

// Root info
app.get('/', (_req, res) => {
  res.json({
    name: 'Kuramanime API',
    version: '1.0.0',
    description: 'Unofficial Kuramanime anime scraping API',
    endpoints: [
      'GET /api/home',
      'GET /api/anime',
      'GET /api/anime?search=...&order_by=...&genre=...&season=...&type=...&page=...',
      'GET /api/anime/:id',
      'GET /api/anime/:id/:slug',
      'GET /api/anime/:id/episode/:ep',
      'GET /api/anime/:id/episode/:ep/stream?server=kuramadrive',
      'GET /api/anime/:id/batch/:range',
      'GET /api/anime/:id/:slug/batch/:range',
      'GET /api/quick/:type',
      'GET /api/properties/:type',
      'GET /api/schedule/:day',
      'GET /api/search?q=...',
    ],
  });
});

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint tidak ditemukan' });
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  res.status(500).json({
    success: false,
    error: err.message || 'Terjadi kesalahan internal',
  });
});

export default app;
