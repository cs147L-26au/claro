import { ApiError } from './api-error.mjs';

const providers = {
  openai: { name: 'OpenAI', keyVariable: 'OPENAI_API_KEY', modelVariable: 'OPENAI_MODEL', defaultModel: 'gpt-4.1-mini', endpoint: 'https://api.openai.com/v1/chat/completions' },
  groq: { name: 'Groq', keyVariable: 'GROQ_API_KEY', modelVariable: 'GROQ_MODEL', defaultModel: 'openai/gpt-oss-20b', endpoint: 'https://api.groq.com/openai/v1/chat/completions' },
};

export function resolveAiProvider(options = {}, env = process.env) {
  // Existing injected { key, model, fetchImpl } callers use Groq. Runtime calls
  // without an injected key prefer OpenAI whenever OPENAI_API_KEY is configured.
  const injectedKey = Object.hasOwn(options, 'key');
  const id = options.provider || (injectedKey ? 'groq' : env.OPENAI_API_KEY?.trim() ? 'openai' : 'groq');
  const provider = providers[id];
  if (!provider) throw new ApiError(503, 'The configured recommendation provider is not supported.');
  return {
    ...provider, id,
    key: (injectedKey ? options.key : env[provider.keyVariable])?.trim() || '',
    model: options.model || env[provider.modelVariable]?.trim() || provider.defaultModel,
  };
}

export function aiStatus(env = process.env) {
  const provider = resolveAiProvider({}, env);
  return { configured: Boolean(provider.key), provider: provider.key ? provider.name : null, model: provider.key ? provider.model : null };
}

export async function generateStructuredResult({ schemaName, schema, messages, maxTokens }, options = {}) {
  const provider = resolveAiProvider(options);
  if (!provider.key) throw new ApiError(503, 'Recommendations are not connected yet. Add an OpenAI API key (OPENAI_API_KEY) or a Groq API key (GROQ_API_KEY) to the server’s .env file, then restart the API server.');
  const fetchImpl = options.fetchImpl || fetch;
  const timeout = AbortSignal.timeout(30000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const interrupted = error => {
    if (options.signal?.aborted) return new ApiError(499, 'Analysis canceled. Your details are still here.');
    if (signal.aborted || ['TimeoutError', 'AbortError'].includes(error?.name))
      return new ApiError(504, 'The recommendation took too long. Please try again.');
    return null;
  };
  let response;
  try {
    signal.throwIfAborted();
    response = await fetchImpl(provider.endpoint, {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${provider.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: provider.model, temperature: 0.3, max_completion_tokens: maxTokens,
        response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
        messages,
      }),
    });
  } catch (error) {
    throw interrupted(error) || new ApiError(504, `Could not reach ${provider.name}. Please try again shortly.`);
  }
  if (response.status === 429) throw new ApiError(429, `The ${provider.name} usage or rate limit has been reached. Check the provider account or wait, then try again.`);
  if ([401, 403].includes(response.status)) throw new ApiError(503, `The recommendation service key was rejected. Check the ${provider.name} key and model access on the server.`);
  if (!response.ok) throw new ApiError(502, 'The recommendation service is unavailable. Please try again shortly.');
  try {
    const payload = await response.json();
    signal.throwIfAborted();
    if (payload.choices?.[0]?.finish_reason !== 'stop') throw new Error('Incomplete completion');
    return JSON.parse(payload.choices[0].message.content);
  } catch (error) {
    throw interrupted(error) || new ApiError(502, 'The recommendation response could not be read. Please try again.');
  }
}
