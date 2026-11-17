/**
 * JURYSONE — Configuração do Dashboard
 *
 * Este arquivo define as URLs do backend usadas pelo dashboard.html.
 * NÃO são necessárias chaves de API aqui — elas ficam no servidor NestJS.
 *
 * Para desenvolvimento local: http://localhost:3001/api
 * Em produção, o próprio backend serve estas páginas (pasta public/), então a
 * API fica no mesmo endereço do site: <origem>/api. Assim funciona em qualquer
 * servidor (VM da Oracle, Render, jurysone.com.br) sem trocar este arquivo.
 */
window.JURYSONE_CONFIG = {
  // URL do backend NestJS (onde vivem TODAS as chaves de API)
  API_URL: window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : window.location.origin + '/api',
};
