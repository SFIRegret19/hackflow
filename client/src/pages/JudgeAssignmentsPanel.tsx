import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";
import { createPortal } from "react-dom";
import "./JudgeAssignmentsPanel.css";

type JudgeAssignment = {
  assignmentId: string;
  judgeId: string;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
  assignedAt: string;
};

type JudgeAssignmentsResponse = {
  judges: JudgeAssignment[];
};

type AssignJudgeResponse = {
  message: string;
  judge: JudgeAssignment;
};

type JudgeAssignmentsPanelProps = {
  hackathonId: string;
  hackathonName: string;
  onClose: () => void;
};

function formatAssignedAt(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function JudgeAssignmentsPanel({
  hackathonId,
  hackathonName,
  onClose,
}: JudgeAssignmentsPanelProps) {
  const [judges, setJudges] = useState<JudgeAssignment[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadJudges = useCallback(async () => {
    setLoading(true);

    try {
        const result = await apiRequest<JudgeAssignmentsResponse>(
        `/organizer/hackathons/${hackathonId}/judges`,
        );

        setJudges(result.judges);
        setError("");
    } catch (err) {
        setError(
        err instanceof Error
            ? err.message
            : "Не удалось загрузить список судей.",
        );
    } finally {
        setLoading(false);
    }
  }, [hackathonId]);
  useEffect(() => {
    let cancelled = false;

    async function loadInitialJudges() {
        try {
        const result = await apiRequest<JudgeAssignmentsResponse>(
            `/organizer/hackathons/${hackathonId}/judges`,
        );

        if (cancelled) return;

        setJudges(result.judges);
        setError("");
        } catch (err) {
        if (cancelled) return;

        setError(
            err instanceof Error
            ? err.message
            : "Не удалось загрузить список судей.",
        );
        } finally {
        if (!cancelled) {
            setLoading(false);
        }
        }
    }

    void loadInitialJudges();

    return () => {
        cancelled = true;
    };
  }, [hackathonId]);


  async function handleAssignJudge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setError("Укажи email судьи.");
      return;
    }

    setAssigning(true);
    setError("");
    setNotice("");

    try {
      const result = await apiRequest<AssignJudgeResponse>(
        `/organizer/hackathons/${hackathonId}/judges`,
        {
          method: "POST",
          body: { email: normalizedEmail },
        },
      );

      setNotice(result.message);
      setEmail("");

      await loadJudges();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось назначить судью.",
      );
    } finally {
      setAssigning(false);
    }
  }

  return createPortal(
    <div
      className="judge-assignment-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !assigning) {
          onClose();
        }
      }}
    >
      <section
        className="judge-assignment-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="judge-assignment-title"
      >
        <header className="judge-assignment-header">
          <div>
            <span className="org-eyebrow">КОМАНДА ОЦЕНИВАНИЯ</span>
            <h2 id="judge-assignment-title">Назначение судей</h2>
            <p>{hackathonName}</p>
          </div>

          <button
            className="judge-assignment-close"
            type="button"
            onClick={onClose}
            disabled={assigning}
            aria-label="Закрыть панель"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

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

        <form
          className="judge-assignment-form"
          onSubmit={handleAssignJudge}
        >
          <div className="org-field">
            <label htmlFor="judge-email">Email зарегистрированного пользователя</label>
            <input
              id="judge-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="judge@example.com"
              maxLength={254}
              required
            />
          </div>

          <button
            className="org-primary-button"
            type="submit"
            disabled={assigning}
          >
            {assigning ? "Назначаем..." : "Назначить судью"}
          </button>

          <p className="judge-assignment-hint">
            Пользователь должен быть зарегистрирован в HackFlow.
            После назначения ему будет доступен кабинет судьи.
          </p>
        </form>

        <div className="judge-assignment-list-heading">
          <div>
            <h3>Назначенные судьи</h3>
            <span>
              {judges.length}{" "}
              {judges.length === 1
                ? "судья"
                : judges.length >= 2 && judges.length <= 4
                  ? "судьи"
                  : "судей"}
            </span>
          </div>

          <button
            className="org-secondary-button"
            type="button"
            onClick={() => void loadJudges()}
            disabled={loading}
          >
            {loading ? "Загрузка..." : "Обновить"}
          </button>
        </div>

        {loading ? (
          <div className="judge-assignment-empty">
            Загружаем список судей...
          </div>
        ) : judges.length === 0 ? (
          <div className="judge-assignment-empty">
            <strong>Судьи пока не назначены</strong>
            <p>Введи email зарегистрированного пользователя выше.</p>
          </div>
        ) : (
          <ul className="judge-assignment-list">
            {judges.map((assignment) => (
              <li key={assignment.assignmentId}>
                <span className="judge-assignment-avatar" aria-hidden="true">
                  {(assignment.user.name?.trim() ||
                    assignment.user.email)[0].toUpperCase()}
                </span>

                <div className="judge-assignment-user">
                  <strong>
                    {assignment.user.name?.trim() || "Без имени"}
                  </strong>
                  <span>{assignment.user.email}</span>
                  <small>
                    Назначен: {formatAssignedAt(assignment.assignedAt)}
                  </small>
                </div>

                <span className="judge-assignment-status">Судья</span>
              </li>
            ))}
          </ul>
        )}

        <footer className="judge-assignment-footer">
          <button
            className="org-secondary-button"
            type="button"
            onClick={onClose}
            disabled={assigning}
          >
            Закрыть
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}