import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";
import "./OrganizerDashboard.css";
import "./JudgeDashboard.css";

type User = {
  id: string;
  email: string;
  name: string | null;
  roles: Array<{
    role: "PARTICIPANT" | "ORGANIZER" | "JUDGE";
  }>;
};

type JudgeDashboardProps = {
  user: User;
  onLogoutSuccess: () => void;
};

type JudgeHackathon = {
  id: string;
  name: string;
  theme: string;
  description: string | null;
  startAt: string;
  endAt: string;
  status: string;
  assignedAt: string;
  submittedProjectCount: number;
};

type JudgeCriterion = {
  id: string;
  name: string;
  description: string | null;
  maxScore: number;
  sortOrder: number;
};

type JudgeGrade = {
  criterionId: string;
  score: number;
  comment: string | null;
  criterion?: JudgeCriterion;
};

type JudgeEvaluation = {
  id: string;
  status: "DRAFT" | "SUBMITTED";
  submittedAt: string | null;
  grades: JudgeGrade[];
};

type JudgeProject = {
  id: string;
  name: string;
  description: string;
  repositoryUrl: string;
  submittedAt: string | null;
  team: {
    id: string;
    name: string;
    members: Array<{
      role: "CAPTAIN" | "MEMBER";
      user: {
        id: string;
        name: string | null;
      };
    }>;
  };
  evaluation: JudgeEvaluation | null;
};

type JudgingData = {
  hackathon: {
    id: string;
    name: string;
  };
  criteria: JudgeCriterion[];
  projects: JudgeProject[];
};

type GradeDraft = {
  score: string;
  comment: string;
};

type GradeDraftMap = Record<string, GradeDraft>;

type GradeInput = {
  criterionId: string;
  score: number;
  comment?: string;
};

