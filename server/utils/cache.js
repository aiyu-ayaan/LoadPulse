import { createClient } from "redis";

const resolveRedisUrl = () => process.env.REDIS_URL?.trim() ?? "";
const resolveDefaultTtlSeconds = () => Math.max(1, Number(process.env.REDIS_DEFAULT_TTL_SECONDS ?? 30) || 30);

let redisClient = null;
let redisReady = false;
let initializing = null;
let redisUrl = "";
let defaultTtlSeconds = 30;

const logPrefix = "[cache]";

const safely = async (task, fallback = null) => {
  try {
    return await task();
  } catch (error) {
    console.warn(`${logPrefix} ${String(error?.message ?? error)}`);
    return fallback;
  }
};

export const initCache = async () => {
  redisUrl = resolveRedisUrl();
  defaultTtlSeconds = resolveDefaultTtlSeconds();

  if (!redisUrl) {
    console.log(`${logPrefix} Redis disabled (REDIS_URL not configured).`);
    return;
  }
  if (redisReady || initializing) {
    return initializing;
  }

  redisClient = createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 50, 1_000),
    },
  });

  redisClient.on("error", (error) => {
    console.warn(`${logPrefix} ${String(error?.message ?? error)}`);
  });
  redisClient.on("ready", () => {
    redisReady = true;
    console.log(`${logPrefix} Connected to Redis.`);
  });
  redisClient.on("end", () => {
    redisReady = false;
  });

  initializing = redisClient.connect().catch((error) => {
    redisReady = false;
    console.warn(`${logPrefix} Failed to connect: ${String(error?.message ?? error)}`);
  });

  await initializing;
  initializing = null;
};

export const isCacheReady = () => redisReady && Boolean(redisClient);

export const getCacheHealth = () =>
  !(redisUrl || resolveRedisUrl())
    ? "disabled"
    : isCacheReady()
      ? "up"
      : "down";

export const getCachedJson = async (key) => {
  if (!isCacheReady()) {
    return null;
  }

  return safely(async () => {
    const payload = await redisClient.get(key);
    if (!payload) {
      return null;
    }
    return JSON.parse(payload);
  });
};

export const setCachedJson = async (key, value, ttlSeconds = defaultTtlSeconds) => {
  if (!isCacheReady()) {
    return;
  }

  await safely(() =>
    redisClient.set(key, JSON.stringify(value), {
      EX: Math.max(1, Number(ttlSeconds) || defaultTtlSeconds),
    }),
  );
};

export const deleteCachedKey = async (key) => {
  if (!isCacheReady()) {
    return;
  }
  await safely(() => redisClient.del(key));
};

export const deleteCacheByPrefix = async (prefix) => {
  if (!isCacheReady()) {
    return;
  }

  const keys = [];
  await safely(async () => {
    for await (const key of redisClient.scanIterator({ MATCH: `${prefix}*`, COUNT: 200 })) {
      keys.push(key);
    }
  });

  if (keys.length === 0) {
    return;
  }

  await safely(() => redisClient.del(keys));
};
