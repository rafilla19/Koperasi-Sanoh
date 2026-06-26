import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Printer, CheckCircle, AlertTriangle, X, Download, CreditCard, Copy, Loader } from 'lucide-react';
import { apiUrl } from '../../services/api';
import logoImg from '../../assets/logo.png';
import './LoanDetails.css';

const LoanDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const getCurrentMemberId = () => {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    return user?.member_id ?? user?.member?.id ?? user?.member?.member_id ?? user?.id ?? 1;
  };

  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [showPaymentInvoice, setShowPaymentInvoice] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [loanData, setLoanData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState([]);
  const [empStatus, setEmpStatus] = useState(null);
  const [isInitiating, setIsInitiating] = useState(false);
  const [paymentChannels, setPaymentChannels] = useState([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
  const [hasPendingClosure, setHasPendingClosure] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const summaryRef = useRef(null);

  const handleDownloadSummary = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const memberId = getCurrentMemberId();

      const memberRes = await fetch(apiUrl(`/member/members/profile_detail/?member_id=${memberId}`));
      let memberData = null;
      if (memberRes.ok) {
        memberData = await memberRes.json();
      }

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;

      // Load logo
      const loadLogo = () => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = logoImg;
      });
      const logo = await loadLogo();

      // === KOP SURAT / LETTERHEAD ===
      const headerStartY = 12;
      const logoSize = 18;

      if (logo) {
        doc.addImage(logo, 'PNG', margin, headerStartY - 2, logoSize, logoSize);
      }

      const textStartX = margin + logoSize + 5;

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(27, 54, 93);
      doc.text("KOPERASI PRODUSEN SANOH SINERGI BERSAMA", textStartX, headerStartY + 4);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      doc.text("PT SANOH INDONESIA", textStartX, headerStartY + 9);

      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text("Jl. Inti II Blok C4 No.10, Kawasan Industri Hyundai – Cikarang, Bekasi 17550", textStartX, headerStartY + 14);
      doc.text("Email: koperasi.sanoh@sanoh.co.id  |  Telp: (021) 8983-7320", textStartX, headerStartY + 18);

      const lineY = headerStartY + 22;
      doc.setDrawColor(27, 54, 93);
      doc.setLineWidth(0.8);
      doc.line(margin, lineY, pageWidth - margin, lineY);
      doc.setLineWidth(0.3);
      doc.line(margin, lineY + 1.5, pageWidth - margin, lineY + 1.5);

      // === DOCUMENT TITLE ===
      let currentY = lineY + 10;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(27, 54, 93);
      doc.text("LOAN SUMMARY REPORT", pageWidth / 2, currentY, { align: 'center' });
      currentY += 4;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      doc.text(`Generated on: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, pageWidth / 2, currentY, { align: 'center' });
      currentY += 10;

      // === MEMBER INFORMATION SECTION ===
      doc.setFillColor(240, 245, 255);
      doc.roundedRect(margin, currentY - 3, pageWidth - margin * 2, 28, 2, 2, 'F');

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(27, 54, 93);
      doc.text("MEMBER INFORMATION", margin + 5, currentY + 3);
      currentY += 8;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(50, 50, 50);
      const col1X = margin + 5;
      const col2X = pageWidth / 2 + 5;

      doc.setFont("helvetica", "bold");
      doc.text("Name:", col1X, currentY);
      doc.setFont("helvetica", "normal");
      doc.text(memberData?.full_name || '-', col1X + 30, currentY);

      doc.setFont("helvetica", "bold");
      doc.text("Member ID:", col2X, currentY);
      doc.setFont("helvetica", "normal");
      doc.text(String(memberData?.id || memberId || '-'), col2X + 30, currentY);
      currentY += 6;

      doc.setFont("helvetica", "bold");
      doc.text("Member Since:", col1X, currentY);
      doc.setFont("helvetica", "normal");
      doc.text(formatDate(memberData?.join_date), col1X + 30, currentY);

      doc.setFont("helvetica", "bold");
      doc.text("Loan ID:", col2X, currentY);
      doc.setFont("helvetica", "normal");
      doc.text(`#${id}`, col2X + 30, currentY);
      currentY += 14;

      // === LOAN DETAILS SECTION ===
      doc.setFillColor(240, 245, 255);
      doc.roundedRect(margin, currentY - 3, pageWidth - margin * 2, 34, 2, 2, 'F');

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(27, 54, 93);
      doc.text("LOAN DETAILS", margin + 5, currentY + 3);
      currentY += 8;

      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);

      doc.setFont("helvetica", "bold");
      doc.text("Total Borrowed:", col1X, currentY);
      doc.setFont("helvetica", "normal");
      doc.text(formatRupiah(loanData?.principal_amount), col1X + 35, currentY);

      doc.setFont("helvetica", "bold");
      doc.text("Remaining:", col2X, currentY);
      doc.setFont("helvetica", "normal");
      doc.text(formatRupiah(loanData?.remaining_balance), col2X + 30, currentY);
      currentY += 6;

      doc.setFont("helvetica", "bold");
      doc.text("Interest (Flat):", col1X, currentY);
      doc.setFont("helvetica", "normal");
      doc.text(`${parseFloat(loanData?.bunga || 0).toFixed(1).replace('.', ',')}%`, col1X + 35, currentY);

      doc.setFont("helvetica", "bold");
      doc.text("Status:", col2X, currentY);
      doc.setFont("helvetica", "normal");
      doc.text(status || '-', col2X + 30, currentY);
      currentY += 6;

      doc.setFont("helvetica", "bold");
      doc.text("Purpose:", col1X, currentY);
      doc.setFont("helvetica", "normal");
      doc.text(loanData?.purpose || '-', col1X + 35, currentY);

      doc.setFont("helvetica", "bold");
      doc.text("Progress:", col2X, currentY);
      doc.setFont("helvetica", "normal");
      const progressPct = loanData?.total_installment > 0 ? Math.round((loanData.paid_installment / loanData.total_installment) * 100) : 0;
      doc.text(`${loanData?.paid_installment || 0}/${loanData?.total_installment || 0} (${progressPct}%)`, col2X + 30, currentY);
      currentY += 14;

      // === REPAYMENT SCHEDULE TABLE ===
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(27, 54, 93);
      doc.text("REPAYMENT SCHEDULE", margin + 5, currentY);
      currentY += 4;

      const formatNum = (num) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num || 0);

      const tableColumn = ["No", "Due Date", "Transaction Date", "Principal (Rp)", "Interest (Rp)", "Total (Rp)", "Status"];
      const tableRows = [];

      schedule.forEach(s => {
        const isPaid = s.status_code === 'PAID' || s.status_code === 'PAID_OFF';
        const txnDate = isPaid ? formatDate(s.due_date) : '-';

        tableRows.push([
          s.installment_number,
          formatDate(s.due_date),
          txnDate,
          formatNum(s.amount_principal),
          formatNum(s.amount_interest),
          formatNum(s.amount_total),
          s.status_code
        ]);
      });

      autoTable(doc, {
        startY: currentY,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: {
          fillColor: [27, 54, 93],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center',
          cellPadding: 3,
        },
        bodyStyles: {
          textColor: [40, 40, 40],
          fontSize: 8,
          cellPadding: 2.5,
        },
        alternateRowStyles: {
          fillColor: [245, 248, 255],
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 12 },
          1: { halign: 'center' },
          2: { halign: 'center' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right', fontStyle: 'bold' },
          6: { halign: 'center' },
        },
        styles: {
          font: 'helvetica',
          lineWidth: 0.1,
          lineColor: [200, 200, 200],
        },
        margin: { left: margin, right: margin },
      });

      // === FOOTER ===
      const finalY = doc.lastAutoTable.finalY + 15;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(margin, finalY, pageWidth - margin, finalY);

      doc.setFontSize(7);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(150, 150, 150);
      doc.text("This document is generated automatically by the Koperasi Sanoh Cooperative System.", pageWidth / 2, finalY + 5, { align: 'center' });
      doc.text("This is a valid document and does not require a signature.", pageWidth / 2, finalY + 9, { align: 'center' });

      doc.save(`Loan_Summary_${id}.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF", err);
      alert("Failed to generate PDF");
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      const memberId = getCurrentMemberId();

      try {
        const chanRes = await fetch(apiUrl('/loan/loans/payment_channels/'));
        if (chanRes.ok) {
          setPaymentChannels(await chanRes.json());
        }

        const profileResponse = await fetch(apiUrl(`/member/members/profile_detail/?member_id=${memberId}`));
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          setHasPendingClosure(profileData.has_pending_closure || false);
          // profile_detail includes employee_status_id, use it as primary source
          if (profileData?.employee_status_id !== undefined && profileData?.employee_status_id !== null) {
            setEmpStatus(Number(profileData.employee_status_id));
          }
        } else {
          // Fallback for older API payloads where profile_detail may fail
          const memberResponse = await fetch(apiUrl('/member/members/'));
          if (memberResponse.ok) {
            const memberData = await memberResponse.json();
            const currentMember = memberData.find(m => m.id === memberId);
            if (currentMember?.employee_status_id !== undefined && currentMember?.employee_status_id !== null) {
              setEmpStatus(Number(currentMember.employee_status_id));
            }
          }
        }

        let foundLoan = null;
        let foundStatus = '';

        const activeRes = await fetch(apiUrl(`/loan/loans/active_summary/?member_id=${memberId}`));
        if (activeRes.ok) {
          const activeData = await activeRes.json();
          const match = activeData.find(item => String(item.loan_id) === id);
          if (match) {
            foundLoan = match;
            foundStatus = 'Active';
          }
        }

        if (!foundLoan) {
          const completedRes = await fetch(apiUrl(`/loan/loans/completed_summary/?member_id=${memberId}`));
          if (completedRes.ok) {
            const completedData = await completedRes.json();
            const match = completedData.find(item => String(item.loan_id) === id);
            if (match) {
              foundLoan = match;
              foundStatus = 'Completed';
            }
          }
        }

        if (!foundLoan) {
          const pendingRes = await fetch(apiUrl(`/loan/loan-applications/pending_summary/?member_id=${memberId}`));
          if (pendingRes.ok) {
            const pendingData = await pendingRes.json();
            const match = pendingData.find(item => String(item.id) === id);
            if (match) {
              foundLoan = match;
              foundStatus = 'Pending';
            }
          }
        }

        if (!foundLoan) {
          const rejectedRes = await fetch(apiUrl(`/loan/loan-applications/rejected_summary/?member_id=${memberId}`));
          if (rejectedRes.ok) {
            const rejectedData = await rejectedRes.json();
            const match = rejectedData.find(item => String(item.id) === id);
            if (match) {
              foundLoan = match;
              foundStatus = 'Rejected';
            }
          }
        }

        if (foundLoan) {
          setLoanData({ ...foundLoan, determinedStatus: foundStatus });
          if (foundStatus === 'Active' || foundStatus === 'Completed') {
            const schedRes = await fetch(apiUrl(`/loan/loans/${id}/schedule/?member_id=${memberId}`));
            if (schedRes.ok) {
              const schedData = await schedRes.json();
              setSchedule(schedData);
            }
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleInitiatePayment = async () => {
    if (isInitiating) return;
    setIsInitiating(true);

    // If we already have a generated pending snap_token, use it immediately!
    if (invoiceData && invoiceData.snap_token) {
      if (window.snap) {
        window.snap.pay(invoiceData.snap_token, {
          onSuccess: function(result) {
            alert("Payment successful!");
            setShowPaymentInvoice(false);
            setIsInitiating(false);
            window.location.reload();
          },
          onPending: function(result) {
            alert("Payment is pending. Please complete your payment.");
            setShowPaymentInvoice(false);
            setIsInitiating(false);
            window.location.reload();
          },
          onError: function(result) {
            alert("Payment failed!");
            setIsInitiating(false);
          },
          onClose: function() {
            alert("You closed the payment window without finishing payment.");
            setIsInitiating(false);
          }
        });
      } else {
        alert('Midtrans Snap SDK not loaded. Redirecting to payment page...');
        const redirectUrl = `https://app.sandbox.midtrans.com/snap/v2/vtweb/${invoiceData.snap_token}`;
        window.open(redirectUrl, '_blank');
        setIsInitiating(false);
      }
      return;
    }

    if (!invoiceData || !invoiceData.snap_token) {
        if (!selectedPaymentMethod) {
            alert("Silakan pilih metode pembayaran terlebih dahulu!");
            setIsInitiating(false);
            return;
        }
    }

    try {
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const memberId = user?.member_id || 1;

      const response = await fetch(apiUrl(`/loan/loans/${id}/create_payment_token/?member_id=${memberId}`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ payment_type: selectedPaymentMethod })
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to initiate payment.');
        setIsInitiating(false);
        return;
      }

      const data = await response.json();
      if (data.snap_token) {
        if (window.snap) {
          window.snap.pay(data.snap_token, {
            onSuccess: function(result) {
              alert("Payment successful!");
              setShowPaymentInvoice(false);
              setIsInitiating(false);
              window.location.reload();
            },
            onPending: function(result) {
              alert("Payment is pending. Please complete your payment.");
              setShowPaymentInvoice(false);
              setIsInitiating(false);
              window.location.reload();
            },
            onError: function(result) {
              alert("Payment failed!");
              setIsInitiating(false);
            },
            onClose: function() {
              alert("You closed the payment window without finishing payment.");
              setIsInitiating(false);
            }
          });
        } else {
          alert('Midtrans Snap SDK not loaded. Redirecting to payment page...');
          window.open(data.redirect_url, '_blank');
          setIsInitiating(false);
        }
      } else {
        setIsInitiating(false);
      }
    } catch (err) {
      console.error(err);
      alert('Network error. Failed to initiate payment.');
      setIsInitiating(false);
    }
  };

  const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(number || 0).replace(',00', '');
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    const d = new Date(dateString);
    const date = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${date} at ${time}`;
  };

  if (loading) {
    return <div className="ld-page"><div className="ld-header"><h2>Loading...</h2></div></div>;
  }

  const status = loanData ? loanData.determinedStatus : 'Active';

  const getStatusColor = (s) => {
    switch (s.toLowerCase()) {
      case 'active': return 'status-active';
      case 'completed': return 'status-completed';
      case 'pending': return 'status-pending';
      case 'rejected': return 'status-rejected';
      default: return '';
    }
  };

  const getBadgeClass = (s) => {
    if (s === 'Paid' || s === 'PAID' || s === 'PAID_OFF') return 'bdg-paid';
    if (s === 'Due Soon') return 'bdg-due';
    if (s === 'Scheduled' || s === 'UNPAID') return 'bdg-sched';
    return '';
  };

  const isPendingOrRejected = status === 'Pending' || status === 'Rejected';

  return (
    <div className="ld-page" ref={summaryRef}>
      <div className="ld-header">
        <div className="ld-header-left">
          <button className="ld-back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Back
          </button>
          <h1>Loan Details</h1>
          <div className={`ld-status-pill ${getStatusColor(status)}`}>
            <span className="dot"></span> {status}
          </div>
        </div>
      </div>

      <div className="ld-sub-header">
        {status !== 'Rejected' && (
          <span className="ld-date">
            {status === 'Completed' ? 
              `Start on ${formatDate(loanData?.start_date || loanData?.admin_update)} - End on ${formatDate(loanData?.last_payment_date)}` : 
              status === 'Pending' ? 
              `Applied at ${formatDateTime(loanData?.applied_at)}` :
              `Start on ${formatDate(loanData?.start_date || loanData?.admin_update)}`}
          </span>
        )}
        {!isPendingOrRejected && (
          <div className="ld-actions">
            {/* <button className="ld-btn-outline"><FileText size={16} /> View Loan Agreement</button> */}
            <button className="ld-btn-outline" onClick={handleDownloadSummary} disabled={isDownloading}>
              {isDownloading ? <><Loader size={16} className="spinner" /> Generating...</> : <><Printer size={16} /> Print Summary</>}
            </button>
          </div>
        )}
      </div>

      {status === 'Rejected' && (
        <div className="ld-rejection-note">
          <AlertTriangle size={20} className="r-icon" />
          <div className="r-text">
            <h4>Application Rejected by Administrator</h4>
            <p>Your requested amount exceeds the allowed limit based on your current salary and total cooperative savings. Please review your available limit in the application page and re-apply.</p>
          </div>
        </div>
      )}

      <div className="ld-details-card">
        <h3>{isPendingOrRejected ? 'Application Information' : 'Loan Details'}</h3>
        
        {isPendingOrRejected ? (
          <div className="ld-grid ld-grid-2">
            <div className="ld-g-col">
              <span className="lbl">TOTAL BORROWED</span>
              <span className="val">{formatRupiah(loanData?.amount_requested)}</span>
            </div>
            <div className="ld-g-col">
              <span className="lbl">ESTIMATE INTEREST AMOUNT</span>
              <span className="val">{formatRupiah((loanData?.amount_requested || 0) * 0.005)}</span>
            </div>
            <div className="ld-g-col">
              <span className="lbl">PURPOSE</span>
              <span className="val">{loanData?.purpose}</span>
            </div>
            <div className="ld-g-col">
              <span className="lbl">ESTIMATE BUNGA</span>
              <span className="val">0,5%</span>
            </div>
            <div className="ld-g-col">
              <span className="lbl">REPAYMENT REQUEST</span>
              <span className="val">{loanData?.duration_months} Months Installment Request</span>
            </div>
            {loanData?.salary_statement_file && (
              <div className="ld-g-col">
                <span className="lbl">SALARY STATEMENT</span>
                <span className="val">
                  <a 
                    href={loanData.salary_statement_file} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="ld-document-link"
                    style={{ color: '#0284c7', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}
                  >
                    <FileText size={16} /> View Document
                  </a>
                </span>
              </div>
            )}
            {status === 'Rejected' && (
              <div className="ld-g-col" style={{gridColumn: '1 / -1'}}>
                <span className="lbl">REJECT REASON</span>
                <span className="val" style={{color: '#ef4444', fontWeight: 500}}>{loanData?.reject_reason || '-'}</span>
              </div>
            )}
          </div>
        ) : (
          <div className={`ld-grid ${status === 'Completed' ? 'ld-grid-2' : ''}`}>
            <div className="ld-g-col">
              <span className="lbl">TOTAL BORROWED</span>
              <span className="val">{formatRupiah(loanData?.principal_amount)}</span>
            </div>
            <div className="ld-g-col">
              <span className="lbl">REMAINING</span>
              <span className="val">{status === 'Completed' ? 'Rp 0' : formatRupiah(loanData?.remaining_balance)}</span>
            </div>
            
            {status === 'Active' && (
              <div className="ld-g-col ld-next-deduction">
                <span className="lbl">NEXT DEDUCTION</span>
                <span className="val-large">{loanData?.next_installment_balance ? formatRupiah(loanData.next_installment_balance) : '-'}</span>
                <span className="sub">Due - {loanData?.next_installment_due_date ? formatDate(loanData.next_installment_due_date) : ''}</span>
                {empStatus === 3 && (
                  <button 
                    className="btn-pay-now" 
                    disabled={hasPendingClosure}
                    style={hasPendingClosure ? { background: '#94a3b8', cursor: 'not-allowed', opacity: 0.6 } : {}}
                    onClick={async () => {
                      if (hasPendingClosure) return;
                      setShowPaymentInvoice(true);
                      setInvoiceLoading(true);
                      try {
                        const userStr = localStorage.getItem('user');
                        const user = userStr ? JSON.parse(userStr) : null;
                        const memberId = user?.member_id || 1;
                        const res = await fetch(apiUrl(`/loan/loans/${id}/payment_invoice/?member_id=${memberId}`));
                        if (res.ok) {
                          const data = await res.json();
                          if (data.length > 0) {
                            setInvoiceData(data[0]); // assuming the first/latest pending payment
                          }
                        }
                      } catch (err) {
                        console.error(err);
                      } finally {
                        setInvoiceLoading(false);
                      }
                    }}
                  >
                    PAY NOW
                  </button>
                )}
              </div>
            )}

            <div className="ld-g-col">
              <span className="lbl">PURPOSE</span>
              <span className="val">{loanData?.purpose}</span>
            </div>
            <div className="ld-g-col">
              <span className="lbl">BUNGA (FLAT)</span>
              <span className="val">{parseFloat(loanData?.bunga || 0).toFixed(1).replace('.', ',')}%</span>
            </div>
            {loanData?.salary_statement_file && (
              <div className="ld-g-col">
                <span className="lbl">SALARY STATEMENT</span>
                <span className="val">
                  <a 
                    href={loanData.salary_statement_file} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="ld-document-link"
                    style={{ color: '#0284c7', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}
                  >
                    <FileText size={16} /> View Document
                  </a>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {!isPendingOrRejected && (
        <div className="ld-progress-section">
          <div className="prog-header">
            <h3>Repayment Progress</h3>
            <span className="pct">
              {loanData?.total_installment > 0 ? Math.round((loanData.paid_installment / loanData.total_installment) * 100) : 0}%
            </span>
          </div>
          <div className="prog-bar">
            <div className="prog-fill" style={{width: `${loanData?.total_installment > 0 ? Math.round((loanData.paid_installment / loanData.total_installment) * 100) : 0}%`}}></div>
          </div>
          <div className="prog-footer">
            {loanData?.paid_installment || 0} of {loanData?.total_installment || 0} Installments Paid
          </div>
        </div>
      )}

      {(status === 'Active' || status === 'Completed') && (
        <div className="ld-schedule">
          <h3>Repayment Schedule <span style={{fontSize: 12, fontWeight: 'normal', color: '#94A3B8', marginLeft: 8}}>(Double click a paid row for receipt)</span></h3>
          <div className="ld-table-wrap">
            <table className="ld-table">
              <thead>
                <tr>
                  <th>NO.</th>
                  <th>DUE DATE</th>
                  <th>AMOUNT PRINCIPLE</th>
                  <th>AMOUNT INTEREST</th>
                  <th>TOTAL PAYMENT</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {status === 'Pending' ? (
                  <tr>
                    <td colSpan="6" className="ld-empty-row">Schedule will be generated upon approval.</td>
                  </tr>
                ) : schedule.length > 0 ? (
                  schedule.map(s => {
                    const isPaid = status === 'Completed' || s.status_code === 'PAID' || s.status_code === 'PAID_OFF';
                    return (
                    <tr 
                      key={s.id || s.installment_number}
                      onDoubleClick={async () => {
                        if (isPaid) {
                          try {
                            const res = await fetch(apiUrl(`/loan/loans/${id}/receipts/?member_id=${memberId}`));
                            if (res.ok) {
                              const receipts = await res.json();
                              const receipt = receipts.find(r => r.installment_number === s.installment_number);
                              if (receipt) {
                                setSelectedReceipt(receipt);
                              } else {
                                setSelectedReceipt({...s, fallback: true});
                              }
                            } else {
                              setSelectedReceipt({...s, fallback: true});
                            }
                          } catch (err) {
                            console.error(err);
                            setSelectedReceipt({...s, fallback: true});
                          }
                        }
                      }}
                      className={isPaid ? 'row-clickable' : ''}
                    >
                      <td>#{s.installment_number}</td>
                      <td>{formatDate(s.due_date)}</td>
                      <td>{formatRupiah(s.amount_principal)}</td>
                      <td>{formatRupiah(s.amount_interest)}</td>
                      <td>{formatRupiah(s.amount_total)}</td>
                      <td>
                        <span className={`ld-badge ${status === 'Completed' ? 'bdg-paid' : getBadgeClass(s.status_code)}`}>
                          {isPaid && <span className="dot" style={{backgroundColor: '#059669'}}></span>}
                          {(!isPaid && s.status_code === 'DUE_SOON') && <span className="dot" style={{backgroundColor: '#D97706'}}></span>}
                          {status === 'Completed' ? 'Paid' : s.status_code}
                        </span>
                      </td>
                    </tr>
                  )}
                )) : (
                  <tr>
                    <td colSpan="6" className="ld-empty-row">No schedule available.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transaction Receipt Modal */}
      {selectedReceipt && createPortal(
        <div className="ld-modal-overlay" onClick={() => setSelectedReceipt(null)}>
          <div className="ld-modal" onClick={(e) => e.stopPropagation()}>
            <button className="ld-modal-close" onClick={() => setSelectedReceipt(null)}>
              <X size={18} />
            </button>
            <div className="ld-receipt-icon">
              <CheckCircle size={24} />
            </div>
            <h2>Transaction Receipt</h2>
            <div className="ld-receipt-status">{selectedReceipt.status_code === 'SUCCESS' || selectedReceipt.gateway_status === 'SUCCESS' || selectedReceipt.status_code === 'PAID' || selectedReceipt.fallback ? 'SUCCESS' : selectedReceipt.status_code || 'SUCCESS'}</div>
            
            <div className="ld-receipt-details">
              <div className="ld-r-row">
                <span className="lbl">CATEGORY</span>
                <span className="val badge-outline">Loan Installment #{selectedReceipt.installment_number}</span>
              </div>
              <div className="ld-r-row">
                <span className="lbl">DATE & TIME</span>
                <span className="val right-align">
                  <strong>{selectedReceipt.payment_date ? formatDate(selectedReceipt.payment_date) : formatDate(selectedReceipt.due_date)}</strong><br/>
                  <span className="sub">{selectedReceipt.payment_date ? new Date(selectedReceipt.payment_date).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'}) : '-'}</span>
                </span>
              </div>
              <div className="ld-r-box">
                <span className="lbl">TRANSACTION ID</span>
                <div className="val id-box">
                  {selectedReceipt.id ? `TXN-${selectedReceipt.id}` : 'N/A'}
                  <Copy size={14} className="copy-icon" />
                </div>
              </div>
              <div className="ld-r-row recipient">
                <span className="lbl">PAYMENT METHOD</span>
                <span className="val flex-align">
                  {selectedReceipt.payment_method || '-'}
                </span>
              </div>
              <div className="ld-r-row recipient">
                <span className="lbl">RECIPIENT</span>
                <span className="val flex-align">
                  <span className="ks-logo-sm">KS</span> Koperasi Sanoh
                </span>
              </div>
            </div>

            <div className="ld-receipt-total" style={{borderBottom: 'none', paddingBottom: '10px', display: 'flex', flexDirection: 'column', gap: '8px'}}>
              <div className="ld-r-row">
                <span className="lbl" style={{fontWeight: 'normal', color: '#64748b'}}>Installment Amount</span>
                <span className="val" style={{fontWeight: 'normal', color: '#64748b'}}>{formatRupiah(selectedReceipt.amount_paid || selectedReceipt.amount_total)}</span>
              </div>
              {(selectedReceipt.admin_fee > 0) && (
                <div className="ld-r-row">
                  <span className="lbl" style={{fontWeight: 'normal', color: '#64748b'}}>Admin Fee</span>
                  <span className="val" style={{fontWeight: 'normal', color: '#64748b'}}>{formatRupiah(selectedReceipt.admin_fee)}</span>
                </div>
              )}
              <div className="ld-r-row" style={{borderTop: '1px dashed #cbd5e1', paddingTop: '12px', marginTop: '4px'}}>
                <span className="lbl" style={{fontWeight: 'bold', fontSize: '14px'}}>TOTAL PAID</span>
                <span className="val" style={{fontWeight: 'bold', fontSize: '18px'}}>{formatRupiah((selectedReceipt.amount_paid || selectedReceipt.amount_total) + (parseFloat(selectedReceipt.admin_fee) || 0))}</span>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Payment Midtrans Invoice Modal */}
      {showPaymentInvoice && createPortal(
        <div className="ld-modal-overlay" onClick={() => setShowPaymentInvoice(false)}>
          <div className="ld-modal invoice-modal" onClick={(e) => e.stopPropagation()}>
            <button className="ld-modal-close" onClick={() => setShowPaymentInvoice(false)}>
              <X size={18} />
            </button>
            
            <div className="midtrans-header">
              <div className="m-icon"><CreditCard size={24} /></div>
              <div>
                <h3>Payment Details</h3>
                <p>Powered by Midtrans</p>
              </div>
            </div>

            <div className="m-invoice-body">
              {invoiceLoading ? (
                <div style={{padding: '20px', textAlign: 'center'}}>Loading invoice details...</div>
              ) : invoiceData ? (
                <>
                  {invoiceData.snap_token && (
                    <div className="m-pending-warning" style={{
                      backgroundColor: '#fffbeb',
                      border: '1px solid #feebc8',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      marginBottom: '15px',
                      color: '#c05621',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      textAlign: 'left'
                    }}>
                      <AlertTriangle size={16} style={{color: '#dd6b20', flexShrink: 0}} />
                      <span>
                        <strong>Pending Transaction:</strong> You have an active payment session for this installment. Click <strong>Pay Now</strong> to resume.
                      </span>
                    </div>
                  )}
                  <div className="m-inv-row">
                    <span className="lbl">Installment No.</span>
                    <span className="val">#{invoiceData.installment_number}</span>
                  </div>
                  <div className="m-inv-row">
                    <span className="lbl">Item</span>
                    <span className="val">Loan Installment Payment</span>
                  </div>
                  <div className="m-inv-row amount">
                    <span className="lbl">Amount to Pay</span>
                    <span className="val">{formatRupiah(invoiceData.amount_paid)}</span>
                  </div>
                  
                  {(() => {
                    const selectedChannel = paymentChannels.find(ch => ch.channel_code === selectedPaymentMethod);
                    const feePercentage = selectedChannel ? Number(selectedChannel.fee_percentage) : 0;
                    const feeFixed = selectedChannel ? Number(selectedChannel.fee_fixed) : 0;
                    const subtotal = invoiceData ? Number(invoiceData.amount_paid) : 0;
                    const feeTotal = Math.round((subtotal * feePercentage) / 100) + feeFixed;
                    const totalAmount = subtotal + feeTotal;

                    return selectedPaymentMethod ? (
                      <>
                        <div className="m-inv-row">
                          <span className="lbl">Biaya Layanan</span>
                          <span className="val">{formatRupiah(feeTotal)}</span>
                        </div>
                        <div className="m-inv-row amount" style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '8px', marginTop: '8px' }}>
                          <span className="lbl" style={{ fontWeight: '700', color: '#1e293b' }}>Total Pembayaran</span>
                          <span className="val" style={{ fontWeight: '700', color: '#2563eb' }}>{formatRupiah(totalAmount)}</span>
                        </div>
                      </>
                    ) : null;
                  })()}

                  <div className="m-inv-row">
                    <span className="lbl">Status</span>
                    <span className="val">{invoiceData.status_code || invoiceData.gateway_status || 'PENDING'}</span>
                  </div>
                  
                  {(!invoiceData || !invoiceData.snap_token) && (
                    <div className="m-payment-methods">
                      <h4 style={{marginTop: '20px', marginBottom: '10px', fontSize: '14px', color: '#1e293b'}}>Pilih Metode Pembayaran</h4>
                      <div className="pm-grid" style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                        {paymentChannels.map(ch => (
                           <div 
                             key={ch.channel_code} 
                             className={`pm-card ${selectedPaymentMethod === ch.channel_code ? 'selected' : ''}`} 
                             onClick={() => setSelectedPaymentMethod(ch.channel_code)}
                             style={{
                               display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                               padding: '12px 16px', border: selectedPaymentMethod === ch.channel_code ? '2px solid #2563eb' : '1px solid #e2e8f0',
                               borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s ease',
                               backgroundColor: selectedPaymentMethod === ch.channel_code ? '#eff6ff' : '#fff'
                             }}
                           >
                             <span className="pm-name" style={{fontWeight: '600', color: '#334155'}}>{ch.channel_name}</span>
                             <span className="pm-fee" style={{fontSize: '12px', color: '#64748b'}}>
                               {ch.fee_percentage > 0 ? `${ch.fee_percentage}% /transaksi` : (ch.fee_fixed > 0 ? formatRupiah(ch.fee_fixed) : 'Gratis')}
                             </span>
                           </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{padding: '20px', textAlign: 'center'}}>No pending invoice found.</div>
              )}
            </div>

            {empStatus === 3 && (
              <div className="ld-modal-actions">
                <button className="btn-modal-outline" disabled={isInitiating} onClick={() => setShowPaymentInvoice(false)}>Cancel</button>
                <button className="btn-modal-blue" disabled={isInitiating} onClick={handleInitiatePayment}>
                  {isInitiating ? 'Processing...' : ((invoiceData && invoiceData.snap_token) ? 'Lanjutkan Pembayaran' : 'Pay Now')}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default LoanDetails;
