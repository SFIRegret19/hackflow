import {
  Router,
  type RequestHandler,
  type Response,
} from "express";
import { z } from "zod";

import { prisma } from "../../config/prisma.ts";
import { requireAuth } from "../auth/auth.middleware.ts";

export const teamProjectsRouter = Router({ mergeParams: true });

teamProjectsRouter.use(requireAuth);

const projectSchema = z.object({
  name: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(10000),
  repositoryUrl: z
    .string()
    .trim()
    .url()
    .max(2048)
    .refine((value) => {
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    }, "Ссылка на репозиторий должна использовать HTTPS."),
});

function getRouteParam(value: unknown): string | null {
  const param = Array.isArray(value) ? value[0] : value;

  if (typeof param !== "string" || param.trim().length === 0) {
    return null;
  }

  return param;
}

function sendValidationError(
  res: Response,
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

const teamProjectInclude = {
  hackathon: {
    select: {
      id: true,
      name: true,
      status: true,
      startAt: true,
      endAt: true,
    },
  },
  members: {
    select: {
      userId: true,
      role: true,
    },
  },
  project: true,
};

// GET /api/teams/:teamId/project
const getProjectHandler: RequestHandler = async (req, res) => {
  const userId = req.auth?.userId;
  const teamId = getRouteParam(req.params.teamId);

  if (!userId) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Требуется авторизация.",
    });
    return;
  }

  if (!teamId) {
    res.status(400).json({
      error: "INVALID_TEAM_ID",
      message: "Некорректный идентификатор команды.",
    });
    return;
  }

  try {
    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        members: {
          some: { userId },
        },
      },
      include: teamProjectInclude,
    });

    if (!team) {
      res.status(404).json({
        error: "TEAM_NOT_FOUND",
        message: "Команда не найдена или у тебя нет к ней доступа.",
      });
      return;
    }

    res.status(200).json({
      project: team.project,
      team: {
        id: team.id,
        name: team.name,
        memberCount: team.members.length,
        currentUserRole:
          team.members.find((member) => member.userId === userId)?.role ??
          null,
      },
      hackathon: team.hackathon,
    });
  } catch (error) {
    console.error("Getting team project failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось получить проект.",
    });
  }
};

// PUT /api/teams/:teamId/project
// Создаёт либо обновляет черновик проекта.
const saveProjectHandler: RequestHandler = async (req, res) => {
  const userId = req.auth?.userId;
  const teamId = getRouteParam(req.params.teamId);

  if (!userId) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Требуется авторизация.",
    });
    return;
  }

  if (!teamId) {
    res.status(400).json({
      error: "INVALID_TEAM_ID",
      message: "Некорректный идентификатор команды.",
    });
    return;
  }

  const parsed = projectSchema.safeParse(req.body);

  if (!parsed.success) {
    sendValidationError(res, parsed.error.issues);
    return;
  }

  try {
    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        members: {
          some: { userId },
        },
      },
      include: teamProjectInclude,
    });

    if (!team) {
      res.status(404).json({
        error: "TEAM_NOT_FOUND",
        message: "Команда не найдена или у тебя нет к ней доступа.",
      });
      return;
    }

    const currentMember = team.members.find(
      (member) => member.userId === userId,
    );

    if (currentMember?.role !== "CAPTAIN") {
      res.status(403).json({
        error: "CAPTAIN_REQUIRED",
        message: "Изменять проект может только капитан команды.",
      });
      return;
    }

    if (
      team.hackathon.status !== "PUBLISHED" ||
      team.hackathon.endAt <= new Date()
    ) {
      res.status(409).json({
        error: "PROJECT_SUBMISSION_CLOSED",
        message: "Нельзя редактировать проект вне периода проведения хакатона.",
      });
      return;
    }

    if (team.project?.status === "SUBMITTED") {
      res.status(409).json({
        error: "PROJECT_ALREADY_SUBMITTED",
        message: "Отправленный проект нельзя изменять.",
      });
      return;
    }

    const data = {
      name: parsed.data.name,
      description: parsed.data.description,
      repositoryUrl: parsed.data.repositoryUrl,
    };

    let project;

    if (team.project) {
      // Обновляем только пока проект остаётся черновиком.
      // Это также защищает от одновременного сохранения и отправки.
      const updated = await prisma.project.updateMany({
        where: {
          id: team.project.id,
          status: "DRAFT",
        },
        data,
      });

      if (updated.count !== 1) {
        res.status(409).json({
          error: "PROJECT_ALREADY_SUBMITTED",
          message: "Проект уже отправлен либо изменён другим запросом.",
        });
        return;
      }

      project = await prisma.project.findUnique({
        where: {
          id: team.project.id,
        },
      });
    } else {
      project = await prisma.project.create({
        data: {
          teamId,
          ...data,
          status: "DRAFT",
        },
      });
    }

    res.status(200).json({
      message: "Черновик проекта сохранён.",
      project,
    });
  } catch (error) {
    if (hasPrismaErrorCode(error, "P2002")) {
      res.status(409).json({
        error: "PROJECT_ALREADY_EXISTS",
        message: "У этой команды уже существует проект.",
      });
      return;
    }

    console.error("Saving project failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось сохранить проект.",
    });
  }
};

