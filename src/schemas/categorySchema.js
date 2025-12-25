import { z } from 'zod'

export const categorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['Income', 'Expense']),
  parentCategoryId: z.string().nullable().optional(),
  status: z.enum(['Active', 'Archived']).optional(),
})

