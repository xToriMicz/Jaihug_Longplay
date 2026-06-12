const API_BASE_URL = 'http://localhost:28453';

export async function apiCall(endpoint, options = {}) {
    const headers = { ...options.headers };
    let body = options.body;

    if (body && !(body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
        body,
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || `API Error: ${response.status}`);
    }

    return response.json();
}

export const musicApi = {
    getState: () => apiCall('/api/state'),
    saveState: (state) => apiCall('/api/state', {
        method: 'POST',
        body: state
    }),
    uploadFile: (file, fileType) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('file_type', fileType);
        return apiCall('/api/upload', {
            method: 'POST',
            body: formData
        });
    },
    startExport: () => apiCall('/api/export', { method: 'POST' }),
    getExportStatus: () => apiCall('/api/export/status'),
    resetExport: () => apiCall('/api/export/reset', { method: 'POST' }),
    listProjects: () => apiCall('/api/projects'),
    saveProject: (name, state) => apiCall(`/api/projects/${encodeURIComponent(name)}`, {
        method: 'POST',
        body: state
    }),
    loadProject: (name) => apiCall(`/api/projects/${encodeURIComponent(name)}`),
    deleteProject: (name) => apiCall(`/api/projects/${encodeURIComponent(name)}`, {
        method: 'DELETE'
    }),
    getBaseUrl: () => API_BASE_URL
};
