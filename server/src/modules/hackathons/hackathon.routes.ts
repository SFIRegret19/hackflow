import {
  Router,
  type RequestHandler,
  type Response,
} from "express";
import { z } from "zod";

import { prisma } from "../../config/prisma.ts";
import { requireAuth } from "../auth/auth.middleware.ts";
import { requireRole } from "../auth/role.middleware.ts";

export const publicHackathonRouter = Router();
export const organizerHackathonRouter = Router();

const dateInput = z
  .string()
  .trim()
  .min(1, "Укажите дату и время.")
  .refine(
    (value) => Number.isFinite(Date.parse(value)),
    "Указана некорректная дата.",
  )
  .transform((value) => new Date(value));

const createHackathonSchema = z
  .object({
    name: z.string().trim().min(3).max(150),
    theme: z.string().trim().min(2).max(200),
    description: z.string().trim().max(10000).optional(),
    startAt: dateInput,
    endAt: dateInput,
  })
  .superRefine((data, ctx) => {
    if (data.startAt >= data.endAt) {
      ctx.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "Окончание должно быть позже начала.",
      });
    }
  });

const updateHackathonSchema = z.object({
  name: z.string().trim().min(3).max(150).optional(),
  theme: z.string().trim().min(2).max(200).optional(),
  description: z
    .string()
    .trim()
    .max(10000)
    .optional()
    .transform((value) =>
      value === undefined ? undefined : value || null,
    ),
  startAt: dateInput.optional(),
  endAt: dateInput.optional(),
});

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

function getUserId(req: Parameters<RequestHandler>[0]): string | null {
  return req.auth?.userId ?? null;
}

function getHackathonId(
  req: Parameters<RequestHandler>[0],
  res: Response,
): string | null {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (typeof id !== "string" || id.trim().length === 0) {
    res.status(400).json({
      error: "INVALID_HACKATHON_ID",
      message: "Не указан корректный идентификатор хакатона.",
    });

    return null;
  }

  return id;
}

const publicInclude = {
  _count: {
    select: {
      teams: true,
    },
  },
  criteria: {
    select: {
      id: true,
      name: true,
      maxScore: true,
      sortOrder: true,
    },
    orderBy: {
      sortOrder: "asc" as const,
    },
  },
};

const organizerInclude = {
  _count: {
    select: {
      teams: true,
    },
  },
  criteria: {
    select: {
      id: true,
      name: true,
      maxScore: true,
      sortOrder: true,
    },
    orderBy: {
      sortOrder: "asc" as const,
    },
  },
};

// GET /api/hackathons
// Только опубликованные мероприятия.
const listPublishedHandler: RequestHandler = async (_req, res) => {
  try {
    const hackathons = await prisma.hackathon.findMany({
      where: {
        status: "PUBLISHED",
      },
      orderBy: {
        startAt: "asc",
      },
      include: publicInclude,
    });

    res.status(200).json({ hackathons });
  } catch (error) {
    console.error("Listing hackathons failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось получить список хакатонов.",
    });
  }
};

// GET /api/hackathons/:id
const getPublishedHandler: RequestHandler = async (req, res) => {
    const hackathonId = getHackathonId(req, res);
    if (!hackathonId) return;
    try {
    const hackathon = await prisma.hackathon.findFirst({
      where: {
        id: hackathonId,
        status: "PUBLISHED",
      },
      include: publicInclude,
    });

    if (!hackathon) {
      res.status(404).json({
        error: "HACKATHON_NOT_FOUND",
        message: "Опубликованный хакатон не найден.",
      });
      return;
    }

    res.status(200).json({ hackathon });
  } catch (error) {
    console.error("Getting public hackathon failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось получить данные хакатона.",
    });
  }
};

publicHackathonRouter.get("/", listPublishedHandler);
publicHackathonRouter.get("/:id", getPublishedHandler);

// Все маршруты ниже требуют авторизации и роль ORGANIZER.
organizerHackathonRouter.use(
  requireAuth,
  requireRole("ORGANIZER"),
);

