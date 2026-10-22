import { createHash, randomBytes } from "node:crypto";
import {
  Router,
  type RequestHandler,
  type Response,
} from "express";
import { z } from "zod";

import { env } from "../../config/env.ts";
import { mailer } from "../../config/mailer.ts";
import { prisma } from "../../config/prisma.ts";
import { requireAuth } from "../auth/auth.middleware.ts";
import { requireRole } from "../auth/role.middleware.ts";

export const hackathonTeamsRouter = Router({ mergeParams: true });
export const teamsRouter = Router();
export const invitationsRouter = Router();

const teamNameSchema = z.string().trim().min(2).max(100);

const emailSchema = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email())
  .transform((email) => email.toLowerCase());

const createTeamSchema = z.object({
  name: teamNameSchema,
});

const createInvitationSchema = z.object({
  email: emailSchema,
});

const acceptInvitationSchema = z.object({
  token: z.string().trim().length(64),
});

function getParam(value: unknown): string | null {
  const param = Array.isArray(value) ? value[0] : value;

  if (typeof param !== "string" || !param.trim()) {
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

function hasPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const teamInclude = {
  hackathon: {
    select: {
      id: true,
      name: true,
      theme: true,
      startAt: true,
      endAt: true,
      status: true,
    },
  },
  members: {
    orderBy: {
      joinedAt: "asc" as const,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  project: {
    select: {
      id: true,
      name: true,
      status: true,
      submittedAt: true,
    },
  },
};

// POST /api/hackathons/:hackathonId/teams
hackathonTeamsRouter.use(requireAuth);

const createTeamHandler: RequestHandler = async (req, res) => {
  const userId = req.auth?.userId;
  const hackathonId = getParam(req.params.hackathonId);

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

  const parsed = createTeamSchema.safeParse(req.body);

  if (!parsed.success) {
    sendValidationError(res, parsed.error.issues);
    return;
  }

  try {
    const hackathon = await prisma.hackathon.findUnique({
      where: { id: hackathonId },
      select: {
        id: true,
        status: true,
        startAt: true,
      },
    });

    if (
      !hackathon ||
      hackathon.status !== "PUBLISHED" ||
      hackathon.startAt <= new Date()
    ) {
      res.status(409).json({
        error: "REGISTRATION_CLOSED",
        message: "Регистрация команд на этот хакатон недоступна.",
      });
      return;
    }

    const existingMembership = await prisma.member.findFirst({
      where: {
        userId,
        team: { hackathonId },
      },
      select: { id: true },
    });

    if (existingMembership) {
      res.status(409).json({
        error: "ALREADY_IN_TEAM",
        message: "Ты уже состоишь в команде этого хакатона.",
      });
      return;
    }

    const team = await prisma.team.create({
      data: {
        name: parsed.data.name,
        hackathonId,
        createdById: userId,
        members: {
          create: {
            userId,
            role: "CAPTAIN",
          },
        },
      },
      include: teamInclude,
    });

    res.status(201).json({
      message: "Команда создана. Ты назначен капитаном.",
      team,
    });
  } catch (error) {
    if (hasPrismaErrorCode(error, "P2002")) {
      res.status(409).json({
        error: "TEAM_NAME_EXISTS",
        message: "Команда с таким названием уже существует в этом хакатоне.",
      });
      return;
    }

    console.error("Creating team failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось создать команду.",
    });
  }
};

hackathonTeamsRouter.post(
  "/",
  requireRole("PARTICIPANT"),
  createTeamHandler,
);

// GET /api/hackathons/:hackathonId/teams/mine
const getMyTeamHandler: RequestHandler = async (req, res) => {
  const userId = req.auth?.userId;
  const hackathonId = getParam(req.params.hackathonId);

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
    const membership = await prisma.member.findFirst({
      where: {
        userId,
        team: { hackathonId },
      },
      include: {
        team: { include: teamInclude },
      },
    });

    res.status(200).json({
      team: membership?.team ?? null,
      membershipRole: membership?.role ?? null,
    });
  } catch (error) {
    console.error("Getting team membership failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось получить команду.",
    });
  }
};

hackathonTeamsRouter.get("/mine", getMyTeamHandler);

// POST /api/teams/:teamId/invitations
teamsRouter.use(requireAuth);

const inviteMemberHandler: RequestHandler = async (req, res) => {
  const userId = req.auth?.userId;
  const teamId = getParam(req.params.teamId);

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

  const parsed = createInvitationSchema.safeParse(req.body);

  if (!parsed.success) {
    sendValidationError(res, parsed.error.issues);
    return;
  }

  try {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        hackathon: {
          select: {
            id: true,
            name: true,
            status: true,
            startAt: true,
          },
        },
        members: {
          where: { userId },
          select: { role: true },
        },
      },
    });

    if (!team) {
      res.status(404).json({
        error: "TEAM_NOT_FOUND",
        message: "Команда не найдена.",
      });
      return;
    }

    if (team.members[0]?.role !== "CAPTAIN") {
      res.status(403).json({
        error: "CAPTAIN_REQUIRED",
        message: "Приглашать участников может только капитан команды.",
      });
      return;
    }

    if (
      team.hackathon.status !== "PUBLISHED" ||
      team.hackathon.startAt <= new Date()
    ) {
      res.status(409).json({
        error: "REGISTRATION_CLOSED",
        message: "Приглашать участников можно до начала хакатона.",
      });
      return;
    }

    const email = parsed.data.email;
    const sender = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (!sender) {
      res.status(401).json({
        error: "USER_NOT_FOUND",
        message: "Пользователь не найден.",
      });
      return;
    }

    if (sender.email.toLowerCase() === email) {
      res.status(400).json({
        error: "CANNOT_INVITE_SELF",
        message: "Нельзя отправить приглашение самому себе.",
      });
      return;
    }

    const invitedUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (invitedUser) {
      const existingMembership = await prisma.member.findFirst({
        where: {
          userId: invitedUser.id,
          team: { hackathonId: team.hackathonId },
        },
        select: { id: true },
      });

      if (existingMembership) {
        res.status(409).json({
          error: "USER_ALREADY_IN_TEAM",
          message: "Пользователь уже состоит в команде этого хакатона.",
        });
        return;
      }
    }

    const existingInvitation = await prisma.teamInvitation.findFirst({
      where: {
        teamId,
        email,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });

    if (existingInvitation) {
      res.status(409).json({
        error: "INVITATION_ALREADY_SENT",
        message: "Для этого email уже есть действующее приглашение.",
      });
      return;
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await prisma.teamInvitation.create({
      data: {
        teamId,
        email,
        tokenHash,
        expiresAt,
        invitedById: userId,
      },
    });

    const invitationUrl = new URL(
      "/invitations/accept",
      env.CLIENT_URL,
    );
    invitationUrl.searchParams.set("token", token);

    try {
      await mailer.sendMail({
        from: env.MAIL_FROM,
        to: email,
        subject: `Приглашение в команду «${team.name}»`,
        text: [
          `Привет!`,
          ``,
          `${sender.name || sender.email} приглашает тебя в команду «${team.name}».`,
          `Хакатон: ${team.hackathon.name}.`,
          ``,
          `Чтобы принять приглашение, войди в HackFlow под адресом ${email} и открой ссылку:`,
          invitationUrl.toString(),
          ``,
          `Ссылка действует до ${expiresAt.toISOString()}.`,
        ].join("\n"),
      });
    } catch (mailError) {
      console.error("Sending invitation email failed:", mailError);

      await prisma.teamInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "EXPIRED",
          expiresAt: new Date(),
        },
      });

      res.status(502).json({
        error: "EMAIL_DELIVERY_FAILED",
        message: "Не удалось отправить письмо. Проверь Mailpit и SMTP.",
      });
      return;
    }

    res.status(201).json({
      message: "Приглашение отправлено.",
      invitation: {
        id: invitation.id,
        email: invitation.email,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) {
    console.error("Creating team invitation failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось создать приглашение.",
    });
  }
};

