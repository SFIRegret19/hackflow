import { Router, type RequestHandler } from "express";
import { prisma } from "../../config/prisma.ts";
import { requireAuth } from "../auth/auth.middleware.ts";
import { requireRole } from "../auth/role.middleware.ts";
import { z } from "zod";

export const judgeRouter = Router();

judgeRouter.use(requireAuth, requireRole("JUDGE"));

function getRouteParam(value: unknown): string | null {
  const param = Array.isArray(value) ? value[0] : value;

  if (typeof param !== "string" || param.trim().length === 0) {
    return null;
  }

  return param;
}

// GET /api/judge/hackathons
const listAssignedHackathons: RequestHandler = async (req, res) => {
  try {
    const userId = req.auth?.userId;

    if (!userId) {
      res.status(401).json({ message: "Требуется авторизация." });
      return;
    }

    const assignments = await prisma.hackathonJudge.findMany({
      where: {
        judge: {
          is: { userId },
        },
      },
      orderBy: { assignedAt: "desc" },
      select: {
        assignedAt: true,
        hackathonId: true,
        hackathon: {
          select: {
            id: true,
            name: true,
            theme: true,
            description: true,
            startAt: true,
            endAt: true,
            status: true,
          },
        },
      },
    });

    const hackathons = await Promise.all(
      assignments.map(async (assignment) => {
        const submittedProjectCount = await prisma.project.count({
          where: {
            status: "SUBMITTED",
            team: {
              is: {
                hackathonId: assignment.hackathonId,
              },
            },
          },
        });

        return {
          ...assignment.hackathon,
          assignedAt: assignment.assignedAt,
          submittedProjectCount,
        };
      }),
    );

    res.json({ hackathons });
  } catch {
    res.status(500).json({
      message: "Не удалось загрузить назначенные хакатоны.",
    });
  }
};

// GET /api/judge/hackathons/:hackathonId/projects
const listSubmittedProjects: RequestHandler = async (req, res) => {
  try {
    const userId = req.auth?.userId;
    const hackathonId = getRouteParam(req.params.hackathonId);

    if (!userId) {
      res.status(401).json({ message: "Требуется авторизация." });
      return;
    }

    if (!hackathonId) {
      res.status(400).json({
        message: "Некорректный ID хакатона.",
      });
      return;
    }

    const assignment = await prisma.hackathonJudge.findFirst({
      where: {
        hackathonId,
        judge: {
          is: { userId },
        },
      },
      select: { id: true },
    });

    if (!assignment) {
      res.status(403).json({
        message: "Вы не назначены судьёй этого хакатона.",
      });
      return;
    }

    const hackathon = await prisma.hackathon.findUnique({
      where: { id: hackathonId },
      select: {
        id: true,
        name: true,
        criteria: {
          orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" },
          ],
          select: {
            id: true,
            name: true,
            description: true,
            maxScore: true,
            sortOrder: true,
          },
        },
      },
    });

    if (!hackathon) {
      res.status(404).json({
        message: "Хакатон не найден.",
      });
      return;
    }

    const projects = await prisma.project.findMany({
      where: {
        status: "SUBMITTED",
        team: {
          is: { hackathonId },
        },
      },
      orderBy: {
        submittedAt: "asc",
      },
      select: {
        id: true,
        name: true,
        description: true,
        repositoryUrl: true,
        submittedAt: true,
        team: {
          select: {
            id: true,
            name: true,
            members: {
              select: {
                role: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        evaluations: {
          where: {
            judge: {
              is: { userId },
            },
          },
          select: {
            id: true,
            status: true,
            submittedAt: true,
            grades: {
              select: {
                criterionId: true,
                score: true,
                comment: true,
              },
            },
          },
        },
      },
    });

    res.json({
      hackathon: {
        id: hackathon.id,
        name: hackathon.name,
      },
      criteria: hackathon.criteria,
      projects: projects.map((project) => ({
        ...project,
        evaluation: project.evaluations[0] ?? null,
        evaluations: undefined,
      })),
    });
  } catch {
    res.status(500).json({
      message: "Не удалось загрузить проекты для оценивания.",
    });
  }
};

judgeRouter.get("/hackathons", listAssignedHackathons);
judgeRouter.get(
  "/hackathons/:hackathonId/projects",
  listSubmittedProjects,
);

const evaluationDraftSchema = z
  .object({
    grades: z
      .array(
        z.object({
          criterionId: z.string().min(1),
          score: z.number().int().min(0).max(1000),
          comment: z.string().trim().max(5000).optional(),
        }),
      )
      .max(100),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>();

    value.grades.forEach((grade, index) => {
      if (seen.has(grade.criterionId)) {
        context.addIssue({
          code: "custom",
          path: ["grades", index, "criterionId"],
          message: "Критерий не должен повторяться.",
        });
      }

      seen.add(grade.criterionId);
    });
  });

async function verifyEvaluationAccess(
  userId: string,
  hackathonId: string,
  projectId: string,
): Promise<
  | { ok: true; judgeId: string }
  | { ok: false; status: 403 | 404; message: string }
> {
  const assignment = await prisma.hackathonJudge.findFirst({
    where: {
      hackathonId,
      judge: { is: { userId } },
    },
    select: { judgeId: true },
  });

  if (!assignment) {
    return {
      ok: false,
      status: 403,
      message: "Вы не назначены судьёй этого хакатона.",
    };
  }

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      status: "SUBMITTED",
      team: { is: { hackathonId } },
    },
    select: { id: true },
  });

  if (!project) {
    return {
      ok: false,
      status: 404,
      message: "Отправленный проект не найден в этом хакатоне.",
    };
  }

  return { ok: true, judgeId: assignment.judgeId };
}