// POST /api/teams/:teamId/project/submit
const submitProjectHandler: RequestHandler = async (req, res) => {
  const userId = req.auth?.userId;
  const teamId = getRouteParam(req.params.teamId);

  if (!userId) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Требуется авторизация.",
    });
    return;
  }

  if (!teamId) {
    res.status(400).json({
      error: "INVALID_TEAM_ID",
      message: "Некорректный идентификатор команды.",
    });
    return;
  }

  try {
    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        members: {
          some: { userId },
        },
      },
      include: teamProjectInclude,
    });

    if (!team) {
      res.status(404).json({
        error: "TEAM_NOT_FOUND",
        message: "Команда не найдена или у тебя нет к ней доступа.",
      });
      return;
    }

    const currentMember = team.members.find(
      (member) => member.userId === userId,
    );

    if (currentMember?.role !== "CAPTAIN") {
      res.status(403).json({
        error: "CAPTAIN_REQUIRED",
        message: "Отправить проект может только капитан команды.",
      });
      return;
    }

    // Проверяем состав до изменения статуса проекта.
    if (team.members.length < 2) {
      res.status(409).json({
        error: "TEAM_TOO_SMALL",
        message: "Для отправки проекта команда должна состоять минимум из двух участников.",
        memberCount: team.members.length,
        minimumMembers: 2,
      });
      return;
    }

    if (
      team.hackathon.status !== "PUBLISHED" ||
      team.hackathon.endAt <= new Date()
    ) {
      res.status(409).json({
        error: "PROJECT_SUBMISSION_CLOSED",
        message: "Приём проектов для этого хакатона закрыт.",
      });
      return;
    }

    if (!team.project) {
      res.status(404).json({
        error: "PROJECT_NOT_FOUND",
        message: "Сначала создай и сохрани черновик проекта.",
      });
      return;
    }

    if (team.project.status === "SUBMITTED") {
      res.status(409).json({
        error: "PROJECT_ALREADY_SUBMITTED",
        message: "Проект уже отправлен. Повторная отправка запрещена.",
      });
      return;
    }

    const submittedAt = new Date();

    const result = await prisma.project.updateMany({
      where: {
        id: team.project.id,
        teamId,
        status: "DRAFT",
      },
      data: {
        status: "SUBMITTED",
        submittedAt,
      },
    });

    if (result.count !== 1) {
      res.status(409).json({
        error: "PROJECT_ALREADY_SUBMITTED",
        message: "Проект уже отправлен или изменён другим запросом.",
      });
      return;
    }

    const project = await prisma.project.findUnique({
      where: {
        id: team.project.id,
      },
    });

    res.status(200).json({
      message: "Проект успешно отправлен на оценивание.",
      project,
    });
  } catch (error) {
    console.error("Submitting project failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось отправить проект.",
    });
  }
};

teamProjectsRouter.get("/", getProjectHandler);
teamProjectsRouter.put("/", saveProjectHandler);
teamProjectsRouter.post("/submit", submitProjectHandler);