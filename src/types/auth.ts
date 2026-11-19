import { z } from 'zod';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  hasSeenOnboarding: boolean;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  hasSeenOnboarding: boolean;
  createdAt: string;
}

export interface Session {
  token: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

export const SignupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').trim(),
  email: z.string().email('Invalid email address').trim().toLowerCase(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export type SignupDTO = z.infer<typeof SignupSchema>;

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export type LoginDTO = z.infer<typeof LoginSchema>;

