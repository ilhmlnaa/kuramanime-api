import { Router } from 'express';
import {
  homeController,
  animeListController,
  animeDetailController,
  episodeController,
  streamController,
  batchController,
  scheduleController,
  searchController,
  quickListController,
  propertiesController,
} from '../controllers/kuramanimeController.js';
import { cache } from '../middleware/cache.js';

const router = Router();

router.get('/', cache(120), homeController);
router.get('/home', cache(120), homeController);

router.get('/anime', cache(300), animeListController);

router.get('/quick/:type', cache(300), quickListController);

router.get('/properties/:type', cache(21600), propertiesController);

router.get('/schedule', cache(120), scheduleController);
router.get('/schedule/:day', cache(120), scheduleController);

router.get('/search', cache(300), searchController);

router.get('/anime/:id', cache(600), animeDetailController);
router.get('/anime/:id/:slug', cache(600), animeDetailController);

router.get('/anime/:id/batch/:range', cache(600), batchController);
router.get('/anime/:id/:slug/batch/:range', cache(600), batchController);

router.get('/anime/:id/episode/:ep', cache(120), episodeController);

router.get('/anime/:id/episode/:ep/stream', cache(60), streamController);

export default router;
