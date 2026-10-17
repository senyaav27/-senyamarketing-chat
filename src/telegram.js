export function telegram(token, fetcher = fetch) {
  return async (method, payload) => {
    let response;
    try {
      response = await fetcher(
        `https://api.telegram.org/bot${token}/${method}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(12000),
        },
      );
    } catch {
      throw new Error("telegram_network");
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("telegram_response");
    }
    if (!response.ok || !data.ok) {
      const error = new Error("telegram_rejected");
      error.retryAfter = data.parameters?.retry_after;
      throw error;
    }
    return data.result;
  };
}
