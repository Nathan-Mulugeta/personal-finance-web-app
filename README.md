# Personal Finance Web App

A comprehensive personal finance management system built with React and Supabase.

## Features

- **Transaction Management**: Track income, expenses, and transfers
- **Multi-Currency Accounts**: Support for multiple accounts in different currencies
- **Hierarchical Categories**: Unlimited nesting depth for categories
- **Budget Management**: One-time and recurring monthly budgets
- **Account Transfers**: Same and multi-currency transfers with exchange rate tracking
- **Borrowing/Lending**: Track money borrowed or lent with payment management
- **Reports**: Budget vs spending reports, account balances, category spending
- **Transaction Import**: Import transactions from Google Sheets

## Tech Stack

- **Frontend**: React (with hooks), React Router, Redux Toolkit
- **UI**: Tailwind CSS + Material-UI
- **Backend**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth (Email/Password)
- **Form Handling**: React Hook Form + Zod validation

## Prerequisites

- Node.js 18+ and npm/yarn
- A Supabase project (create one at [supabase.com](https://supabase.com))

## Setup Instructions

### 1. Clone and Install

```bash
npm install
```

### 2. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to Project Settings > API
3. Copy your Project URL and anon/public key
4. Create a `.env` file in the root directory:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Database Migrations

Run the Supabase migrations to set up your database schema:

1. Install Supabase CLI: `npm install -g supabase`
2. Link your project: `supabase link --project-ref your-project-ref`
3. Run migrations: `supabase db push`

Or manually run the SQL files in `supabase/migrations/` in order:

- `001_initial_schema.sql`
- `002_indexes.sql`
- `003_triggers.sql`
- `004_rls_policies.sql`
- `005_functions.sql`
- `006_seed_data.sql` (optional)

### 4. Run the Application

```bash
npm run dev
```

The app will open at `http://localhost:3000`

## Project Structure

```
finance-web-app/
├── public/
├── src/
│   ├── components/     # Reusable UI components
│   ├── pages/          # Page components
│   ├── store/          # Redux store and slices
│   ├── lib/            # API clients and utilities
│   ├── utils/          # Business logic utilities
│   ├── schemas/        # Zod validation schemas
│   ├── hooks/          # Custom React hooks
│   └── App.js          # Main app component
├── supabase/
│   └── migrations/     # Database migration files
└── package.json
```

## Database Schema

The application uses the following main tables:

- **Accounts**: Financial accounts (checking, savings, credit, etc.)
- **Categories**: Hierarchical income/expense categories
- **Transactions**: Individual transactions
- **Budgets**: Monthly budgets (one-time or recurring)
- **ExchangeRates**: Currency exchange rates from transfers
- **BorrowingsLendings**: Borrowing/lending records
- **Settings**: Application settings

All tables include `user_id` for Row Level Security (RLS) to ensure users can only access their own data.

## Development

- **Build**: `npm run build`
- **Preview**: `npm run preview`
- **Lint**: `npm run lint`

## License

MIT
