# HackFlow

HackFlow — веб-платформа для организации хакатонов, формирования команд, подачи проектов и их оценки судьями.

## Возможности

### Участник

- Просмотр опубликованных хакатонов.
- Создание команды и приглашение зарегистрированных пользователей по email.
- Просмотр состава команды.
- Создание и редактирование проекта команды, отправка проекта на оценивание.
- Отправка проекта запрещена, если в команде менее двух участников.

### Организатор

- Создание, просмотр и редактирование черновиков хакатонов.
- Настройка критериев оценки до публикации.
- Публикация и отмена хакатонов.
- Назначение зарегистрированных пользователей судьями по email.
- Просмотр итоговых оценок, баллов и рейтинга проектов.
- Просмотр результатов доступен после окончания хакатона.

### Судья

- Просмотр назначенных хакатонов и поданных проектов.
- Оценивание проекта по критериям хакатона.
- Сохранение черновика оценки и комментариев.
- Окончательная отправка оценки; после отправки она блокируется от дальнейшего редактирования.

В рейтинг включаются только окончательно отправленные оценки. Проекты без завершённых оценок не получают итогового места. Итоговый балл проекта рассчитывается как средний балл по завершённым оценкам судей; при равенстве итогового балла проекты делят место.

## Технологии

- **Frontend:** React 19, TypeScript, Vite.
- **Backend:** Node.js, Express 5, TypeScript.
- **База данных:** PostgreSQL 17, Prisma 7.
- **Авторизация:** JWT в HttpOnly cookie, хеширование паролей через bcrypt.
- **Почта для локальной разработки:** Nodemailer и Mailpit.
- **Документация API:** OpenAPI 3.0.3 и Swagger UI.
- **Docker Compose:** PostgreSQL и Mailpit для локальной разработки.

## Требования

- Node.js 24 и npm.
- Docker Desktop с запущенным Docker Engine.
- Git — для клонирования репозитория.

## Настройка окружения

Команды ниже предполагают Windows PowerShell и каталог проекта `C:\Projects\hackflow`. Если проект находится в другом месте, перейдите в соответствующий каталог.

1. Скопируйте шаблон локальных переменных:

   ```powershell
   Set-Location C:\Projects\hackflow
   Copy-Item .env.example .env
   ```

2. Откройте `.env` и при необходимости скорректируйте настройки. `DATABASE_URL` должен соответствовать `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` и `POSTGRES_PORT`. Установите собственный случайный `JWT_SECRET` длиной не менее 32 символов.

3. Не добавляйте `.env` в Git: файл содержит локальные настройки и секреты. Для примера предназначен `.env.example`.

### Переменные окружения

Все значения ниже относятся к локальной разработке. Значения с пометкой «пример» нужно заменить для своего окружения.

| Переменная | Пример / значение по умолчанию | Назначение |
|---|---|---|
| `POSTGRES_DB` | `hackflow` | Имя базы PostgreSQL, создаваемой контейнером. |
| `POSTGRES_USER` | `hackflow` | Пользователь PostgreSQL. |
| `POSTGRES_PASSWORD` | `change_me_locally` (пример) | Пароль PostgreSQL; задайте собственный. |
| `POSTGRES_PORT` | `5432` | Порт PostgreSQL на хосте. |
| `DATABASE_URL` | `postgresql://hackflow:change_me_locally@127.0.0.1:5432/hackflow?schema=public` (пример) | Строка подключения Prisma к PostgreSQL. Согласуйте её с параметрами БД. |
| `JWT_SECRET` | `replace_with_a_random_secret` (пример) | Секрет для подписи JWT; замените случайной строкой длиной минимум 32 символа. |
| `SMTP_HOST` | `127.0.0.1` | Адрес SMTP-сервиса Mailpit при запуске backend на хосте. |
| `SMTP_PORT` | `10250` | Проброшенный SMTP-порт Mailpit на хосте. |
| `MAIL_FROM` | `HackFlow <no-reply@hackflow.local>` | Адрес отправителя писем. |
| `MAILPIT_SMTP_PORT` | `10250` | Порт хоста, направляемый на SMTP-порт Mailpit внутри контейнера. |
| `MAILPIT_UI_PORT` | `8025` | Порт веб-интерфейса Mailpit на хосте. |
| `CLIENT_URL` | `http://127.0.0.1:5173` | URL frontend, используемый backend, в частности для ссылок в письмах. |
| `PORT` | `3001` | Порт backend API; если переменная не указана, используется `3001`. |
| `NODE_ENV` | `development` | Режим Node.js; по умолчанию `development`. |

