function authHeader() {
  const token = localStorage.getItem('finanzas_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(method, url, body) {
  let res;
  try {
    res = await fetch('/api' + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error('No se pudo conectar con el servidor.');
    err.response = { status: 0, data: { message: 'No se pudo conectar con el servidor.', errors: [] } };
    throw err;
  }

  if (res.status === 401 && !url.startsWith('/auth/')) {
    localStorage.removeItem('finanzas_token');
    localStorage.removeItem('finanzas_user');
    window.location.replace('/');
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : await res.blob();

  if (!res.ok) {
    const message = isJson ? data.message : 'Error al procesar la solicitud.';
    const err = new Error(message || 'Error del servidor.');
    err.response = { status: res.status, data: { message, errors: (data && data.errors) || [] } };
    throw err;
  }

  return { data };
}

const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  delete: (url) => request('DELETE', url),
  patch: (url, body) => request('PATCH', url, body),
};

export function apiErrorMessage(err) {
  return err?.response?.data?.message || 'Error de conexión.';
}

export function apiFieldErrors(err) {
  return err?.response?.data?.errors || [];
}

export default api;
