import { Router, type RequestHandler } from "express";
import { prisma } from "../../config/prisma.ts";
import { requireAuth } from "../auth/auth.middleware.ts";
import { requireRole } from "../auth/role.middleware.ts";

export const organizerResultsRouter = Router({ mergeParams: true });

organizerResultsRouter.use(requireAuth, requireRole("ORGANIZER"));

function getRouteParam(value: unknown): string | null {
  const param = Array.isArray(value) ? value[0] : value;

  if (typeof param !== "string" || param.trim().length === 0) {
    return null;
  }

  return param;
}

const getHackathonResultsHandler: RequestHandler = async (req, res) => {
  try {
    const userId = req.auth?.userId;
    const hackathonId = getRouteParam(req.params.hackathonId);

    if (!userId) {
      res.status(401).json({
        message: "Требуется авторизация.",
      });
      return;
    }

    if (!hackathonId) {
      res.status(400).json({
        message: "Некорректный ID хакатона.",
      });
      return;
    }

    // Организатор может просматривать результаты только своего хакатона.
    const hackathon = await prisma.hackathon.findFirst({
      where: {
        id: hackathonId,
        createdById: userId,
      },
      select: {
        id: true,
        name: true,
        status: true,
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
        message: "Хакатон не найден или у вас нет доступа.",
      });
      return;
    }

    const maxScore = hackathon.criteria.reduce(
      (sum, criterion) => sum + criterion.maxScore,
      0,
    );

    // В рейтинг попадают только поданные проекты.
    // Среди оценок учитываем только окончательно отправленные.
    const projects = await prisma.project.findMany({
      where: {
        status: "SUBMITTED",
        team: {
          is: { hackathonId },
        },
      },
      orderBy: [
        { submittedAt: "asc" },
        { createdAt: "asc" },
      ],
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
          where: { status: "SUBMITTED" },
          orderBy: [
            { submittedAt: "asc" },
            { createdAt: "asc" },
          ],
          select: {
            id: true,
            submittedAt: true,
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
            grades: {
              select: {
                criterionId: true,
                score: true,
                comment: true,
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
        },
      },
    });

    const projectsWithResults = projects.map((project) => {
      const evaluations = project.evaluations.map((evaluation) => {
        const totalScore = evaluation.grades.reduce(
          (sum, grade) => sum + grade.score,
          0,
        );

        return {
          id: evaluation.id,
          submittedAt: evaluation.submittedAt,
          judge: evaluation.judge,
          totalScore,
          maxScore,
          grades: evaluation.grades,
        };
      });

      const averageScore =
        evaluations.length > 0
          ? Math.round(
              (evaluations.reduce(
                (sum, evaluation) => sum + evaluation.totalScore,
                0,
              ) /
                evaluations.length) *
                100,
            ) / 100
          : null;

      return {
        id: project.id,
        name: project.name,
        description: project.description,
        repositoryUrl: project.repositoryUrl,
        submittedAt: project.submittedAt,
        team: project.team,
        evaluationCount: evaluations.length,
        maxScore,
        averageScore,
        evaluations,
        rank: null as number | null,
      };
    });

    // Сначала проекты с оценками, затем без оценок.
    // При равном среднем балле место также будет одинаковым.
    const orderedProjects = [...projectsWithResults].sort((a, b) => {
      if (a.averageScore === null && b.averageScore !== null) return 1;
      if (a.averageScore !== null && b.averageScore === null) return -1;

      if (a.averageScore !== null && b.averageScore !== null) {
        const scoreDifference = b.averageScore - a.averageScore;

        if (scoreDifference !== 0) return scoreDifference;
      }

      return (
        (a.submittedAt?.getTime() ?? 0) -
        (b.submittedAt?.getTime() ?? 0)
      );
    });

    let ratedPosition = 0;
    let currentRank = 0;
    let previousAverage: number | null = null;

    const rankedProjects = orderedProjects.map((project) => {
      if (project.averageScore === null) {
        return { ...project, rank: null };
      }

      ratedPosition += 1;

      if (
        previousAverage === null ||
        project.averageScore !== previousAverage
      ) {
        currentRank = ratedPosition;
      }

      previousAverage = project.averageScore;

      return {
        ...project,
        rank: currentRank,
      };
    });

    res.json({
      hackathon: {
        id: hackathon.id,
        name: hackathon.name,
        status: hackathon.status,
        maxScore,
      },
      criteria: hackathon.criteria,
      projects: rankedProjects,
    });
  } catch {
    res.status(500).json({
      message: "Не удалось загрузить результаты хакатона.",
    });
  }
};

organizerResultsRouter.get("/", getHackathonResultsHandler);