// GET /api/organizer/hackathons
const listOrganizerHandler: RequestHandler = async (req, res) => {
  const userId = getUserId(req);

  if (!userId) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Требуется авторизация.",
    });
    return;
  }

  try {
    const hackathons = await prisma.hackathon.findMany({
      where: {
        createdById: userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: organizerInclude,
    });

    res.status(200).json({ hackathons });
  } catch (error) {
    console.error("Listing organizer hackathons failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось получить хакатоны организатора.",
    });
  }
};

// GET /api/organizer/hackathons/:id
const getOrganizerHandler: RequestHandler = async (req, res) => {
  const userId = getUserId(req);
  const hackathonId = getHackathonId(req, res);

  if (!userId) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Требуется авторизация.",
    });
    return;
  }
  
  if (!hackathonId) return;

  try {
    const hackathon = await prisma.hackathon.findFirst({
      where: {
        id: hackathonId,
        createdById: userId,
      },
      include: organizerInclude,
    });

    if (!hackathon) {
      res.status(404).json({
        error: "HACKATHON_NOT_FOUND",
        message: "Хакатон не найден.",
      });
      return;
    }

    res.status(200).json({ hackathon });
  } catch (error) {
    console.error("Getting organizer hackathon failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось получить хакатон.",
    });
  }
};

// POST /api/organizer/hackathons
const createHandler: RequestHandler = async (req, res) => {
  const userId = getUserId(req);

  if (!userId) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Требуется авторизация.",
    });
    return;
  }

  const parsed = createHackathonSchema.safeParse(req.body);

  if (!parsed.success) {
    sendValidationError(res, parsed.error.issues);
    return;
  }

  try {
    const hackathon = await prisma.hackathon.create({
      data: {
        name: parsed.data.name,
        theme: parsed.data.theme,
        description: parsed.data.description?.trim() || null,
        startAt: parsed.data.startAt,
        endAt: parsed.data.endAt,
        status: "DRAFT",
        createdById: userId,
      },
      include: organizerInclude,
    });

    res.status(201).json({
      message: "Хакатон создан как черновик.",
      hackathon,
    });
  } catch (error) {
    console.error("Creating hackathon failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось создать хакатон.",
    });
  }
};

// PATCH /api/organizer/hackathons/:id
// Редактировать можно только собственные черновики.
const updateHandler: RequestHandler = async (req, res) => {
  const userId = getUserId(req);
  const hackathonId = getHackathonId(req, res);

  if (!hackathonId) return;

  if (!userId) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Требуется авторизация.",
    });
    return;
  }
  
  const parsed = updateHackathonSchema.safeParse(req.body);

  if (!parsed.success) {
    sendValidationError(res, parsed.error.issues);
    return;
  }

  if (!Object.values(parsed.data).some((value) => value !== undefined)) {
    res.status(400).json({
      error: "EMPTY_UPDATE",
      message: "Укажи хотя бы одно поле для изменения.",
    });
    return;
  }

  try {
    const existing = await prisma.hackathon.findFirst({
      where: {
        id: hackathonId,
        createdById: userId,
      },
    });

    if (!existing) {
      res.status(404).json({
        error: "HACKATHON_NOT_FOUND",
        message: "Хакатон не найден.",
      });
      return;
    }

    if (existing.status !== "DRAFT") {
      res.status(409).json({
        error: "HACKATHON_NOT_DRAFT",
        message: "На этом этапе редактировать можно только черновики.",
      });
      return;
    }

    const nextStartAt = parsed.data.startAt ?? existing.startAt;
    const nextEndAt = parsed.data.endAt ?? existing.endAt;

    if (nextStartAt >= nextEndAt) {
      res.status(400).json({
        error: "INVALID_DATE_RANGE",
        message: "Окончание должно быть позже начала.",
      });
      return;
    }

    const hackathon = await prisma.hackathon.update({
      where: {
        id: existing.id,
      },
      data: {
        ...(parsed.data.name !== undefined
          ? { name: parsed.data.name }
          : {}),
        ...(parsed.data.theme !== undefined
          ? { theme: parsed.data.theme }
          : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
        ...(parsed.data.startAt !== undefined
          ? { startAt: parsed.data.startAt }
          : {}),
        ...(parsed.data.endAt !== undefined
          ? { endAt: parsed.data.endAt }
          : {}),
      },
      include: organizerInclude,
    });

    res.status(200).json({
      message: "Хакатон обновлён.",
      hackathon,
    });
  } catch (error) {
    console.error("Updating hackathon failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось изменить хакатон.",
    });
  }
};

