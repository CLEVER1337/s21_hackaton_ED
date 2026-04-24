import axios from 'axios';

export const BASE_URL = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (!err.response) {
      console.error('[api] network error:', err.message);
    } else {
      console.error(
        '[api] %s %s -> %s',
        err.config?.method?.toUpperCase(),
        err.config?.url,
        err.response.status,
        err.response.data,
      );
    }
    return Promise.reject(err);
  },
);

export const uploadFiles = (files, onProgress) => {
  const form = new FormData();
  for (const f of files) form.append('files', f);
  return api.post('/api/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });
};

export const getDocuments = () => api.get('/api/documents');
export const getDocument = (id) => api.get(`/api/documents/${id}`);
export const updateDocument = (id, data) =>
  api.patch(`/api/documents/${id}`, { data });
export const approveDocument = (id) =>
  api.post(`/api/documents/${id}/approve`);
export const deleteDocument = (id) => api.delete(`/api/documents/${id}`);
export const retryDocument = (id) => api.post(`/api/documents/${id}/retry`);
export const getStats = () => api.get('/api/stats');
export const exportDocument = (id, format) =>
  api.get(`/api/documents/${id}/export`, {
    params: { format },
    responseType: 'blob',
  });

export const getFileUrl = (id) => `${BASE_URL}/api/documents/${id}/file`;
