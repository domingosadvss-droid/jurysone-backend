import { Prisma } from '@prisma/client';
import { PERFIS, ehParceiro, perfisDo } from '../../common/perfis';

/**
 * Quem vê quais publicações (decisões 96, 113 e 114):
 *   ADMIN (titular): tudo do escritório + particulares de parceiro só quando houve coincidência;
 *   SOCIO / ADVOGADO / ESTAGIARIO: tudo do escritório, sem os particulares de parceiro;
 *   ASSOCIADO e PARCEIRO: só aquelas em que a OAB deles foi intimada.
 */
export function filtroPublicacoes(user: any): Prisma.IntimacaoWhereInput {
  const escritorioId = user.officeId;
  const p = perfisDo(user);
  const gestao = p.some((x) => [PERFIS.ADMIN, PERFIS.SOCIO, PERFIS.ADVOGADO].includes(x as any));
  if (ehParceiro(user) || (p.includes(PERFIS.ASSOCIADO) && !gestao)) {
    return { escritorioId, intimadosIds: { has: user.id } };
  }
  if (p.includes(PERFIS.ADMIN)) {
    return { escritorioId, OR: [{ particular: false }, { particular: true, NOT: { coincidencias: { equals: Prisma.DbNull } } }] };
  }
  return { escritorioId, particular: false };
}
