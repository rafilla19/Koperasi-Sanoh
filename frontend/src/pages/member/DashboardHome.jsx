import React, { useState, useRef, useEffect } from 'react';
import {
  Wallet, PiggyBank, Briefcase, CreditCard,
  Download, Copy, HandCoins, ArrowUpRight, TrendingUp,
  PieChart, Calendar, Search, FileText, Filter,
  ArrowRightLeft, AlertCircle, Info, CheckCircle2,
  ChevronDown, TrendingDown, X, Check, UserCircle
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Filler, Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { apiUrl } from '../../services/api';
import './DashboardHome.css';

ChartJS.register(
  CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Filler, Legend,
);

/* ─── DATA ─────────────────────────────────────────────────────────────────── */
const dummyTransactions = [
  { id: '9283-3844', date: 'Oct 20, 2023', time: '09:06 AM', type: 'Voluntary Saving Payment', amount: 'Rp 50.000,00', status: 'Success', recipient: 'Koperasi Sanoh' },
  { id: '9283-3843', date: 'Oct 15, 2023', time: '14:20 PM', type: 'Mandatory Saving Payment', amount: 'Rp 100.000,00', status: 'Success', recipient: 'Koperasi Sanoh' },
  { id: '9283-3842', date: 'Oct 01, 2023', time: '08:15 AM', type: 'Principal Saving Payment', amount: 'Rp 100.000,00', status: 'Success', recipient: 'Koperasi Sanoh' },
  { id: '9283-3841', date: 'Sep 25, 2023', time: '11:45 AM', type: 'Loan Installment', amount: 'Rp 300.000,00', status: 'Pending', recipient: 'Koperasi Sanoh' },
  { id: '9283-3840', date: 'Sep 20, 2023', time: '09:00 AM', type: 'Voluntary Saving Payment', amount: 'Rp 50.000,00', status: 'Success', recipient: 'Koperasi Sanoh' },
];

const dummyChartDataMap = {
  '1M': { labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'], data: [120000, 118000, 125000, 130000], grow: '4.2%', total: 'Rp 125.000' },
  '3M': { labels: ['Feb', 'Mar', 'Apr'], data: [85000, 110000, 130000], grow: '12.5%', total: 'Rp 115.000' },
  'YTD': { labels: ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'], data: [35000, 32000, 40000, 85000, 110000, 130000], grow: '16.4%', total: 'Rp 130.000' },
  '1Y': { labels: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'], data: [15000, 18000, 17000, 22000, 25000, 30000, 35000, 32000, 40000, 85000, 110000, 130000], grow: '24.8%', total: 'Rp 102.000' },
  '3Y': { labels: ['2021', '2022', '2023'], data: [450000, 680000, 950000], grow: '45.2%', total: 'Rp 650.000' },
  '5Y': { labels: ['2019', '2020', '2021', '2022', '2023'], data: [200000, 310000, 450000, 680000, 950000], grow: '110.5%', total: 'Rp 450.000' },
};

const PERIODS = ['3M', '6M', 'YTD', '1Y', 'ALL'];

/* ─── CHART OPTIONS ─────────────────────────────────────────────────────────── */
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      mode: 'index',
      intersect: false,
      backgroundColor: 'rgba(10,22,40,0.92)',
      titleColor: 'rgba(255,255,255,0.5)',
      bodyColor: '#FFFFFF',
      padding: 10,
      cornerRadius: 8,
      displayColors: false,
      callbacks: {
        label: (ctx) => {
          if (ctx.parsed.y == null) return null;
          const prefix = ctx.dataset.label === 'Forecast' ? '(Forecast) ' : '';
          return prefix + 'Rp ' + ctx.parsed.y.toLocaleString('id-ID');
        },
      },
    },
  },
  scales: {
    y: { display: false },
    x: {
      grid: { display: false, drawBorder: false },
      ticks: {
        color: '#7A90B0',
        font: { size: 10, family: "'DM Sans', sans-serif" },
      },
      border: { display: false },
    },
  },
  elements: {
    line: { tension: 0.42 },
    point: { radius: 0, hitRadius: 12, hoverRadius: 4, hoverBorderWidth: 2, hoverBorderColor: '#fff', hoverBackgroundColor: '#2D6BE4' },
  },
  interaction: { mode: 'nearest', axis: 'x', intersect: false },
};

/* ─── COMPONENT ─────────────────────────────────────────────────────────────── */
const DashboardHome = () => {
  const [selectedTx, setSelectedTx] = useState(null);
  const [shuFilter, setShuFilter] = useState('YTD');
  const [txTypeFilter, setTxTypeFilter] = useState('all');
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [user, setUser] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPayments, setSelectedPayments] = useState({
    savingIds: [], // Array of saving bill IDs
    loanIds: [] // Array of installment IDs
  });
  const [savingMonthFilter, setSavingMonthFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [paymentChannels, setPaymentChannels] = useState([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [isInitiating, setIsInitiating] = useState(false);
  const [shuAnalytics, setShuAnalytics] = useState(null);
  const [showShuHistory, setShowShuHistory] = useState(false);

  const itemsPerPage = 5;
  const chartRef = useRef(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      // Get member_id from user in localStorage
      const userStr = localStorage.getItem('user');
      const userData = userStr ? JSON.parse(userStr) : null;
      setUser(userData);
      
      const memberId = userData?.member_id;

      if (!memberId) {
        setLoading(false);
        console.warn('No member_id found for current user');
        return;
      }

      try {
        let url = apiUrl(`/loan/loans/my_transactions/?type=${txTypeFilter}&member_id=${memberId}`);
        if (startDate) {
          url += `&start_date=${startDate}`;
        }
        if (endDate) {
          url += `&end_date=${endDate}`;
        }

        const [summaryRes, txRes, chanRes, shuRes] = await Promise.all([
          fetch(apiUrl(`/loan/loans/dashboard_summary/?member_id=${memberId}`)),
          fetch(url),
          fetch(apiUrl('/loan/loans/payment_channels/')),
          fetch(apiUrl(`/my-shu/analytics/?member_id=${memberId}`))
        ]);

        const summaryData = await summaryRes.json();
        const txData = await txRes.json();
        const chanData = chanRes.ok ? await chanRes.json() : [];
        const shuData = shuRes.ok ? await shuRes.json() : null;

        setSummary(summaryData);
        setTransactions(Array.isArray(txData) ? txData : []);
        setPaymentChannels(chanData);
        if (shuData) setShuAnalytics(shuData);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardData();
    setCurrentPage(1); // Reset to first page when filter changes
  }, [txTypeFilter, searchTrigger]);

  const handleClearFilters = () => {
    setTxTypeFilter('all');
    setStartDate('');
    setEndDate('');
    setSearchTrigger(prev => prev + 1);
  };

  const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(number || 0).replace(',00', '');
  };

  useEffect(() => {
    if (summary) {
      let loanIds = [];
      if (summary.unpaid_installments_list) {
        loanIds = summary.unpaid_installments_list.map(i => i.id);
      }
      let savingIds = [];
      if (summary.unpaid_bills_list) {
        savingIds = summary.unpaid_bills_list.map(b => b.id);
      }
      setSelectedPayments({ savingIds, loanIds });
      setSavingMonthFilter('ALL');
    }
  }, [summary]);

  const uniqueSavingMonths = React.useMemo(() => {
    if (!summary?.unpaid_bills_list) return [];
    const months = new Set();
    summary.unpaid_bills_list.forEach(b => {
      const d = new Date(b.bill_date);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.add(val);
    });
    return Array.from(months).sort();
  }, [summary]);

  const filteredBills = React.useMemo(() => {
    if (!summary?.unpaid_bills_list) return [];
    if (savingMonthFilter === 'ALL') return summary.unpaid_bills_list;
    return summary.unpaid_bills_list.filter(b => {
      const d = new Date(b.bill_date);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return val === savingMonthFilter;
    });
  }, [summary, savingMonthFilter]);

  const toggleSavingBill = (id) => {
    setSelectedPayments(prev => {
      let newIds = [...prev.savingIds];
      if (newIds.includes(id)) {
        newIds = newIds.filter(i => i !== id);
      } else {
        newIds.push(id);
      }
      return { ...prev, savingIds: newIds };
    });
  };

  const toggleInstallment = (id) => {
    if (!summary?.unpaid_installments_list) return;
    
    const index = summary.unpaid_installments_list.findIndex(i => i.id === id);
    const isSelected = selectedPayments.loanIds.includes(id);

    setSelectedPayments(prev => {
      let newLoanIds = [...prev.loanIds];

      if (!isSelected) {
        // When selecting, we must ensure all previous ones are also selected
        // Or just allow selecting this one IF previous are already selected
        const prevUnselected = summary.unpaid_installments_list
          .slice(0, index)
          .some(i => !newLoanIds.includes(i.id));
        
        if (prevUnselected) {
          // Auto-select all previous ones too? Or just block?
          // User said "harus memilih lebih atas dulu", so let's auto-select all up to this one
          const upToNow = summary.unpaid_installments_list.slice(0, index + 1).map(i => i.id);
          return { ...prev, loanIds: Array.from(new Set([...newLoanIds, ...upToNow])) };
        }
        newLoanIds.push(id);
      } else {
        // When unselecting, we must also unselect all subsequent ones to maintain sequence
        const subsequentIds = summary.unpaid_installments_list.slice(index).map(i => i.id);
        newLoanIds = newLoanIds.filter(i => !subsequentIds.includes(i));
      }

      return { ...prev, loanIds: newLoanIds };
    });
  };

  const isSequentialSelectionValid = () => {
    if (selectedPayments.loanIds.length === 0) return true;
    if (!summary?.unpaid_installments_list?.length) return true;

    // The first unpaid installment MUST be selected if any loan installment is selected
    const firstUnpaidId = summary.unpaid_installments_list[0].id;
    if (!selectedPayments.loanIds.includes(firstUnpaidId)) return false;

    // Check for gaps
    let foundUnselected = false;
    for (const inst of summary.unpaid_installments_list) {
      if (selectedPayments.loanIds.includes(inst.id)) {
        if (foundUnselected) return false; // Gap found!
      } else {
        foundUnselected = true;
      }
    }
    return true;
  };

  const calculateTotal = () => {
    let total = 0;
    if (summary?.unpaid_bills_list) {
      summary.unpaid_bills_list.forEach(b => {
        if (selectedPayments.savingIds.includes(b.id)) {
          total += Number(b.amount_due - (b.amount_paid || 0));
        }
      });
    }
    
    if (summary?.unpaid_installments_list) {
      summary.unpaid_installments_list.forEach(inst => {
        if (selectedPayments.loanIds.includes(inst.id)) {
          total += Number(inst.amount_total);
        }
      });
    }
    return total;
  };

  const calculateGrowth = (inc, total) => {
    if (!total || total === 0) return 0;
    return ((inc / total) * 100).toFixed(1);
  };

  const handleInitiatePayment = async () => {
    if (isInitiating) return;
    if (!selectedPaymentMethod) {
      alert("Silakan pilih metode pembayaran terlebih dahulu!");
      return;
    }
    
    setIsInitiating(true);
    const memberId = summary?.member_id || user?.member_id;

    try {
      const res = await fetch(apiUrl('/loan/loans/create_bulk_payment_token/'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          member_id: memberId,
          saving_ids: selectedPayments.savingIds,
          loan_ids: selectedPayments.loanIds,
          payment_type: selectedPaymentMethod
        })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Gagal membuat pembayaran.");
        setIsInitiating(false);
        return;
      }

      if (window.snap) {
        window.snap.pay(data.snap_token, {
          onSuccess: function(result) {
            alert("Pembayaran berhasil!");
            setShowPaymentModal(false);
            setIsInitiating(false);
            window.location.reload();
          },
          onPending: function(result) {
            alert("Pembayaran tertunda. Harap selesaikan pembayaran Anda.");
            setShowPaymentModal(false);
            setIsInitiating(false);
            window.location.reload();
          },
          onError: function(result) {
            alert("Pembayaran gagal!");
            setIsInitiating(false);
          },
          onClose: function() {
            alert("Anda menutup halaman pembayaran sebelum selesai.");
            setIsInitiating(false);
          }
        });
      } else {
        alert("Midtrans Snap belum terisi. Harap muat ulang halaman.");
        setIsInitiating(false);
      }
    } catch (error) {
      console.error("Payment initiation failed:", error);
      alert("Koneksi gagal.");
      setIsInitiating(false);
    }
  };

  const handleDownloadReport = () => {
    console.log('Generating report...');
    try {
      const doc = new jsPDF();
      const dateStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

      // Header
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42); // Navy
      doc.text('KOPERASI SANOH SINERGI BERSAMA', 105, 20, { align: 'center' });

      doc.setFontSize(14);
      doc.setTextColor(100);
      doc.text('FINANCIAL SUMMARY REPORT', 105, 30, { align: 'center' });

      doc.setLineWidth(0.5);
      doc.line(20, 35, 190, 35);

      // Member Info
      doc.setFontSize(11);
      doc.setTextColor(0);
      doc.text(`Member Name : ${summary?.full_name || 'Member'}`, 20, 45);
      doc.text(`Report Date   : ${dateStr}`, 20, 52);

      // Savings Section
      doc.setFontSize(14);
      doc.text('1. Savings Overview', 20, 70);
      const savingsBody = [
        ['Principal Savings', formatRupiah(summary?.principle_balance)],
        ['Mandatory Savings', formatRupiah(summary?.mandatory_balance)],
        ['Voluntary Savings', formatRupiah(summary?.voluntary_balance)],
        ['Total Balance', formatRupiah(summary?.total_saving_balance)]
      ];
      autoTable(doc, {
        startY: 75,
        head: [['Account Type', 'Current Balance']],
        body: savingsBody,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42] }
      });

      // Loan Section
      const finalY = doc.lastAutoTable.finalY + 15;
      doc.text('2. Loan Status', 20, finalY);
      const loanBody = [
        ['Approved Principal', formatRupiah(summary?.principal_amount)],
        ['Remaining Balance', formatRupiah(summary?.total_loan_remaining)],
        ['Installments Paid', `${summary?.paid_installments} of ${summary?.total_installments}`],
        ['Total Outstanding', formatRupiah(summary?.grand_total_outstanding)]
      ];
      autoTable(doc, {
        startY: finalY + 5,
        body: loanBody,
        theme: 'plain',
        styles: { fontSize: 10 }
      });

      // Transaction Section
      const txY = doc.lastAutoTable.finalY + 15;
      doc.text('3. Recent Transactions', 20, txY);
      const txBody = transactions.map(tx => [
        new Date(tx.transaction_date).toLocaleDateString('id-ID'),
        tx.transaction_type,
        formatRupiah(tx.amount),
        tx.status
      ]);
      autoTable(doc, {
        startY: txY + 5,
        head: [['Date', 'Type', 'Amount', 'Status']],
        body: txBody,
        styles: { fontSize: 9 }
      });

      // Footer
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setTextColor(150);
        doc.text(`Koperasi Sanoh - Professional Financial Management System`, 105, 285, { align: 'center' });
      }

      doc.save(`Financial_Report_${summary?.full_name}_${new Date().toISOString().split('T')[0]}.pdf`);
      console.log('Report generated successfully.');
    } catch (error) {
      console.error('Failed to generate PDF report:', error);
      alert('Failed to generate report. Please check if your browser allows downloads or try again later.');
    }
  };

  const handleDownloadReceipt = (tx) => {
    try {
      const doc = new jsPDF();

      // Header
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42);
      doc.text('KOPERASI SANOH SINERGI BERSAMA', 105, 30, { align: 'center' });

      doc.setFontSize(14);
      doc.text('TRANSACTION RECEIPT', 105, 40, { align: 'center' });

      doc.setLineWidth(0.5);
      doc.line(20, 45, 190, 45);

      // Details
      doc.setFontSize(11);
      doc.setTextColor(0);

      const rows = [
        ['Status', tx.status],
        ['Category', tx.transaction_type],
        ['Date', new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(tx.transaction_date))],
        ['Member Name', summary?.full_name],
        ['Amount', formatRupiah(tx.amount)]
      ];

      autoTable(doc, {
        startY: 55,
        body: rows,
        theme: 'plain',
        styles: { fontSize: 11, cellPadding: 5 },
        columnStyles: { 0: { fontStyle: 'bold', width: 50 } }
      });

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text('Thank you for being a part of Koperasi Sanoh.', 105, doc.lastAutoTable.finalY + 20, { align: 'center' });

      doc.save(`Receipt_${tx.reference || 'TX'}.pdf`);
    } catch (error) {
      console.error('Failed to generate Receipt:', error);
      alert('Failed to generate receipt.');
    }
  };

  const formatMonthLabel = (monthStr) => {
    const [yy, mm] = monthStr.split('-');
    const date = new Date(parseInt(yy), parseInt(mm) - 1, 1);
    return date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
  };

  const getFilteredChartData = () => {
    if (!shuAnalytics || !shuAnalytics.chart_data) {
      return { labels: [], data: [], forecastLabels: [], forecastData: [], total: 'Rp 0', estimatedAnnual: null, confidence: null };
    }

    let filtered = [...shuAnalytics.chart_data];
    const now = new Date();

    if (shuFilter === '3M') {
      filtered = filtered.slice(-3);
    } else if (shuFilter === '6M') {
      filtered = filtered.slice(-6);
    } else if (shuFilter === 'YTD') {
      const currentYear = now.getFullYear().toString();
      filtered = filtered.filter(d => d.month.startsWith(currentYear));
    } else if (shuFilter === '1Y') {
      filtered = filtered.slice(-12);
    }
    // 'ALL' → no filter, show everything

    const historicalLabels = filtered.map(d => formatMonthLabel(d.month));
    const historicalData = filtered.map(d => d.total_shu);

    let forecastLabels = [];
    let forecastData = [];
    let estimatedAnnual = null;
    let confidence = null;

    if (shuAnalytics.forecast && shuAnalytics.forecast.forecast_data) {
      const fc = shuAnalytics.forecast;
      forecastLabels = fc.forecast_data.map(d => formatMonthLabel(d.month));
      forecastData = fc.forecast_data.map(d => d.total_shu);
      estimatedAnnual = fc.estimated_annual_return;
      confidence = fc.confidence;
    }

    return {
      labels: historicalLabels,
      data: historicalData,
      forecastLabels,
      forecastData,
      total: formatRupiah(shuAnalytics.total_shu),
      estimatedAnnual,
      confidence,
    };
  };

  const activeChart = getFilteredChartData();

  /* Build gradient fill dynamically */
  const getGradient = (chart) => {
    const { ctx, chartArea } = chart;
    if (!chartArea) return 'rgba(45,107,228,0.1)';
    const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, 'rgba(45,107,228,0.18)');
    g.addColorStop(1, 'rgba(45,107,228,0)');
    return g;
  };

  const hasForecast = activeChart.forecastData.length > 0;
  const allLabels = [...activeChart.labels, ...activeChart.forecastLabels];

  const chartData = {
    labels: allLabels,
    datasets: [
      {
        fill: true,
        label: 'SHU Value',
        data: [
          ...activeChart.data,
          ...new Array(activeChart.forecastLabels.length).fill(null),
        ],
        borderColor: '#2D6BE4',
        borderWidth: 2.5,
        backgroundColor: (context) => {
          const chart = context.chart;
          return getGradient(chart);
        },
      },
      ...(hasForecast ? [{
        fill: false,
        label: 'Forecast',
        data: [
          ...new Array(Math.max(0, activeChart.data.length - 1)).fill(null),
          ...(activeChart.data.length > 0 ? [activeChart.data[activeChart.data.length - 1]] : []),
          ...activeChart.forecastData,
        ],
        borderColor: '#94A3B8',
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHoverRadius: 3,
        pointHoverBackgroundColor: '#94A3B8',
        pointHoverBorderColor: '#fff',
      }] : []),
    ],
  };

  /* Close modal on ESC */
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setSelectedTx(null); setShowShuHistory(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="dash-home">

      {/* ── Page Header ────────────────────────────────────── */}
      <div className="dh-page-header">
        <div>
          <h1>Welcome Back, {loading && !user ? '...' : (user?.full_name || summary?.full_name || 'Member')}!</h1>
          <p>Here is your financial overview for this period.</p>
        </div>
        <button className="dh-report-btn hidden-mobile" onClick={handleDownloadReport}>
          <Download size={14} />
          Report Overview
        </button>
      </div>

      {!user?.member_id && !loading && (
        <div className="alert-info-dashboard" style={{ 
          background: '#EFF6FF', 
          border: '1px solid #BFDBFE', 
          padding: '16px', 
          borderRadius: '12px', 
          marginBottom: '24px',
          color: '#1E40AF',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <UserCircle size={20} />
          <span>Informasi profil member Anda belum lengkap. Silakan hubungi admin untuk menghubungkan akun Anda dengan data anggota.</span>
        </div>
      )}

      {/* ── Stat Cards ─────────────────────────────────────── */}
      <div className="dash-grid-4">

        {/* Principal Savings */}
        <div className="premium-card group stat-card-blue stat-rise-1">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
            <div className="icon-wrapper blue-gradient">
              <Briefcase size={20} />
            </div>
          </div>
          <p className="summary-label">Principal Savings</p>
          <h3 className="summary-value">{loading ? '...' : formatRupiah(summary?.principle_balance)}</h3>
        </div>

        {/* Voluntary Savings */}
        <div className="premium-card group stat-card-green stat-rise-2">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
            <div className="icon-wrapper green-gradient">
              <PiggyBank size={20} />
            </div>
            <span className="badge-soft-green">
              <ArrowUpRight size={11} /> {calculateGrowth(summary?.voluntary_month_inc, summary?.voluntary_balance)}%
            </span>
          </div>
          <p className="summary-label">Voluntary Savings</p>
          <h3 className="summary-value">{loading ? '...' : formatRupiah(summary?.voluntary_balance)}</h3>
        </div>

        {/* Mandatory Savings */}
        <div className="premium-card group stat-card-teal stat-rise-3">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
            <div className="icon-wrapper teal-gradient">
              <Wallet size={20} />
            </div>
            <span className="badge-soft-green">
              <ArrowUpRight size={11} /> {calculateGrowth(summary?.mandatory_month_inc, summary?.mandatory_balance)}%
            </span>
          </div>
          <p className="summary-label">Mandatory Savings</p>
          <h3 className="summary-value">{loading ? '...' : formatRupiah(summary?.mandatory_balance)}</h3>
        </div>

        {/* Outstanding Payment */}
        <div className="premium-card group stat-card-rose stat-rise-4">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
            <div className="icon-wrapper red-gradient">
              <CreditCard size={20} />
            </div>
            {summary?.employee_status_id === 3 && summary?.grand_total_outstanding > 0 && (
              <button 
                className="pay-now-badge-btn" 
                onClick={() => setShowPaymentModal(true)}
              >
                Pay Now
              </button>
            )}
            {summary?.employee_status_id !== 3 && (
              <span className="badge-soft-gray">Upcoming</span>
            )}
          </div>
          <p className="summary-label">Outstanding Payment</p>
          <h3 className="summary-value" style={{ color: '#E11D48' }}>
            {loading ? '...' : formatRupiah(summary?.grand_total_outstanding)}
          </h3>
        </div>

      </div>

      {/* ── Analytics & Loan ───────────────────────────────── */}
      <div className="dash-grid-2">

        {/* SHU Analytics */}
        <div className="premium-card" style={{ display: 'flex', flexDirection: 'column' }}>

          <div className="chart-header">
            <div className="chart-title-group">
              <div className="chart-icon-box">
                <TrendingUp size={18} />
              </div>
              <div>
                <p className="chart-title">SHU Analytics</p>
                <p className="chart-subtitle">
                  {activeChart.estimatedAnnual
                    ? `Est. annual return: ${formatRupiah(activeChart.estimatedAnnual)}`
                    : 'Estimated annual return'}
                </p>
              </div>
            </div>
            {/* Period Tabs */}
            <div className="period-tab-group">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  className={`period-tab-btn${shuFilter === p ? ' active' : ''}`}
                  onClick={() => setShuFilter(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="chart-canvas-wrap">
            <Line ref={chartRef} data={chartData} options={chartOptions} />
          </div>

          <div className="chart-metrics-row">
            <div className="chart-metric shu-tooltip-wrap">
              <p className="metric-label-small">
                Current SHU {shuAnalytics?.current_year?.year || new Date().getFullYear()}
                <Info size={11} style={{ marginLeft: 4, verticalAlign: 'middle', opacity: 0.5 }} />
              </p>
              <h4 className="metric-value-big dark">
                {formatRupiah(shuAnalytics?.current_year?.total_shu || 0)}
              </h4>
              <div className="shu-tooltip-box">
                Total SHU yang sudah Anda terima sepanjang tahun {shuAnalytics?.current_year?.year || new Date().getFullYear()} ini.
              </div>
            </div>
            {shuAnalytics?.forecast?.trend && (
              <div className="chart-metric shu-tooltip-wrap">
                <p className="metric-label-small">
                  Predicted Growth (6 mo)
                  <Info size={11} style={{ marginLeft: 4, verticalAlign: 'middle', opacity: 0.5 }} />
                </p>
                <h4 className="metric-value-big" style={{
                  color: shuAnalytics.forecast.trend.direction === 'up' ? '#10B981'
                    : shuAnalytics.forecast.trend.direction === 'down' ? '#EF4444'
                    : '#64748B'
                }}>
                  {shuAnalytics.forecast.trend.direction === 'up' ? (
                    <TrendingUp size={14} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
                  ) : shuAnalytics.forecast.trend.direction === 'down' ? (
                    <TrendingDown size={14} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
                  ) : null}
                  {shuAnalytics.forecast.trend.growth_6m_pct > 0 ? '+' : ''}
                  {shuAnalytics.forecast.trend.growth_6m_pct}%
                </h4>
                <p style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
                  {activeChart.confidence === 'high'
                    ? 'Akurasi tinggi'
                    : activeChart.confidence === 'medium'
                    ? 'Akurasi sedang'
                    : 'Data masih sedikit'}
                </p>
                <div className="shu-tooltip-box">
                  Perkiraan naik/turunnya SHU Anda dalam 6 bulan ke depan berdasarkan data sebelumnya.
                </div>
              </div>
            )}
            {shuAnalytics?.yearly_history?.length > 0 && (
              <div
                className="chart-metric shu-tooltip-wrap"
                style={{ cursor: 'pointer' }}
                onClick={() => setShowShuHistory(true)}
              >
                <p className="metric-label-small" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <FileText size={12} />
                  SHU History
                  <Info size={11} style={{ opacity: 0.5 }} />
                </p>
                <h4 className="metric-value-big" style={{ color: '#2D6BE4', fontSize: 13 }}>
                  View details
                </h4>
                <div className="shu-tooltip-box">
                  Klik untuk lihat rincian SHU bulanan tahun ini dan total SHU tahun-tahun sebelumnya.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Loan Balance */}
        <div className="premium-card" style={{ display: 'flex', flexDirection: 'column' }}>

          <div>
            <p className="loan-balance-label">Active Loan Balance</p>
            <h2 className="loan-amount-big">
              {loading ? '...' : formatRupiah(summary?.total_loan_remaining)}
            </h2>
            <p className="loan-subtitle">
              From total approved loan of <strong>{loading ? '...' : formatRupiah(summary?.principal_amount)}</strong>
            </p>
          </div>

          <div className="loan-donut-row">
            {/* Donut Chart — Dynamic Progress */}
            {(() => {
              const total = summary?.total_installments || 0;
              const paid = summary?.paid_installments || 0;
              const paidPct = total > 0 ? Math.round((paid / total) * 100) : 0;
              // r=46 → C = 2π×46 ≈ 289.03
              const dashOffset = 289.03 * (1 - paidPct / 100);

              return (
                <div className="donut-container">
                  <svg className="donut-svg-el" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="50" cy="50" r="46" fill="none" stroke="#EEF2F9" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="46" fill="none"
                      stroke="#F59E0B" strokeWidth="8"
                      strokeDasharray="289.03"
                      strokeDashoffset={dashOffset}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="donut-center-text">
                    <span className="donut-pct">{paidPct}%</span>
                    <span className="donut-pct-lbl">Paid</span>
                  </div>
                </div>
              );
            })()}

            <div className="loan-install-info">
              <h4>{summary?.paid_installments || 0} of {summary?.total_installments || 0} Installments</h4>
              <p>Keep up the good payment history to increase your next loan limit.</p>
            </div>
          </div>

          <div className="loan-footer-row">
            <div>
              <p className="due-chip-label">Next Payment Due</p>
              <p className="due-chip-val">
                {summary?.next_due_date
                  ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(summary.next_due_date))
                  : '-'}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p className="due-chip-label">Amount Due</p>
              <p className="due-chip-val danger">
                {summary?.next_due_amount ? formatRupiah(summary.next_due_amount) : '-'}
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* ── Transaction History ─────────────────────────────── */}
      <div className="premium-card" style={{ padding: 0, marginTop: '18px', overflow: 'hidden' }}>

        <div className="tx-card-header">
          <h3>Recent Transactions</h3>
        </div>

        {/* Filters */}
        <div className="tx-filters-strip">
          <span className="filter-strip-label">Trans. Type</span>
          <select
            id="transaction-type-filter"
            name="transactionType"
            className="filter-pill-select"
            value={txTypeFilter}
            onChange={(e) => setTxTypeFilter(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="deposit">Deposit</option>
            <option value="loan">Loan Installment</option>
            <option value="withdrawal">Withdrawals</option>
            <option value="shu_distribution">SHU Distribution</option>
          </select>

          <span className="filter-strip-label">Date</span>
          <input 
            type="date" 
            className="filter-pill-date" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)} 
          />
          <span className="filter-sep">—</span>
          <input 
            type="date" 
            className="filter-pill-date" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)} 
          />

          <div className="filter-actions-group">
            <button 
              className="btn-filter-clear" 
              onClick={handleClearFilters}
            >
              Clear
            </button>
            <button 
              className="btn-filter-search" 
              onClick={() => setSearchTrigger(prev => prev + 1)}
            >
              Search
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="tx-table-outer">
          <table className="tx-table">
            <thead>
              <tr>
                <th style={{ width: '20%' }}>Date</th>
                <th style={{ width: '20%' }}>Ref ID</th>
                <th style={{ width: '25%' }}>Transaction Type</th>
                <th style={{ width: '15%' }}>Amount</th>
                <th style={{ width: '20%', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: '#94A3B8' }}>
                    No recent transactions found.
                  </td>
                </tr>
              ) : (
                transactions
                  .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                  .map((tx, idx) => (
                    <tr key={idx} className="tx-row" onClick={() => setSelectedTx(tx)}>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span className="tx-date-primary">
                          {new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(tx.transaction_date))}
                        </span>
                        <span className="tx-time-secondary" style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                          {new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date(tx.transaction_date))} WIB
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="tx-ref-id">{tx.reference || '-'}</span>
                    </td>
                    <td>
                      <span className="tx-type-cell">{tx.transaction_type}</span>
                    </td>
                    <td>
                      <span className="tx-amount-cell">{formatRupiah(tx.amount)}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`status-pill status-pill-${tx.status?.toLowerCase().replace(' ', '-')}`}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {transactions.length > 0 && (
          <div className="tx-pagination-row">
            <span className="pg-count-label">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, transactions.length)} of {transactions.length} entries
            </span>
            <div className="pg-btn-group">
              <button
                className="page-nav-btn"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                Prev
              </button>
              {Array.from({ length: Math.ceil(transactions.length / itemsPerPage) }, (_, i) => (
                <button
                  key={i + 1}
                  className={`page-nav-btn${currentPage === i + 1 ? ' active' : ''}`}
                  onClick={() => setCurrentPage(i + 1)}
                >
                  {i + 1}
                </button>
              ))}
              <button
                className="page-nav-btn"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(transactions.length / itemsPerPage)))}
                disabled={currentPage === Math.ceil(transactions.length / itemsPerPage)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Payment Modal ────────────────────────────────────── */}
      {showPaymentModal && (
        <div className="dh-modal-overlay" onClick={() => setShowPaymentModal(false)}>
          <div className="dh-payment-modal" onClick={e => e.stopPropagation()}>
            <div className="dh-modal-header">
              <div className="header-title">
                <div className="icon-box">
                  <CreditCard size={20} color="#E11D48" />
                </div>
                <div>
                  <h3>Select Payment</h3>
                  <p>Choose bills you want to pay</p>
                </div>
              </div>
              <button className="close-btn" onClick={() => setShowPaymentModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="dh-modal-content">
              <div className="payment-options">
                {/* Savings Bill Section */}
                <div className="payment-group-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Saving Bills</span>
                  {uniqueSavingMonths.length > 0 && (
                    <select 
                      value={savingMonthFilter} 
                      onChange={e => setSavingMonthFilter(e.target.value)}
                      style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #E2E8F0', fontSize: '12px', background: '#fff' }}
                    >
                      <option value="ALL">All Months</option>
                      {uniqueSavingMonths.map(m => (
                        <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</option>
                      ))}
                    </select>
                  )}
                </div>

                {filteredBills.length > 0 ? (
                  filteredBills.map(b => (
                    <div 
                      key={b.id}
                      className={`payment-option sub-option ${selectedPayments.savingIds.includes(b.id) ? 'selected' : ''}`}
                      onClick={() => toggleSavingBill(b.id)}
                    >
                      <div className="option-info">
                        <div className={`checkbox ${selectedPayments.savingIds.includes(b.id) ? 'checked' : ''}`}>
                          {selectedPayments.savingIds.includes(b.id) && <Check size={14} />}
                        </div>
                        <div>
                          <span className="option-label">{b.saving_type_id === 1 ? 'Mandatory Saving' : 'Voluntary Saving'}</span>
                          <span className="option-desc">Bill Date: {new Date(b.bill_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                      </div>
                      <span className="option-amount">{formatRupiah(b.amount_due - (b.amount_paid || 0))}</span>
                    </div>
                  ))
                ) : (
                  <div className="no-items-msg">No unpaid saving bills</div>
                )}

                {/* Loan Installments Section */}
                <div className="payment-group-label">Loan Installments</div>
                {summary?.unpaid_installments_list?.length > 0 ? (
                  summary.unpaid_installments_list.map((inst) => (
                    <div 
                      key={inst.id}
                      className={`payment-option sub-option ${selectedPayments.loanIds.includes(inst.id) ? 'selected' : ''}`}
                      onClick={() => toggleInstallment(inst.id)}
                    >
                      <div className="option-info">
                        <div className={`checkbox ${selectedPayments.loanIds.includes(inst.id) ? 'checked' : ''}`}>
                          {selectedPayments.loanIds.includes(inst.id) && <Check size={14} />}
                        </div>
                        <div>
                          <span className="option-label">Installment #{inst.installment_number}</span>
                          <span className="option-desc">Due: {new Date(inst.due_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                      </div>
                      <span className="option-amount">{formatRupiah(inst.amount_total)}</span>
                    </div>
                  ))
                ) : (
                  <div className="no-items-msg">No unpaid installments</div>
                )}
              </div>

              {/* Payment Methods Section */}
              <div className="payment-group-label" style={{ marginTop: '20px', marginBottom: '10px' }}>Pilih Metode Pembayaran</div>
              <div className="pm-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '20px' }}>
                {paymentChannels.map(ch => (
                   <div 
                     key={ch.channel_code} 
                     className={`payment-option ${selectedPaymentMethod === ch.channel_code ? 'selected' : ''}`} 
                     onClick={() => setSelectedPaymentMethod(ch.channel_code)}
                     style={{ 
                       padding: '12px 16px', 
                       border: `2px solid ${selectedPaymentMethod === ch.channel_code ? '#E11D48' : '#F1F5F9'}`,
                       borderRadius: '12px',
                       cursor: 'pointer',
                       background: selectedPaymentMethod === ch.channel_code ? '#FFF1F2' : '#FAFAFA',
                       display: 'flex',
                       flexDirection: 'column',
                       gap: '4px',
                       transition: 'all 0.2s',
                       boxShadow: selectedPaymentMethod === ch.channel_code ? '0 4px 6px -1px rgba(225, 29, 72, 0.1)' : 'none'
                     }}
                   >
                     <span style={{ fontWeight: '600', fontSize: '13px', color: '#1E293B' }}>{ch.channel_name}</span>
                     <span style={{ fontSize: '11px', color: '#64748B' }}>
                       {ch.fee_percentage > 0 ? `${ch.fee_percentage}%` : ''} 
                       {ch.fee_percentage > 0 && ch.fee_fixed > 0 ? ' + ' : ''}
                       {ch.fee_fixed > 0 ? `Rp ${ch.fee_fixed}` : ''}
                       {ch.fee_percentage === 0 && ch.fee_fixed === 0 ? 'Gratis' : ''}
                     </span>
                   </div>
                ))}
              </div>

              {(() => {
                const selectedChannel = paymentChannels.find(ch => ch.channel_code === selectedPaymentMethod);
                const feePercentage = selectedChannel ? Number(selectedChannel.fee_percentage) : 0;
                const feeFixed = selectedChannel ? Number(selectedChannel.fee_fixed) : 0;
                const subtotal = calculateTotal();
                const feeTotal = Math.round((subtotal * feePercentage) / 100) + feeFixed;
                const totalAmount = subtotal + feeTotal;

                return (
                  <>
                    <div className="payment-summary-box" style={{ background: '#F8FAFC', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
                      <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748B', marginBottom: '8px' }}>
                        <span>Subtotal Selected</span>
                        <span className="summary-val" style={{ fontWeight: '500', color: '#1E293B' }}>
                          {formatRupiah(subtotal)}
                        </span>
                      </div>
                      {selectedPaymentMethod && (
                        <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748B', marginBottom: '8px' }}>
                          <span>Biaya Layanan</span>
                          <span className="summary-val" style={{ fontWeight: '500', color: '#1E293B' }}>
                            {formatRupiah(feeTotal)}
                          </span>
                        </div>
                      )}
                      <div className="summary-row total" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '700', color: '#0F172A', borderTop: '1px solid #E2E8F0', paddingTop: '10px' }}>
                        <span>Total Amount</span>
                        <span className="total-val" style={{ color: '#E11D48' }}>
                          {formatRupiah(selectedPaymentMethod ? totalAmount : subtotal)}
                        </span>
                      </div>
                    </div>

                    <button 
                      className="dh-modal-pay-btn"
                      disabled={
                        (selectedPayments.savingIds.length === 0 && selectedPayments.loanIds.length === 0) || 
                        !isSequentialSelectionValid() ||
                        !selectedPaymentMethod ||
                        isInitiating
                      }
                      onClick={handleInitiatePayment}
                      style={{
                        width: '100%',
                        padding: '14px',
                        borderRadius: '12px',
                        border: 'none',
                        background: ((selectedPayments.savingIds.length === 0 && selectedPayments.loanIds.length === 0) || !isSequentialSelectionValid() || !selectedPaymentMethod || isInitiating) ? '#CBD5E1' : '#E11D48',
                        color: '#FFFFFF',
                        fontWeight: '600',
                        cursor: ((selectedPayments.savingIds.length === 0 && selectedPayments.loanIds.length === 0) || !isSequentialSelectionValid() || !selectedPaymentMethod || isInitiating) ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                        textAlign: 'center'
                      }}
                    >
                      {isInitiating ? 'Processing...' : (!isSequentialSelectionValid() ? 'Please Select Chronologically' : (!selectedPaymentMethod ? 'Pilih Metode Pembayaran' : 'Pay Now'))}
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Transaction Modal ───────────────────────────────── */}
      {selectedTx && (
        <div className="tx-modal-overlay" onClick={() => setSelectedTx(null)}>
          <div className="tx-modal-card" onClick={(e) => e.stopPropagation()}>

            <button
              className="btn-modal-close"
              onClick={() => setSelectedTx(null)}
              aria-label="Close"
            >✕</button>

            {/* Header */}
            <div className="modal-icon-ring">
              <HandCoins size={30} color="#059669" />
            </div>
            <div className="modal-header-text">
              <h3>Transaction Receipt</h3>
              <span className={`modal-status-tag ${selectedTx.status?.toLowerCase().includes('berhasil') || selectedTx.status?.toLowerCase().includes('success') ? 'success' : 'pending'}`}>
                {selectedTx.status}
              </span>
            </div>

            <hr className="modal-divider" />

            {/* Rows */}
            <div className="modal-rows">
              <div className="modal-row">
                <span className="modal-row-key">Category</span>
                <span className="modal-row-val tag">{selectedTx.transaction_type}</span>
              </div>

              <div className="modal-row">
                <span className="modal-row-key">Date</span>
                <div className="modal-row-val">
                  {new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(selectedTx.transaction_date))}
                </div>
              </div>

              <div className="modal-id-block">
                <div>
                  <span className="modal-row-key">Reference ID</span>
                  <span className="modal-id-code">{selectedTx.reference || '-'}</span>
                </div>
                <button className="modal-copy-btn" title="Copy to clipboard">
                  <Copy size={14} />
                </button>
              </div>

              <div className="modal-row">
                <span className="modal-row-key">Organization</span>
                <div className="modal-recipient-chip">
                  <div className="recipient-avatar">KS</div>
                  <span className="modal-row-val">Koperasi Sanoh</span>
                </div>
              </div>
            </div>

            <hr className="modal-dashed-divider" />

            <div className="modal-total-row">
              <span className="modal-total-label">Total Amount</span>
              <span className="modal-total-amount">{formatRupiah(selectedTx.amount)}</span>
            </div>

            <div className="modal-actions">
              <button className="btn-modal-ghost" onClick={() => setSelectedTx(null)}>
                Close
              </button>
              {/* <button className="btn-modal-primary" onClick={() => handleDownloadReceipt(selectedTx)}>
                <Download size={15} /> Download Receipt
              </button> */}
            </div>

          </div>
        </div>
      )}

      {/* ── SHU History Modal ───────────────────────────────── */}
      {showShuHistory && shuAnalytics && (
        <div className="tx-modal-overlay" onClick={() => setShowShuHistory(false)}>
          <div className="tx-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, width: '90%' }}>
            <button
              className="btn-modal-close"
              onClick={() => setShowShuHistory(false)}
            >
              <X size={18} />
            </button>

            <div style={{ padding: '24px 24px 0' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>SHU History</h3>
              <p style={{ fontSize: 13, color: '#64748B', marginBottom: 20 }}>Annual SHU summary &amp; current year breakdown</p>
            </div>

            {/* Current year breakdown */}
            {shuAnalytics.current_year?.months?.length > 0 && (
              <div style={{ padding: '0 24px 16px' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 8 }}>
                  {shuAnalytics.current_year.year} (Current Year)
                </p>
                <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #E8ECF1', borderRadius: 10 }}>
                  <table className="tx-table" style={{ fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th style={{ textAlign: 'right' }}>Savings</th>
                        <th style={{ textAlign: 'right' }}>SHU</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shuAnalytics.current_year.months.map((m) => {
                        const monthName = new Date(2026, m.month - 1, 1).toLocaleString('en-US', { month: 'long' });
                        return (
                          <tr key={m.month}>
                            <td>{monthName}</td>
                            <td style={{ textAlign: 'right' }}>{formatRupiah(m.total_savings)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatRupiah(m.total_shu)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', fontSize: 14 }}>
                  <span style={{ color: '#64748B', fontWeight: 500 }}>Total {shuAnalytics.current_year.year}</span>
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>{formatRupiah(shuAnalytics.current_year.total_shu)}</span>
                </div>
              </div>
            )}

            {/* Past years */}
            {shuAnalytics.yearly_history?.length > 0 && (
              <div style={{ padding: '0 24px 24px' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 8 }}>Past Years</p>
                <div style={{ border: '1px solid #E8ECF1', borderRadius: 10 }}>
                  <table className="tx-table" style={{ fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th>Year</th>
                        <th style={{ textAlign: 'right' }}>Total Savings</th>
                        <th style={{ textAlign: 'right' }}>Total SHU</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shuAnalytics.yearly_history.map((y) => (
                        <tr key={y.year}>
                          <td style={{ fontWeight: 600 }}>{y.year}</td>
                          <td style={{ textAlign: 'right' }}>{formatRupiah(y.total_savings)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatRupiah(y.total_shu)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ padding: '0 24px 24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-modal-ghost" onClick={() => setShowShuHistory(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default DashboardHome;