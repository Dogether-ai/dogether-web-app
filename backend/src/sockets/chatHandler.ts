import { Server, Socket } from 'socket.io';
import prisma from '../config/database';

export const handleChatSockets = (io: Server, socket: Socket) => {
  // Join a user-specific room for direct notifications
  socket.on('join_user', (data: { userId: string }) => {
    const { userId } = data;
    if (userId) {
      socket.join(`user_${userId}`);
      console.log(`[Socket] User ${socket.id} joined user room user_${userId}`);
    }
  });

  // Join a specific task session room
  socket.on('join_session', (data: { sessionId: string }) => {
    const { sessionId } = data;
    if (sessionId) {
      socket.join(`session_${sessionId}`);
      console.log(`[Socket] User ${socket.id} joined room session_${sessionId}`);
    }
  });

  // Handle real-time sending of messages
  socket.on('send_message', async (data: { sessionId: string; senderId: string; content: string; imageUrl?: string }) => {
    const { sessionId, senderId, content, imageUrl } = data;
    if (!sessionId || !senderId || (!content && !imageUrl)) {
      console.warn('Invalid send_message payload received:', data);
      return;
    }

    try {
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

      // Broadcast to everyone in the room
      io.to(`session_${sessionId}`).emit('receive_message', message);
      console.log(`[Socket] Message broadcasted in session_${sessionId} from ${senderId}`);
    } catch (error) {
      console.error('[Socket Error] Failed to process message:', error);
    }
  });

  // Handle payment confirmation updates
  socket.on('trigger_payment_status', (data: { sessionId: string; paymentStatus: string; status: string }) => {
    const { sessionId, paymentStatus, status } = data;
    if (sessionId) {
      io.to(`session_${sessionId}`).emit('payment_status_updated', {
        paymentStatus,
        status
      });
      console.log(`[Socket] Broadcasted payment update for session_${sessionId}: ${paymentStatus}`);
    }
  });
};
