/**
 * JURYSONE — Leitura do texto das publicações (funções puras)
 *
 * Tudo aqui é heurístico e conservador: na dúvida, o prazo entra marcado "conferir".
 * Nada aqui decide sozinho algo irreversível; serve para lançar prazos, agenda e alertas.
 */
import { normalizarLocal } from './calendario';

/** Remove HTML (o texto do DJEN vem como HTML de dezenas de tribunais: tratar como hostil) */
export function textoPlano(html?: string | null): string {
  return String(html ?? '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export function soDigitos(v?: string | null): string {
  return String(v ?? '').replace(/\D/g, '');
}

/** Número CNJ só com dígitos (20) */
export function numeroCnj(v?: string | null): string | null {
  const d = soDigitos(v);
  return d.length === 20 ? d : null;
}

export function mascararCnj(d: string): string {
  if (d.length !== 20) return d;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
}

const UFS_TJ: Record<string, string> = {
  '01': 'AC', '02': 'AL', '03': 'AP', '04': 'AM', '05': 'BA', '06': 'CE', '07': 'DFT', '08': 'ES', '09': 'GO',
  '10': 'MA', '11': 'MT', '12': 'MS', '13': 'MG', '14': 'PA', '15': 'PB', '16': 'PR', '17': 'PE', '18': 'PI',
  '19': 'RJ', '20': 'RN', '21': 'RS', '22': 'RO', '23': 'RR', '24': 'SC', '25': 'SE', '26': 'SP', '27': 'TO',
};

/** Sigla do tribunal pelo número CNJ (J.TR): 8.24 → TJSC, 5.12 → TRT12, 4.04 → TRF4 */
export function tribunalDoNumero(v?: string | null): string | null {
  const d = numeroCnj(v);
  if (!d) return null;
  const j = d.slice(13, 14);
  const tr = d.slice(14, 16);
  if (j === '8') return UFS_TJ[tr] ? `TJ${UFS_TJ[tr]}` : null;
  if (j === '5') return `TRT${Number(tr)}`;
  if (j === '4') return `TRF${Number(tr)}`;
  return null;
}

// ── Prazo ────────────────────────────────────────────────────────────────────

const EXTENSO: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, noventa: 90,
};

function extensoParaNumero(txt: string): number | null {
  const partes = normalizarLocal(txt).split(' ').filter((p) => p && p !== 'e');
  if (!partes.length || partes.length > 3) return null;
  let total = 0;
  for (const p of partes) {
    if (!(p in EXTENSO)) return null;
    total += EXTENSO[p];
  }
  return total || null;
}

export interface PrazoExtraido {
  dias: number | null;
  trecho: string | null;
  // houve mais de um prazo diferente, ou prazo em horas: conferir
  duvidoso: boolean;
}

export function extrairPrazo(texto: string): PrazoExtraido {
  const t = texto.replace(/\s+/g, ' ');
  const achados: { dias: number; trecho: string; horas: boolean }[] = [];
  const padroes: RegExp[] = [
    /prazo\s+(?:comum\s+|sucessivo\s+|legal\s+|improrrog[aá]vel\s+)?de\s+(\d{1,3})\s*(?:\([^)]{0,40}\))?\s*(dias|horas)/gi,
    /prazo\s+(?:comum\s+|sucessivo\s+|legal\s+|improrrog[aá]vel\s+)?de\s+([a-zà-ú]+(?:\s+e\s+[a-zà-ú]+)?)\s*(?:\(\s*\d{1,3}\s*\))?\s*(dias|horas)/gi,
    /\b(?:em|no|dentro\s+de)\s+(\d{1,3})\s*(?:\([^)]{0,40}\))?\s*(dias|horas)/gi,
    /\b(\d{1,3})\s*\(\s*[a-zà-ú\s]{3,30}\)\s*(dias|horas)/gi,
  ];
  for (const re of padroes) {
    for (const m of t.matchAll(re)) {
      const bruto = m[1];
      const n = /^\d+$/.test(bruto) ? Number(bruto) : extensoParaNumero(bruto);
      if (!n || n > 365) continue;
      const horas = /hora/i.test(m[2]);
      const ini = Math.max(0, (m.index ?? 0) - 60);
      achados.push({ dias: horas ? Math.max(1, Math.ceil(n / 24)) : n, trecho: t.slice(ini, (m.index ?? 0) + m[0].length + 40).trim(), horas });
    }
  }
  if (!achados.length) return { dias: null, trecho: null, duvidoso: false };
  const distintos = new Set(achados.map((a) => a.dias));
  return { dias: achados[0].dias, trecho: achados[0].trecho, duvidoso: distintos.size > 1 || achados[0].horas };
}

