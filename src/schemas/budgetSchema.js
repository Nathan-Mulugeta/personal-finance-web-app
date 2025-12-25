import { z } from 'zod'

export const budgetSchema = z.object({
  categoryId: z.string().min(1, 'Category is required'),
  currency: z.string().length(3, 'Currency must be a 3-letter code'),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format').nullable().optional(),
  recurring: z.boolean().default(false),
  startMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Start month must be in YYYY-MM format').nullable().optional(),
  endMonth: z.string().regex(/^\d{4}-\d{2}$/, 'End month must be in YYYY-MM format').nullable().optional(),
  notes: z.string().optional(),
  status: z.enum(['Active', 'Archived']).optional(),
}).refine(
  (data) => {
    if (!data.recurring && !data.month) {
      return false
    }
    if (data.recurring && !data.startMonth) {
      return false
    }
    return true
  },
  {
    message: 'Month is required for non-recurring budgets, startMonth is required for recurring budgets',
  }
)

