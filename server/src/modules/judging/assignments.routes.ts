import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.ts";
import { requireAuth } from "../auth/auth.middleware.ts";
import { requireRole } from "../auth/role.middleware.ts";

export const organizerJudgesRouter = Router({ mergeParams: true });

organizerJudgesRouter.use(requireAuth, requireRole("ORGANIZER"));

const assignJudgeSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) =>
    value.toLowerCase()
  ),
});

function getRouteParam(value: unknown): string | null {
  const param = Array.isArray(value) ? value[0] : value;

  if (typeof param !== "string" || param.trim().length === 0) {
    return null;
  }

  return param;
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

const listJudgesHandler: RequestHandler = async (req, res) => {
  try {
    const userId = req.auth?.userId;
    const hackathonId = getRouteParam(req.params.hackathonId);

    if (!userId) {
      res.status(401).json({ message: "Требуется авторизация." });
      return;
    }

    if (!hackathonId) {
      res.status(400).json({ message: "Некорректный ID хакатона." });
      return;
    }

    const hackathon = await prisma.hackathon.findFirst({
      where: {
        id: hackathonId,
        createdById: userId,
      },
      select: { id: true },
    });

    if (!hackathon) {
      res.status(404).json({
        message: "Хакатон не найден или у вас нет доступа.",
      });
      return;
    }

    const assignments = await prisma.hackathonJudge.findMany({
      where: { hackathonId },
      orderBy: { assignedAt: "asc" },
      include: {
        judge: {
          select: {
            id: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    res.json({
      judges: assignments.map((assignment) => ({
        assignmentId: assignment.id,
        judgeId: assignment.judge.id,
        user: assignment.judge.user,
        assignedAt: assignment.assignedAt,
      })),
    });
  } catch {
    res.status(500).json({
      message: "Не удалось загрузить список судей.",
    });
  }
};

const assignJudgeHandler: RequestHandler = async (req, res) => {
  try {
    const userId = req.auth?.userId;
    const hackathonId = getRouteParam(req.params.hackathonId);

    if (!userId) {
      res.status(401).json({ message: "Требуется авторизация." });
      return;
    }

    if (!hackathonId) {
      res.status(400).json({ message: "Некорректный ID хакатона." });
      return;
    }

    const parsed = assignJudgeSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        message: "Укажите корректный email зарегистрированного пользователя.",
        issues: parsed.error.issues,
      });
      return;
    }

    const hackathon = await prisma.hackathon.findFirst({
      where: {
        id: hackathonId,
        createdById: userId,
      },
      select: { id: true },
    });

    if (!hackathon) {
      res.status(404).json({
        message: "Хакатон не найден или у вас нет доступа.",
      });
      return;
    }

    const targetUser = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!targetUser) {
      res.status(404).json({
        message: "Пользователь с таким email не зарегистрирован.",
      });
      return;
    }

    const judge = await prisma.$transaction(async (tx) => {
      await tx.userRole.upsert({
        where: {
          userId_role: {
            userId: targetUser.id,
            role: "JUDGE",
          },
        },
        create: {
          userId: targetUser.id,
          role: "JUDGE",
        },
        update: {},
      });

      const judgeRecord = await tx.judge.upsert({
        where: { userId: targetUser.id },
        create: { userId: targetUser.id },
        update: {},
      });

      const assignment = await tx.hackathonJudge.create({
        data: {
          hackathonId,
          judgeId: judgeRecord.id,
        },
      });

      return {
        assignment,
        judgeRecord,
      };
    });

    res.status(201).json({
      message: "Судья назначен на хакатон.",
      judge: {
        assignmentId: judge.assignment.id,
        judgeId: judge.judgeRecord.id,
        user: targetUser,
        assignedAt: judge.assignment.assignedAt,
      },
    });
  } catch (error) {
    if (hasPrismaErrorCode(error, "P2002")) {
      res.status(409).json({
        message: "Этот пользователь уже назначен судьёй на данный хакатон.",
      });
      return;
    }

    res.status(500).json({
      message: "Не удалось назначить судью.",
    });
  }
};

organizerJudgesRouter.get("/", listJudgesHandler);
organizerJudgesRouter.post("/", assignJudgeHandler);