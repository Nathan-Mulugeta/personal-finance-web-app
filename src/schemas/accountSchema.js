import { z } from 'zod'

export const accountSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['Checking', 'Savings', 'Credit', 'Investment', 'Cash', 'Bank']),
  currency: z.string().length(3, 'Currency must be a 3-letter code'),
  openingBalance: z.number().default(0),
  status: z.enum(['Active', 'Closed', 'Suspended']).optional(),
})

