/**
 * ─────────────────────────────────────────────────────────────
 * Teste de integração DataJud — rode com:
 *   npx ts-node src/modules/datajud/datajud.test.ts
 * ─────────────────────────────────────────────────────────────
 */

import axios from 'axios';

const API_KEY  = process.env.DATAJUD_API_KEY  ?? 'cDZHYzlZa0JadVREZDJCendFbXNBR3A1';
const BASE_URL = process.env.DATAJUD_BASE_URL ?? 'https://api-publica.datajud.cnj.jus.br';

const http = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization:  `ApiKey ${API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 30_000,
});

async function testarBuscaPorNumero() {
  console.log('\n🔍 Teste 1 — Busca por número de processo no TJSP');
  console.log('   Processo: 0001234-56.2024.8.26.0100\n');

  try {
    const { data } = await http.post('/api_publica-tjsp/_search', {
      size: 1,
      query: {
        match: { numeroProcesso: '0001234-56.2024.8.26.0100' },
      },
    });

    const hits = data?.hits?.hits ?? [];
    const total = data?.hits?.total?.value ?? 0;

    console.log(`   Total encontrado: ${total}`);
    if (hits.length > 0) {
      const proc = hits[0]._source;
      console.log('   ✅ Processo encontrado!');
      console.log(`   Número:    ${proc.numeroProcesso}`);
      console.log(`   Classe:    ${proc.classe?.nome}`);
      console.log(`   Tribunal:  ${proc.tribunal}`);
      console.log(`   Grau:      ${proc.grau}`);
    } else {
      console.log('   ℹ️  Processo fictício não encontrado (esperado — é um número de teste).');
      console.log('   ✅ Conexão com DataJud funcionando corretamente!');
    }
  } catch (err: any) {
    console.error('   ❌ Erro:', err?.response?.data ?? err.message);
  }
}

async function testarBuscaPorParte() {
  console.log('\n🔍 Teste 2 — Busca por nome de parte no TJSP');
  console.log('   Parte: "João Silva"\n');

  try {
    const { data } = await http.post('/api_publica-tjsp/_search', {
      size: 3,
      query: {
        nested: {
          path: 'partes',
          query: {
            match: { 'partes.nome': { query: 'João Silva', operator: 'and' } },
          },
        },
      },
    });

    const hits  = data?.hits?.hits ?? [];
    const total = data?.hits?.total?.value ?? 0;
    console.log(`   Total encontrado: ${total}`);
    console.log(`   ✅ Retornou ${hits.length} processos de amostra`);
    hits.forEach((h: any, i: number) => {
      console.log(`   [${i + 1}] ${h._source.numeroProcesso} — ${h._source.classe?.nome}`);
    });
  } catch (err: any) {
    console.error('   ❌ Erro:', err?.response?.data ?? err.message);
  }
}

async function testarListarTribunais() {
  console.log('\n🔍 Teste 3 — Verificar acesso ao índice do TJRJ\n');
  try {
    const { data } = await http.get('/api_publica-tjrj/_count');
    console.log(`   ✅ TJRJ online — ${data?.count?.toLocaleString('pt-BR') ?? 'N/A'} processos indexados`);
  } catch (err: any) {
    console.error('   ❌ Erro TJRJ:', err?.response?.status, err?.response?.data?.error?.reason ?? err.message);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('   JurysOne — Teste de Integração DataJud (CNJ)    ');
  console.log('═══════════════════════════════════════════════════');
  console.log(`   Base URL: ${BASE_URL}`);
  console.log(`   API Key:  ${API_KEY.slice(0, 8)}...`);

  await testarBuscaPorNumero();
  await testarBuscaPorParte();
  await testarListarTribunais();

  console.log('\n═══════════════════════════════════════════════════');
  console.log('   Testes concluídos!');
  console.log('═══════════════════════════════════════════════════\n');
}

main().catch(console.error);
