import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import routes from './routes/index.js';
import { openApiSpec } from './docs/openapi.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  }
  next();
});

app.get('/openapi.json', (_req, res) => res.json(openApiSpec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  explorer: true,
  customSiteTitle: 'Kuramanime API Docs',
}));
app.use('/api', routes);

app.get('/', (_req, res) => {
  res.json({
    name: 'Kuramanime API',
    version: '1.0.0',
    description: 'Unofficial Kuramanime anime scraping API',
    documentation: '/docs',
    openapi: '/openapi.json',
    endpoints: {
      home: 'GET /api/home',
      animeList: 'GET /api/anime?search=&order_by=text&page=1',
      search: 'GET /api/search?q=one+piece',
      animeDetail: 'GET /api/anime/:id/:slug?',
      episode: 'GET /api/anime/:id/episode/:ep',
      stream: 'GET /api/anime/:id/episode/:ep/stream?server=kuramadrive',
      batch: 'GET /api/anime/:id/:slug?/batch/:range',
      quickList: 'GET /api/quick/:type?page=1&limit=20&includeImages=true',
      properties: 'GET /api/properties/:type',
      schedule: 'GET /api/schedule/:day?',
    },
  });
});

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint tidak ditemukan' });
});

app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  res.status(500).json({
    success: false,
    error: err.message || 'Terjadi kesalahan internal',
  });
});

export default app;
