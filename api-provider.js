// Central API provider abstraction
// Set API_PROVIDER=anthropic or API_PROVIDER=openai (default) in your .env
require('dotenv').config();

const PROVIDER = (process.env.API_PROVIDER || 'openai').toLowerCase();
const isAnthropic = PROVIDER === 'anthropic';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_URL = (process.env.API_BASE_URL || 'https://openrouter.ai/api/v1') + '/chat/completions';

const DEFAULT_MODEL_ANTHROPIC = 'claude-sonnet-4-5-20250929';
const DEFAULT_MODEL_OPENAI = 'eva-unit-01/eva-qwen-2.5-72b';

function getApiUrl() {
  return isAnthropic ? ANTHROPIC_URL : OPENAI_URL;
}

function getApiKey() {
  if (isAnthropic) return process.env.ANTHROPIC_API_KEY || '';
  return process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY || '';
}

function getDefaultModel() {
  return process.env.MODEL_DEFAULT || (isAnthropic ? DEFAULT_MODEL_ANTHROPIC : DEFAULT_MODEL_OPENAI);
}

function getHeaders(apiKey) {
  if (isAnthropic) {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    };
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + apiKey
  };
}

// Build the request body for either provider.
// systemPrompt: prepended as system field (Anthropic) or first message (OpenAI)
function buildRequestBody({ model, messages, systemPrompt, maxTokens, stream = true, extra = {} }) {
  if (isAnthropic) {
    const body = { model, messages, max_tokens: maxTokens, stream, ...extra };
    if (systemPrompt) body.system = systemPrompt;
    return body;
  }
  const msgs = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;
  return { model, messages: msgs, max_tokens: maxTokens, stream, ...extra };
}

// Extract streamed text chunk from a parsed SSE event. Returns string or null.
function extractTextChunk(parsed) {
  if (isAnthropic) {
    return (parsed.type === 'content_block_delta' && parsed.delta?.text)
      ? parsed.delta.text
      : null;
  }
  return parsed.choices?.[0]?.delta?.content || null;
}

// Extract token usage from a parsed SSE event.
// Always returns {input_tokens, output_tokens} or null.
function extractUsage(parsed) {
  if (isAnthropic) {
    if (parsed.type === 'message_delta' && parsed.usage) {
      return {
        input_tokens: parsed.usage.input_tokens || 0,
        output_tokens: parsed.usage.output_tokens || 0
      };
    }
    return null;
  }
  if (parsed.usage) {
    return {
      input_tokens: parsed.usage.prompt_tokens || 0,
      output_tokens: parsed.usage.completion_tokens || 0
    };
  }
  return null;
}

module.exports = {
  PROVIDER,
  isAnthropic,
  getApiUrl,
  getApiKey,
  getDefaultModel,
  getHeaders,
  buildRequestBody,
  extractTextChunk,
  extractUsage
};
