const cacheParameters = [
  {
    name: 'noCache',
    in: 'query',
    description: 'Lewati pembacaan dan penulisan cache untuk request ini.',
    schema: { type: 'boolean', default: false },
  },
  {
    name: 'refreshCache',
    in: 'query',
    description: 'Hapus cache lama, ambil data terbaru, lalu simpan hasil baru.',
    schema: { type: 'boolean', default: false },
  },
];

const operation = (summary, parameters = []) => ({
  summary,
  parameters: [...parameters, ...cacheParameters],
  responses: {
    200: {
      description: 'Berhasil',
      headers: {
        'X-Cache': {
          description: 'Status cache: HIT, MISS, BYPASS, atau REFRESH.',
          schema: { type: 'string' },
        },
      },
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiResponse' },
        },
      },
    },
    400: { description: 'Parameter tidak valid' },
    500: { description: 'Gagal mengambil data upstream' },
  },
});

const path = (name, description) => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'string' },
});

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Kuramanime API',
    version: '1.0.0',
    description: 'Unofficial REST API Kuramanime. Cover anime diperkaya dari halaman detail dan disimpan 6 jam di memory serta 7 hari di Redis bila REDIS_URL tersedia.',
  },
  servers: [{ url: '/', description: 'Current server' }],
  tags: [
    { name: 'Anime' },
    { name: 'Episode' },
    { name: 'Discovery' },
  ],
  paths: {
    '/api/home': {
      get: { ...operation('Beranda dan anime terbaru'), tags: ['Discovery'] },
    },
    '/api/anime': {
      get: {
        ...operation('Daftar dan pencarian anime', [
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'order_by', in: 'query', schema: { type: 'string', default: 'text' } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'genre', in: 'query', schema: { type: 'string' } },
          { name: 'season', in: 'query', schema: { type: 'string' } },
          { name: 'type', in: 'query', schema: { type: 'string' } },
        ]),
        tags: ['Anime'],
      },
    },
    '/api/search': {
      get: {
        ...operation('Pencarian cepat', [
          { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 2 } },
        ]),
        tags: ['Discovery'],
      },
    },
    '/api/anime/{id}': {
      get: { ...operation('Detail anime', [path('id', 'ID numerik atau slug anime')]), tags: ['Anime'] },
    },
    '/api/anime/{id}/{slug}': {
      get: {
        ...operation('Detail anime dengan ID dan slug', [path('id', 'ID anime'), path('slug', 'Slug anime')]),
        tags: ['Anime'],
      },
    },
    '/api/anime/{id}/episode/{ep}': {
      get: {
        ...operation('Metadata episode, download, dan stream Kuramadrive', [
          path('id', 'ID numerik atau slug anime'),
          path('ep', 'Nomor episode'),
        ]),
        tags: ['Episode'],
        description: 'Response mencakup slug anime, cover, streamUrl Kuramadrive, navigation, dan seluruh daftar episodes.',
      },
    },
    '/api/anime/{id}/episode/{ep}/stream': {
      get: {
        ...operation('URL stream dari server tertentu', [
          path('id', 'ID anime'),
          path('ep', 'Nomor episode'),
          { name: 'server', in: 'query', required: true, schema: { type: 'string', example: 'kuramadrive' } },
        ]),
        tags: ['Episode'],
      },
    },
    '/api/anime/{id}/batch/{range}': {
      get: {
        ...operation('Link download batch', [
          path('id', 'ID numerik atau slug anime'),
          path('range', 'Rentang episode, misalnya 1-12'),
        ]),
        tags: ['Episode'],
      },
    },
    '/api/anime/{id}/{slug}/batch/{range}': {
      get: {
        ...operation('Link download batch dengan ID dan slug', [
          path('id', 'ID anime'),
          path('slug', 'Slug anime'),
          path('range', 'Rentang episode, misalnya 1-12'),
        ]),
        tags: ['Episode'],
      },
    },
    '/api/quick/{type}': {
      get: {
        ...operation('Daftar cepat anime', [
          {
            name: 'type',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['ongoing', 'finished', 'upcoming', 'movie', 'donghua'] },
          },
          {
            name: 'page',
            in: 'query',
            description: 'Halaman hasil. Default 1.',
            schema: { type: 'integer', minimum: 1, default: 1 },
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Jumlah item per halaman. Default 20, maksimum 50.',
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          },
          {
            name: 'includeImages',
            in: 'query',
            description: 'Isi properti img dari cover detail. Gunakan false untuk response cold-cache yang lebih cepat.',
            schema: { type: 'boolean', default: true },
          },
        ]),
        tags: ['Discovery'],
        description: 'Mengembalikan quick list dengan pagination API-side. Cover hanya diambil untuk item pada halaman yang diminta, bukan seluruh daftar.',
      },
    },
    '/api/properties/{type}': {
      get: {
        ...operation('Daftar properti anime', [path('type', 'genre, season, studio, type, quality, source, atau country')]),
        tags: ['Discovery'],
      },
    },
    '/api/schedule/{day}': {
      get: {
        ...operation('Jadwal berdasarkan hari', [path('day', 'Nama hari Indonesia atau Inggris')]),
        tags: ['Discovery'],
        description: 'Setiap item jadwal mencakup ID dan slug anime, informasi episode, waktu tayang, cover, dan URL detail.',
      },
    },
    '/api/schedule': {
      get: { ...operation('Jadwal hari default'), tags: ['Discovery'] },
    },
  },
  components: {
    schemas: {
      ApiResponse: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'object', additionalProperties: true },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string' },
        },
      },
    },
  },
};
