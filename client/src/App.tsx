import { useEffect, useState, type FormEvent } from "react";
import "./App.css";
import { apiRequest } from "./lib/api";
import OrganizerDashboard from "./pages/OrganizerDashboard";
import ParticipantDashboard from "./pages/ParticipantDashboard";
import InvitationAcceptance from "./pages/InvitationAcceptance";

type Role = "PARTICIPANT" | "ORGANIZER" | "JUDGE";

type User = {
  id: string;
  email: string;
  name: string | null;
  roles: Array<{
    role: Role;
  }>;
};

type AuthResponse = {
  message: string;
  user: User;
};

const roleLabels: Record<Role, string> = {
  PARTICIPANT: "Участник",
  ORGANIZER: "Организатор",
  JUDGE: "Судья",
};

function App() {
  const [mode, setMode] = useState<"login" | "register">("login");

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const [user, setUser] = useState<User | null>(null);
  const [dashboardView, setDashboardView] = useState<
    "ORGANIZER" | "PARTICIPANT"
  >("ORGANIZER");
  const [checkingSession, setCheckingSession] = useState(true);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    apiRequest<{ user: User }>("/auth/me")
      .then((data) => {
        if (active) {
          setUser(data.user);
        }
      })
      .catch(() => {
        if (active) {
          setUser(null);
        }
      })
      .finally(() => {
        if (active) {
          setCheckingSession(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  function switchMode(nextMode: "login" | "register") {
    setMode(nextMode);
    setError("");
    setNotice("");
    setPassword("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setNotice("");
    setLoading(true);

    try {
      if (mode === "register") {
        await apiRequest<AuthResponse>("/auth/register", {
          method: "POST",
          body: {
            email,
            name: name.trim(),
            password,
          },
        });

        setMode("login");
        setPassword("");
        setNotice(
          "Аккаунт создан. Теперь войдите, используя свой email и пароль.",
        );

        return;
      }

      const data = await apiRequest<AuthResponse>("/auth/login", {
        method: "POST",
        body: {
          email,
          password,
        },
      });

      setUser(data.user);
      setPassword("");
      setNotice("");
      const returnTo = new URLSearchParams(window.location.search).get(
        "returnTo",
      );

      if (returnTo?.startsWith("/invitations/accept")) {
        window.location.assign(returnTo);
        return;
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Произошла непредвиденная ошибка.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setError("");
    setNotice("");
    setLoading(true);

    try {
      await apiRequest<{ message: string }>("/auth/logout", {
        method: "POST",
      });

      setUser(null);
      setMode("login");
      setPassword("");
      setNotice("Вы вышли из аккаунта.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось выполнить выход.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (window.location.pathname === "/invitations/accept") {
    return (
      <InvitationAcceptance
        user={user}
        checkingSession={checkingSession}
      />
    );
  }

  const hasOrganizerRole =
    user?.roles.some(({ role }) => role === "ORGANIZER") ?? false;

  const hasParticipantRole =
    user?.roles.some(({ role }) => role === "PARTICIPANT") ?? false;

  function handleDashboardLogoutSuccess() {
    setUser(null);
    setMode("login");
    setPassword("");
    setError("");
    setNotice("");
    setDashboardView("ORGANIZER");
  }

  if (
    !checkingSession &&
    user !== null &&
    (hasOrganizerRole || hasParticipantRole)
  ) {
    const activeDashboard: "ORGANIZER" | "PARTICIPANT" =
      hasOrganizerRole && dashboardView === "ORGANIZER"
        ? "ORGANIZER"
        : "PARTICIPANT";

    const dashboardProps = {
      user,
      onLogoutSuccess: handleDashboardLogoutSuccess,
      showDashboardSwitcher: hasOrganizerRole,
      activeDashboard,
      onDashboardViewChange: setDashboardView,
    };

    return activeDashboard === "ORGANIZER" ? (
      <OrganizerDashboard {...dashboardProps} />
    ) : (
      <ParticipantDashboard {...dashboardProps} />
    );
  }

  const displayName =
    user?.name?.trim() || user?.email.split("@")[0] || "Участник";

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="/"
          aria-label="HackFlow — главная"
          onClick={(event) => event.preventDefault()}
        >
          <span className="brand-mark">H</span>

          <span className="brand-copy">
            <span className="brand-name">hackflow</span>
            <span className="brand-caption">HACKATHON PLATFORM</span>
          </span>
        </a>

        <div className="topbar-note">
          <span className="status-dot" />
          Пространство для идей и команд
        </div>
      </header>

      <main className="main-layout">
        <section className="intro-panel">
          <div className="intro-content">
            <div className="eyebrow">
              <span className="eyebrow-line" />
              СОЗДАВАЙ. СОТРУДНИЧАЙ. ПОБЕЖДАЙ.
            </div>

            <h1>
              Большие идеи
              <br />
              начинаются <span>с команды.</span>
            </h1>

            <p className="intro-description">
              Находи хакатоны, объединяйся с разработчиками,
              представляй проекты и превращай идеи в результаты.
            </p>

            <div className="feature-list">
              <div className="feature-item">
                <span className="feature-icon">01</span>

                <div>
                  <h3>Находи возможности</h3>
                  <p>Выбирай интересные хакатоны и темы.</p>
                </div>
              </div>

              <div className="feature-item">
                <span className="feature-icon">02</span>

                <div>
                  <h3>Собирай команду</h3>
                  <p>Объединяй людей с общими целями.</p>
                </div>
              </div>

              <div className="feature-item">
                <span className="feature-icon">03</span>

                <div>
                  <h3>Показывай результат</h3>
                  <p>Представляй проекты и участвуй в соревновании.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="decor-orbit decor-orbit-one" />
          <div className="decor-orbit decor-orbit-two" />

          <div className="intro-footer">
            <span>HACKFLOW / 2026</span>
            <span>Твоя следующая большая идея начинается здесь.</span>
          </div>
        </section>

        <section className="form-panel">
          {checkingSession ? (
            <div className="auth-card loading-card">
              <div className="loading-spinner" />
              <p>Проверяем авторизацию...</p>
            </div>
          ) : user ? (
            <div className="auth-card dashboard-card">
              <div className="dashboard-icon">✓</div>

              <div className="card-eyebrow">ЛИЧНЫЙ КАБИНЕТ</div>

              <h2>С возвращением, {displayName}!</h2>

              <p className="card-description">
                Ты успешно вошёл в HackFlow. Аккаунт готов к работе.
              </p>

              <div className="profile-block">
                <div className="avatar">
                  {displayName.charAt(0).toUpperCase()}
                </div>

                <div className="profile-info">
                  <strong>{displayName}</strong>
                  <span>{user.email}</span>
                </div>
              </div>

              <div className="role-section">
                <span className="field-label">ТВОИ РОЛИ</span>

                <div className="role-list">
                  {user.roles.map(({ role }) => (
                    <span className="role-badge" key={role}>
                      {roleLabels[role]}
                    </span>
                  ))}
                </div>
              </div>

              <div className="dashboard-notice">
                <span className="notice-indicator" />

                <div>
                  <strong>Аккаунт активен</strong>
                  <p>
                    Следующий шаг — подключение хакатонов,
                    команд и проектов.
                  </p>
                </div>
              </div>

              {error && (
                <div className="alert alert-error" role="alert">
                  {error}
                </div>
              )}

              <button
                className="primary-button"
                type="button"
                onClick={handleLogout}
                disabled={loading}
              >
                {loading ? "Выполняем выход..." : "Выйти из аккаунта"}
                {!loading && <span aria-hidden="true">↗</span>}
              </button>
            </div>
          ) : (
            <div className="auth-card">
              <div className="card-topline">
                <span className="card-eyebrow">ТВОЁ ПРОСТРАНСТВО</span>
                <span className="secure-label">● Безопасный вход</span>
              </div>

              <h2>
                {mode === "login"
                  ? "С возвращением"
                  : "Создай свой аккаунт"}
              </h2>

              <p className="card-description">
                {mode === "login"
                  ? "Войди, чтобы продолжить работу над своими проектами."
                  : "Присоединяйся к сообществу и участвуй в хакатонах."}
              </p>

              <div className="auth-tabs">
                <button
                  type="button"
                  className={mode === "login" ? "auth-tab active" : "auth-tab"}
                  onClick={() => switchMode("login")}
                >
                  Вход
                </button>

                <button
                  type="button"
                  className={
                    mode === "register" ? "auth-tab active" : "auth-tab"
                  }
                  onClick={() => switchMode("register")}
                >
                  Регистрация
                </button>
              </div>

              {notice && (
                <div className="alert alert-success" role="status">
                  {notice}
                </div>
              )}

              {error && (
                <div className="alert alert-error" role="alert">
                  {error}
                </div>
              )}

              <form className="auth-form" onSubmit={handleSubmit}>
                {mode === "register" && (
                  <div className="form-field">
                    <label htmlFor="name">Имя</label>

                    <input
                      id="name"
                      type="text"
                      placeholder="Как к тебе обращаться"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      maxLength={100}
                      autoComplete="name"
                      required
                    />
                  </div>
                )}

                <div className="form-field">
                  <label htmlFor="email">Электронная почта</label>

                  <input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    maxLength={254}
                    autoComplete="email"
                    required
                  />
                </div>

                <div className="form-field">
                  <div className="label-row">
                    <label htmlFor="password">Пароль</label>

                    {mode === "register" && (
                      <span className="field-hint">От 12 символов</span>
                    )}
                  </div>

                  <input
                    id="password"
                    type="password"
                    placeholder={
                      mode === "login"
                        ? "Введи свой пароль"
                        : "Придумай надёжный пароль"
                    }
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    minLength={12}
                    required
                  />
                </div>

                <button
                  className="primary-button"
                  type="submit"
                  disabled={loading}
                >
                  <span>
                    {loading
                      ? "Пожалуйста, подожди..."
                      : mode === "login"
                        ? "Войти в аккаунт"
                        : "Создать аккаунт"}
                  </span>

                  {!loading && <span aria-hidden="true">↗</span>}
                </button>
              </form>

              <p className="form-footnote">
                {mode === "login"
                  ? "Впереди новые идеи, проекты и возможности."
                  : "Создавая аккаунт, ты присоединяешься к HackFlow."}
              </p>
            </div>
          )}
        </section>
      </main>

      <footer className="site-footer">
        <span>© 2026 HackFlow</span>
        <span>Создано для тех, кто меняет будущее.</span>
      </footer>
    </div>
  );
}

export default App;