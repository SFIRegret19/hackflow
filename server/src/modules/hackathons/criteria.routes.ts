import {
  Router,
  type RequestHandler,
  type Response,
} from "express";
import { z } from "zod";

import { prisma } from "../../config/prisma.ts";
import { requireAuth } from "../auth/auth.middleware.ts";
import { requireRole } from "../auth/role.middleware.ts";

export const criteriaRouter = Router({ mergeParams: true });

criteriaRouter.use(requireAuth, requireRole("ORGANIZER"));

const criterionNameSchema = z.string().trim().min(2).max(120);

const descriptionSchema = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => value || null);

const scoreSchema = z.number().int().min(1).max(1000);

const createCriterionSchema = z.object({
  name: criterionNameSchema,
  description: descriptionSchema.optional(),
  maxScore: scoreSchema,
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

const updateCriterionSchema = z.object({
  name: criterionNameSchema.optional(),
  description: descriptionSchema.optional(),
  maxScore: scoreSchema.optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

function getRouteParam(value: unknown): string | null {
  const param = Array.isArray(value) ? value[0] : value;

  if (typeof param !== "string" || param.trim().length === 0) {
    return null;
  }

  return param;
}

function getUserId(req: Parameters<RequestHandler>[0]): string | null {
  return req.auth?.userId ?? null;
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

/**
 * Проверяет существование хакатона и принадлежность организатору.
 * При необходимости запрещает операции после публикации.
 */
async function ensureOwnedHackathon(
  hackathonId: string,
  userId: string,
  res: Response,
  draftOnly: boolean,
): Promise<boolean> {
  const hackathon = await prisma.hackathon.findFirst({
    where: {
      id: hackathonId,
      createdById: userId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!hackathon) {
    res.status(404).json({
      error: "HACKATHON_NOT_FOUND",
      message: "Хакатон не найден.",
    });

    return false;
  }

  if (draftOnly && hackathon.status !== "DRAFT") {
    res.status(409).json({
      error: "HACKATHON_NOT_DRAFT",
      message: "Критерии можно изменять только у черновика.",
    });

    return false;
  }

  return true;
}

// GET /api/organizer/hackathons/:hackathonId/criteria
const listCriteriaHandler: RequestHandler = async (req, res) => {
  const userId = getUserId(req);
  const hackathonId = getRouteParam(req.params.hackathonId);

  if (!userId) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Требуется авторизация.",
    });
    return;
  }

  if (!hackathonId) {
    res.status(400).json({
      error: "INVALID_HACKATHON_ID",
      message: "Некорректный идентификатор хакатона.",
    });
    return;
  }

  try {
    const owned = await ensureOwnedHackathon(
      hackathonId,
      userId,
      res,
      false,
    );

    if (!owned) return;

    const criteria = await prisma.criterion.findMany({
      where: {
        hackathonId,
      },
      orderBy: [
        { sortOrder: "asc" },
        { createdAt: "asc" },
      ],
    });

    res.status(200).json({ criteria });
  } catch (error) {
    console.error("Listing criteria failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось получить критерии.",
    });
  }
};

// POST /api/organizer/hackathons/:hackathonId/criteria
const createCriterionHandler: RequestHandler = async (req, res) => {
  const userId = getUserId(req);
  const hackathonId = getRouteParam(req.params.hackathonId);

  if (!userId) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Требуется авторизация.",
    });
    return;
  }

  if (!hackathonId) {
    res.status(400).json({
      error: "INVALID_HACKATHON_ID",
      message: "Некорректный идентификатор хакатона.",
    });
    return;
  }

  const parsed = createCriterionSchema.safeParse(req.body);

  if (!parsed.success) {
    sendValidationError(res, parsed.error.issues);
    return;
  }

  try {
    const owned = await ensureOwnedHackathon(
      hackathonId,
      userId,
      res,
      true,
    );

    if (!owned) return;

    const criterion = await prisma.criterion.create({
      data: {
        hackathonId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        maxScore: parsed.data.maxScore,
        sortOrder: parsed.data.sortOrder ?? 0,
      },
    });

    res.status(201).json({
      message: "Критерий создан.",
      criterion,
    });
  } catch (error) {
    if (hasPrismaErrorCode(error, "P2002")) {
      res.status(409).json({
        error: "CRITERION_NAME_EXISTS",
        message: "Критерий с таким названием уже существует.",
      });
      return;
    }

    console.error("Creating criterion failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось создать критерий.",
    });
  }
};

