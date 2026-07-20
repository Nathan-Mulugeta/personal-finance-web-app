import { jsonrepair } from 'jsonrepair';

/**
 * AI Parsing Service
 * Calls the configured AI provider directly from the client for parsing receipts and natural language.
 * Based on proven working implementation patterns.
 */

// Multi-provider configuration — update models and URLs here only
const PROVIDERS = {
  openai: {
    apiBase: 'https://api.openai.com/v1',
    model: 'gpt-4.1',
    textModel: 'gpt-4o-mini',
  },
  gemini: {
    apiBase: 'https://generativelanguage.googleapis.com/v1/models',
    model: 'gemini-3.5-flash',
    textModel: 'gemini-3.1-flash-lite',
  },
};

const AI_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
};

// Exported for use in Settings UI — list all supported providers
export const AI_PROVIDER_LINKS = [
  {
    url: 'https://aistudio.google.com/apikey',
    label: 'Google AI Studio (Gemini)',
  },
  { url: 'https://platform.openai.com/api-keys', label: 'OpenAI Platform' },
];

function buildLeafCategoryList(categories) {
  const categoryMap = new Map(categories.map((c) => [c.category_id, c.name]));
  const parentIds = new Set(
    categories.map((c) => c.parent_category_id).filter(Boolean),
  );

  return categories
    .filter((c) => !parentIds.has(c.category_id))
    .map((c) => ({
      ...c,
      name: c.parent_category_id
        ? `${categoryMap.get(c.parent_category_id)} > ${c.name}`
        : c.name,
    }));
}

/**
 * Build the prompt for receipt parsing
 */
function buildReceiptPrompt(categories) {
  const categoryList = buildLeafCategoryList(categories)
    .map((cat) => `- ${cat.name} (${cat.type}, ID: ${cat.category_id})`)
    .join('\n');

  return `You are a financial assistant helping to parse receipt images into transaction data.

Analyze this receipt image and extract ONLY product/item line items as separate transactions.

Available categories:
${categoryList}

Return ONLY valid JSON with this structure:
{
  "merchant": "Store name",
  "receiptDate": "YYYY-MM-DD",
  "transactions": [
    {
      "description": "Item description",
      "amount": 0.00,
      "suggestedCategoryId": "CAT_XXX",
      "suggestedCategoryName": "Category Name",
      "type": "Expense",
      "taxable": true
    }
  ]
}

Rules:
- Extract ONLY actual product/item line items (goods or services purchased)
- Use the item price as shown on the receipt (this is the pre-tax amount)
- DO NOT extract tax lines (e.g., "TAX", "VAT", "GST", "Tax 15%", etc.)
- DO NOT extract subtotals, totals, discounts, fees, or payment method lines
- DO NOT extract summary lines like "Subtotal", "Total", "Amount Due", etc.
- Create a separate transaction for each distinct product/item purchased
- ALWAYS prefer the most specific subcategory over a parent category; never assign a parent category if subcategories exist beneath it
- If no specific subcategory matches an item, use the one whose name contains "General" (e.g. "General: groceries") rather than the parent
- Match each item to the most appropriate category from the list
- Use the exact CategoryID from the list
- Amount should be a positive number (use the item price as listed, before tax)
- If an item name has "(N)" next to it, it is non-taxable: set "taxable" to false. Otherwise set "taxable" to true
- Do NOT include the "(N)" marker in the description field — strip it from the item name
- Return JSON only, no markdown or explanation`;
}

/**
 * Build the prompt for natural language parsing
 */
function buildNaturalLanguagePrompt(text, categories) {
  const categoryList = buildLeafCategoryList(categories)
    .map((cat) => `- ${cat.name} (${cat.type}, ID: ${cat.category_id})`)
    .join('\n');

  return `Parse this text into transactions: "${text}"

Available categories:
${categoryList}

Return ONLY valid JSON:
{
  "transactions": [
    {
      "description": "Transaction description",
      "amount": 0.00,
      "suggestedCategoryId": "CAT_XXX",
      "suggestedCategoryName": "Category Name",
      "type": "Income" or "Expense"
    }
  ]
}

Rules:
- Parse multiple transactions if mentioned (e.g., "groceries $50 and coffee $5" = 2 transactions)
- Infer type from context: spending/bought/paid = Expense, received/earned/got paid = Income
- ALWAYS prefer the most specific subcategory over a parent category; never assign a parent category if subcategories exist beneath it
- If no specific subcategory matches an item, use the one whose name contains "General" (e.g. "General: groceries") rather than the parent
- Match each item to the most appropriate category from the list
- Use the exact CategoryID from the list
- Amount should be a positive number
- Return JSON only, no markdown or explanation`;
}

/**
 * Extract and parse JSON from AI response.
 * Handles markdown code blocks, partial wrapping, and malformed JSON
 * (unquoted keys, single quotes, trailing commas) via jsonrepair.
 */
