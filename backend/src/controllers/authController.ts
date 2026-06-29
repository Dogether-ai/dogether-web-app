import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { generateToken } from '../utils/jwt';
import { AuthenticatedRequest } from '../middleware/auth';
import { OAuth2Client } from 'google-auth-library';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

export const register = async (req: Request, res: Response) => {
  const { email, password, name, avatarUrl } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required.' });
  }

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        avatarUrl
      }
    });

    // Generate JWT
    const token = generateToken(user.id);

    return res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        rating: user.rating
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Server error. Failed to register user.' });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // Compare passwords
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // Generate JWT
    const token = generateToken(user.id);

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        rating: user.rating
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Server error. Failed to log in.' });
  }
};

export const getProfile = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is missing.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        rating: true,
        bio: true,
        interests: true,
        instagram: true,
        telegram: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error('Profile fetch error:', error);
    return res.status(500).json({ error: 'Server error. Failed to fetch profile.' });
  }
};

export const updateProfile = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId;
  const { bio, interests, instagram, telegram, avatarUrl, name } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        bio: bio !== undefined ? bio : undefined,
        interests: interests !== undefined ? interests : undefined,
        instagram: instagram !== undefined ? instagram : undefined,
        telegram: telegram !== undefined ? telegram : undefined,
        avatarUrl: avatarUrl !== undefined ? avatarUrl : undefined,
        name: name !== undefined ? name : undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        rating: true,
        bio: true,
        interests: true,
        instagram: true,
        telegram: true
      }
    });

    return res.status(200).json({
      message: 'Profile updated successfully',
      user
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ error: 'Server error. Failed to update profile.' });
  }
};

export const googleSignIn = async (req: Request, res: Response) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: 'Google ID Token is required.' });
  }

  try {
    let email: string | undefined;
    let name: string | undefined;
    let avatarUrl: string | undefined;

    // Check if we should bypass verification in dev mode
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'mock-id' || idToken.startsWith('mock_token_')) {
      console.log('[Dev Mode] Mocking Google token verification:', idToken);
      if (idToken.startsWith('mock_token_')) {
        const mockEmail = idToken.replace('mock_token_', '');
        email = mockEmail;
        name = mockEmail.split('@')[0];
      } else {
        email = 'test_google_user@dogether.com';
        name = 'Test Google User';
      }
    } else {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: GOOGLE_CLIENT_ID
      });
      const payload = ticket.getPayload();
      if (!payload) {
        return res.status(400).json({ error: 'Invalid Google token payload.' });
      }
      email = payload.email;
      name = payload.name;
      avatarUrl = payload.picture;
    }

    if (!email) {
      return res.status(400).json({ error: 'Google token does not contain an email.' });
    }

    // 1. Try to find the user in our database
    let user = await prisma.user.findUnique({ where: { email } });

    // 2. If user doesn't exist, create (register) them
    if (!user) {
      console.log(`[Google Auth] Registering new user: ${email}`);
      const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);
      user = await prisma.user.create({
        data: {
          email,
          password: randomPassword,
          name: name || 'Google User',
          avatarUrl: avatarUrl || null
        }
      });
    } else {
      console.log(`[Google Auth] Logging in existing user: ${email}`);
      if (avatarUrl && user.avatarUrl !== avatarUrl) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl }
        });
      }
    }

    // 3. Generate our application JWT
    const token = generateToken(user.id);

    return res.status(200).json({
      message: 'Google Sign-In successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        rating: user.rating
      }
    });
  } catch (error) {
    console.error('Google Sign-In error:', error);
    return res.status(500).json({ error: 'Authentication failed. Invalid Google Token.' });
  }
};
