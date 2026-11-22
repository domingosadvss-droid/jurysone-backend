/**
 * JURYSONE — Calendário padrão por tribunal (2026–2027)
 *
 * Mesma lista da planilha "Controle de Prazos – Domingos Advocacia" (constante CALENDARIO do
 * Apps Script, conferida em 18/11/2026; caso Renato 5001812-26.2026.8.24.0005 = 24/11/2026 no eproc).
 *
 * Regra do escritório: ficam de fora, de propósito, feriados municipais, o aniversário de
 * Florianópolis (só Capital) e os feriados regimentais do TRT12 de 2027 que ainda podem ser
 * transferidos — assim o prazo calculado nunca fica MAIS LONGO do que o real.
 *
 * Efeito:
 *   FORENSE          → sem expediente: adia a publicação do DJEN e a contagem
 *   SUSPENSAO_PRAZO  → só suspende a contagem (ex.: 12 e 13/11/2026, recesso de 20/12 a 20/01)
 * tribunal null = vale para todos.
 */
export interface LinhaCalendario {
  data: string;
  dataFim?: string;
  descricao: string;
  tribunal: string | null;
  tipo: 'FORENSE' | 'SUSPENSAO_PRAZO';
  fonte: string;
}

const L = (data: string, descricao: string, tribunal: string, fonte: string): LinhaCalendario => ({
  data, descricao, tribunal: tribunal === 'Todos' ? null : tribunal, fonte,
  tipo: /^(Prazos suspensos|Recesso)/.test(descricao) ? 'SUSPENSAO_PRAZO' : 'FORENSE',
});

const CONFERIR_2027 = '2027: repetição da regra fixa – conferir quando o tribunal publicar o calendário de 2027';

