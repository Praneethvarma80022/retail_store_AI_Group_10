import axios from "axios";
import { AUTH_STORAGE_KEY, clearStoredSession } from "./auth";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  try {
    const session = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");

    if (session?.token) {
      config.headers.Authorization = `Bearer ${session.token}`;
    }
  } catch {
    clearStoredSession();
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearStoredSession();
      window.dispatchEvent(new Event("retail-ai-auth-expired"));
    }

    return Promise.reject(error);
  }
);

export function getErrorMessage(error, fallback = "Something went wrong.") {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

export default api;