## Локальный запуск

> Текущий `docker-compose.yml` поднимает инфраструктуру — PostgreSQL и Mailpit. Backend и frontend запускаются командами npm в отдельных терминалах, а не контейнерами. Поэтому для запуска всего текущего приложения используйте шаги ниже.

### 1. Запустить PostgreSQL и Mailpit

Из корня проекта:

```powershell
Set-Location C:\Projects\hackflow
docker compose up -d db mailpit
docker compose ps
```

Дождитесь состояния `healthy` у `db` и `mailpit`.

| Сервис | Адрес | Назначение |
|---|---|---|
| PostgreSQL | `127.0.0.1:5432` | База данных |
| Mailpit SMTP | `127.0.0.1:10250` | Приём писем от приложения при локальной разработке |
| Mailpit Web UI | <http://127.0.0.1:8025> | Просмотр писем и приглашений |

### 2. Установить зависимости и подготовить базу

В отдельном терминале PowerShell:

```powershell
Set-Location C:\Projects\hackflow\server
npm install
npx prisma generate
npx prisma db push
```

`prisma generate` генерирует Prisma Client. `prisma db push` синхронизирует локальную базу с текущей Prisma-схемой; команда подходит для локальной разработки. Для production-среды следует использовать контролируемую стратегию миграций.

### 3. Запустить backend

В том же терминале, находясь в каталоге `server`:

```powershell
npm run dev
```

API доступен по адресу <http://127.0.0.1:3001>.

### 4. Запустить frontend

Откройте ещё один терминал PowerShell:

```powershell
Set-Location C:\Projects\hackflow\client
npm install
npm run dev -- --host 127.0.0.1
```

Откройте приложение: <http://127.0.0.1:5173>.

### 5. Проверить работоспособность

В отдельном PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/health | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:3001/api/health/db | ConvertTo-Json
```

Проверить интерактивную документацию API: <http://127.0.0.1:3001/docs>. OpenAPI JSON доступен по адресу <http://127.0.0.1:3001/docs/openapi.json>.

## API endpoints

Базовый адрес локального API: `http://127.0.0.1:3001/api`. Для защищённых маршрутов нужна авторизация в приложении; сервер использует HttpOnly cookie. Более подробная документация доступна в Swagger по адресу <http://127.0.0.1:3001/docs>.

