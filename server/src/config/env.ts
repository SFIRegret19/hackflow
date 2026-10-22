import dotenv from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

dotenv.config({
  path: resolve(process.cwd(), "../.env"),
});

const envSchema = z.object({
  SMTP_HOST: z.string().default("127.0.0.1"),
  SMTP_PORT: z.coerce.number().int().positive().default(10250),
  MAIL_FROM: z.string().default("HackFlow <no-reply@hackflow.local>"),
  CLIENT_URL: z.string().url().default("http://127.0.0.1:5173"),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export const env = envSchema.parse(process.env);