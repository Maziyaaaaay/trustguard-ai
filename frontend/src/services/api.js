const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

export async function analyzeMediaFile(file, { signal } = {}) {
  if (!file) {
    throw new Error("Choose a media file first.");
  }

  const formData = new FormData();
  formData.append("file", file);

  let response;

  try {
    response = await fetch(`${API_BASE_URL}/api/analyze/media`, {
      method: "POST",
      body: formData,
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw error;
    }

    throw new Error(
      `Cannot reach the TrustGuard API at ${API_BASE_URL}. Check that the backend is running and VITE_API_BASE_URL is correct.`
    );
  }

  const rawBody = await response.text();
  let data;

  try {
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new Error(
      `The API returned an unreadable response (${response.status}).`
    );
  }

  if (!response.ok || data.success === false) {
    throw new Error(
      data.error ||
        data.detail ||
        `Media analysis failed (${response.status}).`
    );
  }

  return data;
}