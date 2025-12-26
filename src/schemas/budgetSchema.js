import { z } from 'zod'

export const budgetSchema = z.object({
  categoryId: z.string().min(1, 'Category is required'),
  currency: z.string().length(3, 'Currency must be a 3-letter code'),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  month: z
    .union([
      z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'),
      z.literal(''),
    ])
    .optional()
    .transform((val) => (val === '' ? undefined : val)),
  recurring: z.boolean().default(false),
  startMonth: z
    .union([
      z.string().regex(/^\d{4}-\d{2}$/, 'Start month must be in YYYY-MM format'),
      z.literal(''),
    ])
    .optional()
    .transform((val) => (val === '' ? undefined : val)),
  endMonth: z
    .union([
      z.string().regex(/^\d{4}-\d{2}$/, 'End month must be in YYYY-MM format'),
      z.literal(''),
    ])
    .optional()
    .transform((val) => (val === '' ? undefined : val)),
  notes: z.string().optional(),
  status: z.enum(['Active', 'Archived']).optional(),
}).refine(
  (data) => {
    // For non-recurring budgets, month is required
    if (!data.recurring && !data.month) {
      return false
    }
    // For recurring budgets, startMonth is required, endMonth is optional (can be null/empty for non-ending)
    if (data.recurring && !data.startMonth) {
      return false
    }
    return true
  },
  {
    message: 'Month is required for non-recurring budgets, startMonth is required for recurring budgets',
  }
)

