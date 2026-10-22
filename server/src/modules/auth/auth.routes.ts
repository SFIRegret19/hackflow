import { Router, type CookieOptions, type RequestHandler } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { env } from "../../config/env.ts";
import { prisma } from "../../config/prisma.ts";
import { requireAuth } from "./auth.middleware.ts";

export const authRouter = Router();

const COOKIE_NAME = "hackflow_token";
const TOKEN_TTL_SECONDS = 24 * 60 * 60;

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: TOKEN_TTL_SECONDS * 1000,
};

const emailSchema = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email())
  .transform((email) => email.toLowerCase());

const passwordSchema = z
  .string()
  .min(12, "Пароль должен содержать минимум 12 символов")
  .refine(
    (password) => Buffer.byteLength(password, "utf8") <= 72,
    "Пароль не должен превышать 72 байта в UTF-8",
  );

const registerSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(100).optional(),
  password: passwordSchema,
});

const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

function sendValidationError(
  res: Parameters<RequestHandler>[1],
  issues: z.ZodIssue[],
): void {
  res.status(400).json({
    error: "VALIDATION_ERROR",
    details: issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  });
}

function hasPrismaErrorCode(
  error: unknown,
  code: string,
): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

// POST /api/auth/register
const registerHandler: RequestHandler = async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    sendValidationError(res, parsed.error.issues);
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name ?? null,
        passwordHash,
        roles: {
          create: {
            role: "PARTICIPANT",
          },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        roles: {
          select: {
            role: true,
          },
        },
      },
    });

    res.status(201).json({
      message: "Аккаунт успешно создан.",
      user,
    });
  } catch (error) {
    if (hasPrismaErrorCode(error, "P2002")) {
      res.status(409).json({
        error: "EMAIL_ALREADY_EXISTS",
        message: "Пользователь с таким email уже существует.",
      });
      return;
    }

    console.error("Registration failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось создать аккаунт.",
    });
  }
};

// POST /api/auth/login
const loginHandler: RequestHandler = async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    sendValidationError(res, parsed.error.issues);
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: {
        email: parsed.data.email,
      },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        roles: {
          select: {
            role: true,
          },
        },
      },
    });

    const passwordIsValid =
      user !== null &&
      (await bcrypt.compare(parsed.data.password, user.passwordHash));

    if (!user || !passwordIsValid) {
      res.status(401).json({
        error: "INVALID_CREDENTIALS",
        message: "Неверный email или пароль.",
      });
      return;
    }

    const token = jwt.sign(
      { sub: user.id },
      env.JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: TOKEN_TTL_SECONDS,
        issuer: "hackflow-api",
        audience: "hackflow-web",
      },
    );

    res.cookie(COOKIE_NAME, token, cookieOptions);

    res.status(200).json({
      message: "Вход выполнен.",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
      },
    });
  } catch (error) {
    console.error("Login failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось выполнить вход.",
    });
  }
};

// GET /api/auth/me
const meHandler: RequestHandler = async (req, res) => {
  const userId = req.auth?.userId;

  if (!userId) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Требуется авторизация.",
    });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        roles: {
          select: {
            role: true,
          },
        },
      },
    });

    if (!user) {
      res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });

      res.status(401).json({
        error: "USER_NOT_FOUND",
        message: "Пользователь больше не существует.",
      });
      return;
    }

    res.status(200).json({ user });
  } catch (error) {
    console.error("Fetching current user failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось получить данные пользователя.",
    });
  }
};

// POST /api/auth/logout
const logoutHandler: RequestHandler = (_req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  res.status(200).json({
    message: "Выход выполнен.",
  });
};

authRouter.post("/register", registerHandler);
authRouter.post("/login", loginHandler);
authRouter.get("/me", requireAuth, meHandler);
authRouter.post("/logout", logoutHandler);