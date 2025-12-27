# Quick Expense Edge Function

A Supabase Edge Function that allows adding expenses and querying account data via HTTP from Tasker (or any HTTP client).

## Setup

### 1. Install Supabase CLI

If you haven't already:

```bash
npm install -g supabase
```

### 2. Link your project

```bash
cd /path/to/finance-web-app
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### 3. Set Environment Variables

In the Supabase Dashboard, go to **Project Settings > Edge Functions** and add these secrets:

| Variable                | Description                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `QUICK_EXPENSE_API_KEY` | A secret key for authentication. Generate one with: `uuidgen` or use any random string         |
| `QUICK_EXPENSE_USER_ID` | Your Supabase user ID (UUID). Find it in the `auth.users` table or in your app's user settings |

Note: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available in Edge Functions.

### 4. Deploy the Function

```bash
supabase functions deploy quick-expense --no-verify-jwt
```

## API Reference

All requests require the header:

```
Authorization: Bearer YOUR_QUICK_EXPENSE_API_KEY
```

Base URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/quick-expense`

---

## GET Endpoints

### Get Account Balance

```
GET ?action=getAccountBalance&accountID=ACC_xxx
```

**Response:**

```json
{
  "data": {
    "CurrentBalance": 1234.56,
    "Currency": "USD",
    "AccountID": "ACC_xxx_xxx",
    "Name": "Main Wallet"
  }
}
```

Tasker access: `%http_data.data.CurrentBalance`

---

### Get Categories

```
GET ?action=getCategories
```

Returns all active categories.

**Response:**

```json
{
  "data": [
    {
      "CategoryID": "CAT_xxx_xxx",
      "Name": "Taxi",
      "Type": "Expense",
      "ParentCategoryID": null
    },
    {
      "CategoryID": "CAT_yyy_yyy",
      "Name": "Food",
      "Type": "Expense",
      "ParentCategoryID": "CAT_zzz_zzz"
    }
  ]
}
```

Tasker access: `JSON.parse(http_data).data`

---

### Get Accounts

```
GET ?action=getAccounts&status=Active
```

| Parameter | Required | Description                                       |
| --------- | -------- | ------------------------------------------------- |
| `status`  | No       | Filter by status: `Active`, `Closed`, `Suspended` |

**Response:**

```json
{
  "data": [
    {
      "AccountID": "ACC_xxx_xxx",
      "Name": "Main Wallet",
      "Currency": "USD",
      "Status": "Active"
    }
  ]
}
```

Tasker access: `JSON.parse(http_data).data`

---

## POST Endpoint

### Create Transaction

```
POST /
Content-Type: application/json
```

**Request Body:**

```json
{
  "action": "createTransaction",
  "AccountID": "ACC_xxx_xxx",
  "CategoryID": "CAT_xxx_xxx",
  "Amount": 25.5,
  "Currency": "USD",
  "Description": "Taxi to airport",
  "Type": "Expense"
}
```

#### Required Fields

| Field        | Type   | Description                                 |
| ------------ | ------ | ------------------------------------------- |
| `action`     | string | Must be `"createTransaction"`               |
| `Amount`     | number | Transaction amount (positive for expense)   |
| `CategoryID` | string | Category ID (e.g., `CAT_1234567890_001`)    |
| `AccountID`  | string | Account ID (e.g., `ACC_1234567890_001`)     |
| `Currency`   | string | 3-letter currency code (e.g., `USD`, `EUR`) |

#### Optional Fields

| Field         | Type   | Default     | Description                                                            |
| ------------- | ------ | ----------- | ---------------------------------------------------------------------- |
| `Description` | string | `""`        | Transaction description/notes                                          |
| `Type`        | string | `"Expense"` | One of: `Income`, `Expense`, `Transfer`, `Transfer Out`, `Transfer In` |
| `Date`        | string | Today       | Date in `YYYY-MM-DD` format                                            |

**Response:**

```json
{
  "success": true,
  "data": {
    "TransactionID": "TXN_1735312800000_123",
    "Amount": 25.5,
    "Currency": "USD"
  },
  "message": "Transaction of 25.5 USD added successfully"
}
```

---

### Create Transactions Batch

```
POST /
Content-Type: application/json
```

**Request Body:**

```json
{
  "action": "createTransactionsBatch",
  "transactions": [
    {
      "AccountID": "ACC_xxx_xxx",
      "CategoryID": "CAT_xxx_xxx",
      "Amount": 25.5,
      "Currency": "USD",
      "Description": "Taxi",
      "Type": "Expense"
    },
    {
      "AccountID": "ACC_xxx_xxx",
      "CategoryID": "CAT_yyy_yyy",
      "Amount": 5.0,
      "Currency": "USD",
      "Description": "Coffee",
      "Type": "Expense"
    }
  ]
}
```

Each transaction object has the same fields as single `createTransaction` (without the `action` key).

**Limits:** Maximum 100 transactions per batch.

**Response:**

```json
{
  "success": true,
  "data": {
    "inserted": 2,
    "transactions": [
      { "TransactionID": "TXN_xxx_001", "Amount": 25.5, "Currency": "USD" },
      { "TransactionID": "TXN_xxx_002", "Amount": 5.0, "Currency": "USD" }
    ]
  },
  "message": "2 transaction(s) added successfully"
}
```

**Validation Error Response:**

```json
{
  "success": false,
  "error": "Validation failed for 1 transaction(s)",
  "validationErrors": [
    { "index": 0, "errors": ["Amount is required"] }
  ]
}
```

---

## Error Response

All errors return:

```json
{
  "error": "Error message here"
}
```

---

## Tasker Setup Examples

### Add Expense Widget

1. **Method:** POST
2. **URL:** `https://YOUR_PROJECT_REF.supabase.co/functions/v1/quick-expense`
3. **Headers:**
   - `Authorization: Bearer YOUR_API_KEY`
   - `Content-Type: application/json`
4. **Body:**

```javascript
var payload = {
  action: 'createTransaction',
  AccountID: local('pf_account_id'),
  CategoryID: local('pf_category_id'),
  Amount: parseFloat(local('pf_amount')),
  Currency: local('pf_currency'),
  Description: local('pf_desc') || '',
  Type: local('pf_type') || 'Expense',
};
```

### Get Balance Widget

1. **Method:** GET
2. **URL:** `https://YOUR_PROJECT_REF.supabase.co/functions/v1/quick-expense?action=getAccountBalance&accountID=ACC_xxx`
3. **Headers:**
   - `Authorization: Bearer YOUR_API_KEY`

### Get Categories (for dropdowns)

1. **Method:** GET
2. **URL:** `https://YOUR_PROJECT_REF.supabase.co/functions/v1/quick-expense?action=getCategories`
3. **Headers:**
   - `Authorization: Bearer YOUR_API_KEY`

---

## Security Notes

- Keep your `QUICK_EXPENSE_API_KEY` secret - anyone with it can access your account data
- The function uses the service role to bypass RLS, so all validation happens in the function code
- Consider rotating your API key periodically
