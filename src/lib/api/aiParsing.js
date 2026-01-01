/**
 * AI Parsing Service
 * Calls Google Gemini API directly from the client for parsing receipts and natural language.
 * Based on proven working implementation patterns.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1/models';
const GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Build the prompt for receipt parsing
 */
function buildReceiptPrompt(categories) {
  const categoryList = categories
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
      "type": "Expense"
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
- Match each item to the most appropriate category from the list
- Use the exact CategoryID from the list
- Amount should be a positive number (use the item price as listed, before tax)
- Return JSON only, no markdown or explanation`;
}

/**
 * Build the prompt for natural language parsing
 */
function buildNaturalLanguagePrompt(text, categories) {
  const categoryList = categories
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
- Match to the most specific category (prefer sub-categories over parent categories)
- Use the exact CategoryID from the list
- Amount should be a positive number
- Return JSON only, no markdown or explanation`;
}

/**
 * Extract JSON from AI response (handles markdown code blocks)
 */
function extractJSON(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    // Try to extract from markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) return JSON.parse(jsonMatch[1]);

    // Try to find any JSON object in the text
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) return JSON.parse(objectMatch[0]);

    throw new Error('Could not extract valid JSON from response');
  }
}

/**
 * Convert file to base64
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Call Gemini API
 */
async function callGemini(apiKey, prompt, imageBase64 = null, mimeType = null) {
  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  // Build request parts
  const parts = [{ text: prompt }];

  // Add image if provided
  if (imageBase64) {
    parts.push({
      inline_data: {
        mime_type: mimeType || 'image/jpeg',
        data: imageBase64,
      },
    });
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.1,
      topK: 32,
      topP: 1,
      maxOutputTokens: 4096,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      errorData.error?.message || `API request failed: ${response.status}`;
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!responseText) {
    throw new Error('Invalid response format from Gemini API');
  }

  const parsedData = extractJSON(responseText);

  if (!parsedData.transactions || !Array.isArray(parsedData.transactions)) {
    throw new Error('Invalid response structure: missing transactions array');
  }

  return parsedData;
}

/**
 * Format error message for display
 */
function formatError(error) {
  const message = error.message || 'Unknown error';
  if (message.includes('API key') || message.includes('API_KEY_INVALID')) {
    return 'API key not configured or invalid. Please check your settings.';
  }
  if (
    message.includes('quota') ||
    message.includes('rate limit') ||
    message.includes('RATE_LIMIT')
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
    message.includes('Invalid response') ||
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
 * @param {string} apiKey - Gemini API key from settings
 * @returns {Promise<Object>} Parsed transactions and receipt info
 */
export async function parseReceipt(base64Image, categories, apiKey) {
  if (!apiKey) {
    throw new Error(
      'Gemini API key not configured. Please add your API key in Settings.'
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
    const result = await callGemini(apiKey, prompt, imageData, mimeType);

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
 * @param {string} apiKey - Gemini API key from settings
 * @returns {Promise<Object>} Parsed transactions
 */
export async function parseNaturalLanguage(text, categories, apiKey) {
  if (!apiKey) {
    throw new Error(
      'Gemini API key not configured. Please add your API key in Settings.'
    );
  }

  try {
    const prompt = buildNaturalLanguagePrompt(text, categories);
    const result = await callGemini(apiKey, prompt);

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
 * @param {string} apiKey - Gemini API key from settings
 * @returns {boolean} Whether AI features are available
 */
export function isAIConfigured(apiKey) {
  return !!apiKey && apiKey.trim().length > 0;
}