// ── Matéria, réu preso, comarca ──────────────────────────────────────────────

export function ehPenal(...campos: (string | null | undefined)[]): boolean {
  const t = campos.filter(Boolean).join(' ');
  return /penal|criminal|crime|inqu[eé]rito|habeas\s+corpus|termo\s+circunstanciado|j[uú]ri|execu[cç][aã]o\s+da\s+pena|medidas?\s+protetivas?/i.test(t);
}

export function mencionaReuPreso(texto: string): boolean {
  return /r[eé]u\s+pres[oa]|acusad[oa]\s+pres[oa]|denunciad[oa]\s+pres[oa]|(?:se\s+)?encontra(?:-se)?\s+(?:pres|recolhid|segregad)|pris[aã]o\s+preventiva|custodiad[oa]|segregad[oa]\s+cautelarmente|mandado\s+de\s+pris[aã]o\s+cumprido/i.test(texto);
}

/** Município da comarca a partir do nome do órgão ("1ª Vara Cível da Comarca de Itajaí") */
export function comarcaDoOrgao(orgao?: string | null): string | null {
  const t = String(orgao ?? '');
  const m = t.match(/(?:comarca\s+de|foro\s+(?:central\s+)?de|vara\s+do\s+trabalho\s+de|vara\s+federal\s+(?:[a-zà-ú ]+\s+)?de|subse[cç][aã]o\s+judici[aá]ria\s+de|juizado\s+especial\s+[a-zà-ú ]*?\s+de)\s+([^,\-–/()0-9]+)/i);
  if (!m) return null;
  return m[1].replace(/\s+/g, ' ').trim() || null;
}

// ── Audiência ────────────────────────────────────────────────────────────────

export interface AudienciaExtraida {
  data: string; // AAAA-MM-DD
  hora: string | null; // HH:MM
  virtual: boolean;
  trecho: string;
}

export function extrairAudiencia(texto: string): AudienciaExtraida | null {
  const t = texto.replace(/\s+/g, ' ');
  for (const m of t.matchAll(/audi[eê]ncia/gi)) {
    const ini = Math.max(0, (m.index ?? 0) - 250);
    const janela = t.slice(ini, (m.index ?? 0) + 300);
    if (!/designad|designo|redesign|marcad|marco\s+(?:a\s+)?audi|pautad|inclu[ií]d[oa]\s+em\s+pauta|fica\s+(?:mantida|agendada)|agendad/i.test(janela)) continue;
    if (/cancelad|retirad[oa]\s+de\s+pauta|n[aã]o\s+se\s+realizar/i.test(janela)) continue;
    const dm = janela.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4}|\d{2})/);
    if (!dm) continue;
    const dia = Number(dm[1]), mes = Number(dm[2]);
    let ano = Number(dm[3]);
    if (ano < 100) ano += 2000;
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) continue;
    const depoisData = janela.slice((dm.index ?? 0) + dm[0].length, (dm.index ?? 0) + dm[0].length + 60);
    const hm = depoisData.match(/(\d{1,2})\s*(?:h|:|horas)\s*(\d{2})?/i);
    let hora: string | null = null;
    if (hm && Number(hm[1]) < 24) hora = `${String(Number(hm[1])).padStart(2, '0')}:${hm[2] ?? '00'}`;
    return {
      data: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
      hora,
      virtual: /videoconfer[eê]ncia|virtual|telepresencial|link|teams|zoom|google\s+meet|webex/i.test(janela),
      trecho: janela.trim(),
    };
  }
  return null;
}

// ── Nomeação dativa ──────────────────────────────────────────────────────────

