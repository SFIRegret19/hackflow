import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import "./HackathonResultsPanel.css";
import "./OrganizerDashboard.css";

type CriterionResult = {
  id: string;
  name: string;
  description: string | null;
  maxScore: number;
  sortOrder: number;
};

type GradeResult = {
  criterionId: string;
  score: number;
  comment: string | null;
  criterion: {
    id: string;
    name: string;
    maxScore: number;
    sortOrder: number;
  };
};

type EvaluationResult = {
  id: string;
  submittedAt: string | null;
  judge: {
    id: string;
    user: {
      id: string;
      name: string | null;
      email: string;
    };
  };
  totalScore: number;
  maxScore: number;
  grades: GradeResult[];
};

type ProjectResult = {
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
  evaluationCount: number;
  maxScore: number;
  averageScore: number | null;
  evaluations: EvaluationResult[];
  rank: number | null;
};

type ResultsResponse = {
  hackathon: {
    id: string;
    name: string;
    status: string;
    maxScore: number;
  };
  criteria: CriterionResult[];
  projects: ProjectResult[];
};

type HackathonResultsPanelProps = {
  hackathonId: string;
  hackathonName: string;
  onClose: () => void;
};

function formatDate(value: string | null): string {
  if (!value) return "Не указана";

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function HackathonResultsPanel({
  hackathonId,
  hackathonName,
  onClose,
}: HackathonResultsPanelProps) {
  const [data, setData] = useState<ResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    apiRequest<ResultsResponse>(
      `/organizer/hackathons/${hackathonId}/results`,
    )
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError("");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Не удалось загрузить результаты хакатона.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hackathonId]);

  return (
    <div className="results-overlay">
      <section
        className="results-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="results-title"
      >
        <header className="results-header">
          <div>
            <span className="org-eyebrow">ИТОГИ ХАКАТОНА</span>
            <h2 id="results-title">{hackathonName}</h2>
            <p>
              Рейтинг команд и оценки, окончательно отправленные судьями.
            </p>
          </div>

          <button
            className="org-icon-button"
            type="button"
            onClick={onClose}
            aria-label="Закрыть результаты"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        {loading ? (
          <div className="org-empty-state">
            <span className="org-empty-icon" aria-hidden="true">
              …
            </span>
            <strong>Загружаем результаты</strong>
            <p>Получаем оценки судей и формируем рейтинг.</p>
          </div>
        ) : error ? (
          <div className="org-alert org-alert-error" role="alert">
            {error}
          </div>
        ) : data ? (
          <>
            <div className="results-summary">
              <div>
                <span>Проектов подано</span>
                <strong>{data.projects.length}</strong>
              </div>

              <div>
                <span>Критериев</span>
                <strong>{data.criteria.length}</strong>
              </div>

              <div>
                <span>Максимальный балл</span>
                <strong>{data.hackathon.maxScore}</strong>
              </div>
            </div>

            <section className="results-criteria-section">
              <div className="org-section-heading">
                <div>
                  <span className="org-eyebrow">
                    СИСТЕМА ОЦЕНИВАНИЯ
                  </span>
                  <h3>Критерии</h3>
                </div>
              </div>

              {data.criteria.length === 0 ? (
                <p className="org-muted">
                  Для этого хакатона ещё не настроены критерии.
                </p>
              ) : (
                <div className="results-criteria-list">
                  {data.criteria.map((criterion) => (
                    <div
                      className="results-criterion-chip"
                      key={criterion.id}
                    >
                      <span>{criterion.name}</span>
                      <strong>{criterion.maxScore} баллов</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="results-projects-section">
              <div className="org-section-heading">
                <div>
                  <span className="org-eyebrow">
                    ФИНАЛЬНЫЕ РЕЗУЛЬТАТЫ
                  </span>
                  <h3>Рейтинг команд</h3>
                </div>
              </div>

              {data.projects.length === 0 ? (
                <div className="org-empty-state">
                  <strong>Пока нет отправленных проектов</strong>
                  <p>
                    Когда команды отправят проекты, здесь появятся их
                    результаты.
                  </p>
                </div>
              ) : (
                <div className="results-project-list">
                  {data.projects.map((project) => (
                    <article
                      className="results-project-card"
                      key={project.id}
                    >
                      <div className="results-project-heading">
                        <div className="results-rank">
                          {project.rank === null
                            ? "—"
                            : `#${project.rank}`}
                        </div>

                        <div className="results-project-title">
                          <span className="org-eyebrow">
                            {project.team.name}
                          </span>
                          <h4>{project.name}</h4>
                        </div>

                        <div className="results-project-score">
                          {project.averageScore === null ? (
                            <>
                              <strong>—</strong>
                              <span>Нет оценок</span>
                            </>
                          ) : (
                            <>
                              <strong>
                                {project.averageScore}
                                <small> / {project.maxScore}</small>
                              </strong>
                              <span>
                                {project.evaluationCount === 1
                                  ? "1 оценка"
                                  : project.evaluationCount < 5
                                    ? `${project.evaluationCount} оценки`
                                    : `${project.evaluationCount} оценок`}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <p className="results-project-description">
                        {project.description}
                      </p>

                      <div className="results-project-meta">
                        <span>
                          Отправлен: {formatDate(project.submittedAt)}
                        </span>

                        <a
                          href={project.repositoryUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Репозиторий ↗
                        </a>
                      </div>

                      <div className="results-team-members">
                        {project.team.members.map((member, index) => (
                          <span
                            className="results-member-chip"
                            key={`${member.user.id}-${index}`}
                          >
                            {member.user.name || "Участник"}
                            {member.role === "CAPTAIN"
                              ? " · Капитан"
                              : ""}
                          </span>
                        ))}
                      </div>

                      {project.evaluations.length > 0 ? (
                        <details className="results-evaluations">
                          <summary>
                            Оценки судей ({project.evaluations.length})
                          </summary>

                          <div className="results-evaluation-list">
                            {project.evaluations.map((evaluation) => (
                              <section
                                className="results-evaluation-card"
                                key={evaluation.id}
                              >
                                <div className="results-evaluation-heading">
                                  <div>
                                    <strong>
                                      {evaluation.judge.user.name ||
                                        evaluation.judge.user.email}
                                    </strong>
                                    <span>
                                      {evaluation.judge.user.email}
                                    </span>
                                  </div>

                                  <strong className="results-evaluation-score">
                                    {evaluation.totalScore} /{" "}
                                    {evaluation.maxScore}
                                  </strong>
                                </div>

                                <p className="results-evaluation-date">
                                  Отправлено:{" "}
                                  {formatDate(evaluation.submittedAt)}
                                </p>

                                <div className="results-grade-list">
                                  {evaluation.grades
                                    .slice()
                                    .sort(
                                      (a, b) =>
                                        a.criterion.sortOrder -
                                        b.criterion.sortOrder,
                                    )
                                    .map((grade) => (
                                      <div
                                        className="results-grade-row"
                                        key={grade.criterionId}
                                      >
                                        <div>
                                          <strong>
                                            {grade.criterion.name}
                                          </strong>

                                          {grade.comment && (
                                            <p>{grade.comment}</p>
                                          )}
                                        </div>

                                        <span>
                                          {grade.score} /{" "}
                                          {grade.criterion.maxScore}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              </section>
                            ))}
                          </div>
                        </details>
                      ) : (
                        <p className="results-no-evaluations">
                          Пока нет окончательно отправленных оценок.
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </section>
    </div>
  );
}