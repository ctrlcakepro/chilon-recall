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

// baseUrl is documented as the provider's OpenAI-compatible root (e.g. ".../v1"), but a
// value that already points at the full endpoint (e.g. ".../v1/models", copied from
// provider docs) must not get the suffix appended a second time.
function joinEndpoint(baseUrl, suffix) {
  const trimmed = normalizeBaseUrl(baseUrl);
  return trimmed.toLowerCase().endsWith(suffix.toLowerCase()) ? trimmed : `${trimmed}${suffix}`;
}

// HTTP header values can't contain CR/LF or other control characters; a runtime's
// Headers implementation rejects them, and does so by embedding the offending value
// (the key itself) verbatim in its own error message. Reject those keys ourselves
// first so that value never reaches Headers, is never quoted back at the caller, and
// isn't misreported as a network problem.
const INVALID_HEADER_VALUE_CHARS = /[\r\n\0]/;

function redactKey(message, apiKey) {
  return apiKey ? message.split(apiKey).join("[REDACTED]") : message;
}

export async function listProviderModels({ baseUrl, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch }) {
  const url = joinEndpoint(baseUrl, "/models");
  if (INVALID_HEADER_VALUE_CHARS.test(apiKey)) {
    throw new Error(
      "The API key contains a line break or control character, so it can't be sent as an HTTP header. " +
        "Check that you copied only the key itself, with no extra newline."
    );
  }
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
    // Belt-and-suspenders: even if some other error ends up embedding the key
    // (a custom fetchImpl, a future runtime change), never let it leave this
    // function unredacted.
    throw new Error(`Could not reach ${url}: ${redactKey(error.message, apiKey)}`);
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
  // Rerank hints take priority: some embedding patterns (e.g. /bge/i) also match
  // reranker model names like "bge-reranker-large", so rerank matches must be
  // excluded from the embedding bucket rather than the other way around.
  const rerank = modelIds.filter((id) => RERANK_HINTS.some((pattern) => pattern.test(id)));
  const embedding = modelIds.filter(
    (id) => !rerank.includes(id) && EMBEDDING_HINTS.some((pattern) => pattern.test(id))
  );
  const other = modelIds.filter((id) => !embedding.includes(id) && !rerank.includes(id));
  return {
    embedding,
    rerank,
    other,
    suggestedEmbeddingModel: embedding[0] || null,
    suggestedRerankModel: rerank[0] || null
  };
}
