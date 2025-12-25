import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Grid, Paper, Typography, Box, Card, CardContent } from '@mui/material'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import ReceiptIcon from '@mui/icons-material/Receipt'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import { fetchAccounts } from '../store/slices/accountsSlice'
import { fetchTransactions } from '../store/slices/transactionsSlice'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorMessage from '../components/common/ErrorMessage'

function Dashboard() {
  const dispatch = useDispatch()
  const accounts = useSelector((state) => state.accounts.accounts)
  const transactions = useSelector((state) => state.transactions.transactions)
  const accountsLoading = useSelector((state) => state.accounts.loading)
  const transactionsLoading = useSelector((state) => state.transactions.loading)
  const error = useSelector((state) => state.accounts.error || state.transactions.error)

  useEffect(() => {
    dispatch(fetchAccounts({ status: 'Active' }))
    dispatch(fetchTransactions({ limit: 10 }))
  }, [dispatch])

  const totalAccounts = accounts.length
  const recentTransactions = transactions.slice(0, 5)

  if (accountsLoading || transactionsLoading) {
    return <LoadingSpinner />
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

      {error && <ErrorMessage error={error} />}

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <AccountBalanceIcon sx={{ mr: 1, fontSize: 40 }} color="primary" />
                <Box>
                  <Typography variant="h4">{totalAccounts}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Active Accounts
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <ReceiptIcon sx={{ mr: 1, fontSize: 40 }} color="secondary" />
                <Box>
                  <Typography variant="h4">{transactions.length}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Recent Transactions
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <AccountBalanceWalletIcon sx={{ mr: 1, fontSize: 40 }} color="success" />
                <Box>
                  <Typography variant="h4">-</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Budget Overview
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Recent Transactions
            </Typography>
            {recentTransactions.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No transactions yet
              </Typography>
            ) : (
              <Box component="ul" sx={{ pl: 0, listStyle: 'none' }}>
                {recentTransactions.map((txn) => (
                  <Box
                    key={txn.transaction_id}
                    component="li"
                    sx={{
                      py: 1,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body1">{txn.description || 'No description'}</Typography>
                      <Typography variant="body1" fontWeight="bold">
                        {txn.amount} {txn.currency}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(txn.date).toLocaleDateString()}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}

export default Dashboard

