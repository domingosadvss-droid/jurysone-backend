/**
 * JURYSONE — Configuração do Dashboard
 *
 * Este arquivo define as URLs do backend usadas pelo dashboard.html.
 * NÃO são necessárias chaves de API aqui — elas ficam no servidor NestJS.
 *
 * Para desenvolvimento local: http://localhost:3001/api
 * Para produção: https://api.jurysone.com.br/api
 */
window.JURYSONE_CONFIG = {
  // URL do backend NestJS (onde vivem TODAS as chaves de API)
  API_URL: window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : 'https://jurysone-backend.onrender.com/api',
};