function extractJSON(text) {
  if (text == null) {
    throw new Error('Could not extract valid JSON from response');
  }

  const raw = typeof text === 'string' ? text : String(text);

  // Strip markdown code fences if present
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Attempt 1: strict parse on stripped text
  try {
    return JSON.parse(stripped);
  } catch { /* fall through to the next parse strategy */ }

  // Attempt 2: extract the first {...} block then strict parse
  const objectMatch = stripped.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch { /* fall through to the next parse strategy */ }
  }

  // Attempt 3: repair then parse (handles unquoted keys, single quotes,
  // trailing commas, and other common AI output quirks)
  try {
    return JSON.parse(jsonrepair(stripped));
  } catch { /* fall through to the next parse strategy */ }

  // Attempt 4: repair the extracted object block
  if (objectMatch) {
    try {
      return JSON.parse(jsonrepair(objectMatch[0]));
    } catch { /* fall through to the next parse strategy */ }
  }

  throw new Error('Could not extract valid JSON from response');
}

/**
 * Normalize AI message content to a plain string (OpenAI may return string or part array).
 */
function extractResponseText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const text = content
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('');
    return text || null;
  }
  return null;
}

/**
 * Normalize parsed JSON to the expected { transactions: [...] } shape.
 */
function normalizeParsedData(parsed) {
  if (Array.isArray(parsed)) {
    return { transactions: parsed };
  }

  if (parsed && typeof parsed === 'object') {
    const transactions =
      parsed.transactions ??
      parsed.Transactions ??
      parsed.transaction ??
      parsed.Transaction;

    if (Array.isArray(transactions)) {
      return { ...parsed, transactions };
    }
  }

  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error) {
  const msg = error.message || '';
  return (
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('RATE_LIMIT') ||
    msg.includes('503') ||
    msg.includes('500') ||
    msg.includes('network') ||
    msg.includes('Failed to fetch')
  );
}

async function callAIWithRetry(
  apiKey,
  prompt,
  imageBase64 = null,
  mimeType = null,
  parseType = 'text',
) {
  const { maxRetries, baseDelayMs } = AI_RETRY_CONFIG;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await callAI(apiKey, prompt, imageBase64, mimeType, parseType);
    } catch (error) {
      if (!isRetryableError(error) || attempt === maxRetries) {
        throw error;
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(
        `AI call failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms:`,
        error.message,
      );
      await sleep(delay);
    }
  }
}

/**
 * Detect the AI provider from the API key format.
 * OpenAI keys start with 'sk-'.
 * @param {string} apiKey
 * @returns {'openai' | 'gemini' | null}
 */
function detectProvider(apiKey) {
  if (!apiKey) return null;
  if (apiKey.startsWith('sk-')) return 'openai';
  // Gemini keys can start with 'AIza', 'AQ', or other Google-issued prefixes.
  // Since OpenAI is always 'sk-', treat everything else as Gemini.
  return 'gemini';
}

/**
 * Build a strict JSON schema for OpenAI structured outputs.
 * 'type' controls whether the receipt fields (merchant, receiptDate)
 * are included — receipt needs them, natural language does not.
 */
function buildResponseSchema(type) {
  const baseProperties = {
    description: { type: 'string' },
    amount: { type: 'number' },
    suggestedCategoryId: { type: 'string' },
    suggestedCategoryName: { type: 'string' },
    type: { type: 'string', enum: ['Expense', 'Income'] },
  };

  const baseRequired = [
    'description',
    'amount',
    'suggestedCategoryId',
    'suggestedCategoryName',
    'type',
  ];

  const transactionSchema = {
    type: 'object',
    properties:
      type === 'receipt'
        ? { ...baseProperties, taxable: { type: 'boolean' } }
        : baseProperties,
    required:
      type === 'receipt'
        ? [...baseRequired, 'taxable']
        : baseRequired,
    additionalProperties: false,
  };

  if (type === 'receipt') {
    return {
      type: 'json_schema',
      json_schema: {
        name: 'receipt_parse',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            merchant: { type: 'string' },
            receiptDate: { type: 'string' },
            transactions: {
              type: 'array',
              items: transactionSchema,
            },
          },
          required: ['merchant', 'receiptDate', 'transactions'],
          additionalProperties: false,
        },
      },
    };
  }

  return {
    type: 'json_schema',
    json_schema: {
      name: 'transaction_parse',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          transactions: {
            type: 'array',
            items: transactionSchema,
          },
        },
        required: ['transactions'],
        additionalProperties: false,
      },
    },
  };
}

/**
 * Call AI provider
 */
