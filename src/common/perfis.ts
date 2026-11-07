/**
 * JURYSONE — Perfis de acesso
 *
 *   ADMIN      → titular; único que altera regras financeiras, fecha períodos e repassa
 *   SOCIO      → vê tudo, inclusive o financeiro completo
 *   ADVOGADO   → perfil legado; tratado como SOCIO para não bloquear usuários antigos
 *   ASSOCIADO  → sem financeiro geral; vê só a própria cota-parte
 *   ESTAGIARIO → sem nenhum dado financeiro
 *   PARCEIRO   → advogado externo; só os processos em que participa
 */
export const PERFIS = {
  ADMIN: 'ADMIN',
  SOCIO: 'SOCIO',
  ADVOGADO: 'ADVOGADO',
  ASSOCIADO: 'ASSOCIADO',
  ESTAGIARIO: 'ESTAGIARIO',
  PARCEIRO: 'PARCEIRO',
} as const;

export type Perfil = (typeof PERFIS)[keyof typeof PERFIS];

export const PERFIS_VALIDOS: string[] = Object.values(PERFIS);

/** Quem vê o financeiro completo do escritório */
export const PERFIS_FINANCEIRO: Perfil[] = [PERFIS.ADMIN, PERFIS.SOCIO, PERFIS.ADVOGADO];

/** Equipe interna (todos menos parceiro externo) */
export const PERFIS_INTERNOS: Perfil[] = [
  PERFIS.ADMIN, PERFIS.SOCIO, PERFIS.ADVOGADO, PERFIS.ASSOCIADO, PERFIS.ESTAGIARIO,
];

/** Advogados internos que gerenciam casos e equipe */
export const PERFIS_GESTAO: Perfil[] = [PERFIS.ADMIN, PERFIS.SOCIO, PERFIS.ADVOGADO];

/** Perfis que precisam do termo de ciência e responsabilidade assinado */
export const PERFIS_EXIGEM_TERMO: Perfil[] = [PERFIS.ASSOCIADO, PERFIS.PARCEIRO];

/** Lê o campo `roles` (string, possivelmente separada por vírgula) e devolve a lista de perfis */
export function perfisDo(user: any): string[] {
  const raw = user?.roles ?? user?.role ?? '';
  const lista = Array.isArray(raw) ? raw : String(raw).split(',');
  return lista.map((r: string) => r.trim().toUpperCase()).filter(Boolean);
}

export function temPerfil(user: any, permitidos: readonly string[]): boolean {
  const meus = perfisDo(user);
  return meus.some((p) => permitidos.includes(p));
}

export function ehParceiro(user: any): boolean {
  const meus = perfisDo(user);
  return meus.includes(PERFIS.PARCEIRO) && !meus.some((p) => PERFIS_INTERNOS.includes(p as Perfil));
}

export function veFinanceiro(user: any): boolean {
  return temPerfil(user, PERFIS_FINANCEIRO);
}

export function ehAdmin(user: any): boolean {
  return temPerfil(user, [PERFIS.ADMIN]);
}