export const CALENDARIO_PADRAO: LinhaCalendario[] = [
  // ---- Todos os tribunais
  L('2026-01-01', 'Confraternização Universal', 'Todos', 'Lei 662/1949'),
  L('2026-02-16', 'Carnaval (segunda)', 'Todos', 'calendários TJSC, TRT12, TRF4 (Lei 5.010/66, art. 62)'),
  L('2026-02-17', 'Carnaval (terça)', 'Todos', 'calendários TJSC, TRT12, TRF4'),
  L('2026-04-03', 'Sexta-feira Santa', 'Todos', 'feriado nacional'),
  L('2026-04-21', 'Tiradentes', 'Todos', 'Lei 662/1949'),
  L('2026-05-01', 'Dia do Trabalho', 'Todos', 'Lei 662/1949'),
  L('2026-09-07', 'Independência', 'Todos', 'Lei 662/1949'),
  L('2026-10-12', 'N. Sra. Aparecida', 'Todos', 'Lei 6.802/1980'),
  L('2026-11-02', 'Finados', 'Todos', 'Lei 662/1949'),
  L('2026-11-12', 'Prazos suspensos – instabilidade Microsoft 365', 'Todos', 'Portaria CNJ 551/2026; Res. GP TJSC 64/2026; Ato Seap TRT12 22/2026'),
  L('2026-11-13', 'Prazos suspensos – instabilidade Microsoft 365', 'Todos', 'Portaria CNJ 551/2026; Res. GP TJSC 64/2026; Ato Seap TRT12 22/2026'),
  L('2026-11-15', 'Proclamação da República', 'Todos', 'Lei 662/1949'),
  L('2026-11-20', 'Consciência Negra', 'Todos', 'Lei 14.759/2023'),
  L('2026-12-25', 'Natal', 'Todos', 'Lei 662/1949'),
  // ---- TJSC
  L('2026-04-02', 'Quinta-feira Santa', 'TJSC', 'Res. GP 1/1985'),
  L('2026-06-04', 'Corpus Christi', 'TJSC', 'calendário TJSC 2026'),
  L('2026-10-28', 'Dia do Servidor Público', 'TJSC', 'calendário TJSC 2026'),
  L('2026-12-08', 'Dia da Justiça', 'TJSC', 'calendário TJSC 2026'),
  // ---- TRT12
  L('2026-02-18', 'Quarta-feira de Cinzas', 'TRT12', 'Portaria Seap 191/2024 (RI art. 154)'),
  L('2026-04-01', 'Semana Santa', 'TRT12', 'Portaria Seap 191/2024 (RI art. 154)'),
  L('2026-04-02', 'Semana Santa', 'TRT12', 'Portaria Seap 191/2024 (RI art. 154)'),
  L('2026-04-20', 'Feriado regimental', 'TRT12', 'Portaria Seap 25/2026'),
  L('2026-06-04', 'Corpus Christi', 'TRT12', 'Portaria Seap 191/2024'),
  L('2026-06-05', 'Feriado regimental', 'TRT12', 'Portaria Seap 25/2026'),
  L('2026-08-10', 'Feriado regimental (transferido de 11/08)', 'TRT12', 'Portaria Seap 191/2024, art. 2º'),
  L('2026-08-31', 'Prazos suspensos – intempéries', 'TRT12', 'Ato Seap 10/2026'),
  L('2026-09-11', 'Prazos suspensos – intempéries', 'TRT12', 'Ato Seap 11/2026'),
  L('2026-10-30', 'Feriado regimental (transferido de 28/10)', 'TRT12', 'Portaria Seap 191/2024, art. 2º'),
  L('2026-11-04', 'Prazos suspensos – intempéries', 'TRT12', 'Ato Seap 19/2026'),
  L('2026-12-07', 'Feriado regimental (transferido de 08/12)', 'TRT12', 'Portaria Seap 191/2024, art. 2º'),
  // ---- TRF4 / Justiça Federal
  L('2026-04-01', 'Semana Santa', 'TRF4', 'Lei 5.010/66, art. 62, II'),
  L('2026-04-02', 'Semana Santa', 'TRF4', 'Lei 5.010/66, art. 62, II'),
  L('2026-08-11', 'Dia dos Cursos Jurídicos', 'TRF4', 'Lei 5.010/66, art. 62, IV'),
  L('2026-10-21', 'Prazos suspensos – queda do acesso externo ao eproc', 'TRF4', 'Portaria TRF4 917/2026'),
  L('2026-12-08', 'Dia da Justiça', 'TRF4', 'Lei 5.010/66, art. 62, VI'),
  // ---- Recesso (art. 220 CPC / art. 775-A CLT): só suspende a contagem
  { data: '2026-12-20', dataFim: '2027-01-20', descricao: 'Recesso forense – prazos suspensos', tribunal: null, tipo: 'SUSPENSAO_PRAZO', fonte: 'art. 220 CPC / art. 775-A CLT' },
  { data: '2027-12-20', dataFim: '2027-12-31', descricao: 'Recesso forense – prazos suspensos', tribunal: null, tipo: 'SUSPENSAO_PRAZO', fonte: 'art. 220 CPC / art. 775-A CLT' },
  L('2027-01-01', 'Confraternização Universal', 'Todos', 'Lei 662/1949'),
  L('2027-12-25', 'Natal', 'Todos', 'Lei 662/1949'),
  // ---- 2027 (regra fixa; conferir quando os tribunais publicarem)
  ...([
    ['2027-02-08', 'Carnaval (segunda)', 'Todos'], ['2027-02-09', 'Carnaval (terça)', 'Todos'],
    ['2027-03-26', 'Sexta-feira Santa', 'Todos'], ['2027-04-21', 'Tiradentes', 'Todos'], ['2027-05-01', 'Dia do Trabalho', 'Todos'],
    ['2027-09-07', 'Independência', 'Todos'], ['2027-10-12', 'N. Sra. Aparecida', 'Todos'], ['2027-11-02', 'Finados', 'Todos'],
    ['2027-11-15', 'Proclamação da República', 'Todos'], ['2027-11-20', 'Consciência Negra', 'Todos'],
    ['2027-03-25', 'Quinta-feira Santa', 'TJSC'], ['2027-05-27', 'Corpus Christi', 'TJSC'],
    ['2027-10-28', 'Dia do Servidor Público', 'TJSC'], ['2027-12-08', 'Dia da Justiça', 'TJSC'],
    ['2027-02-10', 'Quarta-feira de Cinzas', 'TRT12'], ['2027-03-24', 'Semana Santa', 'TRT12'], ['2027-03-25', 'Semana Santa', 'TRT12'],
    ['2027-05-27', 'Corpus Christi', 'TRT12'],
    ['2027-03-24', 'Semana Santa', 'TRF4'], ['2027-03-25', 'Semana Santa', 'TRF4'], ['2027-08-11', 'Dia dos Cursos Jurídicos', 'TRF4'],
    ['2027-11-01', 'Feriado (Lei 5.010/66)', 'TRF4'], ['2027-12-08', 'Dia da Justiça', 'TRF4'],
  ] as const).map(([d, m, t]) => L(d, m, t, CONFERIR_2027)),
];
