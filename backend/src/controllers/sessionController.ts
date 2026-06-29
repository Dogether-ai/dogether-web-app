import { Response } from 'express';
import prisma from '../config/database';
import { AuthenticatedRequest } from '../middleware/auth';

export const createSession = async (req: AuthenticatedRequest, res: Response) => {
  const { taskId } = req.body;
  const helperId = req.userId;

  if (!helperId) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!taskId) {
    return res.status(400).json({ error: 'Task ID is required.' });
  }

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { creator: true }
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    if (task.creatorId === helperId) {
      return res.status(400).json({ error: 'You cannot apply to your own task.' });
    }

    // Check if session already exists
    let session = await prisma.taskSession.findFirst({
      where: {
        taskId,
        helperId,
      },
      include: {
        task: true,
        client: {
          select: { id: true, name: true, avatarUrl: true, rating: true }
        },
        helper: {
          select: { id: true, name: true, avatarUrl: true, rating: true }
        }
      }
    });

    if (!session) {
      session = await prisma.taskSession.create({
        data: {
          taskId,
          clientId: task.creatorId,
          helperId,
          status: 'JOINED'
        },
        include: {
          task: true,
          client: {
            select: { id: true, name: true, avatarUrl: true, rating: true }
          },
          helper: {
            select: { id: true, name: true, avatarUrl: true, rating: true }
          }
        }
      });

      // Also set task status to ACTIVE if it was OPEN
      if (task.status === 'OPEN') {
        await prisma.task.update({
          where: { id: taskId },
          data: { status: 'ACTIVE' }
        });
      }
    }

    // Emit notification to helper and creator about session creation
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${task.creatorId}`).to(`user_${helperId}`).emit('session_created', {
        sessionId: session.id
      });
      console.log(`[Socket] Emitted session_created for session ${session.id} to user_${task.creatorId} and user_${helperId}`);
    }

    return res.status(201).json({
      message: 'Session initiated successfully',
      session
    });
  } catch (error) {
    console.error('Create session error:', error);
    return res.status(500).json({ error: 'Server error. Failed to join task.' });
  }
};

export const getSession = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  try {
    const session = await prisma.taskSession.findUnique({
      where: { id },
      include: {
        task: true,
        client: {
          select: { id: true, name: true, avatarUrl: true, rating: true, bio: true, interests: true, instagram: true, telegram: true }
        },
        helper: {
          select: { id: true, name: true, avatarUrl: true, rating: true, bio: true, interests: true, instagram: true, telegram: true }
        },
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    if (session.clientId !== userId && session.helperId !== userId) {
      return res.status(403).json({ error: 'Unauthorized to view this session.' });
    }

    return res.status(200).json({ session });
  } catch (error) {
    console.error('Get session error:', error);
    return res.status(500).json({ error: 'Server error. Failed to retrieve session.' });
  }
};

export const getUserSessions = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  try {
    const sessions = await prisma.taskSession.findMany({
      where: {
        OR: [
          { clientId: userId },
          { helperId: userId }
        ]
      },
      include: {
        task: true,
        client: {
          select: { id: true, name: true, avatarUrl: true, rating: true }
        },
        helper: {
          select: { id: true, name: true, avatarUrl: true, rating: true }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    return res.status(200).json({ sessions });
  } catch (error) {
    console.error('Get user sessions error:', error);
    return res.status(500).json({ error: 'Server error. Failed to retrieve user sessions.' });
  }
};

export const sendMessage = async (req: AuthenticatedRequest, res: Response) => {
  const { id: sessionId } = req.params;
  const { content, imageUrl } = req.body;
  const senderId = req.userId;

  if (!senderId) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!content && !imageUrl) {
    return res.status(400).json({ error: 'Message content or image is required.' });
  }

  try {
    const session = await prisma.taskSession.findUnique({
      where: { id: sessionId }
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    if (session.clientId !== senderId && session.helperId !== senderId) {
      return res.status(403).json({ error: 'Unauthorized to post to this session.' });
    }

    const message = await prisma.message.create({
      data: {
        sessionId,
        senderId,
        content: content || '',
        imageUrl: imageUrl || null
      }
    });

    // Update session timestamp
    await prisma.taskSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() }
    });

    return res.status(201).json({ message });
  } catch (error) {
    console.error('Send message error:', error);
    return res.status(500).json({ error: 'Server error. Failed to send message.' });
  }
};

export const processPayment = async (req: AuthenticatedRequest, res: Response) => {
  const { id: sessionId } = req.params;
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  try {
    const session = await prisma.taskSession.findUnique({
      where: { id: sessionId },
      include: { task: true }
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    if (session.clientId !== userId) {
      return res.status(403).json({ error: 'Only the task creator can initiate payment.' });
    }

    // Update session status to COMPLETED and paymentStatus to PAID
    const updatedSession = await prisma.taskSession.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        paymentStatus: 'PAID'
      }
    });

    // Mark task as COMPLETED
    await prisma.task.update({
      where: { id: session.taskId },
      data: { status: 'COMPLETED' }
    });

    // Emit notification to session room and user specific rooms for real-time dashboard update
    const io = req.app.get('io');
    if (io) {
      io.to(`session_${sessionId}`).emit('payment_status_updated', {
        paymentStatus: 'PAID',
        status: 'COMPLETED'
      });
      io.to(`user_${session.clientId}`).to(`user_${session.helperId}`).emit('payment_status_updated', {
        sessionId,
        paymentStatus: 'PAID',
        status: 'COMPLETED'
      });
      console.log(`[Socket] Emitted payment_status_updated for session ${sessionId} to room and user specific rooms`);
    }

    return res.status(200).json({
      message: 'Payment processed successfully and task marked completed.',
      session: updatedSession
    });
  } catch (error) {
    console.error('Process payment error:', error);
    return res.status(500).json({ error: 'Server error. Failed to process payment.' });
  }
};
