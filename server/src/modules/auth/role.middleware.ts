import type { RequestHandler } from "express";

import { prisma } from "../../config/prisma.ts";
import type { GlobalRole } from "../../generated/prisma/client.ts";

export function requireRole(
  ...allowedRoles: GlobalRole[]
): RequestHandler {
  return async (req, res, next) => {
    const userId = req.auth?.userId;

    if (!userId) {
      res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Сначала необходимо войти в аккаунт.",
      });
      return;
    }

    try {
      const userRole = await prisma.userRole.findFirst({
        where: {
          userId,
          role: {
            in: allowedRoles,
          },
        },
        select: {
          role: true,
        },
      });

      if (!userRole) {
        res.status(403).json({
          error: "FORBIDDEN",
          message: "Недостаточно прав для выполнения действия.",
        });
        return;
      }

      next();
    } catch (error) {
      console.error("Role verification failed:", error);

      res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Не удалось проверить права доступа.",
      });
    }
  };
}