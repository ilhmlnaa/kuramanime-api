import { createClient } from 'redis';

let client;
let connecting;

async function getClient() {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!client) {
    client = createClient({
      url,
      socket: {
        connectTimeout: 1000,
        reconnectStrategy: (retries) => retries >= 2 ? false : 200,
      },
    });
    client.on('error', (error) => {
      console.error('[redis]', error.message);
    });
  }

  if (!client.isOpen) {
    connecting ||= client.connect().finally(() => {
      connecting = undefined;
    });
    await connecting.catch(() => null);
  }

  return client.isReady ? client : null;
}

export const redisCacheStore = {
  async get(key) {
    return (await getClient())?.get(key) ?? null;
  },
  async set(key, value, ttl) {
    const redis = await getClient();
    if (redis) await redis.set(key, value, { EX: ttl });
  },
  async delete(key) {
    const redis = await getClient();
    if (redis) await redis.del(key);
  },
};

export async function closeCacheStore() {
  if (client?.isOpen) await client.quit();
  client = undefined;
  connecting = undefined;
}
