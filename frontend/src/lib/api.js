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
    parseSubtitles: (file) => {
        const formData = new FormData();
        formData.append('file', file);
        return apiCall('/api/subtitles/parse', {
            method: 'POST',
            body: formData
        });
    },
    transcribeLyrics: (filepath, apiKey, useHook = false, hookStart = 0.0, hookDuration = 30.0) => {
        return apiCall('/api/subtitles/transcribe', {
            method: 'POST',
            body: {
                filepath,
                api_key: apiKey,
                use_hook: useHook,
                hook_start: hookStart,
                hook_duration: hookDuration
            }
        });
    },
    burnSubtitles: (baseVideoFilename, subtitles, quoteOverlay, subtitleSettings) => {
        return apiCall('/api/subtitles/burn', {
            method: 'POST',
            body: {
                base_video_filename: baseVideoFilename,
                subtitles,
                quote_overlay: quoteOverlay,
                subtitle_settings: subtitleSettings
            }
        });
    },
    getBaseUrl: () => API_BASE_URL
};
