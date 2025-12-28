// CORS headers for preflight requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Helper to create JSON response
function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Helper to create error response
function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message, success: false }, status);
}

// Category interface for type safety
interface Category {
  category_id: string;
  name: string;
  type: 'Income' | 'Expense';
  parent_category_id?: string | null;
}

// Parsed transaction from AI
interface ParsedTransaction {
  description: string;
  amount: number;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  type: 'Income' | 'Expense';
}

// Build the prompt for Gemini
function buildReceiptPrompt(categories: Category[]): string {
  const expenseCategories = categories
    .filter((c) => c.type === 'Expense')
    .map((c) => `- "${c.name}" (ID: ${c.category_id})`)
    .join('\n');

  return `You are a receipt parser. Extract all line items from this receipt image.

For each item, provide:
1. description: The item name/description as shown on receipt
2. amount: The price as a number (no currency symbols)
3. suggestedCategoryId: The best matching category ID from the list below
4. suggestedCategoryName: The name of the suggested category
5. type: Always "Expense" for receipt items

Available expense categories:
${expenseCategories}

Also extract:
- merchant: The store/merchant name
- receiptDate: The date on the receipt in YYYY-MM-DD format (or null if not visible)

Respond ONLY with valid JSON in this exact format:
{
  "transactions": [
    {
      "description": "Item name",
      "amount": 10.99,
      "suggestedCategoryId": "CAT_xxx",
      "suggestedCategoryName": "Category Name",
      "type": "Expense"
    }
  ],
  "merchant": "Store Name",
  "receiptDate": "2025-12-28"
}

If you cannot read the receipt or find no items, return:
{
  "transactions": [],
  "merchant": null,
  "receiptDate": null,
  "error": "Could not parse receipt"
}`;
}

function buildTextPrompt(categories: Category[]): string {
  const expenseCategories = categories
    .filter((c) => c.type === 'Expense')
    .map((c) => `- "${c.name}" (ID: ${c.category_id})`)
    .join('\n');

  const incomeCategories = categories
    .filter((c) => c.type === 'Income')
    .map((c) => `- "${c.name}" (ID: ${c.category_id})`)
    .join('\n');

  return `You are a transaction parser. Parse the user's natural language description into structured transactions.

For each transaction mentioned, provide:
1. description: A brief description of the transaction
2. amount: The amount as a positive number
3. suggestedCategoryId: The best matching category ID from the lists below
4. suggestedCategoryName: The name of the suggested category
5. type: "Expense" for spending, "Income" for money received

Available expense categories:
${expenseCategories}

Available income categories:
${incomeCategories}

Examples:
- "Spent $50 on groceries" → Expense, amount: 50
- "Got paid $1000" → Income, amount: 1000
- "Coffee $5 and lunch $15" → Two expenses

Respond ONLY with valid JSON in this exact format:
{
  "transactions": [
    {
      "description": "Groceries",
      "amount": 50,
      "suggestedCategoryId": "CAT_xxx",
      "suggestedCategoryName": "Category Name",
      "type": "Expense"
    }
  ]
}

If you cannot understand the input, return:
{
  "transactions": [],
  "error": "Could not parse the text"
}`;
}

// Call Gemini API
async function callGemini(
  prompt: string,
  imageBase64?: string
): Promise<object> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  // Use Gemini 1.5 Flash for both vision and text (it's free and fast)
  const model = 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Build the request parts
  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];

  // Add the prompt
  parts.push({ text: prompt });

  // Add image if provided
  if (imageBase64) {
    // Remove data URL prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    
    // Detect mime type from data URL or default to jpeg
    let mimeType = 'image/jpeg';
    if (imageBase64.startsWith('data:image/png')) {
      mimeType = 'image/png';
    } else if (imageBase64.startsWith('data:image/webp')) {
      mimeType = 'image/webp';
    } else if (imageBase64.startsWith('data:image/gif')) {
      mimeType = 'image/gif';
    }

    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: base64Data,
      },
    });
  }

  const requestBody = {
    contents: [
      {
        parts: parts,
      },
    ],
    generationConfig: {
      temperature: 0.1, // Low temperature for consistent parsing
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 8192,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API error:', errorText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();

  // Extract the text response
  const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textResponse) {
    throw new Error('No response from Gemini');
  }

  // Parse the JSON response (Gemini may wrap it in markdown code blocks)
  let jsonStr = textResponse.trim();
  
  // Remove markdown code blocks if present
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('Failed to parse Gemini response:', textResponse);
    throw new Error('Failed to parse AI response as JSON');
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    // Parse request body
    const body = await req.json();
    const { type, image, text, categories } = body;

    // Validate request type
    if (!type || (type !== 'receipt' && type !== 'text')) {
      return errorResponse('type must be "receipt" or "text"');
    }

    // Validate categories
    if (!categories || !Array.isArray(categories) || categories.length === 0) {
      return errorResponse('categories array is required');
    }

    // Validate input based on type
    if (type === 'receipt') {
      if (!image) {
        return errorResponse('image (base64) is required for receipt parsing');
      }

      // Build prompt and call Gemini with image
      const prompt = buildReceiptPrompt(categories);
      const result = await callGemini(prompt, image);

      return jsonResponse({
        success: true,
        type: 'receipt',
        ...result,
      });
    } else {
      // type === 'text'
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return errorResponse('text is required for natural language parsing');
      }

      // Build prompt and call Gemini
      const prompt = buildTextPrompt(categories);
      const fullPrompt = `${prompt}\n\nUser input: "${text}"`;
      const result = await callGemini(fullPrompt);

      return jsonResponse({
        success: true,
        type: 'text',
        ...result,
      });
    }
  } catch (err) {
    console.error('Unexpected error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return errorResponse(message, 500);
  }
});

