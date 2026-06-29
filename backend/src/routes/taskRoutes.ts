import { Router } from 'express';
import { createTask, getTask, deleteTask, getTasksNearby } from '../controllers/taskController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Secure all task routes
router.post('/', authenticate, createTask);
router.get('/nearby', authenticate, getTasksNearby);
router.get('/:id', authenticate, getTask);
router.delete('/:id', authenticate, deleteTask);

export default router;