export function ehNomeacaoDativa(texto: string): boolean {
  const t = texto.replace(/\s+/g, ' ');
  const nomeia = /nomei[oa]|nomead[oa]|nomea[cç][aã]o|designad[oa]\s+para\s+(?:patrocinar|defender|atuar)/i.test(t);
  const dativa = /dativ[oa]|curador(?:a)?\s+especial|assist[eê]ncia\s+judici[aá]ria\s+gratuita|\bAJG\b|defensor(?:a)?\s+(?:p[uú]blic[oa]\s+)?ad\s+hoc/i.test(t);
  return nomeia && dativa;
}

// ── Marcos (para avisar o cliente) ───────────────────────────────────────────

export const MARCOS: Record<string, string> = {
  MARCO_LIMINAR: 'decisão sobre o pedido urgente (liminar)',
  MARCO_SENTENCA: 'sentença',
  MARCO_ACORDAO: 'julgamento do recurso (acórdão)',
  MARCO_ACORDO: 'homologação do acordo',
  MARCO_ALVARA: 'alvará para levantamento de valores',
};

export function detectarMarcos(texto: string, tipoDocumento?: string | null): string[] {
  const t = texto.replace(/\s+/g, ' ');
  const doc = String(tipoDocumento ?? '');
  const marcos = new Set<string>();
  if (/ac[oó]rd[aã]o/i.test(doc) || /\bac[oó]rd[aã]o\b.{0,80}(?:provimento|negaram|deram|conheceram)/i.test(t)) marcos.add('MARCO_ACORDAO');
  if (/senten[cç]a/i.test(doc) || /julgo\s+(?:parcialmente\s+)?(?:procedente|improcedente|extinto)|\babsolvo\b|\bcondeno\b/i.test(t)) marcos.add('MARCO_SENTENCA');
  if (/(?:defiro|deferi|concedo|indefiro)\s+(?:em\s+parte\s+)?(?:a\s+|o\s+)?(?:tutela|liminar|medida\s+(?:liminar|cautelar|urgente)|pedido\s+liminar)/i.test(t)) marcos.add('MARCO_LIMINAR');
  if (/homolog\w*\s+(?:por\s+senten[cç]a\s+)?(?:o\s+|a\s+)?(?:acordo|transa[cç][aã]o|concilia[cç][aã]o)/i.test(t)) marcos.add('MARCO_ACORDO');
  if (/expe[cç]a-se\s+(?:o\s+)?alvar[aá]|alvar[aá]\s+(?:eletr[oô]nico\s+)?(?:de\s+levantamento\s+)?(?:expedid|liberad|deferid)/i.test(t)) marcos.add('MARCO_ALVARA');
  return [...marcos];
}

// ── Pessoas ──────────────────────────────────────────────────────────────────

export function iniciais(nome?: string | null): string {
  return normalizarLocal(nome).split(' ').filter((p) => p.length > 2 || p === 'e').filter((p) => !['da', 'de', 'do', 'das', 'dos', 'e'].includes(p)).map((p) => p[0]).join('');
}

/** Iniciais com e sem as partículas ("José da Silva" → js e jds) */
export function iniciaisVariantes(nome?: string | null): string[] {
  const partes = normalizarLocal(nome).split(' ').filter(Boolean);
  return [...new Set([iniciais(nome), partes.map((p) => p[0]).join('')])];
}

/** "J.S.S." / "J. S. S." → "jss"; nome completo → iniciais */
export function iniciaisDeTexto(txt?: string | null): string {
  const t = String(txt ?? '').trim();
  if (/^([A-ZÀ-Ú]\.\s*){2,}$/.test(t) || /^[A-ZÀ-Ú]{2,5}$/.test(t)) return t.replace(/[^A-Za-zÀ-ú]/g, '').toLowerCase();
  return iniciais(t);
}

/** Telefone brasileiro em um texto (para e-mail do AJG) */
export function extrairTelefone(texto: string): string | null {
  const m = texto.match(/(?:\+?55\s*)?\(?\b([1-9]{2})\)?\s*(9?\d{4})[-\s.]?(\d{4})\b/);
  if (!m) return null;
  const d = `${m[1]}${m[2]}${m[3]}`;
  return d.length >= 10 ? d : null;
}
