export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const STOPWORDS = new Set([
  "a", "o", "e", "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas",
  "por", "para", "com", "sem", "que", "se", "ou", "um", "uma", "uns", "umas",
  "ao", "aos", "pelo", "pela", "pelos", "pelas", "este", "esta", "esse", "essa",
  "seu", "sua", "seus", "suas", "como", "mais", "qual", "quais", "sobre", "sob",
  "entre", "ser", "ter", "haver", "fazer", "poder", "dever", "apos",
]);

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(" ")
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Converte a data de geração do snapshot para o formato brasileiro.
 *
 * Os manifestos gravam ora `2026-07-19`, ora `2026-07-19T05:19:01+00:00`,
 * conforme a família. Quem consulta precisa ver a data, não o carimbo técnico.
 */
export function dataDoSnapshot(valor: string): string {
  const partes = valor.slice(0, 10).split("-");
  if (partes.length !== 3) return valor;
  const [ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
}

const PORTAL_STF = "portal.stf.jus.br";

/**
 * Comportamento declarado da fonte, não defeito do acervo (BASE-047).
 *
 * O portal do STF devolve a própria tela de erro — o "404 Desculpe, mas não
 * encontramos o que você está procurando", servido com status 200 — em parte
 * dos primeiros acessos vindos de outro site. O mesmo endereço abre ao ser
 * recarregado. Relatado em uso em 01/08/2026 e reproduzido uma vez na
 * verificação; 100 requisições sequenciais do mesmo IP não reproduziram, então
 * o gatilho está no lado do STF e não há endereço a corrigir aqui.
 *
 * Sem o aviso, quem consulta conclui que a fonte citada não existe — o
 * contrário do que o acervo se propõe a garantir.
 */
export function avisoPortalSTF(
  urls: readonly (string | undefined)[],
): string {
  if (!urls.some((url) => url?.includes(PORTAL_STF))) return "";
  return (
    "\n> **Se a página do STF abrir em 404, recarregue uma vez.** O portal" +
    " responde com a tela de erro em parte dos primeiros acessos vindos de" +
    " outro site; o mesmo endereço abre na segunda tentativa.\n"
  );
}
