import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";

export type Criterion = {
  id: string;
  hackathonId: string;
  name: string;
  description: string | null;
  maxScore: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type CriteriaPanelProps = {
  hackathon: {
    id: string;
    name: string;
  };
  onClose: () => void;
  onChanged: () => void;
};

type CriterionForm = {
  name: string;
  description: string;
  maxScore: string;
  sortOrder: string;
};

function emptyForm(): CriterionForm {
  return {
    name: "",
    description: "",
    maxScore: "10",
    sortOrder: "0",
  };
}

export default function CriteriaPanel({
  hackathon,
  onClose,
  onChanged,
}: CriteriaPanelProps) {
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CriterionForm>(emptyForm);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadCriteria = useCallback(async () => {

    try {
      const result = await apiRequest<{ criteria: Criterion[] }>(
        `/organizer/hackathons/${hackathon.id}/criteria`,
      );

      setCriteria(result.criteria);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось загрузить критерии.",
      );
    } finally {
      setLoading(false);
    }
  }, [hackathon.id]);

  useEffect(() => {
    let cancelled = false;

    apiRequest<{ criteria: Criterion[] }>(
        `/organizer/hackathons/${hackathon.id}/criteria`,
    )
        .then((result) => {
        if (cancelled) return;

        setCriteria(result.criteria);
        setError("");
        })
        .catch((err: unknown) => {
        if (cancelled) return;

        setError(
            err instanceof Error
            ? err.message
            : "Не удалось загрузить критерии.",
        );
        })
        .finally(() => {
        if (!cancelled) {
            setLoading(false);
        }
        });

    return () => {
        cancelled = true;
    };
  }, [hackathon.id]);

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm());
    setError("");
    setNotice("");
  }

  function startEditing(criterion: Criterion) {
    setEditingId(criterion.id);
    setForm({
      name: criterion.name,
      description: criterion.description ?? "",
      maxScore: String(criterion.maxScore),
      sortOrder: String(criterion.sortOrder),
    });
    setError("");
    setNotice("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);

    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim(),
        maxScore: Number(form.maxScore),
        sortOrder: Number(form.sortOrder),
      };

      const result = await apiRequest<{ message: string }>(
        editingId
          ? `/organizer/hackathons/${hackathon.id}/criteria/${editingId}`
          : `/organizer/hackathons/${hackathon.id}/criteria`,
        {
          method: editingId ? "PATCH" : "POST",
          body,
        },
      );

      setNotice(result.message);
      setEditingId(null);
      setForm(emptyForm());

      await loadCriteria();
      onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось сохранить критерий.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(criterion: Criterion) {
    const confirmed = window.confirm(
      `Удалить критерий «${criterion.name}»?`,
    );

    if (!confirmed) return;

    setError("");
    setNotice("");

    try {
      const result = await apiRequest<{ message: string }>(
        `/organizer/hackathons/${hackathon.id}/criteria/${criterion.id}`,
        { method: "DELETE" },
      );

      setNotice(result.message);

      if (editingId === criterion.id) {
        resetForm();
      }

      await loadCriteria();
      onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось удалить критерий.",
      );
    }
  }

  const totalScore = criteria.reduce(
    (sum, criterion) => sum + criterion.maxScore,
    0,
  );

  return (
    <div
      className="criteria-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="criteria-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="criteria-title"
      >
        <header className="criteria-header">
          <div>
            <span className="org-eyebrow">НАСТРОЙКИ ОЦЕНИВАНИЯ</span>
            <h2 id="criteria-title">Критерии проекта</h2>
            <p>{hackathon.name}</p>
          </div>

          <button
            className="org-icon-button"
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>

        <div className="criteria-summary">
          <div>
            <span>Критериев</span>
            <strong>{criteria.length}</strong>
          </div>
          <div>
            <span>Максимум баллов</span>
            <strong>{totalScore}</strong>
          </div>
        </div>

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

        <div className="criteria-list-section">
          <div className="org-section-heading">
            <h3>Список критериев</h3>
            <span>{criteria.length} шт.</span>
          </div>

          {loading ? (
            <p className="org-muted">Загружаем критерии...</p>
          ) : criteria.length === 0 ? (
            <div className="org-empty-state">
              <span className="org-empty-icon">◎</span>
              <strong>Пока нет критериев</strong>
              <p>Добавь хотя бы один критерий, чтобы подготовить хакатон к публикации.</p>
            </div>
          ) : (
            <div className="criteria-list">
              {criteria.map((criterion, index) => (
                <article className="criterion-item" key={criterion.id}>
                  <div className="criterion-number">
                    {String(index + 1).padStart(2, "0")}
                  </div>

                  <div className="criterion-info">
                    <strong>{criterion.name}</strong>
                    <span>
                      {criterion.description || "Описание не задано"}
                    </span>
                    <small>Порядок: {criterion.sortOrder}</small>
                  </div>

                  <div className="criterion-score">
                    <strong>{criterion.maxScore}</strong>
                    <span>баллов</span>
                  </div>

                  <div className="criterion-actions">
                    <button
                      type="button"
                      className="org-small-button"
                      onClick={() => startEditing(criterion)}
                    >
                      Изменить
                    </button>

                    <button
                      type="button"
                      className="org-small-button danger"
                      onClick={() => void handleDelete(criterion)}
                    >
                      Удалить
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <form className="criteria-form" onSubmit={handleSubmit}>
          <div className="org-section-heading">
            <h3>{editingId ? "Редактирование критерия" : "Новый критерий"}</h3>

            {editingId && (
              <button
                type="button"
                className="org-text-button"
                onClick={resetForm}
              >
                Отмена
              </button>
            )}
          </div>

          <div className="org-form-grid">
            <div className="org-field full-width">
              <label htmlFor="criterion-name">Название</label>
              <input
                id="criterion-name"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                minLength={2}
                maxLength={120}
                required
                placeholder="Например, Инновационность"
              />
            </div>

            <div className="org-field">
              <label htmlFor="criterion-max-score">Максимальный балл</label>
              <input
                id="criterion-max-score"
                type="number"
                min={1}
                max={1000}
                step={1}
                value={form.maxScore}
                onChange={(event) =>
                  setForm({ ...form, maxScore: event.target.value })
                }
                required
              />
            </div>

            <div className="org-field">
              <label htmlFor="criterion-sort">Порядок</label>
              <input
                id="criterion-sort"
                type="number"
                min={0}
                max={10000}
                step={1}
                value={form.sortOrder}
                onChange={(event) =>
                  setForm({ ...form, sortOrder: event.target.value })
                }
                required
              />
            </div>

            <div className="org-field full-width">
              <label htmlFor="criterion-description">Описание</label>
              <textarea
                id="criterion-description"
                rows={3}
                maxLength={2000}
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                placeholder="Что именно должен оценивать судья?"
              />
            </div>
          </div>

          <button
            className="org-primary-button"
            type="submit"
            disabled={saving}
          >
            {saving
              ? "Сохраняем..."
              : editingId
                ? "Сохранить изменения"
                : "Добавить критерий"}
            {!saving && <span aria-hidden="true">↗</span>}
          </button>
        </form>
      </section>
    </div>
  );
}