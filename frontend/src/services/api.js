const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL || ""
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
      `Cannot reach the TrustGuard API${API_BASE_URL ? ` at ${API_BASE_URL}` : ""}. Check that the backend is running and the API URL is correct.`
    );
  }

  if (response.status === 413) {
    throw new Error("The hosted upload limit is 4 MB. Choose a smaller image or a shorter audio/video clip.");
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

  const score = data.risk?.score;
  const validScore = typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 100;
  // The backend deliberately withholds a score when image classification is uncertain.
  const validReview = score === null && data.kind === "image" &&
    data.risk?.level === "REVIEW" && data.risk?.scope === "ai_image_indicator" &&
    data.image_detection?.available === true && data.image_detection?.status === "inconclusive";
  if (data.success !== true || (!validScore && !validReview)) {
    throw new Error(
      "The analysis service returned an incomplete result. No safety rating was assigned; check the backend and try again."
    );
  }

  return data;
}
