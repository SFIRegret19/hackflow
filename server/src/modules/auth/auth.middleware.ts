import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.ts";

export const requireAuth: RequestHandler = (req, res, next) => {
  const token = req.cookies?.hackflow_token;

  if (typeof token !== "string" || token.length === 0) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Требуется авторизация.",
    });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "hackflow-api",
      audience: "hackflow-web",
    });

    if (typeof payload === "string" || typeof payload.sub !== "string") {
      res.status(401).json({
        error: "INVALID_TOKEN",
        message: "Недействительный токен авторизации.",
      });
      return;
    }

    req.auth = {
      userId: payload.sub,
    };

    next();
  } catch {
    res.status(401).json({
      error: "INVALID_TOKEN",
      message: "Токен истёк или недействителен.",
    });
  }
};