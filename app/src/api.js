import { getServerUrl } from './config.js';

export async function api(path, { method = 'GET', body, headers = {}, auth = true, signal } = {}) {
  const token = localStorage.getItem('nexus_token');
  const finalHeaders = { ...headers };
  let payload;

  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (auth && token) finalHeaders.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${getServerUrl()}/api${path}`, {
      method,
      headers: finalHeaders,
      body: payload,
      signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error(`No se pudo conectar con ${getServerUrl()}. Revisa la URL del servidor.`);
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(data?.error || `Error ${response.status}`);
  }
  return data;
}

export function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const token = localStorage.getItem('nexus_token');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${getServerUrl()}/api/files`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && typeof onProgress === 'function') {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data.file);
      else reject(new Error(data.error || `Error ${xhr.status} al subir el archivo`));
    };
    xhr.onerror = () => reject(new Error('No se pudo subir el archivo.'));

    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}
