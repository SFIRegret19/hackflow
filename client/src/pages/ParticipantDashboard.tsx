import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";
import "./ParticipantDashboard.css";

type User = {
  id: string;
  email: string;
  name: string | null;
  roles: Array<{
    role: "PARTICIPANT" | "ORGANIZER" | "JUDGE";
  }>;
};

type Hackathon = {
  id: string;
  name: string;
  theme: string;
  description: string | null;
  startAt: string;
  endAt: string;
  status: "PUBLISHED";
  registrationOpen: boolean;
  _count: {
    teams: number;
  };
  criteria: Array<{
    id: string;
    name: string;
    maxScore: number;
    sortOrder: number;
  }>;
};

type Project = {
  id: string;
  teamId: string;
  name: string;
  description: string;
  repositoryUrl: string;
  status: "DRAFT" | "SUBMITTED";
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type TeamMember = {
  id: string;
  userId: string;
  role: "CAPTAIN" | "MEMBER";
  joinedAt: string;
  user: {
    id: string;
    name: string | null;
  };
};

type Team = {
  id: string;
  name: string;
  members: TeamMember[];
  hackathon: {
    id: string;
    name: string;
    theme: string;
    startAt: string;
    endAt: string;
    status: string;
  };
  project: Project | null;
};

type TeamLookup = {
  hackathonId: string;
  team: Team | null;
  membershipRole: "CAPTAIN" | "MEMBER" | null;
  error?: string;
};

type DashboardView = "ORGANIZER" | "PARTICIPANT";

type ParticipantDashboardProps = {
  user: User;
  onLogoutSuccess: () => void;
  showDashboardSwitcher: boolean;
  activeDashboard: DashboardView;
  onDashboardViewChange: (view: DashboardView) => void;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function fetchMyTeam(hackathonId: string) {
  return apiRequest<{
    team: Team | null;
    membershipRole: "CAPTAIN" | "MEMBER" | null;
  }>(`/hackathons/${hackathonId}/teams/mine`);
}

export default function ParticipantDashboard({
  user,
  onLogoutSuccess,
  showDashboardSwitcher,
  activeDashboard,
  onDashboardViewChange,
}: ParticipantDashboardProps) {
  const [hackathons, setHackathons] = useState<Hackathon[]>([]);
  const [selectedHackathonId, setSelectedHackathonId] = useState("");
  const [teamLookup, setTeamLookup] = useState<TeamLookup | null>(null);

  const [loadingHackathons, setLoadingHackathons] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [teamName, setTeamName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");

  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectRepositoryUrl, setProjectRepositoryUrl] = useState("");
  const [projectSaving, setProjectSaving] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    apiRequest<{ hackathons: Hackathon[] }>("/hackathons")
      .then((result) => {
        if (cancelled) return;

        setHackathons(result.hackathons);
        setSelectedHackathonId(
          result.hackathons[0]?.id ?? "",
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;

        setError(
          err instanceof Error
            ? err.message
            : "Не удалось загрузить каталог хакатонов.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingHackathons(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedHackathonId) return;

    let cancelled = false;

    fetchMyTeam(selectedHackathonId)
    .then(async (result) => {
        if (cancelled) return;

        let team = result.team;

        if (team) {
        const projectDetails = await apiRequest<{
            project: Project | null;
        }>(`/teams/${team.id}/project`);

        if (cancelled) return;

        team = {
            ...team,
            project: projectDetails.project,
        };
        }

        setProjectName(team?.project?.name ?? "");
        setProjectDescription(team?.project?.description ?? "");
        setProjectRepositoryUrl(team?.project?.repositoryUrl ?? "");

        setTeamLookup({
        hackathonId: selectedHackathonId,
        team,
        membershipRole: result.membershipRole,
        });
    })
      .catch((err: unknown) => {
        if (cancelled) return;

        setTeamLookup({
          hackathonId: selectedHackathonId,
          team: null,
          membershipRole: null,
          error:
            err instanceof Error
              ? err.message
              : "Не удалось загрузить состав команды.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedHackathonId]);

  const selectedHackathon =
    hackathons.find((item) => item.id === selectedHackathonId) ?? null;

  const currentLookup =
    teamLookup?.hackathonId === selectedHackathonId
      ? teamLookup
      : null;

  const currentTeam = currentLookup?.team ?? null;

  const isLoadingTeam =
    Boolean(selectedHackathonId) && currentLookup === null;

  const canCreateTeam =
    selectedHackathon !== null &&
    selectedHackathon.status === "PUBLISHED" &&
    selectedHackathon.registrationOpen;

  async function handleCreateTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedHackathon) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const result = await apiRequest<{
        message: string;
        team: Team;
      }>(`/hackathons/${selectedHackathon.id}/teams`, {
        method: "POST",
        body: {
          name: teamName.trim(),
        },
      });

      setTeamLookup({
        hackathonId: selectedHackathon.id,
        team: result.team,
        membershipRole: "CAPTAIN",
      });

      setTeamName("");
      setNotice(result.message);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось создать команду.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentTeam) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const result = await apiRequest<{
        message: string;
      }>(`/teams/${currentTeam.id}/invitations`, {
        method: "POST",
        body: {
          email: inviteEmail.trim(),
        },
      });

      setNotice(
        `${result.message} Письмо можно проверить в почтовом сервисе.`,
      );
      setInviteEmail("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось отправить приглашение.",
      );
    } finally {
      setSaving(false);
    }
  }

    function updateCurrentTeamProject(project: Project) {
    setTeamLookup((previous) => {
        if (
        !previous ||
        previous.hackathonId !== selectedHackathonId ||
        !previous.team
        ) {
        return previous;
        }

        return {
        ...previous,
        team: {
            ...previous.team,
            project,
        },
        };
    });
    }

    async function handleSaveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentTeam || currentLookup?.membershipRole !== "CAPTAIN") {
        return;
    }

    setProjectSaving(true);
    setError("");
    setNotice("");

    try {
        const result = await apiRequest<{
        message: string;
        project: Project;
        }>(`/teams/${currentTeam.id}/project`, {
        method: "PUT",
        body: {
            name: projectName.trim(),
            description: projectDescription.trim(),
            repositoryUrl: projectRepositoryUrl.trim(),
        },
        });

        updateCurrentTeamProject(result.project);
        setNotice(result.message);
    } catch (err) {
        setError(
        err instanceof Error
            ? err.message
            : "Не удалось сохранить проект.",
        );
    } finally {
        setProjectSaving(false);
    }
    }

    async function handleSubmitProject() {
    if (!currentTeam || currentLookup?.membershipRole !== "CAPTAIN") {
        return;
    }

    if (!currentTeam.project) {
        setError("Сначала сохрани черновик проекта.");
        return;
    }

    setProjectSaving(true);
    setError("");
    setNotice("");

    try {
        const result = await apiRequest<{
        message: string;
        project: Project;
        }>(`/teams/${currentTeam.id}/project/submit`, {
        method: "POST",
        });

        updateCurrentTeamProject(result.project);
        setNotice(result.message);
    } catch (err) {
        setError(
        err instanceof Error
            ? err.message
            : "Не удалось отправить проект на оценивание.",
        );
    } finally {
        setProjectSaving(false);
    }
    }

  async function handleLogout() {
    setLoggingOut(true);
    setError("");

    try {
      await apiRequest<{ message: string }>("/auth/logout", {
        method: "POST",
      });

      onLogoutSuccess();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось выполнить выход.",
      );
    } finally {
      setLoggingOut(false);
    }
  }

  const displayName =
    user.name?.trim() || user.email.split("@")[0] || "Участник";

  return (
    <div className="org-shell">
      <header
        className={
          showDashboardSwitcher
            ? "org-topbar org-topbar--switchable"
            : "org-topbar"
        }
      >
        {/* Логотип — только один */}
        <a
          className="org-brand"
          href="/"
          onClick={(event) => event.preventDefault()}
        >
          <span className="org-brand-mark">H</span>
          <span className="org-brand-name">hackflow</span>
        </a>

        {/* Переключатель кабинетов */}
        {showDashboardSwitcher && (
          <nav className="dashboard-switcher" aria-label="Выбор кабинета">
            <button
              type="button"
              className={
                activeDashboard === "ORGANIZER"
                  ? "dashboard-switcher__button is-active"
                  : "dashboard-switcher__button"
              }
              onClick={() => onDashboardViewChange("ORGANIZER")}
              aria-pressed={activeDashboard === "ORGANIZER"}
            >
              Организатор
            </button>

            <button
              type="button"
              className={
                activeDashboard === "PARTICIPANT"
                  ? "dashboard-switcher__button is-active"
                  : "dashboard-switcher__button"
              }
              onClick={() => onDashboardViewChange("PARTICIPANT")}
              aria-pressed={activeDashboard === "PARTICIPANT"}
            >
              Участник
            </button>
          </nav>
        )}

        {/* Профиль и выход — один блок справа */}
        <div className="org-topbar-right">
          <span className="org-role-label">Организатор</span>

          <div className="org-user">
            <span className="org-avatar">
              {displayName.charAt(0).toUpperCase()}
            </span>

            <span className="org-user-name">{displayName}</span>
          </div>

          <button
            className="org-logout-button"
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? "Выходим..." : "Выйти"}
          </button>
        </div>
      </header>

      <main className="org-main">
        <section className="org-welcome">
          <div>
            <span className="org-eyebrow">УЧАСТНИК HACKFLOW</span>
            <h1>Твои хакатоны</h1>
            <p>
              Выбирай мероприятие, создавай команду и приглашай людей,
              которые помогут реализовать твою идею.
            </p>
          </div>
        </section>

        {error && (
          <div className="org-alert org-alert-error" role="alert">
            {error}
          </div>
        )}

        {notice && (
          <div className="org-alert org-alert-success" role="status">
            {notice}
          </div>
        )}

        <section className="participant-workspace">
          <aside className="participant-event-panel">
            <div className="participant-panel-heading">
              <span className="org-eyebrow">КАТАЛОГ</span>
              <h2>Мероприятия</h2>
            </div>

            {loadingHackathons ? (
              <p className="org-muted">Загружаем хакатоны...</p>
            ) : hackathons.length === 0 ? (
              <div className="participant-no-events">
                <span>◇</span>
                <strong>Пока нет опубликованных хакатонов</strong>
                <p>Загляни позже — здесь появятся новые мероприятия.</p>
              </div>
            ) : (
              <div className="participant-event-list">
                {hackathons.map((hackathon) => (
                  <button
                    key={hackathon.id}
                    type="button"
                    className={
                      selectedHackathonId === hackathon.id
                        ? "participant-event active"
                        : "participant-event"
                    }
                    onClick={() => {
                      setSelectedHackathonId(hackathon.id);
                      setError("");
                      setNotice("");
                    }}
                  >
                    <span className="participant-event-dot" />
                    <span className="participant-event-copy">
                      <strong>{hackathon.name}</strong>
                      <small>{hackathon.theme}</small>
                      <small>
                        {formatDate(hackathon.startAt)}
                      </small>
                    </span>
                    <span className="participant-event-arrow">›</span>
                  </button>
                ))}
              </div>
            )}
          </aside>

          <section className="participant-team-panel">
            {!selectedHackathon ? (
              <div className="org-empty-state">
                <span className="org-empty-icon">◇</span>
                <strong>Выбери хакатон</strong>
                <p>
                  После выбора здесь появятся информация о мероприятии
                  и твоя команда.
                </p>
              </div>
            ) : (
              <>
                <div className="participant-event-heading">
                  <div>
                    <span className="org-eyebrow">ВЫБРАННЫЙ ХАКАТОН</span>
                    <h2>{selectedHackathon.name}</h2>
                    <p>{selectedHackathon.theme}</p>
                  </div>

                  <span className="participant-event-date">
                    {formatDate(selectedHackathon.startAt)}
                  </span>
                </div>

                <div className="participant-event-description">
                  {selectedHackathon.description ||
                    "Организатор пока не добавил описание."}
                </div>

                <div className="participant-facts">
                  <div>
                    <span>Начало</span>
                    <strong>{formatDate(selectedHackathon.startAt)}</strong>
                  </div>
                  <div>
                    <span>Окончание</span>
                    <strong>{formatDate(selectedHackathon.endAt)}</strong>
                  </div>
                  <div>
                    <span>Команд</span>
                    <strong>{selectedHackathon._count.teams}</strong>
                  </div>
                </div>

                <div className="participant-team-content">
                  <div className="participant-panel-heading">
                    <span className="org-eyebrow">ТВОЯ КОМАНДА</span>
                    <h2>
                      {currentTeam ? currentTeam.name : "Ещё нет команды"}
                    </h2>
                  </div>

                  {isLoadingTeam ? (
                    <p className="org-muted">
                      Проверяем участие в хакатоне...
                    </p>
                  ) : currentLookup?.error ? (
                    <div
                      className="org-alert org-alert-error"
                      role="alert"
                    >
                      {currentLookup.error}
                    </div>
                  ) : currentTeam ? (
                    <>
                      <div className="participant-team-summary">
                        <div className="participant-team-count">
                          <strong>{currentTeam.members.length}</strong>
                          <span>
                            {currentTeam.members.length === 1
                              ? "участник"
                              : "участников"}
                          </span>
                        </div>

                        <div>
                          <strong>
                            {currentLookup?.membershipRole === "CAPTAIN"
                              ? "Ты капитан команды"
                              : "Ты участник команды"}
                          </strong>
                          <p>
                            {currentLookup?.membershipRole === "CAPTAIN"
                              ? "Ты можешь приглашать новых участников по email."
                              : "Состав команды и приглашения доступны капитану."}
                          </p>
                        </div>
                      </div>

                      <div className="participant-member-list">
                        {currentTeam.members.map((member) => (
                          <div
                            className="participant-member"
                            key={member.id}
                          >
                            <span className="participant-member-avatar">
                              {(member.user.name || "У")
                                .charAt(0)
                                .toUpperCase()}
                            </span>

                            <div>
                              <strong>
                                {member.user.name || "Участник"}
                                {member.userId === user.id ? " (ты)" : ""}
                              </strong>
                              <span>
                                {member.role === "CAPTAIN"
                                  ? "Капитан"
                                  : "Участник"}
                              </span>
                            </div>

                            {member.role === "CAPTAIN" && (
                              <span className="participant-captain-badge">
                                Капитан
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      {currentLookup?.membershipRole === "CAPTAIN" && (
                        <form
                          className="participant-invite-form"
                          onSubmit={handleInvite}
                        >
                          <div className="participant-panel-heading">
                            <span className="org-eyebrow">
                              РАСШИРЕНИЕ КОМАНДЫ
                            </span>
                            <h3>Пригласить участника</h3>
                          </div>

                          <label htmlFor="member-email">
                            Email нового участника
                          </label>

                          <div className="participant-invite-row">
                            <input
                              id="member-email"
                              type="email"
                              value={inviteEmail}
                              onChange={(event) =>
                                setInviteEmail(event.target.value)
                              }
                              placeholder="member@example.com"
                              maxLength={254}
                              required
                            />

                            <button
                              className="org-primary-button"
                              type="submit"
                              disabled={saving}
                            >
                              {saving ? "Отправка..." : "Пригласить"}
                            </button>
                          </div>

                                                    <p className="participant-form-hint">
                            Отправим письмо со ссылкой для принятия
                            приглашения. Ссылка действует семь дней.
                          </p>
                        </form>
                      )}

                      <section className="participant-project-card">
                        <div className="participant-panel-heading">
                          <span className="org-eyebrow">
                            ПРОЕКТ КОМАНДЫ
                          </span>
                          <h3>
                            {currentTeam.project
                              ? "Твой проект"
                              : "Подготовка проекта"}
                          </h3>
                        </div>

                        {currentTeam.project?.status === "SUBMITTED" ? (
                          <div
                            className="participant-project-status"
                            role="status"
                          >
                            <span className="participant-project-badge">
                              Отправлен на оценивание
                            </span>

                            <h4>{currentTeam.project.name}</h4>
                            <p>{currentTeam.project.description}</p>

                            <a
                              href={currentTeam.project.repositoryUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(event) => event.stopPropagation()}
                            >
                              Открыть репозиторий ↗
                            </a>

                            {currentTeam.project.submittedAt && (
                              <p className="participant-project-date">
                                Отправлен:{" "}
                                {new Intl.DateTimeFormat("ru-RU", {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                }).format(
                                  new Date(
                                    currentTeam.project.submittedAt,
                                  ),
                                )}
                              </p>
                            )}
                          </div>
                        ) : currentLookup?.membershipRole !== "CAPTAIN" ? (
                          <p className="org-muted">
                            {currentTeam.project
                              ? "Редактировать и отправлять проект может капитан команды."
                              : "Капитан команды ещё не создал проект."}
                          </p>
                        ) : (
                          <>
                            <p className="org-muted">
                              Заполни информацию о проекте и сохрани черновик
                              перед отправкой.
                            </p>

                            <form
                              className="participant-project-form"
                              onSubmit={handleSaveProject}
                            >
                              <label htmlFor="project-name">
                                Название проекта
                              </label>
                              <input
                                id="project-name"
                                value={projectName}
                                onChange={(event) =>
                                  setProjectName(event.target.value)
                                }
                                minLength={3}
                                maxLength={160}
                                required
                                disabled={projectSaving}
                                placeholder="Например, CityPulse"
                              />

                              <label htmlFor="project-description">
                                Описание проекта
                              </label>
                              <textarea
                                id="project-description"
                                value={projectDescription}
                                onChange={(event) =>
                                  setProjectDescription(event.target.value)
                                }
                                minLength={10}
                                maxLength={10000}
                                rows={5}
                                required
                                disabled={projectSaving}
                                placeholder="Какую проблему решает проект и как он работает?"
                              />

                              <label htmlFor="project-repository">
                                HTTPS-ссылка на репозиторий
                              </label>
                              <input
                                id="project-repository"
                                type="url"
                                value={projectRepositoryUrl}
                                onChange={(event) =>
                                  setProjectRepositoryUrl(
                                    event.target.value,
                                  )
                                }
                                placeholder="https://github.com/organization/project"
                                pattern="https://.*"
                                maxLength={2048}
                                required
                                disabled={projectSaving}
                              />

                              <button
                                className="org-primary-button"
                                type="submit"
                                disabled={projectSaving}
                              >
                                {projectSaving
                                  ? "Сохраняем..."
                                  : "Сохранить черновик"}
                              </button>
                            </form>

                            {currentTeam.project && (
                              <button
                                className="participant-submit-project-button"
                                type="button"
                                onClick={handleSubmitProject}
                                disabled={projectSaving}
                              >
                                {projectSaving
                                  ? "Обрабатываем..."
                                  : "Отправить на оценивание"}
                              </button>
                            )}
                          </>
                        )}
                      </section>
                    </>
                  ) : canCreateTeam ? (
                    <form
                      className="participant-create-form"
                      onSubmit={handleCreateTeam}
                    >
                      <p>
                        Создай команду, чтобы начать приглашать участников
                        и готовить проект к подаче.
                      </p>

                      <label htmlFor="team-name">Название команды</label>

                      <input
                        id="team-name"
                        value={teamName}
                        onChange={(event) =>
                          setTeamName(event.target.value)
                        }
                        minLength={2}
                        maxLength={100}
                        required
                        placeholder="Например, Future Builders"
                      />

                      <button
                        className="org-primary-button"
                        type="submit"
                        disabled={saving}
                      >
                        {saving ? "Создаём..." : "Создать команду"}
                      </button>
                    </form>
                  ) : (
                    <div className="participant-closed-state">
                      <strong>Регистрация команд закрыта</strong>
                      <p>
                        Создать команду можно до начала хакатона.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </section>

        <footer className="org-footer">
          <span>© 2026 HackFlow</span>
          <span>Создавай идеи вместе.</span>
        </footer>
      </main>
    </div>
  );
}