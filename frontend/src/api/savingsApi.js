import { apiUrl } from '../services/api'

export const savingsApi = {
  getWallets: () =>
    fetch(apiUrl('/my-savings/wallets/')).then(r => r.json()),

  getTransactions: (start, end) => {
    const params = new URLSearchParams()
    if (start) params.append('start', start)
    if (end) params.append('end', end)
    return fetch(apiUrl(`/my-savings/transactions/?${params}`)).then(r => r.json())
  },

  getWithdrawals: () =>
    fetch(apiUrl('/my-savings/withdrawals/')).then(r => r.json()),

  submitWithdrawal: (amount, notes) =>
    fetch(apiUrl('/my-savings/withdrawals/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, notes })
    }).then(r => r.json()),
}