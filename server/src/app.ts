import cors from "cors";
import express from "express";
import cookieParser from "cookie-parser";

import { env } from "./config/env.ts";
import { prisma } from "./config/prisma.ts";
import { authRouter } from "./modules/auth/auth.routes.ts";
import { requireAuth } from "./modules/auth/auth.middleware.ts";
import { requireRole } from "./modules/auth/role.middleware.ts";
import { publicHackathonRouter, organizerHackathonRouter } from "./modules/hackathons/hackathon.routes.ts";
import { criteriaRouter } from "./modules/hackathons/criteria.routes.ts";

const app = express();

const allowedOrigins = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "hackflow-api",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/health/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    res.status(503).json({
      status: "error",
      database: "unavailable",
    });
  }
});

app.use("/api/auth", authRouter);

app.get(
  "/api/organizer/dashboard",
  requireAuth,
  requireRole("ORGANIZER"),
  (_req, res) => {
    res.status(200).json({
      status: "ok",
      message: "Доступ организатора подтверждён.",
    });
  },
);

app.use("/api/hackathons", publicHackathonRouter);

app.use(
  "/api/organizer/hackathons/:hackathonId/criteria",
  criteriaRouter,
);

app.use("/api/organizer/hackathons", organizerHackathonRouter);

app.listen(env.PORT, "127.0.0.1", () => {
  console.log(
    `HackFlow API listening at http://127.0.0.1:${env.PORT}`,
  );
});