function formatDate(value: string | null): string {
  if (!value) return "Не указана";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string | null): string {
  if (!value) return "Не указано";

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function createGradeDrafts(
  criteria: JudgeCriterion[],
  project: JudgeProject | null,
): GradeDraftMap {
  const savedGrades = new Map(
    (project?.evaluation?.grades ?? []).map((grade) => [
      grade.criterionId,
      grade,
    ]),
  );

  return Object.fromEntries(
    criteria.map((criterion) => {
      const grade = savedGrades.get(criterion.id);

      return [
        criterion.id,
        {
          score: grade ? String(grade.score) : "",
          comment: grade?.comment ?? "",
        },
      ];
    }),
  );
}

export default function JudgeDashboard({
  user,
  onLogoutSuccess,
}: JudgeDashboardProps) {
  const [hackathons, setHackathons] = useState<JudgeHackathon[]>([]);
  const [selectedHackathonId, setSelectedHackathonId] = useState("");

  const [judgingData, setJudgingData] = useState<JudgingData | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");

  const [gradeDrafts, setGradeDrafts] = useState<GradeDraftMap>({});

  const [loadingHackathons, setLoadingHackathons] = useState(true);
  const [projectLoadError, setProjectLoadError] = useState<{
    hackathonId: string;
    message: string;
  } | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    apiRequest<{ hackathons: JudgeHackathon[] }>("/judge/hackathons")
      .then((result) => {
        if (cancelled) return;

        setHackathons(result.hackathons);
        setSelectedHackathonId(result.hackathons[0]?.id ?? "");
      })
      .catch((err: unknown) => {
        if (cancelled) return;

        setError(
          err instanceof Error
            ? err.message
            : "Не удалось загрузить назначенные хакатоны.",
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

    apiRequest<JudgingData>(
      `/judge/hackathons/${selectedHackathonId}/projects`,
    )
      .then((result) => {
        if (cancelled) return;

        setJudgingData(result);
        setProjectLoadError(null);

        const firstProject = result.projects[0] ?? null;

        setSelectedProjectId(firstProject?.id ?? "");
        setGradeDrafts(createGradeDrafts(result.criteria, firstProject));
      })
      .catch((err: unknown) => {
        if (cancelled) return;

        setProjectLoadError({
          hackathonId: selectedHackathonId,
          message:
            err instanceof Error
              ? err.message
              : "Не удалось загрузить проекты.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedHackathonId, reloadKey]);

  const displayName =
    user.name?.trim() || user.email.split("@")[0] || "Судья";

  const selectedHackathon =
    hackathons.find((item) => item.id === selectedHackathonId) ?? null;

  const currentData =
    judgingData?.hackathon.id === selectedHackathonId
      ? judgingData
      : null;

  const selectedProject =
    currentData?.projects.find(
      (project) => project.id === selectedProjectId,
    ) ?? null;

  const currentProjectError =
    projectLoadError?.hackathonId === selectedHackathonId
      ? projectLoadError.message
      : "";

  const loadingProjects =
    Boolean(selectedHackathonId) &&
    currentData === null &&
    !currentProjectError;

  const maxTotalScore =
    currentData?.criteria.reduce(
      (total, criterion) => total + criterion.maxScore,
      0,
    ) ?? 0;

  const currentTotalScore =
    currentData?.criteria.reduce(
      (total, criterion) =>
        total + Number(gradeDrafts[criterion.id]?.score || 0),
      0,
    ) ?? 0;

  const isEvaluationSubmitted =
    selectedProject?.evaluation?.status === "SUBMITTED";

  function handleSelectHackathon(hackathonId: string) {
    setSelectedHackathonId(hackathonId);
    setError("");
    setNotice("");
  }

  function handleSelectProject(project: JudgeProject) {
    if (!currentData) return;

    setSelectedProjectId(project.id);
    setGradeDrafts(createGradeDrafts(currentData.criteria, project));
    setError("");
    setNotice("");
  }

  function handleGradeChange(
    criterionId: string,
    patch: Partial<GradeDraft>,
  ) {
    setGradeDrafts((previous) => ({
      ...previous,
      [criterionId]: {
        score: previous[criterionId]?.score ?? "",
        comment: previous[criterionId]?.comment ?? "",
        ...patch,
      },
    }));
  }

  function collectGrades(requireAll: boolean): GradeInput[] | null {
    if (!currentData || !selectedProject) {
      setError("Сначала выбери проект для оценивания.");
      return null;
    }

    if (currentData.criteria.length === 0) {
      setError("У этого хакатона нет критериев оценивания.");
      return null;
    }

    const grades: GradeInput[] = [];

    for (const criterion of currentData.criteria) {
      const draft = gradeDrafts[criterion.id];
      const rawScore = draft?.score.trim() ?? "";

      if (!rawScore) {
        if (requireAll) {
          setError(
            `Укажи балл по критерию «${criterion.name}».`,
          );
          return null;
        }

        continue;
      }

      const score = Number(rawScore);

      if (
        !Number.isInteger(score) ||
        score < 0 ||
        score > criterion.maxScore
      ) {
        setError(
          `По критерию «${criterion.name}» допустимо от 0 до ${criterion.maxScore} баллов.`,
        );
        return null;
      }

      const comment = draft?.comment.trim() ?? "";

      grades.push({
        criterionId: criterion.id,
        score,
        ...(comment ? { comment } : {}),
      });
    }

    return grades;
  }

  function applyEvaluation(
    projectId: string,
    evaluation: JudgeEvaluation,
  ) {
    setJudgingData((previous) => {
      if (
        !previous ||
        previous.hackathon.id !== selectedHackathonId
      ) {
        return previous;
      }

      return {
        ...previous,
        projects: previous.projects.map((project) =>
          project.id === projectId
            ? { ...project, evaluation }
            : project,
        ),
      };
    });
  }

  async function saveEvaluationGrades(
    grades: GradeInput[],
  ): Promise<JudgeEvaluation> {
    if (!selectedHackathonId || !selectedProject) {
      throw new Error("Проект для оценивания не выбран.");
    }

    const result = await apiRequest<{
      message: string;
      evaluation: JudgeEvaluation;
    }>(
      `/judge/hackathons/${selectedHackathonId}/projects/${selectedProject.id}/evaluation`,
      {
        method: "PUT",
        body: { grades },
      },
    );

    applyEvaluation(selectedProject.id, result.evaluation);

    return result.evaluation;
  }

  async function handleSaveEvaluation(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (isEvaluationSubmitted) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const grades = collectGrades(false);

      if (!grades) return;

      const evaluation = await saveEvaluationGrades(grades);

      setNotice("Черновик оценки сохранён.");
      applyEvaluation(selectedProject!.id, evaluation);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось сохранить оценку.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitEvaluation() {
    if (isEvaluationSubmitted) return;

    const grades = collectGrades(true);

    if (!grades) return;

    const confirmed = window.confirm(
      "Отправить оценку окончательно? После отправки изменить её через кабинет нельзя.",
    );

    if (!confirmed) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await saveEvaluationGrades(grades);

      if (!selectedHackathonId || !selectedProject) {
        throw new Error("Проект для оценивания не выбран.");
      }

      const result = await apiRequest<{
        message: string;
        evaluation: JudgeEvaluation;
      }>(
        `/judge/hackathons/${selectedHackathonId}/projects/${selectedProject.id}/evaluation/submit`,
        {
          method: "POST",
        },
      );

      applyEvaluation(selectedProject.id, result.evaluation);
      setNotice(result.message);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось отправить оценку.",
      );
    } finally {
      setSaving(false);
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

  return (
    <div className="org-shell">
      <header className="org-topbar">
        <a
          className="org-brand"
          href="/"
          onClick={(event) => event.preventDefault()}
        >
          <span className="org-brand-mark">H</span>
          <span className="org-brand-name">hackflow</span>
        </a>

        <div className="org-topbar-right">
          <span className="org-role-label">Судья</span>

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

      <main className="org-main judge-main">
        <section className="org-welcome">
          <div>
            <span className="org-eyebrow">СУДЕЙСКАЯ ПАНЕЛЬ</span>
            <h1>Оценивание проектов</h1>
            <p>
              Изучай представленные решения, оценивай их по критериям
              и отправляй результаты организаторам.
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

        <div className="judge-workspace">
          <aside className="judge-sidebar">
            <div className="participant-panel-heading">
              <span className="org-eyebrow">НАЗНАЧЕНИЯ</span>
              <h2>Мои хакатоны</h2>
            </div>

            {loadingHackathons ? (
              <p className="org-muted">Загружаем хакатоны...</p>
            ) : hackathons.length === 0 ? (
              <div className="org-empty-state">
                <strong>Пока нет назначений</strong>
                <p>
                  Здесь появятся хакатоны, на которые организатор назначит тебя судьёй.
                </p>
              </div>
            ) : (
              <div className="judge-hackathon-list">
                {hackathons.map((hackathon) => (
                  <button
                    key={hackathon.id}
                    type="button"
                    className={
                      selectedHackathonId === hackathon.id
                        ? "judge-hackathon-option is-active"
                        : "judge-hackathon-option"
                    }
                    onClick={() =>
                      handleSelectHackathon(hackathon.id)
                    }
                  >
                    <strong>{hackathon.name}</strong>
                    <span>{hackathon.theme}</span>
                    <small>
                      {formatDate(hackathon.startAt)}
                    </small>
                    <span className="judge-project-count">
                      Проектов: {hackathon.submittedProjectCount}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </aside>

          <section className="judge-content-panel">
            {!selectedHackathon ? (
              <div className="org-empty-state">
                <strong>Выбери хакатон</strong>
                <p>
                  После выбора появятся проекты, доступные для оценивания.
                </p>
              </div>
            ) : loadingProjects ? (
              <div className="org-empty-state">
                <strong>Загружаем проекты...</strong>
                <p>Получаем список проектов и критерии оценивания.</p>
              </div>
            ) : currentProjectError ? (
              <div className="org-empty-state">
                <strong>Не удалось загрузить проекты</strong>
                <p>{currentProjectError}</p>
                <button
                  className="org-primary-button"
                  type="button"
                  onClick={() => {
                    setProjectLoadError(null);
                    setReloadKey((value) => value + 1);
                  }}
                >
                  Повторить загрузку
                </button>
              </div>
            ) : currentData ? (
              <>
                <div className="judge-hackathon-heading">
                  <div>
                    <span className="org-eyebrow">
                      ВЫБРАННЫЙ ХАКАТОН
                    </span>
                    <h2>{currentData.hackathon.name}</h2>
                    <p>
                      Критериев: {currentData.criteria.length} ·
                      Максимальный балл: {maxTotalScore}
                    </p>
                  </div>
                </div>

                {currentData.projects.length === 0 ? (
                  <div className="org-empty-state">
                    <strong>Пока нет отправленных проектов</strong>
                    <p>
                      Проекты появятся здесь после того, как команды
                      отправят их на оценивание.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="judge-project-list">
                      {currentData.projects.map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          className={
                            selectedProjectId === project.id
                              ? "judge-project-option is-active"
                              : "judge-project-option"
                          }
                          onClick={() =>
                            handleSelectProject(project)
                          }
                        >
                          <span className="judge-project-team">
                            {project.team.name}
                          </span>

                          <strong>{project.name}</strong>

                          <span className="judge-project-option-footer">
                            <span>
                              {project.evaluation?.status === "SUBMITTED"
                                ? "Оценка отправлена"
                                : project.evaluation?.status === "DRAFT"
                                  ? "Черновик оценки"
                                  : "Ожидает оценки"}
                            </span>
                            <span aria-hidden="true">›</span>
                          </span>
                        </button>
                      ))}
                    </div>

                    {selectedProject && (
                      <article className="judge-review-card">
                        <div className="judge-review-heading">
                          <div>
                            <span className="org-eyebrow">
                              ПРОЕКТ КОМАНДЫ
                            </span>
                            <h3>{selectedProject.name}</h3>
                            <p>{selectedProject.team.name}</p>
                          </div>

                          <span
                            className={
                              isEvaluationSubmitted
                                ? "judge-status-badge submitted"
                                : selectedProject.evaluation
                                  ? "judge-status-badge draft"
                                  : "judge-status-badge pending"
                            }
                          >
                            {isEvaluationSubmitted
                              ? "Оценка отправлена"
                              : selectedProject.evaluation
                                ? "Черновик"
                                : "Новая оценка"}
                          </span>
                        </div>

                        <p className="judge-project-description">
                          {selectedProject.description}
                        </p>

                        <a
                          className="judge-repository-link"
                          href={selectedProject.repositoryUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Открыть репозиторий ↗
                        </a>

                        <div className="judge-project-members">
                          <span className="org-eyebrow">
                            УЧАСТНИКИ КОМАНДЫ
                          </span>
                          <div>
                            {selectedProject.team.members.map(
                              (member, index) => (
                                <span
                                  key={`${member.user.id}-${member.role}-${index}`}
                                  className="judge-member-chip"
                                >
                                  {member.user.name || "Участник"}
                                  {member.role === "CAPTAIN"
                                    ? " · Капитан"
                                    : ""}
                                </span>
                              ),
                            )}
                          </div>
                        </div>

                        {isEvaluationSubmitted &&
                          selectedProject.evaluation?.submittedAt && (
                            <p className="judge-submitted-date">
                              Отправлено:{" "}
                              {formatDateTime(
                                selectedProject.evaluation.submittedAt,
                              )}
                            </p>
                          )}

                        <form
                          className="judge-evaluation-form"
                          onSubmit={handleSaveEvaluation}
                        >
                          <div className="judge-score-summary">
                            <div>
                              <span>Текущая сумма</span>
                              <strong>
                                {currentTotalScore} / {maxTotalScore}
                              </strong>
                            </div>
                            <span>
                              {isEvaluationSubmitted
                                ? "Итоговая оценка"
                                : "Черновик оценки"}
                            </span>
                          </div>

                          <div className="judge-criteria-list">
                            {currentData.criteria.map((criterion) => {
                              const draft = gradeDrafts[criterion.id] ?? {
                                score: "",
                                comment: "",
                              };

                              return (
                                <div
                                  key={criterion.id}
                                  className="judge-criterion-card"
                                >
                                  <div className="judge-criterion-heading">
                                    <div>
                                      <label
                                        htmlFor={`score-${criterion.id}`}
                                      >
                                        {criterion.name}
                                      </label>

                                      {criterion.description && (
                                        <p>{criterion.description}</p>
                                      )}
                                    </div>

                                    <span>
                                      / {criterion.maxScore}
                                    </span>
                                  </div>

                                  <div className="judge-score-field">
                                    <label
                                      htmlFor={`score-${criterion.id}`}
                                    >
                                      Баллы
                                    </label>
                                    <input
                                      id={`score-${criterion.id}`}
                                      type="number"
                                      min={0}
                                      max={criterion.maxScore}
                                      step={1}
                                      value={draft.score}
                                      disabled={
                                        saving || isEvaluationSubmitted
                                      }
                                      onChange={(event) =>
                                        handleGradeChange(criterion.id, {
                                          score: event.target.value,
                                        })
                                      }
                                      placeholder={`От 0 до ${criterion.maxScore}`}
                                    />
                                  </div>

                                  <div className="judge-comment-field">
                                    <label
                                      htmlFor={`comment-${criterion.id}`}
                                    >
                                      Комментарий к критерию
                                    </label>
                                    <textarea
                                      id={`comment-${criterion.id}`}
                                      value={draft.comment}
                                      disabled={
                                        saving || isEvaluationSubmitted
                                      }
                                      onChange={(event) =>
                                        handleGradeChange(criterion.id, {
                                          comment: event.target.value,
                                        })
                                      }
                                      maxLength={5000}
                                      rows={2}
                                      placeholder="Обоснование оценки — необязательно"
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {isEvaluationSubmitted ? (
                            <div
                              className="judge-locked-notice"
                              role="status"
                            >
                              Эта оценка отправлена окончательно и доступна
                              только для просмотра.
                            </div>
                          ) : (
                            <div className="judge-evaluation-actions">
                              <button
                                className="org-secondary-button"
                                type="submit"
                                disabled={saving}
                              >
                                {saving
                                  ? "Сохраняем..."
                                  : "Сохранить черновик"}
                              </button>

                              <button
                                className="org-primary-button"
                                type="button"
                                onClick={handleSubmitEvaluation}
                                disabled={saving}
                              >
                                {saving
                                  ? "Обрабатываем..."
                                  : "Отправить оценку"}
                              </button>
                            </div>
                          )}
                        </form>
                      </article>
                    )}
                  </>
                )}
              </>
            ) : null}
          </section>
        </div>

        <footer className="org-footer">
          <span>© 2026 HackFlow</span>
          <span>Объективная оценка начинается с критериев.</span>
        </footer>
      </main>
    </div>
  );
}