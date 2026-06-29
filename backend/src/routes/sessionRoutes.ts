import { Router } from 'express';
import { createSession, getSession, getUserSessions, sendMessage, processPayment } from '../controllers/sessionController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Secure all session routes
router.post('/', authenticate, createSession);
router.get('/', authenticate, getUserSessions);
router.get('/:id', authenticate, getSession);
router.post('/:id/messages', authenticate, sendMessage);
router.post('/:id/pay', authenticate, processPayment);

export default router;
