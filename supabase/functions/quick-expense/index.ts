import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Generate ID matching the frontend pattern: PREFIX_timestamp_random
function generateId(prefix: string): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
  return `${prefix}_${timestamp}_${random}`;
}

// CORS headers for preflight requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
  return jsonResponse({ error: message }, status);
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    // Validate API key
    const authHeader = req.headers.get('Authorization');
    const expectedKey = Deno.env.get('QUICK_EXPENSE_API_KEY');

    if (!expectedKey) {
      console.error('QUICK_EXPENSE_API_KEY not configured');
      return errorResponse('Server configuration error', 500);
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse('Missing or invalid Authorization header', 401);
    }

    const providedKey = authHeader.replace('Bearer ', '');
    if (providedKey !== expectedKey) {
      return errorResponse('Invalid API key', 401);
    }

    // Get user ID from environment
    const userId = Deno.env.get('QUICK_EXPENSE_USER_ID');
    if (!userId) {
      console.error('QUICK_EXPENSE_USER_ID not configured');
      return errorResponse('Server configuration error', 500);
    }

    // Create Supabase client with service role (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle GET requests (query actions)
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const action = url.searchParams.get('action');

      if (!action) {
        return errorResponse('action query parameter is required');
      }

      switch (action) {
        case 'getAccountBalance': {
          const accountID = url.searchParams.get('accountID');
          if (!accountID) {
            return errorResponse('accountID query parameter is required');
          }

          // Get account details
          const { data: account, error: accountError } = await supabase
            .from('accounts')
            .select('account_id, name, currency, opening_balance')
            .eq('account_id', accountID)
            .eq('user_id', userId)
            .single();

          if (accountError || !account) {
            return errorResponse('Account not found', 404);
          }

          // Calculate balance using the database function
          const { data: balance, error: balanceError } = await supabase.rpc(
            'calculate_account_balance',
            {
              p_account_id: accountID,
              p_user_id: userId,
            }
          );

          if (balanceError) {
            console.error('Balance calculation error:', balanceError);
            return errorResponse('Failed to calculate balance', 500);
          }

          // Format for Tasker: %http_data.data.CurrentBalance
          return jsonResponse({
            data: {
              CurrentBalance: balance ?? account.opening_balance ?? 0,
              Currency: account.currency,
              AccountID: account.account_id,
              Name: account.name,
            },
          });
        }

        case 'getCategories': {
          const { data: categories, error: categoriesError } = await supabase
            .from('categories')
            .select('category_id, name, type, parent_category_id')
            .eq('user_id', userId)
            .eq('status', 'Active')
            .order('name', { ascending: true });

          if (categoriesError) {
            console.error('Categories fetch error:', categoriesError);
            return errorResponse('Failed to fetch categories', 500);
          }

          // Map to user's exact field names
          // Format for Tasker: json.data array
          const mappedCategories = (categories || []).map((cat) => ({
            CategoryID: cat.category_id,
            Name: cat.name,
            Type: cat.type,
            ParentCategoryID: cat.parent_category_id,
          }));

          return jsonResponse({
            data: mappedCategories,
          });
        }

        case 'getAccounts': {
          const status = url.searchParams.get('status');

          let query = supabase
            .from('accounts')
            .select('account_id, name, currency, status')
            .eq('user_id', userId);

          if (status) {
            query = query.eq('status', status);
          }

          const { data: accounts, error: accountsError } = await query.order(
            'name',
            { ascending: true }
          );

          if (accountsError) {
            console.error('Accounts fetch error:', accountsError);
            return errorResponse('Failed to fetch accounts', 500);
          }

          // Map to user's exact field names
          // Format for Tasker: json.data array
          const mappedAccounts = (accounts || []).map((acc) => ({
            AccountID: acc.account_id,
            Name: acc.name,
            Currency: acc.currency,
            Status: acc.status,
          }));

          return jsonResponse({
            data: mappedAccounts,
          });
        }

        default:
          return errorResponse(
            `Unknown action: ${action}. Valid actions: getAccountBalance, getCategories, getAccounts`
          );
      }
    }

    // Handle POST requests
    const body = await req.json();

    // Check for action-based routing (Tasker format)
    const action = body.action;

    if (action === 'createTransaction') {
      // Tasker format with PascalCase fields
      const {
        AccountID,
        CategoryID,
        Amount,
        Currency,
        Description = '',
        Type = 'Expense',
        Date: dateField,
      } = body;

      // Validate required fields
      if (Amount === undefined || Amount === null) {
        return errorResponse('Amount is required');
      }
      if (!CategoryID) {
        return errorResponse('CategoryID is required');
      }
      if (!AccountID) {
        return errorResponse('AccountID is required');
      }
      if (!Currency) {
        return errorResponse('Currency is required');
      }

      // Validate type
      const validTypes = [
        'Income',
        'Expense',
        'Transfer',
        'Transfer Out',
        'Transfer In',
      ];
      if (!validTypes.includes(Type)) {
        return errorResponse(
          `Invalid Type. Must be one of: ${validTypes.join(', ')}`
        );
      }

      // Prepare transaction data
      const transactionId = generateId('TXN');
      const transactionDate = dateField ? new Date(dateField) : new Date();
      const now = new Date();

      const transactionData = {
        transaction_id: transactionId,
        user_id: userId,
        account_id: AccountID,
        category_id: CategoryID,
        date: transactionDate.toISOString().split('T')[0],
        amount: Number(Amount),
        currency: Currency.toUpperCase(),
        description: Description,
        type: Type,
        status: 'Cleared',
        transfer_id: null,
        linked_transaction_id: null,
        created_at: now.toISOString(),
      };

      // Insert transaction
      const { data, error } = await supabase
        .from('transactions')
        .insert(transactionData)
        .select()
        .single();

      if (error) {
        console.error('Database error:', error);
        return errorResponse(error.message, 500);
      }

      // Success response matching Tasker expectations
      return jsonResponse({
        success: true,
        data: {
          TransactionID: data.transaction_id,
          Amount: data.amount,
          Currency: data.currency,
        },
        message: `Transaction of ${data.amount} ${data.currency} added successfully`,
      });
    }

    if (action === 'createTransactionsBatch') {
      const { transactions } = body;

      // Validate transactions array
      if (!transactions || !Array.isArray(transactions)) {
        return errorResponse('transactions array is required');
      }
      if (transactions.length === 0) {
        return errorResponse('transactions array cannot be empty');
      }
      if (transactions.length > 100) {
        return errorResponse('Maximum 100 transactions per batch');
      }

      const validTypes = [
        'Income',
        'Expense',
        'Transfer',
        'Transfer Out',
        'Transfer In',
      ];

      // Validate each transaction and prepare data
      const transactionsToInsert = [];
      const validationErrors = [];
      const now = new Date();

      for (let i = 0; i < transactions.length; i++) {
        const txn = transactions[i];
        const {
          AccountID,
          CategoryID,
          Amount,
          Currency,
          Description = '',
          Type = 'Expense',
          Date: dateField,
        } = txn;

        const errors = [];

        if (Amount === undefined || Amount === null) {
          errors.push('Amount is required');
        }
        if (!CategoryID) {
          errors.push('CategoryID is required');
        }
        if (!AccountID) {
          errors.push('AccountID is required');
        }
        if (!Currency) {
          errors.push('Currency is required');
        }
        if (Type && !validTypes.includes(Type)) {
          errors.push(`Invalid Type: ${Type}`);
        }

        if (errors.length > 0) {
          validationErrors.push({ index: i, errors });
          continue;
        }

        const transactionId = generateId('TXN');
        const transactionDate = dateField ? new Date(dateField) : new Date();

        transactionsToInsert.push({
          transaction_id: transactionId,
          user_id: userId,
          account_id: AccountID,
          category_id: CategoryID,
          date: transactionDate.toISOString().split('T')[0],
          amount: Number(Amount),
          currency: Currency.toUpperCase(),
          description: Description,
          type: Type,
          status: 'Cleared',
          transfer_id: null,
          linked_transaction_id: null,
          created_at: now.toISOString(),
        });
      }

      // If any validation errors, return them
      if (validationErrors.length > 0) {
        return jsonResponse(
          {
            success: false,
            error: `Validation failed for ${validationErrors.length} transaction(s)`,
            validationErrors,
          },
          400
        );
      }

      // Insert all transactions
      const { data, error } = await supabase
        .from('transactions')
        .insert(transactionsToInsert)
        .select();

      if (error) {
        console.error('Database error:', error);
        return errorResponse(error.message, 500);
      }

      // Success response
      return jsonResponse({
        success: true,
        data: {
          inserted: data.length,
          transactions: data.map((t) => ({
            TransactionID: t.transaction_id,
            Amount: t.amount,
            Currency: t.currency,
          })),
        },
        message: `${data.length} transaction(s) added successfully`,
      });
    }

    // If no valid action specified, return error
    return errorResponse(
      'action is required in POST body. Valid actions: "createTransaction", "createTransactionsBatch"'
    );
  } catch (err) {
    console.error('Unexpected error:', err);
    return errorResponse('An unexpected error occurred', 500);
  }
});
