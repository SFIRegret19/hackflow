const API_BASE_URL = "http://127.0.0.1:3001/api";

type ApiErrorPayload = {
  message?: string;
  error?: string;
  details?: Array<{
    field?: string;
    message?: string;
  }>;
};

type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
};

export async function apiRequest<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body:
      options.body === undefined
        ? undefined
        : JSON.stringify(options.body),
  });

  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    // Ответ может быть пустым или содержать не JSON.
  }

  if (!response.ok) {
    const data =
      payload !== null && typeof payload === "object"
        ? (payload as ApiErrorPayload)
        : {};

    const validationMessage = data.details
      ?.map((item) => item.message)
      .filter(Boolean)
      .join("; ");

    const message =
      data.message ??
      validationMessage ??
      data.error ??
      `Ошибка запроса: ${response.status}`;

    throw new Error(message);
  }

  return payload as T;
}