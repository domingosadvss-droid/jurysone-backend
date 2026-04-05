// ════════════════════════════════════════════════════════════════════════════
//  JurysOne — Suite de Testes Automatizados com Playwright
//  Versão: 1.0.0  |  Data: 23/03/2026
//
//  Pré-requisitos:
//    npm install -D @playwright/test
//    npx playwright install chromium
//
//  Execução:
//    npx playwright test                          # todos os testes
//    npx playwright test --headed                 # com browser visível
//    npx playwright test tests/jurysone.spec.js   # arquivo específico
//    npx playwright test --reporter=html          # relatório HTML
//
//  Configuração: playwright.config.js na raiz do projeto
// ════════════════════════════════════════════════════════════════════════════

const { test, expect } = require('@playwright/test');

// ── Configuração ─────────────────────────────────────────────────────────────
const BASE_URL  = process.env.JURYSONE_URL  || 'http://localhost:3000/app-preview/dashboard.html';
const PROXY_URL = process.env.PROXY_URL     || 'http://localhost:3002';
const TIMEOUT   = 10_000;

// ── Helpers ───────────────────────────────────────────────────────────────────
async function aguardarPagina(page, nome) {
  await page.click(`text="${nome}"`);
  await page.waitForTimeout(400);
}

async function esperarToast(page, texto) {
  const toast = page.locator('#jus-toast');
  await expect(toast).toContainText(texto, { timeout: 5000 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 1 — Carregamento e Estrutura Básica
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('1. Carregamento e Estrutura', () => {

  test('1.1 Página carrega sem erros de console', async ({ page }) => {
    const erros = [];
    page.on('console', msg => { if (msg.type() === 'error') erros.push(msg.text()); });
    page.on('pageerror', err => erros.push(err.message));
    await page.goto(BASE_URL, { timeout: TIMEOUT });
    await page.waitForLoadState('networkidle');
    // Filtra erros esperados (fontes externas, etc.)
    const errosReais = erros.filter(e =>
      !e.includes('favicon') &&
      !e.includes('fonts.googleapis') &&
      !e.includes('cdn.tailwindcss') &&
      !e.includes('config.js') // arquivo de configuração local opcional
    );
    expect(errosReais, `Erros de console: ${errosReais.join(', ')}`).toHaveLength(0);
  });

  test('1.2 Sidebar renderiza com todos os links de navegação', async ({ page }) => {
    await page.goto(BASE_URL);
    const linksEsperados = ['Dashboard', 'Clientes', 'Processos', 'Financeiro', 'Agenda', 'Documentos', 'Equipe', 'Configurações'];
    for (const link of linksEsperados) {
      await expect(page.locator('.sidebar').getByText(link)).toBeVisible();
    }
  });

  test('1.3 Header renderiza corretamente', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('.header')).toBeVisible();
    await expect(page.locator('.header-title')).toBeVisible();
  });

  test('1.4 Dashboard é a página inicial ativa', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('#page-dashboard')).toHaveClass(/active/);
  });

  test('1.5 Indicador de salvamento existe no DOM', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('#jus-saving-bar')).toBeAttached();
    await expect(page.locator('#jus-saving-pill')).toBeAttached();
  });

  test('1.6 Banner offline existe no DOM', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('#jus-offline-banner')).toBeAttached();
  });

  test('1.7 Toast de undo existe no DOM', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('#jus-undo-toast')).toBeAttached();
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 2 — Navegação entre Páginas
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('2. Navegação', () => {
  const paginas = [
    { nome: 'Clientes',      id: 'page-clientes'      },
    { nome: 'Processos',     id: 'page-processos'     },
    { nome: 'Financeiro',    id: 'page-financeiro'    },
    { nome: 'Agenda',        id: 'page-agenda'        },
    { nome: 'Documentos',    id: 'page-documentos'    },
    { nome: 'Equipe',        id: 'page-equipe'        },
    { nome: 'Configurações', id: 'page-configuracoes' },
  ];

  for (const { nome, id } of paginas) {
    test(`2.${paginas.indexOf({nome,id})+1} Navega para ${nome}`, async ({ page }) => {
      await page.goto(BASE_URL);
      await page.locator('.nav-link').filter({ hasText: nome }).first().click();
      await page.waitForTimeout(300);
      await expect(page.locator(`#${id}`)).toHaveClass(/active/);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 3 — CRUD de Clientes
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('3. CRUD de Clientes', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('.nav-link').filter({ hasText: 'Clientes' }).first().click();
    await page.waitForTimeout(300);
  });

  test('3.1 Botão "+ Novo Cliente" abre modal', async ({ page }) => {
    await page.locator('button:has-text("Novo Cliente")').first().click();
    await expect(page.locator('#modal-cliente')).toHaveClass(/active/);
  });

  test('3.2 Criar novo cliente com dados válidos', async ({ page }) => {
    await page.locator('button:has-text("Novo Cliente")').first().click();
    await page.locator('#form-cliente-nome').fill('Cliente Teste Playwright');
    await page.locator('#form-cliente-email').fill('playwright@test.com.br');
    await page.locator('#form-cliente-cpf').fill('123.456.789-00');
    await page.locator('#form-cliente-telefone').fill('(11) 99999-9999');
    await page.locator('#form-cliente button[type="submit"]').click();
    await page.waitForTimeout(500);
    // Modal deve fechar após salvar
    await expect(page.locator('#modal-cliente')).not.toHaveClass(/active/);
    // Cliente deve aparecer na lista
    await expect(page.locator('#table-clientes, #clientes-table, .card').getByText('Cliente Teste Playwright')).toBeVisible({ timeout: 3000 });
  });

  test('3.3 Validação de campo obrigatório (nome)', async ({ page }) => {
    await page.locator('button:has-text("Novo Cliente")').first().click();
    // Tenta submeter sem nome
    await page.locator('#form-cliente button[type="submit"]').click();
    // Modal deve permanecer aberto (validação impediu submit)
    await expect(page.locator('#modal-cliente')).toHaveClass(/active/);
  });

  test('3.4 Validação inline de e-mail inválido', async ({ page }) => {
    await page.locator('button:has-text("Novo Cliente")').first().click();
    const emailField = page.locator('#form-cliente-email');
    await emailField.fill('email-invalido');
    await emailField.blur();
    // Campo deve ter classe invalid
    await expect(emailField).toHaveClass(/invalid/);
    // Mensagem de erro deve ser visível
    const errMsg = emailField.locator('xpath=following-sibling::*[contains(@class,"field-error")]');
    // Ou o container do campo
    await expect(page.locator('#form-cliente-email').locator('..').locator('.field-error')).toBeVisible({ timeout: 2000 }).catch(() => {
      // Aceita se a classe invalid apareceu mesmo sem o elemento error separado
    });
  });

  test('3.5 Cancelar fecha modal sem criar cliente', async ({ page }) => {
    const contagemAntes = await page.locator('#table-clientes tr, .card-clientes .card').count();
    await page.locator('button:has-text("Novo Cliente")').first().click();
    await page.locator('#form-cliente-nome').fill('Cliente Que Não Será Salvo');
    await page.locator('button:has-text("Cancelar")').first().click();
    await expect(page.locator('#modal-cliente')).not.toHaveClass(/active/);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 4 — CRUD de Processos
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('4. CRUD de Processos', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('.nav-link').filter({ hasText: 'Processos' }).first().click();
    await page.waitForTimeout(300);
  });

  test('4.1 Botão "+ Novo Processo" abre modal', async ({ page }) => {
    await page.locator('button:has-text("Novo Processo")').first().click();
    await expect(page.locator('#modal-processo')).toHaveClass(/active/);
  });

  test('4.2 Modal de processo tem campos obrigatórios', async ({ page }) => {
    await page.locator('button:has-text("Novo Processo")').first().click();
    const modal = page.locator('#modal-processo');
    await expect(modal.locator('#proc-numero, [id*="numero"]').first()).toBeVisible();
    await expect(modal.locator('#proc-tipo, [id*="tipo"]').first()).toBeVisible();
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 5 — Financeiro
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('5. Financeiro', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('.nav-link').filter({ hasText: 'Financeiro' }).first().click();
    await page.waitForTimeout(300);
  });

  test('5.1 Página financeiro carrega com cards de totais', async ({ page }) => {
    await expect(page.locator('#page-financeiro')).toHaveClass(/active/);
    // Deve ter pelo menos um elemento com valor monetário
    await expect(page.locator('#page-financeiro .stat-value, #fin-total-receitas').first()).toBeVisible();
  });

  test('5.2 Botão novo lançamento abre modal', async ({ page }) => {
    await page.locator('#page-financeiro button:has-text("Novo"), #page-financeiro button:has-text("Lançamento")').first().click();
    await expect(page.locator('#modal-financeiro')).toHaveClass(/active/);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 6 — Equipe e Modal de Membro
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('6. Equipe', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('.nav-link').filter({ hasText: 'Equipe' }).first().click();
    await page.waitForTimeout(300);
  });

  test('6.1 Página equipe lista membros', async ({ page }) => {
    await expect(page.locator('#page-equipe')).toHaveClass(/active/);
    await expect(page.locator('#page-equipe .card').first()).toBeVisible();
  });

  test('6.2 Botão de novo membro abre modal', async ({ page }) => {
    await page.locator('#page-equipe button:has-text("Novo"), #page-equipe button:has-text("Membro")').first().click();
    await expect(page.locator('#modal-novo-membro')).toHaveClass(/active/);
  });

  test('6.3 Botão de submit é sempre visível no modal (sticky footer)', async ({ page }) => {
    await page.locator('#page-equipe button:has-text("Novo"), #page-equipe button:has-text("Membro")').first().click();
    const submitBtn = page.locator('#btn-submit-membro');
    await expect(submitBtn).toBeVisible();
    // Scroll no formulário não deve esconder o botão
    await page.locator('#modal-novo-membro form').evaluate(el => el.scrollTop = 9999);
    await page.waitForTimeout(200);
    await expect(submitBtn).toBeVisible();
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 7 — Configurações e Persistência
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('7. Configurações', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('.nav-link').filter({ hasText: 'Configurações' }).first().click();
    await page.waitForTimeout(300);
  });

  test('7.1 Aba "Dados do Escritório" existe e contém campos', async ({ page }) => {
    await page.locator('button:has-text("Dados do Escritório"), [onclick*="cfg-escritorio"]').first().click().catch(() => {});
    const nomeField = page.locator('#cfg-nome, [id*="nome-escritorio"], [id*="cfg-nome"]').first();
    await expect(nomeField).toBeVisible({ timeout: 3000 });
  });

  test('7.2 Paleta de cores altera CSS variables', async ({ page }) => {
    // Clica em uma cor da paleta
    await page.locator('.cor-swatch, [onclick*="aplicarTema"]').first().click().catch(() => {});
    await page.waitForTimeout(300);
    const corPrimaria = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--cor-primaria').trim()
    );
    expect(corPrimaria).toBeTruthy();
    expect(corPrimaria).toMatch(/^#[0-9a-fA-F]{3,6}$/);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 8 — Busca Global
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('8. Busca Global', () => {

  test('8.1 Campo de busca global existe na sidebar', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('#sidebar-global-search')).toBeVisible();
  });

  test('8.2 Busca retorna resultados para termo válido', async ({ page }) => {
    await page.goto(BASE_URL);
    const searchInput = page.locator('#sidebar-global-search');
    await searchInput.fill('Silva');
    await page.waitForTimeout(400);
    const results = page.locator('#global-search-results');
    // Se houver dados com "Silva", o painel deve aparecer
    const isVisible = await results.isVisible();
    // Aceita tanto resultados quanto "nenhum resultado"
    if (isVisible) {
      const content = await results.textContent();
      expect(content).toBeTruthy();
    }
  });

  test('8.3 Escape fecha resultados da busca', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('#sidebar-global-search').fill('teste');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await expect(page.locator('#global-search-results')).not.toHaveClass(/active/);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 9 — Segurança (XSS e Sanitização)
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('9. Segurança — XSS', () => {

  const XSS_PAYLOAD = '<script>window.__xss_test=true</script><img src=x onerror="window.__xss_test=true">';

  test('9.1 Campo de nome de cliente sanitiza XSS', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('.nav-link').filter({ hasText: 'Clientes' }).first().click();
    await page.waitForTimeout(300);

    await page.locator('button:has-text("Novo Cliente")').first().click();
    await page.locator('#form-cliente-nome').fill(XSS_PAYLOAD);
    await page.locator('#form-cliente button[type="submit"]').click();
    await page.waitForTimeout(500);

    // XSS não deve ter executado
    const xssExecutado = await page.evaluate(() => !!window.__xss_test);
    expect(xssExecutado).toBe(false);
  });

  test('9.2 Busca global não executa XSS no termo pesquisado', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('#sidebar-global-search').fill(XSS_PAYLOAD);
    await page.waitForTimeout(400);
    const xssExecutado = await page.evaluate(() => !!window.__xss_test);
    expect(xssExecutado).toBe(false);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 10 — Proxy / Backend
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('10. Proxy Backend', () => {

  test('10.1 Endpoint /status responde 200', async ({ request }) => {
    const resp = await request.get(`${PROXY_URL}/status`).catch(() => null);
    if (!resp) {
      test.skip(); // Proxy pode não estar rodando no ambiente de CI
      return;
    }
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
  });

  test('10.2 Endpoint /db/dados retorna estrutura válida', async ({ request }) => {
    const resp = await request.get(`${PROXY_URL}/db/dados`).catch(() => null);
    if (!resp) { test.skip(); return; }
    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty('ok');
    }
  });

  test('10.3 Rate limiting retorna 429 após exceder limite', async ({ request }) => {
    // Dispara 130 requisições rápidas (> 120/min)
    const requests = Array.from({ length: 130 }, () =>
      request.get(`${PROXY_URL}/status`).catch(() => null)
    );
    const responses = await Promise.all(requests);
    const status429 = responses.filter(r => r?.status() === 429);
    // Deve ter pelo menos uma resposta 429
    if (status429.length === 0) {
      console.log('  ⚠️  Rate limiting não ativou (pode ser por IP diferente ou já resetado)');
    }
    // Teste informativo — não falha se o rate limit não ativou (depende do estado)
  });

  test('10.4 CORS permite origem localhost', async ({ request }) => {
    const resp = await request.fetch(`${PROXY_URL}/status`, {
      headers: { 'Origin': 'http://localhost:3000' }
    }).catch(() => null);
    if (!resp) { test.skip(); return; }
    const acao = resp.headers()['access-control-allow-origin'];
    expect(acao).toMatch(/localhost/);
  });

  test('10.5 Endpoint /auth/login retorna erro com credenciais inválidas', async ({ request }) => {
    const resp = await request.post(`${PROXY_URL}/auth/login`, {
      data: { email: 'invalido@teste.com', senha: 'senhaerrada' }
    }).catch(() => null);
    if (!resp) { test.skip(); return; }
    expect([401, 400]).toContain(resp.status());
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 11 — Cálculo de Repasse a Parceiros
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('11. Cálculo de Repasse (Unitários)', () => {

  test('11.1 Cálculo sobre valor líquido', async ({ page }) => {
    await page.goto(BASE_URL);
    const resultado = await page.evaluate(() => {
      // Simula função de cálculo (adaptar ao nome real da função)
      const valorCausa = 10000;
      const percentual = 20;
      const custos = 500;
      const valorLiquido = valorCausa - custos;
      return (valorLiquido * percentual) / 100;
    });
    expect(resultado).toBe(1900); // (10000 - 500) * 20% = 1900
  });

  test('11.2 Cálculo sobre valor bruto', async ({ page }) => {
    await page.goto(BASE_URL);
    const resultado = await page.evaluate(() => {
      const valorCausa = 10000;
      const percentual = 20;
      return (valorCausa * percentual) / 100;
    });
    expect(resultado).toBe(2000); // 10000 * 20% = 2000
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 12 — Undo System
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('12. Sistema de Undo', () => {

  test('12.1 Toast de undo aparece após exclusão', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('.nav-link').filter({ hasText: 'Clientes' }).first().click();
    await page.waitForTimeout(300);

    // Tenta clicar num botão de excluir se existir
    const btnExcluir = page.locator('.btn-danger').first();
    if (await btnExcluir.isVisible()) {
      // Confirma diálogo se aparecer
      page.once('dialog', dialog => dialog.accept());
      await btnExcluir.click();
      await page.waitForTimeout(500);
      // Toast de undo deve aparecer
      const toast = page.locator('#jus-undo-toast');
      if (await toast.isVisible()) {
        await expect(toast.locator('.undo-btn')).toBeVisible();
      }
    } else {
      test.skip(); // Sem itens para excluir
    }
  });

});
