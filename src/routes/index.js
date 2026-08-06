import { Router } from 'express';
import {
  homeController,
  animeListController,
  animeDetailController,
  episodeController,
  streamController,
  scheduleController,
  searchController,
  quickListController,
  propertiesController,
} from '../controllers/kuramanimeController.js';

const router = Router();

// Home / Beranda
router.get('/', homeController);
router.get('/home', homeController);

// Daftar Anime + Search + Filter
router.get('/anime', animeListController);

// Quick Lists
router.get('/quick/:type', quickListController);

// Properties
router.get('/properties/:type', propertiesController);

// Jadwal
router.get('/schedule', scheduleController);
router.get('/schedule/:day', scheduleController);

// Search
router.get('/search', searchController);

// Detail Anime
router.get('/anime/:id', animeDetailController);
router.get('/anime/:id/:slug', animeDetailController);

// Episode metadata
router.get('/anime/:id/episode/:ep', episodeController);

// Stream URL (butuh auth token)
router.get('/anime/:id/episode/:ep/stream', streamController);

export default router;
