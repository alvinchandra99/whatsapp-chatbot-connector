import { createClient } from "redis";
import { config } from "../config";

const redis = createClient({ url: config.REDIS_URL, password: config.REDIS_PASSWORD });

if (config.SESSION_DATABASE === "redis") {
  redis.on("error", (err) => console.error("Redis Client Error", err));

  (async () => {
    await redis.connect();
  })();
}

export default redis;
