import { Response } from 'express';
import prisma from '../config/database';
import { AuthenticatedRequest } from '../middleware/auth';

export const createTask = async (req: AuthenticatedRequest, res: Response) => {
  const { title, description, price, isPaid, latitude, longitude } = req.body;
  const creatorId = req.userId;

  if (!creatorId) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!title || !description || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Title, description, latitude, and longitude are required.' });
  }

  try {
    const task = await prisma.task.create({
      data: {
        title,
        description,
        price: price ? parseFloat(price) : 0.0,
        isPaid: !!isPaid,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        creatorId
      }
    });

    return res.status(201).json({
      message: 'Task created successfully',
      task
    });
  } catch (error) {
    console.error('Create task error:', error);
    return res.status(500).json({ error: 'Server error. Failed to create task.' });
  }
};

export const getTask = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            rating: true
          }
        }
      }
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    return res.status(200).json({ task });
  } catch (error) {
    console.error('Get task error:', error);
    return res.status(500).json({ error: 'Server error. Failed to retrieve task.' });
  }
};

export const deleteTask = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    const task = await prisma.task.findUnique({ where: { id } });

    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    if (task.creatorId !== userId) {
      return res.status(403).json({ error: 'Unauthorized to delete this task.' });
    }

    await prisma.task.delete({ where: { id } });

    return res.status(200).json({ message: 'Task deleted successfully.' });
  } catch (error) {
    console.error('Delete task error:', error);
    return res.status(500).json({ error: 'Server error. Failed to delete task.' });
  }
};

export const getTasksNearby = async (req: AuthenticatedRequest, res: Response) => {
  const latStr = req.query.lat as string;
  const lngStr = req.query.lng as string;
  const radiusStr = req.query.radius as string; // in kilometers

  if (!latStr || !lngStr) {
    return res.status(400).json({ error: 'Latitude (lat) and longitude (lng) query parameters are required.' });
  }

  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);
  const radiusKm = radiusStr ? parseFloat(radiusStr) : 5.0; // default 5km

  if (isNaN(lat) || isNaN(lng) || isNaN(radiusKm)) {
    return res.status(400).json({ error: 'Latitude, longitude, and radius must be valid numbers.' });
  }

  try {
    // Geospatial search using Haversine formula with creator profile details joined
    const tasks = await prisma.$queryRawUnsafe(`
      SELECT t.id, t.title, t.description, t.price, t."isPaid", t.status, t.latitude, t.longitude, t."creatorId", t."createdAt",
             u.name AS "creatorName", u."avatarUrl" AS "creatorAvatar", u.rating AS "creatorRating", u.bio AS "creatorBio", u.interests AS "creatorInterests", u.instagram AS "creatorInstagram", u.telegram AS "creatorTelegram", (
        6371 * acos(
          cos(radians(${lat})) * cos(radians(t.latitude)) * cos(radians(t.longitude) - radians(${lng})) +
          sin(radians(${lat})) * sin(radians(t.latitude))
        )
      ) AS distance
      FROM "Task" t
      INNER JOIN "User" u ON t."creatorId" = u.id
      WHERE t.status IN ('OPEN', 'ACTIVE')
      AND (
        6371 * acos(
          cos(radians(${lat})) * cos(radians(t.latitude)) * cos(radians(t.longitude) - radians(${lng})) +
          sin(radians(${lat})) * sin(radians(t.latitude))
        )
      ) < ${radiusKm}
      ORDER BY distance
    `);

    return res.status(200).json({ tasks });
  } catch (error) {
    console.error('Fetch nearby tasks error:', error);
    return res.status(500).json({ error: 'Server error. Failed to fetch nearby tasks.' });
  }
};