function isEvaluationPrismaError(
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

// PUT /api/judge/hackathons/:hackathonId/projects/:projectId/evaluation
const saveEvaluationHandler: RequestHandler = async (req, res) => {
  try {
    const userId = req.auth?.userId;
    const hackathonId = getRouteParam(req.params.hackathonId);
    const projectId = getRouteParam(req.params.projectId);

    if (!userId) {
      res.status(401).json({ message: "Требуется авторизация." });
      return;
    }

    if (!hackathonId || !projectId) {
      res.status(400).json({
        message: "Некорректный ID хакатона или проекта.",
      });
      return;
    }

    const parsed = evaluationDraftSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        message: "Проверьте баллы и комментарии оценки.",
        issues: parsed.error.issues,
      });
      return;
    }

    const access = await verifyEvaluationAccess(
      userId,
      hackathonId,
      projectId,
    );

    if (!access.ok) {
      res.status(access.status).json({ message: access.message });
      return;
    }

    const criteria = await prisma.criterion.findMany({
      where: { hackathonId },
      select: { id: true, name: true, maxScore: true, sortOrder: true },
    });

    const criteriaById = new Map(
      criteria.map((criterion) => [criterion.id, criterion]),
    );

    for (const grade of parsed.data.grades) {
      const criterion = criteriaById.get(grade.criterionId);

      if (!criterion) {
        res.status(400).json({
          message: "Один из критериев не принадлежит этому хакатону.",
        });
        return;
      }

      if (grade.score > criterion.maxScore) {
        res.status(400).json({
          message: `Баллы по критерию «${criterion.name}» не могут превышать ${criterion.maxScore}.`,
        });
        return;
      }
    }

    const evaluation = await prisma.$transaction(async (tx) => {
      const existing = await tx.evaluation.findUnique({
        where: {
          projectId_judgeId: {
            projectId,
            judgeId: access.judgeId,
          },
        },
        select: { id: true, status: true },
      });

      if (existing?.status === "SUBMITTED") {
        throw new Error("EVALUATION_ALREADY_SUBMITTED");
      }

      let evaluationId: string;

      if (existing) {
        // Не меняем оценку, если она была отправлена параллельно.
        const updated = await tx.evaluation.updateMany({
          where: {
            id: existing.id,
            status: "DRAFT",
          },
          data: { updatedAt: new Date() },
        });

        if (updated.count !== 1) {
          throw new Error("EVALUATION_ALREADY_SUBMITTED");
        }

        evaluationId = existing.id;
      } else {
        const created = await tx.evaluation.create({
          data: {
            projectId,
            judgeId: access.judgeId,
            status: "DRAFT",
          },
          select: { id: true },
        });

        evaluationId = created.id;
      }

      // В теле запроса передаётся полный снимок черновика.
      await tx.grade.deleteMany({
        where: { evaluationId },
      });

      if (parsed.data.grades.length > 0) {
        await tx.grade.createMany({
          data: parsed.data.grades.map((grade) => ({
            evaluationId,
            criterionId: grade.criterionId,
            score: grade.score,
            comment: grade.comment?.trim() || null,
          })),
        });
      }

      return tx.evaluation.findUniqueOrThrow({
        where: { id: evaluationId },
        include: {
          grades: {
            include: {
              criterion: {
                select: {
                  id: true,
                  name: true,
                  maxScore: true,
                  sortOrder: true,
                },
              },
            },
          },
        },
      });
    });

    res.json({
      message: "Черновик оценки сохранён.",
      evaluation,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "EVALUATION_ALREADY_SUBMITTED"
    ) {
      res.status(409).json({
        message: "Оценка уже отправлена и больше не редактируется.",
      });
      return;
    }

    if (isEvaluationPrismaError(error, "P2002")) {
      res.status(409).json({
        message: "Черновик оценки уже существует. Повторите сохранение.",
      });
      return;
    }

    res.status(500).json({
      message: "Не удалось сохранить черновик оценки.",
    });
  }
};

