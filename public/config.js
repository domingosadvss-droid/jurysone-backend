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
  // Usa URL relativa em produção — funciona em qualquer domínio (jurysone.com.br ou onrender.com)
  API_URL: window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : window.location.origin + '/api',
};