async function callAI(
  apiKey,
  prompt,
  imageBase64 = null,
  mimeType = null,
  parseType = 'text',
) {
  const provider = detectProvider(apiKey);
  const isText = parseType === 'text';

  if (provider === 'openai') {
    const url = `${PROVIDERS.openai.apiBase}/chat/completions`;
    const modelToUse =
      isText && PROVIDERS.openai.textModel
        ? PROVIDERS.openai.textModel
        : PROVIDERS.openai.model;

    const systemMessage = {
      role: 'system',
      content:
        'You are a precise financial data extraction assistant. ' +
        'Extract data exactly as instructed. ' +
        'Return only the JSON fields defined in the schema — ' +
        'no additional fields, no commentary.',
    };

    const userContent = imageBase64
      ? [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`,
              detail: 'high',
            },
          },
        ]
      : prompt;

    const messages = [systemMessage, { role: 'user', content: userContent }];

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelToUse,
        messages,
        temperature: 0.1,
        max_tokens: 4096,
        response_format: buildResponseSchema(parseType),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        errorData.error?.message || `API request failed: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const responseText = extractResponseText(
      data.choices?.[0]?.message?.content,
    );

    if (!responseText) {
      throw new Error('Invalid response format from AI provider');
    }

    const parsedData = normalizeParsedData(extractJSON(responseText));
    if (!parsedData.transactions || !Array.isArray(parsedData.transactions)) {
      throw new Error('Invalid response structure: missing transactions array');
    }
    return parsedData;
  } else if (provider === 'gemini') {
    const { apiBase, model, textModel } = PROVIDERS.gemini;
    const modelToUse = isText && textModel ? textModel : model;

    const url = `${apiBase}/${modelToUse}:generateContent?key=${apiKey}`;

    const parts = [{ text: prompt }];
    if (imageBase64) {
      parts.push({
        inline_data: {
          mime_type: mimeType || 'image/jpeg',
          data: imageBase64,
        },
      });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          topK: 32,
          topP: 1,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        errorData.error?.message || `API request failed: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join('');

    if (!responseText) {
      throw new Error('Invalid response format from AI provider');
    }

    const parsedData = normalizeParsedData(extractJSON(responseText));
    if (!parsedData.transactions || !Array.isArray(parsedData.transactions)) {
      throw new Error('Invalid response structure: missing transactions array');
    }
    return parsedData;
  } else {
    throw new Error(
      'Unrecognized API key format. Please enter a valid Gemini or OpenAI key.',
    );
  }
}

/**
 * Format error message for display
 */
function formatError(error) {
  const message = error.message || 'Unknown error';
  if (message.includes('Unrecognized API key format')) {
    return 'Unrecognized API key format. Please enter a valid Gemini or OpenAI key.';
  }
  if (message.includes('API key') || message.includes('API_KEY_INVALID')) {
    return 'API key not configured or invalid. Please check your AI settings.';
  }
  if (
    message.includes('quota') ||
    message.includes('rate limit') ||
    message.includes('RATE_LIMIT') ||
    message.includes('RATE_LIMIT_EXCEEDED')
  ) {
    return 'API rate limit exceeded. Please try again in a few moments.';
  }
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('Failed to fetch')
  ) {
    return 'Network error. Please check your internet connection.';
  }
  if (
    message.includes('Invalid response format') ||
    message.includes('Could not extract')
  ) {
    return 'Unable to parse AI response. Please try again or rephrase your input.';
  }
  return `Error: ${message}`;
}

/**
 * Parse a receipt image using AI
 * @param {string} base64Image - Base64 encoded image (with or without data URL prefix)
 * @param {Array} categories - Array of category objects with category_id, name, type
 * @param {string} apiKey - AI provider API key from settings
 * @returns {Promise<Object>} Parsed transactions and receipt info
 */
export async function parseReceipt(base64Image, categories, apiKey) {
  if (!apiKey) {
    throw new Error(
      'AI API key not configured. Please add your API key in Settings.',
    );
  }

  try {
    // Remove data URL prefix if present and extract mime type
    let imageData = base64Image;
    let mimeType = 'image/jpeg';

    if (base64Image.startsWith('data:')) {
      const match = base64Image.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        imageData = match[2];
      } else {
        imageData = base64Image.split(',')[1] || base64Image;
      }
    }

    const prompt = buildReceiptPrompt(categories);
    const result = await callAIWithRetry(
      apiKey,
      prompt,
      imageData,
      mimeType,
      'receipt',
    );

    return {
      success: true,
      type: 'receipt',
      ...result,
    };
  } catch (error) {
    console.error('Error parsing receipt:', error);
    throw new Error(formatError(error));
  }
}

/**
 * Parse natural language text into transactions using AI
 * @param {string} text - Natural language description of transactions
 * @param {Array} categories - Array of category objects with category_id, name, type
 * @param {string} apiKey - AI provider API key from settings
 * @returns {Promise<Object>} Parsed transactions
 */
export async function parseNaturalLanguage(text, categories, apiKey) {
  if (!apiKey) {
    throw new Error(
      'AI API key not configured. Please add your API key in Settings.',
    );
  }

  try {
    const prompt = buildNaturalLanguagePrompt(text, categories);
    const result = await callAIWithRetry(apiKey, prompt, null, null, 'text');

    return {
      success: true,
      type: 'text',
      ...result,
    };
  } catch (error) {
    console.error('Error parsing natural language:', error);
    throw new Error(formatError(error));
  }
}

/**
 * Check if AI features are configured
 * @param {string} apiKey - API key from settings (Gemini or OpenAI)
 * @returns {boolean} Whether the key is present and from a recognized provider
 */
export function isAIConfigured(apiKey) {
  if (!apiKey || apiKey.trim().length === 0) return false;
  return detectProvider(apiKey) !== null;
}
