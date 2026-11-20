import { supabase } from './supabaseClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function accessToken(forceRefresh = false) {
  const result = forceRefresh
    ? await supabase.auth.refreshSession()
    : await supabase.auth.getSession();
  const token = result.data.session?.access_token;
  if (result.error || !token) {
    const error = new Error('Sesi login berakhir. Silakan masuk kembali.');
    error.status = 401;
    throw error;
  }
  return token;
}

async function request(path, options = {}) {
  const send = async (forceRefresh = false) => {
    const headers = { ...(options.headers || {}) };
    try {
      const token = await accessToken(forceRefresh);
      headers.Authorization = `Bearer ${token}`;
    } catch (err) {
      // Endpoint /api/detect dan /api/health dapat diproses tanpa auth jika token kadaluarsa
      if (path !== '/api/detect' && path !== '/api/health') throw err;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || 12000);
    try {
      return await fetch(`${API_BASE}${path}`, {
        method: options.method || 'GET',
        headers: {
          ...(options.json ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: options.json ? JSON.stringify(options.json) : options.body,
        signal: options.signal || controller.signal,
      });
    } finally {
      window.clearTimeout(timeout);
    }
  };

  let response = await send();
  if (response.status === 401) response = await send(true);
  if (response.status === 401) {
    await supabase.auth.signOut({ scope: 'local' });
  }
  if (!response.ok) {
    let message = 'Permintaan tidak dapat diproses';
    try { message = (await response.json()).detail || message; } catch {}
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

export async function checkBackendHealth() {
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    return response.ok ? { online: true, ...(await response.json()) } : { online: false };
  } catch (error) { return { online: false, error: error.message }; }
}

async function upload(path, formData, options = {}) {
  return request(path, { method: 'POST', body: formData, ...options });
}

export function detectPose(blob, cameraMode = 'auto') {
  const form = new FormData();
  form.append('camera_mode', cameraMode);
  form.append('image', blob, 'frame.jpg');
  return upload('/api/detect', form, { timeoutMs: 5000 });
}

export function sendCalibration(blobs, cameraMode = 'auto') {
  const form = new FormData();
  form.append('camera_mode', cameraMode);
  blobs.forEach((blob, index) => form.append('images', blob, `calib_${index + 1}.jpg`));
  return upload('/api/calibrations', form);
}

export function predictFrame(blob, calibrationId, sessionId) {
  const form = new FormData();
  form.append('calibration_id', calibrationId);
  if (sessionId) form.append('session_id', sessionId);
  form.append('image', blob, 'frame.jpg');
  return upload('/api/predict', form);
}

export const fetchAccount = () => request('/api/account');
export const updateAccount = (data) => request('/api/account', { method: 'PATCH', json: data });
export const deleteAccountRequest = () => request('/api/account', { method: 'DELETE' });
export const fetchConfiguration = () => request('/api/configuration');
export const fetchSessionHistory = () => request('/api/sessions/history');
export const fetchActiveSession = () => request('/api/sessions/active');
export const cancelActiveSession = (id) => request(`/api/sessions/${id}/active`, { method: 'DELETE' });
export const clearSessionHistory = () => request('/api/sessions/history', { method: 'DELETE' });
export const startSession = (data) => request('/api/sessions/start', { method: 'POST', json: data });
export const pauseSession = (id, paused) => request(`/api/sessions/${id}/pause`, { method: 'POST', json: { paused } });
export const heartbeatSession = (id) => request(`/api/sessions/${id}/heartbeat`, { method: 'POST', json: {} });
export const finishSession = (id) => request(`/api/sessions/${id}/finish`, { method: 'POST', json: {} });
export const joinChallengeRequest = (id) => request(`/api/challenges/${id}/join`, { method: 'POST', json: {} });
export const redeemRewardRequest = (id) => request(`/api/rewards/${id}/redeem`, { method: 'POST', json: {} });
export const claimAchievementRequest = (id) => request(`/api/achievements/${id}/claim`, { method: 'POST', json: {} });
export const equipRewardsRequest = (data) => request('/api/rewards/equipped', { method: 'PUT', json: data });
export const createReportRequest = (data) => request('/api/reports', { method: 'POST', json: data });
export const replyReportRequest = (id, text) => request(`/api/reports/${id}/replies`, { method: 'POST', json: { text } });
export const fetchAdminOverview = () => request('/api/admin/overview');
export const updateAdminReport = (id, data) => request(`/api/admin/reports/${id}`, { method: 'PATCH', json: data });
export const saveAdminConfiguration = (data) => request('/api/admin/configuration', { method: 'PUT', json: data });
