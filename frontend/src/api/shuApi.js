import { apiUrl } from '../services/api'

const fetchJson = async (url, options) => {
  const response = await fetch(url, options)
  const contentType = response.headers.get('content-type') || ''

  if (!response.ok) {
    if (contentType.includes('application/json')) {
      return Promise.reject(await response.json())
    }
    return Promise.reject(new Error(`HTTP ${response.status}`))
  }

  if (contentType.includes('application/json')) {
    return response.json()
  }

  return response.text()
}

export const shuApi = {
  // Master Configuration
  getMasterConfigurations: () =>
    fetchJson(apiUrl('/admin/shu/master-configurations/')),

  createMasterConfiguration: ({ name, percentage }) =>
    fetch(apiUrl('/admin/shu/master-configurations/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ component_name: name, percentage }),
    }).then(r => r.json()),

  updateMasterConfiguration: (id, data) =>
    fetch(apiUrl(`/admin/shu/master-configurations/${id}/`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  deleteMasterConfiguration: (id) =>
    fetch(apiUrl(`/admin/shu/master-configurations/${id}/`), {
      method: 'DELETE',
    }),


  // Member Bases (Daftar Pembagian SHU Anggota)
  getShuMemberBases: ({ search, summary, month, year } = {}) => {
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (summary) params.append('summary', summary)
    if (month) params.append('month', month)
    if (year) params.append('year', year)
    return fetchJson(apiUrl(`/admin/shu/member-bases/?${params}`))
  },

  // Outcome Categories
  getOutcomeCategories: () =>
    fetchJson(apiUrl('/admin/shu/outcome/categories/')),

  // Outcome Transactions
  getOutcomeTransactions: ({ search, month, year, day } = {}) => {
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (month) params.append('month', month)
    if (year) params.append('year', year)
    if (day) params.append('day', day)
    return fetch(apiUrl(`/admin/shu/outcome/transactions/?${params}`))
      .then(r => {
        if (!r.ok) return r.json().then(err => Promise.reject(err))
        return r.json()
      })
  },

  createOutcomeTransaction: (data) =>
    fetch(apiUrl('/admin/shu/outcome/transactions/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  updateOutcomeTransaction: (id, data) =>
    fetch(apiUrl(`/admin/shu/outcome/transactions/${id}/`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  deleteOutcomeTransaction: (id) =>
    fetch(apiUrl(`/admin/shu/outcome/transactions/${id}/`), {
      method: 'DELETE',
    }),

  // Annual aggregation from monthly table
  getAnnualFromMonthly: ({ year, search } = {}) => {
    const params = new URLSearchParams()
    if (year) params.append('year', year)
    if (search) params.append('search', search)
    return fetchJson(apiUrl(`/admin/shu/annual-from-monthly/?${params}`))
  },

  // Annual Jasa Modal Distributions
  getAnnualJasaModalDistributions: ({ year, search } = {}) => {
    const params = new URLSearchParams()
    if (year) params.append('year', year)
    if (search) params.append('search', search)
    return fetchJson(apiUrl(`/admin/shu/jasa-modal-annual/?${params}`))
  },

  distributeMonthlyJasaModal: ({ year, month }) =>
    fetch(apiUrl('/admin/shu/jasa-modal-monthly/distribute/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month }),
    }).then(r => {
      if (!r.ok) return r.json().then(err => Promise.reject(err))
      return r.json()
    }),

  distributeAnnualJasaModal: ({ year, member_ids }) =>
    fetch(apiUrl('/admin/shu/jasa-modal-annual/distribute/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(member_ids ? { year, member_ids } : { year }),
    }).then(r => {
      if (!r.ok) return r.json().then(err => Promise.reject(err))
      return r.json()
    }),

  updateJasaModalNotes: (id, notes) =>
    fetchJson(apiUrl(`/admin/shu/jasa-modal-annual/${id}/notes/`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    }),

  uploadJasaModalProof: (id, file) => {
    const formData = new FormData()
    formData.append('file', file)
    return fetch(apiUrl(`/admin/shu/jasa-modal-annual/${id}/proof/`), {
      method: 'PATCH',
      body: formData,
    }).then(r => {
      if (!r.ok) return r.json().then(err => Promise.reject(err))
      return r.json()
    })
  },

  // SHU Results
  getShuResult: ({ year, month } = {}) => {
    const params = new URLSearchParams()
    if (year) params.append('year', year)
    if (month) params.append('month', month)
    return fetchJson(apiUrl(`/admin/shu/results/?${params}`))
  },

  getComponentAllocations: ({ year, month } = {}) => {
    const params = new URLSearchParams()
    if (year) params.append('year', year)
    if (month) params.append('month', month)
    return fetchJson(apiUrl(`/admin/shu/component-allocations/?${params}`))
  },

  saveComponentAllocations: (data) =>
    fetch(apiUrl('/admin/shu/component-allocations/save/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => {
      if (!r.ok) return r.json().then(err => Promise.reject(err))
      return r.json()
    }),

  distributeShu: (data) =>
    fetch(apiUrl('/admin/shu/results/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => {
      if (!r.ok) return r.text().then(t => Promise.reject(new Error(`${r.status}: ${t.slice(0, 200)}`)))
      return r.json()
    }),

  distributeMemberBases: (data) =>
    fetch(apiUrl('/admin/shu/member-bases/distribute/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => {
      if (!r.ok) return r.text().then(t => Promise.reject(new Error(`${r.status}: ${t.slice(0, 200)}`)))
      return r.json()
    }),

  // Monthly Distributions CRUD
  getMonthlyDistributions: ({ year, month, search } = {}) => {
    const params = new URLSearchParams()
    if (year) params.append('year', year)
    if (month) params.append('month', month)
    if (search) params.append('search', search)
    return fetchJson(apiUrl(`/admin/shu/jasa-modal-monthly/?${params}`))
  },

  updateMonthlyDistribution: (id, data) =>
    fetchJson(apiUrl(`/admin/shu/jasa-modal-monthly/${id}/`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteMonthlyDistribution: (id) =>
    fetch(apiUrl(`/admin/shu/jasa-modal-monthly/${id}/`), {
      method: 'DELETE',
    }).then(r => {
      if (!r.ok) return r.json().then(err => Promise.reject(err))
      return null
    }),

  // Excel Template & Upload
  downloadOutcomeTemplate: () =>
    fetch(apiUrl('/admin/shu/outcome/template/')).then(r => {
      if (!r.ok) throw new Error('Gagal mengunduh template')
      return r.blob()
    }),

  uploadOutcomeExcel: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return fetch(apiUrl('/admin/shu/outcome/upload/'), {
      method: 'POST',
      body: formData,
    }).then(r => r.json())
  },

  syncResults: ({ year } = {}) =>
    fetch(apiUrl('/admin/shu/outcome/sync-results/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(year ? { year } : {}),
    }).then(r => r.json()),
}
