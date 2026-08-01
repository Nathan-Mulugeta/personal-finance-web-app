import { z } from 'zod'

export const transferSchema = z.object({
  fromAccountId: z.string().min(1, 'From account is required'),
  toAccountId: z.string().min(1, 'To account is required'),
  amount: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined || isNaN(val)) {
        return undefined;
      }
      return Number(val);
    },
    z.number().min(0.01, 'Amount must be greater than 0').optional()
  ),
  fromAmount: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined || isNaN(val)) {
        return undefined;
      }
      return Number(val);
    },
    z.number().min(0.01, 'From amount must be greater than 0').optional()
  ),
  toAmount: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined || isNaN(val)) {
        return undefined;
      }
      return Number(val);
    },
    z.number().min(0.01, 'To amount must be greater than 0').optional()
  ),
  categoryId: z.string().nullable().optional(),
  description: z.string().optional(),
  // Which service the money was converted through, kept on the exchange rate
  // rather than on the transactions. Required for cross-currency transfers —
  // enforced in the dialog, which is what knows the two accounts' currencies.
  ratePlatform: z.string().optional(),
  status: z.enum(['Pending', 'Cleared', 'Reconciled', 'Cancelled']).optional(),
  date: z.string().optional(),
}).refine(
  (data) => {
    // Either amount (same currency) or both fromAmount and toAmount (multi-currency)
    return (data.amount !== undefined && data.amount !== null && !isNaN(data.amount)) || 
           (data.fromAmount !== undefined && data.fromAmount !== null && !isNaN(data.fromAmount) &&
            data.toAmount !== undefined && data.toAmount !== null && !isNaN(data.toAmount))
  },
  {
    message: 'Either amount (same currency) or both fromAmount and toAmount (multi-currency) are required',
    path: ['root'],
  }
)

