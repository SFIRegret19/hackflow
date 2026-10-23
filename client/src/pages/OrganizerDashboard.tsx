import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { apiRequest } from "../lib/api";
import CriteriaPanel, { type Criterion } from "./CriteriaPanel";
import "./OrganizerDashboard.css";

type Role = "PARTICIPANT" | "ORGANIZER" | "JUDGE";

type User = {
  id: string;
  email: string;
  name: string | null;
  roles: Array<{ role: Role }>;
};

type HackathonStatus = "DRAFT" | "PUBLISHED" | "CANCELLED";

type Hackathon = {
  id: string;
  name: string;
  theme: string;
  description: string | null;
  startAt: string;
  endAt: string;
  status: HackathonStatus;
  createdAt: string;
  updatedAt: string;
  _count: { teams: number };
  criteria: Criterion[];
};

type HackathonForm = {
  name: string;
  theme: string;
  description: string;
  startAt: string;
  endAt: string;
};

type DashboardView = "ORGANIZER" | "PARTICIPANT";

type OrganizerDashboardProps = {
  user: User;
  onLogoutSuccess: () => void;
  showDashboardSwitcher: boolean;
  activeDashboard: DashboardView;
  onDashboardViewChange: (view: DashboardView) => void;
};

const statusInfo: Record<
  HackathonStatus,
  { label: string; className: string }
> = {
  DRAFT: { label: "Черновик", className: "draft" },
  PUBLISHED: { label: "Опубликован", className: "published" },
  CANCELLED: { label: "Отменён", className: "cancelled" },
};

function toDateTimeLocal(date: Date): string {
  const timezoneOffset = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - timezoneOffset)
    .toISOString()
    .slice(0, 16);
}

