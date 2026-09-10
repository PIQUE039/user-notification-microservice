import { Router } from 'express';
import { register, login, getProfile, updateProfile } from '../controllers/userController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate, registerSchema, loginSchema, updateProfileSchema } from '../utils/validation.js';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.get('/profile', requireAuth, getProfile);
router.put('/profile', requireAuth, validate(updateProfileSchema), updateProfile);

export default router;