// PATCH /api/organizer/hackathons/:hackathonId/criteria/:criterionId
const updateCriterionHandler: RequestHandler = async (req, res) => {
  const userId = getUserId(req);
  const hackathonId = getRouteParam(req.params.hackathonId);
  const criterionId = getRouteParam(req.params.criterionId);

  if (!userId) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Требуется авторизация.",
    });
    return;
  }

  if (!hackathonId || !criterionId) {
    res.status(400).json({
      error: "INVALID_ROUTE_PARAMETER",
      message: "Некорректный идентификатор хакатона или критерия.",
    });
    return;
  }

  const parsed = updateCriterionSchema.safeParse(req.body);

  if (!parsed.success) {
    sendValidationError(res, parsed.error.issues);
    return;
  }

  if (Object.values(parsed.data).every((value) => value === undefined)) {
    res.status(400).json({
      error: "EMPTY_UPDATE",
      message: "Укажи хотя бы одно поле для изменения.",
    });
    return;
  }

  try {
    const owned = await ensureOwnedHackathon(
      hackathonId,
      userId,
      res,
      true,
    );

    if (!owned) return;

    const existing = await prisma.criterion.findFirst({
      where: {
        id: criterionId,
        hackathonId,
      },
    });

    if (!existing) {
      res.status(404).json({
        error: "CRITERION_NOT_FOUND",
        message: "Критерий не найден в этом хакатоне.",
      });
      return;
    }

    const criterion = await prisma.criterion.update({
      where: {
        id: existing.id,
      },
      data: {
        ...(parsed.data.name !== undefined
          ? { name: parsed.data.name }
          : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
        ...(parsed.data.maxScore !== undefined
          ? { maxScore: parsed.data.maxScore }
          : {}),
        ...(parsed.data.sortOrder !== undefined
          ? { sortOrder: parsed.data.sortOrder }
          : {}),
      },
    });

    res.status(200).json({
      message: "Критерий обновлён.",
      criterion,
    });
  } catch (error) {
    if (hasPrismaErrorCode(error, "P2002")) {
      res.status(409).json({
        error: "CRITERION_NAME_EXISTS",
        message: "Критерий с таким названием уже существует.",
      });
      return;
    }

    console.error("Updating criterion failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось изменить критерий.",
    });
  }
};

// DELETE /api/organizer/hackathons/:hackathonId/criteria/:criterionId
const deleteCriterionHandler: RequestHandler = async (req, res) => {
  const userId = getUserId(req);
  const hackathonId = getRouteParam(req.params.hackathonId);
  const criterionId = getRouteParam(req.params.criterionId);

  if (!userId) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Требуется авторизация.",
    });
    return;
  }

  if (!hackathonId || !criterionId) {
    res.status(400).json({
      error: "INVALID_ROUTE_PARAMETER",
      message: "Некорректный идентификатор хакатона или критерия.",
    });
    return;
  }

  try {
    const owned = await ensureOwnedHackathon(
      hackathonId,
      userId,
      res,
      true,
    );

    if (!owned) return;

    const criterion = await prisma.criterion.findFirst({
      where: {
        id: criterionId,
        hackathonId,
      },
    });

    if (!criterion) {
      res.status(404).json({
        error: "CRITERION_NOT_FOUND",
        message: "Критерий не найден в этом хакатоне.",
      });
      return;
    }

    const gradeCount = await prisma.grade.count({
      where: {
        criterionId,
      },
    });

    if (gradeCount > 0) {
      res.status(409).json({
        error: "CRITERION_IN_USE",
        message: "Нельзя удалить критерий, по которому уже есть оценки.",
      });
      return;
    }

    await prisma.criterion.delete({
      where: {
        id: criterion.id,
      },
    });

    res.status(200).json({
      message: "Критерий удалён.",
      criterionId,
    });
  } catch (error) {
    console.error("Deleting criterion failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось удалить критерий.",
    });
  }
};

criteriaRouter.get("/", listCriteriaHandler);
criteriaRouter.post("/", createCriterionHandler);
criteriaRouter.patch("/:criterionId", updateCriterionHandler);
criteriaRouter.delete("/:criterionId", deleteCriterionHandler);