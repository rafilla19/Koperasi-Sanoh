import { useState, useEffect, useRef } from 'react';
import { apiUrl } from '../../services/api';
import './WhatsAppSettings.css';

const EMPTY_FORM = { label: '', message: '', sort_order: 0, is_active: true };

export default function WhatsAppSettings() {
  const [phone, setPhone]           = useState('');
  const [editPhone, setEditPhone]   = useState('');
  const [editingPhone, setEditingPhone] = useState(false);
  const [savingPhone, setSavingPhone]   = useState(false);

  const [questions, setQuestions]   = useState([]);
  const [loading, setLoading]       = useState(true);

  const [modal, setModal]           = useState(null); // { mode: 'add'|'edit', data }
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState(null); // question id
  const [deleting, setDeleting]           = useState(false);

  const [toast, setToast]           = useState(null); // { type: 'success'|'error', text }
  const toastTimer = useRef(null);

  const showToast = (type, text) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ type, text });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      fetch(apiUrl('/whatsapp/config/')).then(r => r.json()),
      fetch(apiUrl('/whatsapp/questions/')).then(r => r.json()),
    ])
      .then(([cfg, qs]) => {
        setPhone(cfg.phone_number || '');
        setEditPhone(cfg.phone_number || '');
        setQuestions(Array.isArray(qs) ? qs : []);
      })
      .catch(() => showToast('error', 'Gagal memuat data'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  // ── Phone ────────────────────────────────────────────────────────
  const handleSavePhone = async () => {
    if (!editPhone.trim()) return;
    setSavingPhone(true);
    try {
      const res = await fetch(apiUrl('/whatsapp/config/'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: editPhone.trim() }),
      }).then(r => r.json());
      setPhone(res.phone_number);
      setEditingPhone(false);
      showToast('success', 'Nomor WhatsApp berhasil diperbarui');
    } catch {
      showToast('error', 'Gagal memperbarui nomor');
    } finally {
      setSavingPhone(false);
    }
  };

  // ── Questions ────────────────────────────────────────────────────
  const openAdd = () => {
    setForm(EMPTY_FORM);
    setModal({ mode: 'add' });
  };

  const openEdit = (q) => {
    setForm({ label: q.label, message: q.message, sort_order: q.sort_order, is_active: q.is_active });
    setModal({ mode: 'edit', id: q.id });
  };

  const handleSaveQuestion = async () => {
    if (!form.label.trim() || !form.message.trim()) {
      showToast('error', 'Label dan pesan wajib diisi');
      return;
    }
    setSaving(true);
    try {
      const isEdit = modal.mode === 'edit';
      const url    = isEdit
        ? apiUrl(`/whatsapp/questions/${modal.id}/`)
        : apiUrl('/whatsapp/questions/');
      await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setModal(null);
      showToast('success', isEdit ? 'Pertanyaan berhasil diperbarui' : 'Pertanyaan berhasil ditambahkan');
      fetchAll();
    } catch {
      showToast('error', 'Gagal menyimpan pertanyaan');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (q) => {
    try {
      await fetch(apiUrl(`/whatsapp/questions/${q.id}/`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !q.is_active }),
      });
      setQuestions(prev => prev.map(x => x.id === q.id ? { ...x, is_active: !x.is_active } : x));
    } catch {
      showToast('error', 'Gagal mengubah status');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(apiUrl(`/whatsapp/questions/${deleteConfirm}/`), { method: 'DELETE' });
      setDeleteConfirm(null);
      showToast('success', 'Pertanyaan berhasil dihapus');
      fetchAll();
    } catch {
      showToast('error', 'Gagal menghapus pertanyaan');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="wa-settings">

      {/* Toast */}
      {toast && (
        <div className={`wa-toast wa-toast--${toast.type}`}>{toast.text}</div>
      )}

      {/* Header */}
      <div className="wa-page-header">
        <div className="wa-page-title">
          <span className="wa-page-icon">
            <svg viewBox="0 0 32 32" width="22" height="22" fill="#25D366" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 2C8.3 2 2 8.3 2 16c0 2.5.7 4.8 1.8 6.8L2 30l7.4-1.8C11.3 29.3 13.6 30 16 30c7.7 0 14-6.3 14-14S23.7 2 16 2zm-3.7 7.5c-.3 0-.7.1-1 .5-.3.3-1.1 1.1-1.1 2.6s1.1 3 1.3 3.2c.2.2 2.2 3.5 5.4 4.8 3.2 1.3 3.2.8 3.7.8.5 0 1.7-.7 1.9-1.3.2-.6.2-1.2.1-1.3-.1-.1-.3-.2-.6-.3-.3-.2-1.7-.8-1.9-.9-.2-.1-.4-.2-.6.2-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.5-1.3-.8-1.8c-.2-.4-.5-.4-.7-.4z" />
            </svg>
          </span>
          <div>
            <h2>Pengaturan WhatsApp</h2>
            <p>Kelola nomor admin dan daftar pertanyaan yang muncul di tombol chat member</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="wa-loading">Memuat data...</div>
      ) : (
        <>
          {/* ── Phone Number Card ── */}
          <div className="wa-card">
            <div className="wa-card-head">
              <h3>Nomor WhatsApp Admin</h3>
              <span className="wa-card-sub">Nomor ini yang akan dihubungi member saat klik tombol chat</span>
            </div>

            {editingPhone ? (
              <div className="wa-phone-edit">
                <div className="wa-phone-hint">Format: 62xxxxxxxxxx (tanpa + atau tanda hubung)</div>
                <div className="wa-phone-row">
                  <span className="wa-phone-prefix">+</span>
                  <input
                    className="wa-input"
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="6281234567890"
                    maxLength={15}
                  />
                  <button className="wa-btn wa-btn--primary" onClick={handleSavePhone} disabled={savingPhone}>
                    {savingPhone ? 'Menyimpan...' : 'Simpan'}
                  </button>
                  <button className="wa-btn wa-btn--ghost" onClick={() => { setEditPhone(phone); setEditingPhone(false); }}>
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              <div className="wa-phone-display">
                <div className="wa-phone-value">
                  <span className="wa-phone-badge">WA</span>
                  +{phone || '—'}
                </div>
                <button className="wa-btn wa-btn--outline" onClick={() => setEditingPhone(true)}>
                  Edit Nomor
                </button>
              </div>
            )}
          </div>

          {/* ── Questions Card ── */}
          <div className="wa-card">
            <div className="wa-card-head wa-card-head--row">
              <div>
                <h3>Daftar Pertanyaan</h3>
                <span className="wa-card-sub">Member dapat memilih pertanyaan ini saat membuka chat WhatsApp</span>
              </div>
              <button className="wa-btn wa-btn--primary" onClick={openAdd}>
                + Tambah Pertanyaan
              </button>
            </div>

            {questions.length === 0 ? (
              <div className="wa-empty">Belum ada pertanyaan. Klik "+ Tambah Pertanyaan" untuk menambahkan.</div>
            ) : (
              <div className="wa-table-wrap">
                <table className="wa-table">
                  <thead>
                    <tr>
                      <th style={{ width: 48 }}>No</th>
                      <th style={{ width: 160 }}>Label</th>
                      <th>Pesan yang Dikirim</th>
                      <th style={{ width: 72 }}>Urutan</th>
                      <th style={{ width: 100 }}>Status</th>
                      <th style={{ width: 110 }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questions.map((q, i) => (
                      <tr key={q.id} className={!q.is_active ? 'wa-row--inactive' : ''}>
                        <td className="wa-td-center">{i + 1}</td>
                        <td><span className="wa-label-chip">{q.label}</span></td>
                        <td className="wa-td-message">{q.message}</td>
                        <td className="wa-td-center">{q.sort_order}</td>
                        <td className="wa-td-center">
                          <button
                            className={`wa-toggle ${q.is_active ? 'wa-toggle--on' : 'wa-toggle--off'}`}
                            onClick={() => handleToggleActive(q)}
                            title={q.is_active ? 'Klik untuk nonaktifkan' : 'Klik untuk aktifkan'}
                          >
                            {q.is_active ? 'Aktif' : 'Nonaktif'}
                          </button>
                        </td>
                        <td className="wa-td-actions">
                          <button className="wa-icon-btn wa-icon-btn--edit" onClick={() => openEdit(q)} title="Edit">
                            <svg viewBox="0 0 20 20" width="15" height="15" fill="currentColor">
                              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                            </svg>
                          </button>
                          <button className="wa-icon-btn wa-icon-btn--delete" onClick={() => setDeleteConfirm(q.id)} title="Hapus">
                            <svg viewBox="0 0 20 20" width="15" height="15" fill="currentColor">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Add/Edit Modal ── */}
      {modal && (
        <div className="wa-modal-overlay" onClick={() => setModal(null)}>
          <div className="wa-modal" onClick={e => e.stopPropagation()}>
            <div className="wa-modal-header">
              <h3>{modal.mode === 'add' ? 'Tambah Pertanyaan' : 'Edit Pertanyaan'}</h3>
              <button className="wa-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="wa-modal-body">
              <label className="wa-label">
                Label <span className="wa-required">*</span>
                <span className="wa-label-hint">Teks singkat yang muncul sebagai pilihan di UI</span>
                <input
                  className="wa-input"
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="contoh: Cara mengajukan pinjaman"
                  maxLength={100}
                />
              </label>
              <label className="wa-label">
                Pesan yang Dikirim ke WhatsApp <span className="wa-required">*</span>
                <span className="wa-label-hint">Teks ini yang akan terkirim sebagai pesan WA member ke admin</span>
                <textarea
                  className="wa-input wa-textarea"
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  placeholder="contoh: Halo Admin, saya ingin bertanya tentang..."
                  rows={4}
                />
              </label>
              <div className="wa-modal-row">
                <label className="wa-label" style={{ flex: 1 }}>
                  Urutan Tampil
                  <input
                    className="wa-input"
                    type="number"
                    min={0}
                    value={form.sort_order}
                    onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                  />
                </label>
                <label className="wa-label" style={{ flex: 1 }}>
                  Status
                  <select
                    className="wa-input"
                    value={form.is_active ? 'true' : 'false'}
                    onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}
                  >
                    <option value="true">Aktif</option>
                    <option value="false">Nonaktif</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="wa-modal-footer">
              <button className="wa-btn wa-btn--ghost" onClick={() => setModal(null)}>Batal</button>
              <button className="wa-btn wa-btn--primary" onClick={handleSaveQuestion} disabled={saving}>
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteConfirm && (
        <div className="wa-modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="wa-modal wa-modal--sm" onClick={e => e.stopPropagation()}>
            <div className="wa-modal-header">
              <h3>Hapus Pertanyaan</h3>
              <button className="wa-modal-close" onClick={() => setDeleteConfirm(null)}>✕</button>
            </div>
            <div className="wa-modal-body">
              <p className="wa-delete-text">
                Yakin ingin menghapus pertanyaan ini? Tindakan ini tidak bisa dibatalkan.
              </p>
            </div>
            <div className="wa-modal-footer">
              <button className="wa-btn wa-btn--ghost" onClick={() => setDeleteConfirm(null)}>Batal</button>
              <button className="wa-btn wa-btn--danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
