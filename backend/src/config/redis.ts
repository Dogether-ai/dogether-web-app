import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
let useMemoryFallback = false;

// Create standard Redis client
const client = createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 2) {
        // Stop reconnecting and switch silently to memory mode
        useMemoryFallback = true;
        return false;
      }
      return 1000; // wait 1s between attempts
    }
  }
});

// Suppress unhandled errors by logging them once and switching to memory fallback
client.on('error', (err) => {
  if (!useMemoryFallback) {
    console.warn('⚠️ Local Redis is offline or not installed. Switching backend to in-memory mode.');
    useMemoryFallback = true;
  }
});

(async () => {
  try {
    await client.connect();
    console.log('🚀 Connected to Redis successfully');
  } catch (error) {
    console.warn('⚠️ Redis connection failed. Falling back to in-memory simulation mode.');
    useMemoryFallback = true;
  }
})();

// In-memory fallback structures
interface ActiveUser {
  userId: string;
  lat: number;
  lng: number;
}

const memoryUsers = new Map<string, ActiveUser>();
const memoryKeys = new Map<string, { value: string; expiry: number }>();

// Export a wrapper client that routes calls to memory if connection is offline
const redisClient = {
  async geoAdd(key: string, data: { longitude: number; latitude: number; member: string }) {
    if (!useMemoryFallback) {
      try {
        return await client.geoAdd(key, data);
      } catch (err) {
        useMemoryFallback = true;
      }
    }
    
    if (key === 'active_users') {
      memoryUsers.set(data.member, {
        userId: data.member,
        lat: data.latitude,
        lng: data.longitude
      });
    }
    return 1;
  },

  async set(key: string, value: string, options?: { EX?: number }) {
    if (!useMemoryFallback) {
      try {
        return await client.set(key, value, options);
      } catch (err) {
        useMemoryFallback = true;
      }
    }

    const expiry = options?.EX ? Date.now() + options.EX * 1000 : Infinity;
    memoryKeys.set(key, { value, expiry });
    return 'OK';
  },

  async get(key: string) {
    if (!useMemoryFallback) {
      try {
        return await client.get(key);
      } catch (err) {
        useMemoryFallback = true;
      }
    }

    const item = memoryKeys.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      memoryKeys.delete(key);
      return null;
    }
    return item.value;
  },

  async zRem(key: string, member: string) {
    if (!useMemoryFallback) {
      try {
        return await client.zRem(key, member);
      } catch (err) {
        useMemoryFallback = true;
      }
    }

    if (key === 'active_users') {
      memoryUsers.delete(member);
    }
  },

  async geoPos(key: string, members: string | string[]) {
    const memberList = Array.isArray(members) ? members : [members];
    if (!useMemoryFallback) {
      try {
        return await client.geoPos(key, memberList);
      } catch (err) {
        useMemoryFallback = true;
      }
    }

    if (key !== 'active_users') {
      return memberList.map(() => null);
    }

    return memberList.map(m => {
      const user = memoryUsers.get(m);
      if (user) {
        return { longitude: user.lng, latitude: user.lat };
      }
      return null;
    });
  },

  async geoSearch(key: string, center: { longitude: number; latitude: number }, options: { radius: number; unit: any }) {
    if (!useMemoryFallback) {
      try {
        return await client.geoSearch(key, center, options);
      } catch (err) {
        useMemoryFallback = true;
      }
    }

    if (key !== 'active_users') return [];

    const results: string[] = [];
    const radius = options.radius;

    const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371; // Earth's radius in km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    const now = Date.now();
    for (const [userId, user] of memoryUsers.entries()) {
      const companionKey = `active_user:${userId}`;
      const companion = memoryKeys.get(companionKey);
      
      if (!companion || now > companion.expiry) {
        memoryUsers.delete(userId);
        memoryKeys.delete(companionKey);
        continue;
      }

      const distance = getDistance(center.latitude, center.longitude, user.lat, user.lng);
      if (distance <= radius) {
        results.push(userId);
      }
    }

    return results;
  }
};

export default redisClient;