| Метод | Endpoint | Доступ / назначение |
|---|---|---|
| `GET` | `/api/health` | Публичный — состояние API. |
| `GET` | `/api/health/db` | Публичный — состояние подключения к БД. |
| `POST` | `/api/auth/register` | Публичный — регистрация пользователя. |
| `POST` | `/api/auth/login` | Публичный — вход в систему и установка cookie. |
| `GET` | `/api/auth/me` | Авторизованный — текущий пользователь и его роли. |
| `POST` | `/api/auth/logout` | Завершение сессии. |
| `GET` | `/api/organizer/dashboard` | Организатор — проверка доступа к кабинету. |
| `GET` | `/api/hackathons` | Публичный — список опубликованных хакатонов. |
| `GET` | `/api/hackathons/:id` | Публичный — детали опубликованного хакатона. |
| `GET` | `/api/organizer/hackathons` | Организатор — список собственных хакатонов. |
| `POST` | `/api/organizer/hackathons` | Организатор — создать хакатон. |
| `GET` | `/api/organizer/hackathons/:id` | Организатор — детали собственного хакатона. |
| `PATCH` | `/api/organizer/hackathons/:id` | Организатор — изменить черновик. |
| `POST` | `/api/organizer/hackathons/:id/publish` | Организатор — опубликовать хакатон. |
| `POST` | `/api/organizer/hackathons/:id/cancel` | Организатор — отменить хакатон. |
| `GET` | `/api/organizer/hackathons/:hackathonId/criteria` | Организатор — список критериев. |
| `POST` | `/api/organizer/hackathons/:hackathonId/criteria` | Организатор — добавить критерий. |
| `PATCH` | `/api/organizer/hackathons/:hackathonId/criteria/:criterionId` | Организатор — изменить критерий. |
| `DELETE` | `/api/organizer/hackathons/:hackathonId/criteria/:criterionId` | Организатор — удалить критерий. |
| `GET` | `/api/organizer/hackathons/:hackathonId/judges` | Организатор — список назначенных судей. |
| `POST` | `/api/organizer/hackathons/:hackathonId/judges` | Организатор — назначить зарегистрированного пользователя судьёй по email. |
| `GET` | `/api/organizer/hackathons/:hackathonId/results` | Организатор — рейтинг и оценки после окончания хакатона. |
| `POST` | `/api/hackathons/:hackathonId/teams` | Участник — создать команду. |
| `GET` | `/api/hackathons/:hackathonId/teams/mine` | Авторизованный участник — получить свою команду на хакатоне. |
| `POST` | `/api/teams/:teamId/invitations` | Капитан — отправить приглашение участнику по email. |
| `POST` | `/api/invitations/accept` | Пользователь — принять приглашение в команду. |
| `GET` | `/api/teams/:teamId/project` | Участник команды — получить проект. |
| `PUT` | `/api/teams/:teamId/project` | Капитан — создать или изменить проект до отправки. |
| `POST` | `/api/teams/:teamId/project/submit` | Капитан — отправить проект на оценивание; требуется команда минимум из двух участников. |
| `GET` | `/api/judge/hackathons` | Судья — список назначенных хакатонов. |
| `GET` | `/api/judge/hackathons/:hackathonId/projects` | Судья — список проектов, доступных для оценивания. |
| `PUT` | `/api/judge/hackathons/:hackathonId/projects/:projectId/evaluation` | Судья — сохранить черновик оценки. |
| `POST` | `/api/judge/hackathons/:hackathonId/projects/:projectId/evaluation/submit` | Судья — окончательно отправить оценку. |

`:id`, `:hackathonId`, `:teamId`, `:criterionId` и `:projectId` — параметры пути, которые заменяются соответствующими идентификаторами. Для POST/PUT/PATCH передавайте JSON согласно документации Swagger.

## Сборка и проверки

### Backend

```powershell
Set-Location C:\Projects\hackflow\server
npm run build
```

### Frontend

```powershell
Set-Location C:\Projects\hackflow\client
npm run lint
npm run build
```

Сборка клиента включает проверку TypeScript и production-сборку Vite. Скрипт `test` backend пока не настроен как автоматизированный набор тестов; сценарии проверяются вручную через интерфейс и HTTP endpoints.

## Основной сценарий демонстрации

1. Организатор создаёт хакатон, добавляет критерии и публикует его.
2. Участник создаёт команду и приглашает другого зарегистрированного пользователя по email. Письмо можно увидеть в Mailpit.
3. Капитан заполняет проект и отправляет его на оценивание. Сервер проверяет, что в команде не менее двух участников.
4. Организатор назначает судей по email.
5. Судьи выставляют оценки по критериям, сохраняют черновики и окончательно отправляют оценки. После окончательной отправки редактирование блокируется.
6. До `endAt` запрос результатов запрещён; после окончания организатор может посмотреть рейтинг и оценки. Средний балл рассчитывается по окончательно отправленным оценкам.

## Структура репозитория

```text
hackflow/
├── client/                 # React + TypeScript + Vite
├── server/                 # Express API, Prisma schema и backend-модули
│   └── src/docs/           # OpenAPI-описание для Swagger UI
├── docs/                   # Дополнительные материалы проекта
├── docker-compose.yml      # PostgreSQL и Mailpit для локальной разработки
├── .env.example            # Шаблон переменных без реальных секретов
├── .gitignore
└── README.md
```

## Примечания по безопасности и разработке

- Не публикуйте `.env`, JWT secret, реальные пароли и другие секреты. `.env.example` содержит только демонстрационные значения.
- `JWT_SECRET` должен иметь длину минимум 32 символа.
- Перед демонстрацией убедитесь, что дата окончания тестового хакатона соответствует сценарию, который собираетесь показать.
- Текущий Compose-файл поднимает PostgreSQL и Mailpit; frontend и backend запускаются отдельно командами npm, указанными выше.
