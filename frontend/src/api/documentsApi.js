import { apiUrl } from '../services/api'

export const documentsApi = {
  /**
   * GET /documents/?type_id=3
   * Returns array of documents with specified type_id
   */
  getDocumentsByType: (typeId) =>
    fetch(apiUrl(`/documents/?type_id=${typeId}`)).then(res => res.json()),

  /**
   * GET /documents/
   * Returns all documents
   */
  getAllDocuments: () =>
    fetch(apiUrl('/documents/')).then(res => res.json()),

  /**
   * GET /document-types/
   * Returns all document types
   */
  getDocumentTypes: () =>
    fetch(apiUrl('/document-types/')).then(res => res.json()),
}
