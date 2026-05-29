import axios from 'axios';

const api = axios.create({
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

let _getAccessToken = null;

export function configureApiAuth(getToken) {
  _getAccessToken = getToken;
}

api.interceptors.request.use((config) => {
  if (_getAccessToken) {
    const token = _getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const normalized = {
      message:
        error.response?.data?.error?.message ||
        error.message ||
        'Request failed',
      code: error.response?.data?.error?.code || 'ERR_API',
      status: error.response?.status || 0,
      retryable: error.response?.status >= 500 || !error.response,
    };
    return Promise.reject(normalized);
  },
);

export default api;
