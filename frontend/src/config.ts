// Central API URL configuration for Dogether frontend
// When deployed on Vercel, it will use VITE_API_URL.
// When running locally, it defaults to the local port 5000.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
