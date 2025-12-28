import { supabase } from '../supabase';

/**
 * Parse a receipt image using AI
 * @param {string} base64Image - Base64 encoded image (with or without data URL prefix)
 * @param {Array} categories - Array of category objects with category_id, name, type
 * @returns {Promise<Object>} Parsed transactions and receipt info
 */
export async function parseReceipt(base64Image, categories) {
  const { data, error } = await supabase.functions.invoke('parse-transactions', {
    body: {
      type: 'receipt',
      image: base64Image,
      categories,
    },
  });

  if (error) {
    console.error('Error calling parse-transactions:', error);
    throw new Error(error.message || 'Failed to parse receipt');
  }

  return data;
}

/**
 * Parse natural language text into transactions using AI
 * @param {string} text - Natural language description of transactions
 * @param {Array} categories - Array of category objects with category_id, name, type
 * @returns {Promise<Object>} Parsed transactions
 */
export async function parseNaturalLanguage(text, categories) {
  const { data, error } = await supabase.functions.invoke('parse-transactions', {
    body: {
      type: 'text',
      text,
      categories,
    },
  });

  if (error) {
    console.error('Error calling parse-transactions:', error);
    throw new Error(error.message || 'Failed to parse text');
  }

  return data;
}

