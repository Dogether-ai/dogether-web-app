import { Server, Socket } from 'socket.io';
import redisClient from '../config/redis';
import prisma from '../config/database';

export const handleLocationSockets = (io: Server, socket: Socket) => {
  console.log(`User connected to socket: ${socket.id}`);

  // 1. Listen for location updates from clients
  socket.on('update_location', async (data: { userId: string; lat: number; lng: number }) => {
    const { userId, lat, lng } = data;
    if (!userId || lat === undefined || lng === undefined) {
      console.warn('Invalid update_location payload received:', data);
      return;
    }

    try {
      // GEOADD accepts: Key, { longitude, latitude, member }
      // Note: Redis geo coordinates require longitude first!
      await redisClient.geoAdd('active_users', {
        longitude: lng,
        latitude: lat,
        member: userId
      });

      // Since individual members in a geo index can't have separate TTLs directly,
      // we maintain a companion key with a 30s TTL.
      // This allows us to verify if the user is still active before listing them.
      await redisClient.set(`active_user:${userId}`, 'active', {
        EX: 30
      });

      console.log(`[Socket] Saved location for user ${userId}: Lat ${lat}, Lng ${lng}`);
    } catch (error) {
      console.error('[Socket Error] GEOADD failed:', error);
    }
  });

  // 2. Fetch nearby users query
  socket.on('get_nearby_users', async (data: { lat: number; lng: number; radiusKm: number }, callback) => {
    const { lat, lng, radiusKm = 5 } = data;
    if (lat === undefined || lng === undefined) {
      if (typeof callback === 'function') callback({ error: 'Invalid coordinates' });
      return;
    }

    try {
      // Find all users in Redis within radiusKm
      const results = await redisClient.geoSearch(
        'active_users',
        { longitude: lng, latitude: lat },
        { radius: radiusKm, unit: 'km' }
      );

      // Filter out stale users whose 'active_user:{userId}' key has expired
      const activeNearbyUsers: string[] = [];
      for (const userId of results) {
        const isActive = await redisClient.get(`active_user:${userId}`);
        if (isActive) {
          activeNearbyUsers.push(userId);
        } else {
          // Clean up stale users from Redis GEO set asynchronously
          redisClient.zRem('active_users', userId).catch(err => 
            console.error('[Socket] Failed to remove expired geo member:', err)
          );
        }
      }

      if (activeNearbyUsers.length === 0) {
        if (typeof callback === 'function') callback({ users: [] });
        return;
      }

      // Fetch user profile details from PostgreSQL
      const usersFromDb = await prisma.user.findMany({
        where: { id: { in: activeNearbyUsers } },
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          rating: true,
          bio: true,
          interests: true
        }
      });

      // Get positions from Redis/memory
      const positions = await redisClient.geoPos('active_users', activeNearbyUsers);

      // Map profiles with their coordinates
      const nearbyUsersWithCoords = usersFromDb.map((user) => {
        const idx = activeNearbyUsers.indexOf(user.id);
        const pos = positions[idx];
        return {
          ...user,
          lat: pos ? (typeof pos.latitude === 'string' ? parseFloat(pos.latitude) : pos.latitude) : null,
          lng: pos ? (typeof pos.longitude === 'string' ? parseFloat(pos.longitude) : pos.longitude) : null
        };
      }).filter(u => u.lat !== null && u.lng !== null);

      if (typeof callback === 'function') {
        callback({ users: nearbyUsersWithCoords });
      }
    } catch (error) {
      console.error('[Socket Error] geoSearch failed:', error);
      if (typeof callback === 'function') callback({ error: 'Failed to query locations' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected from socket: ${socket.id}`);
  });
};
