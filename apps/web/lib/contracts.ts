import { z } from 'zod';
export const signInSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(1024),
});
export const environmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  APP_ALLOWED_EMAIL: z.string().email().default('matthewirving99@gmail.com'),
});