teamsRouter.post("/:teamId/invitations", inviteMemberHandler);

// POST /api/invitations/accept
invitationsRouter.use(requireAuth);

const acceptInvitationHandler: RequestHandler = async (req, res) => {
  const userId = req.auth?.userId;

  if (!userId) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Требуется авторизация.",
    });
    return;
  }

  const parsed = acceptInvitationSchema.safeParse(req.body);

  if (!parsed.success) {
    sendValidationError(res, parsed.error.issues);
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      res.status(401).json({
        error: "USER_NOT_FOUND",
        message: "Пользователь не найден.",
      });
      return;
    }

    const invitation = await prisma.teamInvitation.findUnique({
      where: {
        tokenHash: hashToken(parsed.data.token),
      },
      include: {
        team: {
          include: {
            hackathon: {
              select: {
                id: true,
                name: true,
                status: true,
                startAt: true,
              },
            },
          },
        },
      },
    });

    if (!invitation) {
      res.status(404).json({
        error: "INVITATION_NOT_FOUND",
        message: "Приглашение не найдено.",
      });
      return;
    }

    if (invitation.status !== "PENDING") {
      res.status(409).json({
        error: "INVITATION_ALREADY_USED",
        message: "Приглашение уже использовано или недействительно.",
      });
      return;
    }

    const now = new Date();

    if (invitation.expiresAt <= now) {
      await prisma.teamInvitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });

      res.status(410).json({
        error: "INVITATION_EXPIRED",
        message: "Срок действия приглашения истёк.",
      });
      return;
    }

    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      res.status(403).json({
        error: "INVITATION_EMAIL_MISMATCH",
        message: "Войди в аккаунт, зарегистрированный на приглашённый email.",
      });
      return;
    }

    if (
      invitation.team.hackathon.status !== "PUBLISHED" ||
      invitation.team.hackathon.startAt <= now
    ) {
      res.status(409).json({
        error: "REGISTRATION_CLOSED",
        message: "Принять приглашение можно только до начала хакатона.",
      });
      return;
    }

    const existingMembership = await prisma.member.findFirst({
      where: {
        userId,
        team: {
          hackathonId: invitation.team.hackathon.id,
        },
      },
      select: { id: true },
    });

    if (existingMembership) {
      res.status(409).json({
        error: "ALREADY_IN_TEAM",
        message: "Ты уже состоишь в команде этого хакатона.",
      });
      return;
    }

    const membership = await prisma.$transaction(async (tx) => {
      const claimed = await tx.teamInvitation.updateMany({
        where: {
          id: invitation.id,
          status: "PENDING",
          expiresAt: { gt: now },
        },
        data: {
          status: "ACCEPTED",
          acceptedAt: now,
        },
      });

      if (claimed.count !== 1) {
        return null;
      }

      return tx.member.create({
        data: {
          teamId: invitation.teamId,
          userId,
          role: "MEMBER",
        },
      });
    });

    if (!membership) {
      res.status(409).json({
        error: "INVITATION_ALREADY_USED",
        message: "Приглашение уже принято или истекло.",
      });
      return;
    }

    res.status(200).json({
      message: "Ты присоединился к команде.",
      team: {
        id: invitation.team.id,
        name: invitation.team.name,
        hackathon: invitation.team.hackathon,
      },
    });
  } catch (error) {
    if (hasPrismaErrorCode(error, "P2002")) {
      res.status(409).json({
        error: "ALREADY_IN_TEAM",
        message: "Пользователь уже состоит в этой команде.",
      });
      return;
    }

    console.error("Accepting team invitation failed:", error);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Не удалось принять приглашение.",
    });
  }
};

invitationsRouter.post("/accept", acceptInvitationHandler);