// POST /api/judge/hackathons/:hackathonId/projects/:projectId/evaluation/submit
const submitEvaluationHandler: RequestHandler = async (req, res) => {
  try {
    const userId = req.auth?.userId;
    const hackathonId = getRouteParam(req.params.hackathonId);
    const projectId = getRouteParam(req.params.projectId);

    if (!userId) {
      res.status(401).json({ message: "Требуется авторизация." });
      return;
    }

    if (!hackathonId || !projectId) {
      res.status(400).json({
        message: "Некорректный ID хакатона или проекта.",
      });
      return;
    }

    const access = await verifyEvaluationAccess(
      userId,
      hackathonId,
      projectId,
    );

    if (!access.ok) {
      res.status(access.status).json({ message: access.message });
      return;
    }

    const criteria = await prisma.criterion.findMany({
      where: { hackathonId },
      select: { id: true, name: true, maxScore: true },
    });

    if (criteria.length === 0) {
      res.status(409).json({
        message: "У хакатона пока нет критериев оценивания.",
      });
      return;
    }

    const existing = await prisma.evaluation.findUnique({
      where: {
        projectId_judgeId: {
          projectId,
          judgeId: access.judgeId,
        },
      },
      include: {
        grades: {
          select: {
            criterionId: true,
            score: true,
          },
        },
      },
    });

    if (!existing) {
      res.status(409).json({
        message: "Сначала сохраните черновик оценки.",
      });
      return;
    }

    if (existing.status === "SUBMITTED") {
      res.status(409).json({
        message: "Эта оценка уже отправлена.",
      });
      return;
    }

    const gradesByCriterion = new Map(
      existing.grades.map((grade) => [grade.criterionId, grade.score]),
    );

    const missingCriteria = criteria.filter(
      (criterion) => !gradesByCriterion.has(criterion.id),
    );

    if (missingCriteria.length > 0) {
      res.status(400).json({
        message: "Оцените каждый критерий перед отправкой.",
        missingCriteria: missingCriteria.map((criterion) => criterion.name),
      });
      return;
    }

    const invalidScore = criteria.find((criterion) => {
      const score = gradesByCriterion.get(criterion.id);

      return (
        score === undefined ||
        score < 0 ||
        score > criterion.maxScore
      );
    });

    if (invalidScore) {
      res.status(400).json({
        message: `Проверьте баллы по критерию «${invalidScore.name}».`,
      });
      return;
    }

    const submitted = await prisma.evaluation.updateMany({
      where: {
        id: existing.id,
        judgeId: access.judgeId,
        status: "DRAFT",
      },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });

    if (submitted.count !== 1) {
      res.status(409).json({
        message: "Оценка уже отправлена или была изменена параллельно.",
      });
      return;
    }

    const evaluation = await prisma.evaluation.findUniqueOrThrow({
      where: { id: existing.id },
      include: {
        grades: {
          include: {
            criterion: {
              select: {
                id: true,
                name: true,
                maxScore: true,
                sortOrder: true,
              },
            },
          },
        },
      },
    });

    res.json({
      message: "Оценка проекта успешно отправлена.",
      evaluation,
    });
  } catch {
    res.status(500).json({
      message: "Не удалось отправить оценку проекта.",
    });
  }
};

judgeRouter.put(
  "/hackathons/:hackathonId/projects/:projectId/evaluation",
  saveEvaluationHandler,
);

judgeRouter.post(
  "/hackathons/:hackathonId/projects/:projectId/evaluation/submit",
  submitEvaluationHandler,
);