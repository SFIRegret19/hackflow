const tags = [
  { name: "Health", description: "Проверка API и базы данных" },
  { name: "Auth", description: "Регистрация, вход и сессия" },
  { name: "Hackathons", description: "Публичный каталог хакатонов" },
  { name: "Organizer", description: "Управление хакатонами, критериями и судьями" },
  { name: "Teams", description: "Команды и участники" },
  { name: "Projects", description: "Проекты команд" },
  { name: "Judging", description: "Оценивание проектов" },
  { name: "Results", description: "Результаты и рейтинг" },
];

const idParameter = (name: string) => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string" },
});

const jsonBody = (schema: object, description = "Данные запроса") => ({
  required: true,
  description,
  content: {
    "application/json": { schema },
  },
});

const errorResponse = {
  description: "Ошибка запроса, доступа или сервера",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          message: { type: "string" },
        },
      },
    },
  },
};

const simpleResponse = {
  description: "Ответ API в формате JSON",
};

const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "HackFlow API",
    version: "1.0.0",
    description:
      "API платформы для организации хакатонов. Защищённые методы требуют авторизации. Вход выполняется через /auth/login.",
  },
  servers: [
    {
      url: "http://127.0.0.1:3001/api",
      description: "Локальный сервер разработки",
    },
  ],
  tags,
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Проверить доступность API",
        responses: { "200": simpleResponse },
      },
    },
    "/health/db": {
      get: {
        tags: ["Health"],
        summary: "Проверить подключение к PostgreSQL",
        responses: {
          "200": simpleResponse,
          "503": errorResponse,
        },
      },
    },

    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Зарегистрировать пользователя",
        requestBody: jsonBody({
          type: "object",
          required: ["email", "password"],
          properties: {
            name: { type: "string", example: "Иван Иванов" },
            email: { type: "string", format: "email" },
            password: { type: "string", format: "password" },
          },
        }),
        responses: {
          "201": simpleResponse,
          "400": errorResponse,
          "409": errorResponse,
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Войти в систему",
        description:
          "При успешном входе сервер устанавливает HttpOnly cookie сессии.",
        requestBody: jsonBody({
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", format: "password" },
          },
        }),
        responses: {
          "200": simpleResponse,
          "401": errorResponse,
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Получить текущего пользователя",
        responses: {
          "200": simpleResponse,
          "401": errorResponse,
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Выйти из системы",
        responses: { "200": simpleResponse },
      },
    },
    "/organizer/dashboard": {
      get: {
        tags: ["Organizer"],
        summary: "Проверить доступ организатора",
        responses: {
          "200": simpleResponse,
          "401": errorResponse,
          "403": errorResponse,
        },
      },
    },

    "/hackathons": {
      get: {
        tags: ["Hackathons"],
        summary: "Получить опубликованные хакатоны",
        responses: { "200": simpleResponse },
      },
    },
    "/hackathons/{id}": {
      get: {
        tags: ["Hackathons"],
        summary: "Получить опубликованный хакатон",
        parameters: [idParameter("id")],
        responses: {
          "200": simpleResponse,
          "404": errorResponse,
        },
      },
    },
    "/organizer/hackathons": {
      get: {
        tags: ["Organizer"],
        summary: "Список хакатонов организатора",
        responses: {
          "200": simpleResponse,
          "401": errorResponse,
          "403": errorResponse,
        },
      },
      post: {
        tags: ["Organizer"],
        summary: "Создать хакатон",
        requestBody: jsonBody({
          type: "object",
          required: ["name", "theme", "startAt", "endAt"],
          properties: {
            name: { type: "string" },
            theme: { type: "string" },
            description: { type: "string" },
            startAt: { type: "string", format: "date-time" },
            endAt: { type: "string", format: "date-time" },
          },
        }),
        responses: {
          "201": simpleResponse,
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
        },
      },
    },
    "/organizer/hackathons/{id}": {
      get: {
        tags: ["Organizer"],
        summary: "Получить хакатон организатора",
        parameters: [idParameter("id")],
        responses: {
          "200": simpleResponse,
          "404": errorResponse,
        },
      },
      patch: {
        tags: ["Organizer"],
        summary: "Изменить черновик хакатона",
        parameters: [idParameter("id")],
        requestBody: jsonBody({
          type: "object",
          properties: {
            name: { type: "string" },
            theme: { type: "string" },
            description: { type: "string" },
            startAt: { type: "string", format: "date-time" },
            endAt: { type: "string", format: "date-time" },
          },
        }),
        responses: {
          "200": simpleResponse,
          "400": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/organizer/hackathons/{id}/publish": {
      post: {
        tags: ["Organizer"],
        summary: "Опубликовать хакатон",
        parameters: [idParameter("id")],
        responses: { "200": simpleResponse, "400": errorResponse },
      },
    },
    "/organizer/hackathons/{id}/cancel": {
      post: {
        tags: ["Organizer"],
        summary: "Отменить хакатон",
        parameters: [idParameter("id")],
        responses: { "200": simpleResponse, "400": errorResponse },
      },
    },

    "/organizer/hackathons/{hackathonId}/criteria": {
      get: {
        tags: ["Organizer"],
        summary: "Список критериев хакатона",
        parameters: [idParameter("hackathonId")],
        responses: { "200": simpleResponse },
      },
      post: {
        tags: ["Organizer"],
        summary: "Добавить критерий",
        parameters: [idParameter("hackathonId")],
        requestBody: jsonBody({
          type: "object",
          required: ["name", "maxScore"],
          properties: {
            name: { type: "string" },
            maxScore: { type: "integer", minimum: 1 },
          },
        }),
        responses: {
          "201": simpleResponse,
          "400": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/organizer/hackathons/{hackathonId}/criteria/{criterionId}": {
      patch: {
        tags: ["Organizer"],
        summary: "Изменить критерий",
        parameters: [
          idParameter("hackathonId"),
          idParameter("criterionId"),
        ],
        requestBody: jsonBody({
          type: "object",
          properties: {
            name: { type: "string" },
            maxScore: { type: "integer", minimum: 1 },
          },
        }),
        responses: {
          "200": simpleResponse,
          "400": errorResponse,
          "404": errorResponse,
        },
      },
      delete: {
        tags: ["Organizer"],
        summary: "Удалить критерий",
        parameters: [
          idParameter("hackathonId"),
          idParameter("criterionId"),
        ],
        responses: {
          "200": simpleResponse,
          "404": errorResponse,
        },
      },
    },
    "/organizer/hackathons/{hackathonId}/judges": {
      get: {
        tags: ["Organizer"],
        summary: "Список назначенных судей",
        parameters: [idParameter("hackathonId")],
        responses: { "200": simpleResponse },
      },
      post: {
        tags: ["Organizer"],
        summary: "Назначить судью по email",
        parameters: [idParameter("hackathonId")],
        requestBody: jsonBody({
          type: "object",
          required: ["email"],
          properties: {
            email: { type: "string", format: "email" },
          },
        }),
        responses: {
          "201": simpleResponse,
          "400": errorResponse,
          "404": errorResponse,
          "409": errorResponse,
        },
      },
    },
    "/organizer/hackathons/{hackathonId}/results": {
      get: {
        tags: ["Results"],
        summary: "Получить рейтинг и оценки проектов",
        parameters: [idParameter("hackathonId")],
        responses: {
          "200": simpleResponse,
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
        },
      },
    },

    "/hackathons/{hackathonId}/teams": {
      post: {
        tags: ["Teams"],
        summary: "Создать команду",
        parameters: [idParameter("hackathonId")],
        requestBody: jsonBody({
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
          },
        }),
        responses: {
          "201": simpleResponse,
          "400": errorResponse,
          "409": errorResponse,
        },
      },
    },
    "/hackathons/{hackathonId}/teams/mine": {
      get: {
        tags: ["Teams"],
        summary: "Получить свою команду на хакатоне",
        parameters: [idParameter("hackathonId")],
        responses: { "200": simpleResponse, "404": errorResponse },
      },
    },
    "/teams/{teamId}/invitations": {
      post: {
        tags: ["Teams"],
        summary: "Пригласить участника по email",
        parameters: [idParameter("teamId")],
        requestBody: jsonBody({
          type: "object",
          required: ["email"],
          properties: {
            email: { type: "string", format: "email" },
          },
        }),
        responses: {
          "201": simpleResponse,
          "400": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/invitations/accept": {
      post: {
        tags: ["Teams"],
        summary: "Принять приглашение в команду",
        requestBody: jsonBody({
          type: "object",
          properties: {
            token: { type: "string" },
          },
        }),
        responses: {
          "200": simpleResponse,
          "400": errorResponse,
          "404": errorResponse,
        },
      },
    },

    "/teams/{teamId}/project": {
      get: {
        tags: ["Projects"],
        summary: "Получить проект команды",
        parameters: [idParameter("teamId")],
        responses: { "200": simpleResponse, "404": errorResponse },
      },
      put: {
        tags: ["Projects"],
        summary: "Создать или изменить проект",
        parameters: [idParameter("teamId")],
        requestBody: jsonBody({
          type: "object",
          required: ["name", "description", "repositoryUrl"],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            repositoryUrl: { type: "string", format: "uri" },
          },
        }),
        responses: {
          "200": simpleResponse,
          "400": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/teams/{teamId}/project/submit": {
      post: {
        tags: ["Projects"],
        summary: "Отправить проект на оценивание",
        parameters: [idParameter("teamId")],
        responses: {
          "200": simpleResponse,
          "400": errorResponse,
          "403": errorResponse,
          "409": errorResponse,
        },
      },
    },

    "/judge/hackathons": {
      get: {
        tags: ["Judging"],
        summary: "Список назначенных хакатонов судьи",
        responses: { "200": simpleResponse, "403": errorResponse },
      },
    },
    "/judge/hackathons/{hackathonId}/projects": {
      get: {
        tags: ["Judging"],
        summary: "Получить проекты для оценивания",
        parameters: [idParameter("hackathonId")],
        responses: { "200": simpleResponse, "403": errorResponse },
      },
    },
    "/judge/hackathons/{hackathonId}/projects/{projectId}/evaluation": {
      put: {
        tags: ["Judging"],
        summary: "Сохранить черновик оценки",
        parameters: [
          idParameter("hackathonId"),
          idParameter("projectId"),
        ],
        requestBody: jsonBody({
          type: "object",
          description: "Оценки по критериям и комментарии судьи",
          additionalProperties: true,
        }),
        responses: {
          "200": simpleResponse,
          "400": errorResponse,
          "403": errorResponse,
          "409": errorResponse,
        },
      },
    },
    "/judge/hackathons/{hackathonId}/projects/{projectId}/evaluation/submit": {
      post: {
        tags: ["Judging"],
        summary: "Окончательно отправить оценку",
        parameters: [
          idParameter("hackathonId"),
          idParameter("projectId"),
        ],
        responses: {
          "200": simpleResponse,
          "400": errorResponse,
          "403": errorResponse,
          "409": errorResponse,
        },
      },
    },
  },
};

export default openApiDocument;