import { useState } from "react";
import { apiRequest } from "../lib/api";
import "./InvitationAcceptance.css";

type InvitationUser = {
  id: string;
  email: string;
  name: string | null;
} | null;

type InvitationAcceptanceProps = {
  user: InvitationUser;
  checkingSession: boolean;
};

type AcceptedTeam = {
  id: string;
  name: string;
  hackathon: {
    id: string;
    name: string;
  };
};

export default function InvitationAcceptance({
  user,
  checkingSession,
}: InvitationAcceptanceProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [acceptedTeam, setAcceptedTeam] = useState<AcceptedTeam | null>(
    null,
  );

  const token = new URLSearchParams(window.location.search).get("token");

  function goToLogin() {
    const returnTo = `${window.location.pathname}${window.location.search}`;

    window.location.assign(`/?returnTo=${encodeURIComponent(returnTo)}`);
  }

  async function handleAccept() {
    if (!token) {
      setError("В ссылке отсутствует токен приглашения.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await apiRequest<{
        message: string;
        team: AcceptedTeam;
      }>("/invitations/accept", {
        method: "POST",
        body: { token },
      });

      setAcceptedTeam(result.team);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось принять приглашение.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSwitchAccount() {
    setBusy(true);
    setError("");

    try {
      await apiRequest<{ message: string }>("/auth/logout", {
        method: "POST",
      });

      goToLogin();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось сменить аккаунт.",
      );
      setBusy(false);
    }
  }

  return (
    <main className="invitation-page">
      <header className="invitation-brand">
        <span className="invitation-brand-mark">H</span>
        <span>hackflow</span>
      </header>

      <section className="invitation-card">
        {checkingSession ? (
          <>
            <div className="invitation-symbol">↻</div>
            <span className="org-eyebrow">ПРИГЛАШЕНИЕ</span>
            <h1>Проверяем аккаунт</h1>
            <p>Подготавливаем приглашение...</p>
          </>
        ) : acceptedTeam ? (
          <>
            <div className="invitation-symbol success">✓</div>
            <span className="org-eyebrow">ПРИГЛАШЕНИЕ ПРИНЯТО</span>
            <h1>Добро пожаловать в команду!</h1>
            <p>
              Ты присоединился к команде{" "}
              <strong>{acceptedTeam.name}</strong> для участия в хакатоне{" "}
              <strong>{acceptedTeam.hackathon.name}</strong>.
            </p>

            <button
              className="org-primary-button invitation-action"
              type="button"
              onClick={() => window.location.assign("/")}
            >
              Открыть личный кабинет
              <span aria-hidden="true">↗</span>
            </button>
          </>
        ) : !token ? (
          <>
            <div className="invitation-symbol warning">!</div>
            <span className="org-eyebrow">НЕКОРРЕКТНАЯ ССЫЛКА</span>
            <h1>Приглашение не найдено</h1>
            <p>
              В адресе страницы нет токена приглашения. Проверь ссылку
              в письме или попроси капитана отправить приглашение повторно.
            </p>
          </>
        ) : !user ? (
          <>
            <div className="invitation-symbol">✉</div>
            <span className="org-eyebrow">ТЕБЯ ПРИГЛАСИЛИ</span>
            <h1>Присоединяйся к команде</h1>
            <p>
              Войди в HackFlow под адресом электронной почты, на который
              было отправлено приглашение. Если у тебя ещё нет аккаунта,
              зарегистрируйся с этим email.
            </p>

            <button
              className="org-primary-button invitation-action"
              type="button"
              onClick={goToLogin}
            >
              Войти или зарегистрироваться
              <span aria-hidden="true">↗</span>
            </button>
          </>
        ) : (
          <>
            <div className="invitation-symbol">✉</div>
            <span className="org-eyebrow">ТЕБЯ ПРИГЛАСИЛИ</span>
            <h1>Вступить в команду?</h1>
            <p>
              Ты вошёл как <strong>{user.email}</strong>. Нажми кнопку
              ниже, чтобы принять приглашение. Email аккаунта должен
              совпадать с адресом, на который отправили письмо.
            </p>

            {error && (
              <div className="org-alert org-alert-error" role="alert">
                {error}
              </div>
            )}

            <button
              className="org-primary-button invitation-action"
              type="button"
              onClick={handleAccept}
              disabled={busy}
            >
              {busy ? "Проверяем приглашение..." : "Принять приглашение"}
              {!busy && <span aria-hidden="true">↗</span>}
            </button>

            <button
              className="invitation-secondary-action"
              type="button"
              onClick={handleSwitchAccount}
              disabled={busy}
            >
              Войти под другим аккаунтом
            </button>
          </>
        )}

        {!checkingSession && error && !user && (
          <div className="org-alert org-alert-error" role="alert">
            {error}
          </div>
        )}

        <div className="invitation-footnote">
          Ссылка-приглашение одноразовая и действует семь дней.
        </div>
      </section>
    </main>
  );
}