// POST /api/organizer/hackathons/:id/publish
const publishHandler: RequestHandler = async (req, res) => {
  const userId = getUserId(req);
  const hackathonId = getHackathonId(req, res);
  
  
  if (!userId) {
      res.status(401).json({
          error: "UNAUTHORIZED",
          message: "Требуется авторизация.",
        });
        return;
    }
    
  if (!hackathonId) return;

  try {
    const existing = await prisma.hackathon.findFirst({
    where: {
        id: hackathonId,
        createdById: userId,
    },
    });

    if (!existing) {
      res.status(404).json({
        error: "HACKATHON_NOT_FOUND",
        message: "Хакатон не найден.",
      });
      return;
    }

    if (existing.status !== "DRAFT") {
      res.status(409).json({
        error: "HACKATHON_NOT_DRAFT",
        message: "Опубликовать можно только черновик.",
      });
      return;
    }

    if (existing.startAt >= existing.endAt) {
      res.status(400).json({
        error: "INVALID_DATE_RANGE",
        message: "Проверь даты начала и окончания.",
      });
      return;
    }

    const criterionCount = await prisma.criterion.count({
    where: {
        hackathonId: existing.id,
    },
    });

    if (criterionCount === 0) {
    res.status(400).json({
        error: "CRITERIA_REQUIRED",
        message: "Перед публикацией добавь хотя бы один критерий оценивания.",
    });
    return;
    }

    const hackathon = await prisma.hackathon.update({
      where: {
        id: existing.id,
      },
      data: {
        status: "PUBLISHED",
      },
      include: organizerInclude,
    });

    res.status(200).json({
      message: "Хакатон опубликован.",
      hackathon,
    });
  } catch (error) {
    console.error("Publishing hackathon failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось опубликовать хакатон.",
    });
  }
};

// POST /api/organizer/hackathons/:id/cancel
const cancelHandler: RequestHandler = async (req, res) => {
  const userId = getUserId(req);
  const hackathonId = getHackathonId(req, res);

  if (!userId) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Требуется авторизация.",
    });
    return;
  }

  if (!hackathonId) return;

  try {
    const existing = await prisma.hackathon.findFirst({
      where: {
        id: hackathonId,
        createdById: userId,
      },
    });

    if (!existing) {
      res.status(404).json({
        error: "HACKATHON_NOT_FOUND",
        message: "Хакатон не найден.",
      });
      return;
    }

    if (existing.status === "CANCELLED") {
      res.status(409).json({
        error: "HACKATHON_ALREADY_CANCELLED",
        message: "Хакатон уже отменён.",
      });
      return;
    }

    const hackathon = await prisma.hackathon.update({
      where: {
        id: existing.id,
      },
      data: {
        status: "CANCELLED",
      },
      include: organizerInclude,
    });

    res.status(200).json({
      message: "Хакатон отменён.",
      hackathon,
    });
  } catch (error) {
    console.error("Cancelling hackathon failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось отменить хакатон.",
    });
  }
};

organizerHackathonRouter.get("/", listOrganizerHandler);
organizerHackathonRouter.get("/:id", getOrganizerHandler);
organizerHackathonRouter.post("/", createHandler);
organizerHackathonRouter.patch("/:id", updateHandler);
organizerHackathonRouter.post("/:id/publish", publishHandler);
organizerHackathonRouter.post("/:id/cancel", cancelHandler);