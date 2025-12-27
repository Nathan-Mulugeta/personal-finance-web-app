// Supabase Edge Function for Quick-Add Expense
// This function allows adding expenses from external apps like Tasker
// without needing full browser authentication.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface QuickExpenseRequest {
  amount: number
  category_id: string
  description?: string
  api_key?: string
}

// Generate a transaction ID
function generateTransactionId(): string {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `TXN_${timestamp}_${random}`
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body: QuickExpenseRequest = await req.json()
    const { amount, category_id, description = '', api_key } = body

    // Validate required fields
    if (!amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: 'Valid amount is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!category_id) {
      return new Response(
        JSON.stringify({ error: 'Category ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with service role for database operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    let userId: string | null = null

    // Try to authenticate via API key first
    if (api_key) {
      // Find user by API key
      const { data: settingData, error: settingError } = await supabaseAdmin
        .from('settings')
        .select('user_id')
        .eq('setting_key', 'QuickAddApiKey')
        .eq('setting_value', api_key)
        .single()

      if (settingError || !settingData) {
        return new Response(
          JSON.stringify({ error: 'Invalid API key' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      userId = settingData.user_id
    } else {
      // Try to authenticate via Authorization header (JWT)
      const authHeader = req.headers.get('Authorization')
      if (authHeader) {
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
          global: {
            headers: { Authorization: authHeader },
          },
        })

        const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
        
        if (userError || !user) {
          return new Response(
            JSON.stringify({ error: 'Invalid authorization token' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        userId = user.id
      }
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Authentication required. Provide api_key or Authorization header.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's quick-add default account
    const { data: accountSetting, error: accountSettingError } = await supabaseAdmin
      .from('settings')
      .select('setting_value')
      .eq('user_id', userId)
      .eq('setting_key', 'QuickAddDefaultAccountId')
      .single()

    if (accountSettingError || !accountSetting?.setting_value) {
      return new Response(
        JSON.stringify({ error: 'No default account configured. Please set one in Settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const accountId = accountSetting.setting_value

    // Get account details to verify it exists and get currency
    const { data: account, error: accountError } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .eq('status', 'Active')
      .single()

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ error: 'Default account not found or is not active' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify category exists and belongs to user
    const { data: category, error: categoryError } = await supabaseAdmin
      .from('categories')
      .select('*')
      .eq('category_id', category_id)
      .eq('user_id', userId)
      .eq('status', 'Active')
      .single()

    if (categoryError || !category) {
      return new Response(
        JSON.stringify({ error: 'Category not found or is not active' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create the transaction
    const transactionId = generateTransactionId()
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]

    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .insert({
        transaction_id: transactionId,
        user_id: userId,
        account_id: accountId,
        category_id: category_id,
        date: dateStr,
        amount: -Math.abs(amount), // Negative for expenses
        currency: account.currency,
        description: description,
        type: 'Expense',
        status: 'Cleared',
        created_at: now.toISOString(),
      })
      .select()
      .single()

    if (transactionError) {
      console.error('Transaction error:', transactionError)
      return new Response(
        JSON.stringify({ error: 'Failed to create transaction', details: transactionError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        transaction: {
          transaction_id: transaction.transaction_id,
          amount: transaction.amount,
          currency: transaction.currency,
          category: category.name,
          account: account.name,
          date: transaction.date,
          description: transaction.description,
        },
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

