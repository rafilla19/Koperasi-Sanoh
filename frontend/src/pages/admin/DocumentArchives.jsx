import React, { useEffect, useMemo, useState } from 'react';
import { Search, FileText, Plus, Download, X, ExternalLink, Eye } from 'lucide-react';
import { fetchDocumentArchives, fetchDocumentTypes, uploadDocumentArchive } from '../../services/api';
import './DocumentArchives.css';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const formatFileSize = (bytes) => {
  if (!bytes) return '-';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

const DocumentArchives = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [types, setTypes] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [selectedType, setSelectedType] = useState('Semua Tipe');
  const [isLoading, setIsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [formState, setFormState] = useState({
    title: '',
    description: '',
    type_id: '',
    document: null,
  });
  const [viewerDoc, setViewerDoc] = useState(null); // { title, url }

  const typeOptions = useMemo(() => ['Semua Tipe', ...types.map((t) => t.name)], [types]);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setFetchError('');
      try {
        const [documentData, documentTypes] = await Promise.all([
          fetchDocumentArchives(),
          fetchDocumentTypes(),
        ]);
        setDocuments(documentData);
        setTypes(documentTypes);
      } catch (error) {
        console.error(error);
        setFetchError('Gagal memuat data dokumen. Refresh halaman atau cek konsol.');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const typeName = doc.type_name || 'Belum ditentukan';
      const matchesSearch =
        searchText.trim() === '' ||
        doc.title.toLowerCase().includes(searchText.toLowerCase()) ||
        (doc.description || '').toLowerCase().includes(searchText.toLowerCase()) ||
        typeName.toLowerCase().includes(searchText.toLowerCase());
      const matchesType = selectedType === 'Semua Tipe' || typeName === selectedType;
      return matchesSearch && matchesType;
    });
  }, [documents, searchText, selectedType]);

  const totalPages = Math.ceil(filteredDocuments.length / rowsPerPage);
  const paginatedDocs = filteredDocuments.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage,
  );

  const handleTypeSelect = (type) => {
    setSelectedType(type);
    setCurrentPage(1);
  };

  const handleSearchChange = (e) => {
    setSearchText(e.target.value);
    setCurrentPage(1);
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      alert('Ukuran file maksimal 10 MB.');
      event.target.value = '';
      return;
    }
    setFormState((prev) => ({ ...prev, document: file }));
  };

  const openForm = () => {
    setFormState({ title: '', description: '', type_id: '', document: null });
    setUploadError('');
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setUploadError('');
  };

  const handleUpload = async () => {
    if (!formState.title.trim() || !formState.type_id || !formState.document) {
      setUploadError('Judul, jenis, dan file wajib diisi.');
      return;
    }

    const formData = new FormData();
    formData.append('title', formState.title.trim());
    formData.append('description', formState.description);
    formData.append('type_id', formState.type_id);
    formData.append('document', formState.document);

    setUploading(true);
    setUploadError('');
    try {
      const newDocument = await uploadDocumentArchive(formData);
      setDocuments((prev) => [newDocument, ...prev]);
      setIsFormOpen(false);
    } catch (error) {
      console.error(error);
      setUploadError(error.message || 'Gagal mengunggah dokumen. Coba lagi.');
    } finally {
      setUploading(false);
    }
  };

  const handleRowDoubleClick = (doc) => {
    if (doc.document_url) {
      setViewerDoc({ title: doc.title, url: doc.document_url });
    }
  };

  return (
    <div className="card da-container">
      {/* PDF VIEWER MODAL */}
      {viewerDoc && (
        <div className="da-viewer-overlay" onClick={() => setViewerDoc(null)}>
          <div className="da-viewer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="da-viewer-toolbar">
              <div className="da-viewer-title">
                <FileText size={16} color="#60a5fa" />
                {viewerDoc.title}
              </div>
              <div className="da-viewer-actions">
                <a
                  href={viewerDoc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="da-viewer-btn da-viewer-btn-open"
                >
                  <ExternalLink size={13} /> Buka di Tab Baru
                </a>
                <button className="da-viewer-btn da-viewer-btn-close" onClick={() => setViewerDoc(null)}>
                  <X size={13} /> Tutup
                </button>
              </div>
            </div>
            <iframe
              src={`${viewerDoc.url}#toolbar=1&navpanes=0&scrollbar=1`}
              className="da-viewer-frame"
              title={viewerDoc.title}
            />
          </div>
        </div>
      )}

      <div className="da-header">
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Arsip Dokumen</h2>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6b7280' }}>
            Unggah, kelola, dan akses dokumen dengan mudah.
          </p>
        </div>
        {!isFormOpen && (
          <button className="da-btn-upload" onClick={openForm}>
            <Plus size={16} />
            Unggah Dokumen
          </button>
        )}
      </div>

      {/* INLINE UPLOAD FORM */}
      {isFormOpen && (
        <div className="da-inline-form">
          <h3 className="da-inline-form-title">Unggah Dokumen Baru</h3>
          <div className="da-inline-form-grid">
            <div className="da-form-group">
              <label>Judul Dokumen <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                type="text"
                className="da-input"
                value={formState.title}
                onChange={(e) => setFormState((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Masukkan judul dokumen"
              />
            </div>

            <div className="da-form-group">
              <label>Jenis Dokumen <span style={{ color: '#ef4444' }}>*</span></label>
              <select
                className="da-select-box"
                value={formState.type_id}
                onChange={(e) => setFormState((prev) => ({ ...prev, type_id: e.target.value }))}
              >
                <option value="">Pilih jenis dokumen</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="da-form-group">
              <label>File Dokumen <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                className="da-file-input"
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleFileChange}
              />
              <div className="da-note">PDF saja • Maks. 10 MB</div>
              {formState.document && (
                <div className="da-file-name">
                  {formState.document.name} ({formatFileSize(formState.document.size)})
                </div>
              )}
            </div>

            <div className="da-form-group da-form-group--full">
              <label>Deskripsi</label>
              <textarea
                className="da-textarea"
                value={formState.description}
                onChange={(e) => setFormState((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Tambahkan keterangan singkat (opsional)"
              />
            </div>
          </div>

          {uploadError && (
            <div style={{ color: '#dc2626', fontSize: 13, marginTop: 4, marginBottom: 8 }}>{uploadError}</div>
          )}

          <div className="da-inline-form-actions">
            <button
              className="modal-btn modal-btn-cancel"
              type="button"
              onClick={closeForm}
              disabled={uploading}
            >
              Batal
            </button>
            <button
              className="modal-btn modal-btn-confirm"
              type="button"
              onClick={handleUpload}
              disabled={uploading || !formState.title.trim() || !formState.type_id || !formState.document}
            >
              {uploading ? 'Mengunggah...' : 'Unggah'}
            </button>
          </div>
        </div>
      )}

      {/* FILTER BAR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="da-search">
          <Search size={15} color="#94A3B8" />
          <input
            placeholder="Cari judul atau deskripsi..."
            value={searchText}
            onChange={handleSearchChange}
          />
        </div>
        <select
          value={selectedType}
          onChange={(e) => handleTypeSelect(e.target.value)}
          style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13, cursor: 'pointer' }}
        >
          {typeOptions.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>

      {fetchError && (
        <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{fetchError}</div>
      )}

      {/* TABLE */}
      <table>
        <thead style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
          <tr>
            {[
              { label: 'No', style: { width: 40 } },
              { label: 'Nama Dokumen', style: {} },
              { label: 'Deskripsi', style: {} },
              { label: 'Jenis Dokumen', style: {} },
              { label: 'Ukuran', style: {} },
              { label: 'Tanggal Unggah', style: {} },
              { label: 'Aksi', style: { width: 80 } },
            ].map(({ label, style }) => (
              <th
                key={label}
                style={{
                  ...style,
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: 13,
                  letterSpacing: '0.4px',
                  padding: '13px 12px',
                  background: 'transparent',
                  textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan="7" className="empty">Memuat...</td></tr>
          ) : filteredDocuments.length === 0 ? (
            <tr><td colSpan="7" className="empty">Dokumen tidak ditemukan.</td></tr>
          ) : (
            paginatedDocs.map((doc, index) => {
              const typeName = doc.type_name || 'Belum ditentukan';
              return (
                <tr
                  key={doc.id}
                  className={doc.document_url ? 'da-row-clickable' : ''}
                  onDoubleClick={() => handleRowDoubleClick(doc)}
                  title={doc.document_url ? 'Klik dua kali untuk pratinjau dokumen' : ''}
                >
                  <td style={{ color: '#94a3b8', fontSize: 12 }}>
                    {(currentPage - 1) * rowsPerPage + index + 1}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="da-doc-icon">
                        <FileText fill="#334155" color="#fff" size={20} />
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>
                        {doc.title}
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: 13, color: '#6b7280', maxWidth: 220 }}>
                    {doc.description || <span style={{ color: '#cbd5e1' }}>-</span>}
                  </td>
                  <td>
                    <span className="da-type-badge">{typeName}</span>
                  </td>
                  <td style={{ fontSize: 13, color: '#6b7280' }}>{formatFileSize(doc.file_size)}</td>
                  <td style={{ fontSize: 13, color: '#6b7280' }}>
                    {new Date(doc.uploaded_at).toLocaleDateString('id-ID', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </td>
                  <td>
                    {doc.document_url ? (
                      <a
                        href={doc.document_url}
                        target="_blank"
                        rel="noreferrer"
                        className="da-download-btn"
                        title="Unduh dokumen"
                      >
                        <Download size={14} />
                      </a>
                    ) : (
                      <span style={{ color: '#cbd5e1', fontSize: 12 }}>-</span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* PAGINATION */}
      {!isLoading && filteredDocuments.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6b7280' }}>
            <span>Baris per halaman:</span>
            <select
              value={rowsPerPage}
              onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
            >
              {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6b7280' }}>
            <span>
              {(currentPage - 1) * rowsPerPage + 1}–{Math.min(currentPage * rowsPerPage, filteredDocuments.length)} dari {filteredDocuments.length}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: currentPage === 1 ? '#f3f4f6' : '#fff', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
            >
              Prev
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: currentPage === totalPages ? '#f3f4f6' : '#fff', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
            >
              Next
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default DocumentArchives;