function createEmptyForm(): HackathonForm {
  const startAt = new Date();
  startAt.setDate(startAt.getDate() + 7);
  startAt.setHours(10, 0, 0, 0);

  const endAt = new Date(startAt);
  endAt.setDate(endAt.getDate() + 1);
  endAt.setHours(18, 0, 0, 0);

  return {
    name: "",
    theme: "",
    description: "",
    startAt: toDateTimeLocal(startAt),
    endAt: toDateTimeLocal(endAt),
  };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateRange(hackathon: Hackathon): string {
  return `${formatDate(hackathon.startAt)} — ${formatDate(hackathon.endAt)}`;
}

export default function OrganizerDashboard({
  user,
  onLogoutSuccess,
  showDashboardSwitcher,
  activeDashboard,
  onDashboardViewChange,
}: OrganizerDashboardProps) {
  const [hackathons, setHackathons] = useState<Hackathon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<HackathonForm>(createEmptyForm);

  const [selectedForCriteria, setSelectedForCriteria] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadHackathons = useCallback(async () => {

    try {
      const result = await apiRequest<{ hackathons: Hackathon[] }>(
        "/organizer/hackathons",
      );

      setHackathons(result.hackathons);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось загрузить хакатоны.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    apiRequest<{ hackathons: Hackathon[] }>(
        "/organizer/hackathons",
    )
        .then((result) => {
        if (cancelled) return;

        setHackathons(result.hackathons);
        setError("");
        })
        .catch((err: unknown) => {
        if (cancelled) return;

        setError(
            err instanceof Error
            ? err.message
            : "Не удалось загрузить хакатоны.",
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
}, []);

  const stats = useMemo(
    () => ({
      total: hackathons.length,
      published: hackathons.filter((item) => item.status === "PUBLISHED").length,
      drafts: hackathons.filter((item) => item.status === "DRAFT").length,
      teams: hackathons.reduce((sum, item) => sum + item._count.teams, 0),
    }),
    [hackathons],
  );

  function startCreating() {
    setEditingId(null);
    setForm(createEmptyForm());
    setShowForm(true);
    setError("");
    setNotice("");
  }

  function startEditing(hackathon: Hackathon) {
    setEditingId(hackathon.id);

    setForm({
      name: hackathon.name,
      theme: hackathon.theme,
      description: hackathon.description ?? "",
      startAt: toDateTimeLocal(new Date(hackathon.startAt)),
      endAt: toDateTimeLocal(new Date(hackathon.endAt)),
    });

    setShowForm(true);
    setError("");
    setNotice("");
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(createEmptyForm());
    setError("");
  }

  async function handleSaveHackathon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setNotice("");

    if (new Date(form.startAt) >= new Date(form.endAt)) {
      setError("Дата окончания должна быть позже даты начала.");
      return;
    }

    setSaving(true);

    try {
      const body = {
        name: form.name.trim(),
        theme: form.theme.trim(),
        description: form.description.trim(),
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
      };

      const result = await apiRequest<{ message: string }>(
        editingId
          ? `/organizer/hackathons/${editingId}`
          : "/organizer/hackathons",
        {
          method: editingId ? "PATCH" : "POST",
          body,
        },
      );

      setNotice(result.message);
      closeForm();
      await loadHackathons();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось сохранить хакатон.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish(hackathon: Hackathon) {
    const confirmed = window.confirm(
      `Опубликовать хакатон «${hackathon.name}»? После публикации критерии оценивания нельзя будет изменять.`,
    );

    if (!confirmed) return;

    setError("");
    setNotice("");

    try {
      const result = await apiRequest<{ message: string }>(
        `/organizer/hackathons/${hackathon.id}/publish`,
        { method: "POST" },
      );

      setNotice(result.message);
      await loadHackathons();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось опубликовать хакатон.",
      );
    }
  }

  async function handleCancel(hackathon: Hackathon) {
    const confirmed = window.confirm(
      `Отменить хакатон «${hackathon.name}»?`,
    );

    if (!confirmed) return;

    setError("");
    setNotice("");

    try {
      const result = await apiRequest<{ message: string }>(
        `/organizer/hackathons/${hackathon.id}/cancel`,
        { method: "POST" },
      );

      setNotice(result.message);
      await loadHackathons();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось отменить хакатон.",
      );
    }
  }

  async function handleLogout() {
    setError("");
    setLoggingOut(true);

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
    user.name?.trim() || user.email.split("@")[0] || "Организатор";

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
            <span className="org-eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</span>
            <h1>Твои хакатоны</h1>
            <p>
              Создавай мероприятия, настраивай правила оценки и следи за
              подготовкой команд.
            </p>
          </div>

          <button
            className="org-primary-button org-create-button"
            type="button"
            onClick={startCreating}
          >
            <span aria-hidden="true">＋</span>
            Создать хакатон
          </button>
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

        <section className="org-stats-grid">
          <article className="org-stat-card">
            <span className="org-stat-icon purple">◇</span>
            <span className="org-stat-label">Всего мероприятий</span>
            <strong>{stats.total}</strong>
            <small>В твоём пространстве</small>
          </article>

          <article className="org-stat-card">
            <span className="org-stat-icon green">✓</span>
            <span className="org-stat-label">Опубликовано</span>
            <strong>{stats.published}</strong>
            <small>Доступны участникам</small>
          </article>

          <article className="org-stat-card">
            <span className="org-stat-icon amber">✎</span>
            <span className="org-stat-label">Черновики</span>
            <strong>{stats.drafts}</strong>
            <small>Требуют подготовки</small>
          </article>

          <article className="org-stat-card">
            <span className="org-stat-icon blue">♧</span>
            <span className="org-stat-label">Команды</span>
            <strong>{stats.teams}</strong>
            <small>Во всех мероприятиях</small>
          </article>
        </section>

        {showForm && (
          <section className="org-form-card">
            <div className="org-form-heading">
              <div>
                <span className="org-eyebrow">
                  {editingId ? "РЕДАКТИРОВАНИЕ" : "НОВОЕ МЕРОПРИЯТИЕ"}
                </span>
                <h2>{editingId ? "Изменить хакатон" : "Создать хакатон"}</h2>
              </div>

              <button
                className="org-text-button"
                type="button"
                onClick={closeForm}
              >
                Закрыть
              </button>
            </div>

            <form onSubmit={handleSaveHackathon}>
              <div className="org-form-grid">
                <div className="org-field full-width">
                  <label htmlFor="hackathon-name">Название хакатона</label>
                  <input
                    id="hackathon-name"
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                    minLength={3}
                    maxLength={150}
                    required
                    placeholder="Например, CityTech Hackathon 2027"
                  />
                </div>

                <div className="org-field full-width">
                  <label htmlFor="hackathon-theme">Тема</label>
                  <input
                    id="hackathon-theme"
                    value={form.theme}
                    onChange={(event) =>
                      setForm({ ...form, theme: event.target.value })
                    }
                    minLength={2}
                    maxLength={200}
                    required
                    placeholder="Например, умный город"
                  />
                </div>

                <div className="org-field">
                  <label htmlFor="hackathon-start">Начало</label>
                  <input
                    id="hackathon-start"
                    type="datetime-local"
                    value={form.startAt}
                    onChange={(event) =>
                      setForm({ ...form, startAt: event.target.value })
                    }
                    required
                  />
                </div>

                <div className="org-field">
                  <label htmlFor="hackathon-end">Окончание</label>
                  <input
                    id="hackathon-end"
                    type="datetime-local"
                    value={form.endAt}
                    onChange={(event) =>
                      setForm({ ...form, endAt: event.target.value })
                    }
                    required
                  />
                </div>

                <div className="org-field full-width">
                  <label htmlFor="hackathon-description">Описание</label>
                  <textarea
                    id="hackathon-description"
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                    maxLength={10000}
                    rows={4}
                    placeholder="Расскажи о целях и задачах мероприятия..."
                  />
                </div>
              </div>

              <div className="org-form-actions">
                <button
                  className="org-secondary-button"
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Отмена
                </button>

                <button
                  className="org-primary-button"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? "Сохраняем..." : "Сохранить черновик"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="org-hackathons-section">
          <div className="org-section-heading">
            <div>
              <span className="org-eyebrow">УПРАВЛЕНИЕ</span>
              <h2>Мероприятия</h2>
            </div>

            <button
              className="org-secondary-button"
              type="button"
              onClick={() => {
                setLoading(true);
                void loadHackathons();
              }}
              disabled={loading}
            >
              Обновить
            </button>
          </div>

          {loading ? (
            <div className="org-empty-state">
              <span className="org-empty-icon">↻</span>
              <strong>Загружаем хакатоны...</strong>
            </div>
          ) : hackathons.length === 0 ? (
            <div className="org-empty-state">
              <span className="org-empty-icon">◇</span>
              <strong>Пока нет хакатонов</strong>
              <p>
                Создай первое мероприятие, задай критерии и подготовь его к
                публикации.
              </p>

              <button
                className="org-primary-button"
                type="button"
                onClick={startCreating}
              >
                Создать первый хакатон
              </button>
            </div>
          ) : (
            <div className="org-hackathons-grid">
              {hackathons.map((hackathon) => {
                const status = statusInfo[hackathon.status];

                return (
                  <article className="org-hackathon-card" key={hackathon.id}>
                    <div className="org-card-top">
                      <span className={`org-status-badge ${status.className}`}>
                        <span />
                        {status.label}
                      </span>

                      <span className="org-card-index">
                        HF / {hackathon.id.slice(-5).toUpperCase()}
                      </span>
                    </div>

                    <h3>{hackathon.name}</h3>
                    <p className="org-card-theme">{hackathon.theme}</p>

                    <p className="org-card-description">
                      {hackathon.description || "Описание пока не добавлено."}
                    </p>

                    <div className="org-card-meta">
                      <div>
                        <span className="org-meta-icon">◷</span>
                        <span>{formatDateRange(hackathon)}</span>
                      </div>

                      <div>
                        <span className="org-meta-icon">♧</span>
                        <span>
                          {hackathon._count.teams}{" "}
                          {hackathon._count.teams === 1
                            ? "команда"
                            : "команд"}
                        </span>
                      </div>

                      <div>
                        <span className="org-meta-icon">◎</span>
                        <span>
                          {hackathon.criteria.length} крит.
                          {" · "}
                          {hackathon.criteria.reduce(
                            (sum, criterion) => sum + criterion.maxScore,
                            0,
                          )}{" "}
                          баллов максимум
                        </span>
                      </div>
                    </div>

                    <div className="org-card-actions">
                      {hackathon.status === "DRAFT" && (
                        <>
                          <button
                            className="org-secondary-button"
                            type="button"
                            onClick={() => startEditing(hackathon)}
                          >
                            Редактировать
                          </button>

                          <button
                            className="org-primary-button"
                            type="button"
                            onClick={() =>
                              setSelectedForCriteria({
                                id: hackathon.id,
                                name: hackathon.name,
                              })
                            }
                          >
                            Критерии
                          </button>

                          <button
                            className="org-publish-button"
                            type="button"
                            disabled={hackathon.criteria.length === 0}
                            title={
                              hackathon.criteria.length === 0
                                ? "Добавь хотя бы один критерий"
                                : "Опубликовать хакатон"
                            }
                            onClick={() => void handlePublish(hackathon)}
                          >
                            Опубликовать
                          </button>
                        </>
                      )}

                      {hackathon.status === "PUBLISHED" && (
                        <button
                          className="org-secondary-button danger"
                          type="button"
                          onClick={() => void handleCancel(hackathon)}
                        >
                          Отменить хакатон
                        </button>
                      )}

                      {hackathon.status === "CANCELLED" && (
                        <span className="org-muted">
                          Мероприятие отменено
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <footer className="org-footer">
          <span>© 2026 HackFlow</span>
          <span>Платформа для идей, команд и результатов.</span>
        </footer>
      </main>

      {selectedForCriteria && (
        <CriteriaPanel
          hackathon={selectedForCriteria}
          onClose={() => setSelectedForCriteria(null)}
          onChanged={() => void loadHackathons()}
        />
      )}
    </div>
  );
}