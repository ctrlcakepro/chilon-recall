// Live model discovery for the OpenAI-compatible `/models` endpoint.
//
// The API key passed in here is used for exactly one outbound HTTP request and is
// never written to disk, logged, or echoed back inside any structured result.

const DEFAULT_TIMEOUT_MS = 15_000;

const EMBEDDING_HINTS = [/embed/i, /bge/i, /gte/i, /m3e/i, /text-embedding/i];
const RERANK_HINTS = [/rerank/i];

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, "");
}

export async function listProviderModels({ baseUrl, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch }) {
  const url = `${normalizeBaseUrl(baseUrl)}/models`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Timed out contacting ${url} after ${timeoutMs} ms.`);
    }
    throw new Error(`Could not reach ${url}: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(
      `Provider rejected the request (${response.status} ${response.statusText}). Check the base URL and API key.`
    );
  }
  const payload = await response.json();
  const entries = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  const ids = entries.map((entry) => (typeof entry === "string" ? entry : entry?.id)).filter((id) => typeof id === "string");
  return [...new Set(ids)].sort();
}

export function recommendModels(modelIds) {
  const embedding = modelIds.filter((id) => EMBEDDING_HINTS.some((pattern) => pattern.test(id)));
  const rerank = modelIds.filter((id) => RERANK_HINTS.some((pattern) => pattern.test(id)));
  const other = modelIds.filter((id) => !embedding.includes(id) && !rerank.includes(id));
  return {
    embedding,
    rerank,
    other,
    suggestedEmbeddingModel: embedding[0] || null,
    suggestedRerankModel: rerank[0] || null
  };
}
