import { z } from 'zod'

export const transactionSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  categoryId: z.string().min(1, 'Category is required'),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  currency: z.string().length(3, 'Currency must be a 3-letter code'),
  description: z.string().optional(),
  type: z.enum(['Income', 'Expense', 'Transfer', 'Transfer Out', 'Transfer In']).optional(),
  status: z.enum(['Pending', 'Cleared', 'Reconciled', 'Cancelled']).optional(),
  date: z.string().optional(),
})

export const batchTransactionSchema = z.array(transactionSchema).max(1000, 'Maximum 1000 transactions per batch')

