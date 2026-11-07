/**
 * JURYSONE — Controle de acesso por perfil
 *
 * Roda como interceptor global (depois dos guards de autenticação de cada controller,
 * quando `request.user` já existe). Regras:
 *   1. Rotas sem usuário (públicas, webhooks) passam direto.
 *   2. PARCEIRO é bloqueado em toda rota que não tenha @PermiteParceiro().
 *   3. ASSOCIADO e PARCEIRO sem termo assinado são bloqueados (exceto @PermiteSemTermo()).
 *   4. @Perfis(...) restringe a rota aos perfis listados.
 *   5. ESTAGIARIO e PARCEIRO recebem as respostas sem campos financeiros.
 */
import {
  CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import {
  PERFIS_KEY, PERMITE_PARCEIRO_KEY, PERMITE_SEM_TERMO_KEY,
} from '../decorators/perfis.decorator';
import {
  PERFIS, PERFIS_EXIGEM_TERMO, PERFIS_INTERNOS, Perfil, ehParceiro, perfisDo, temPerfil,
} from '../perfis';

/** Campos financeiros removidos das respostas para quem não vê financeiro */
const CAMPOS_FINANCEIROS = new Set([
  'valorHonorario', 'percentualExito', 'formaPagamento', 'parcelamento', 'numParcelas',
  'vencimento1Parc', 'lancamentosFinanceiros', 'itensRepasse', 'taxaGateway',
  'percentualHonorarios', 'pixChave', 'banco', 'agencia', 'conta',
]);

export function removerCamposFinanceiros(valor: any, profundidade = 0): any {
  if (profundidade > 12 || valor === null || valor === undefined) return valor;
  if (Array.isArray(valor)) return valor.map((v) => removerCamposFinanceiros(v, profundidade + 1));
  if (valor instanceof Date || typeof valor !== 'object') return valor;
  // Decimal do Prisma e Buffers passam intactos
  if (typeof (valor as any).toFixed === 'function' || Buffer.isBuffer(valor)) return valor;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(valor)) {
    if (CAMPOS_FINANCEIROS.has(k)) continue;
    out[k] = removerCamposFinanceiros(v, profundidade + 1);
  }
  return out;
}

@Injectable()
export class PerfilInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    // Portal do cliente usa outro token (sem roles de equipe); não é tratado aqui
    if (!user || user.tipo === 'portal' || user.isPortal) return next.handle();

    const alvo = [context.getHandler(), context.getClass()];
    const permitidos = this.reflector.getAllAndOverride<string[]>(PERFIS_KEY, alvo);
    const permiteParceiro = this.reflector.getAllAndOverride<boolean>(PERMITE_PARCEIRO_KEY, alvo);
    const permiteSemTermo = this.reflector.getAllAndOverride<boolean>(PERMITE_SEM_TERMO_KEY, alvo);

    const meus = perfisDo(user);
    const parceiro = ehParceiro(user);

    if (parceiro && !permiteParceiro) {
      throw new ForbiddenException('Acesso de parceiro restrito aos processos em que participa.');
    }

    const exigeTermo =
      meus.some((p) => PERFIS_EXIGEM_TERMO.includes(p as Perfil)) &&
      !meus.some((p) => [PERFIS.ADMIN, PERFIS.SOCIO, PERFIS.ADVOGADO].includes(p as any));
    if (exigeTermo && !user.termoAceitoEm && !permiteSemTermo) {
      throw new ForbiddenException(
        'Acesso bloqueado até a assinatura do termo de ciência e responsabilidade.',
      );
    }

    if (permitidos && permitidos.length > 0) {
      // PARCEIRO entra quando a rota o libera explicitamente
      const lista = permiteParceiro ? [...permitidos, PERFIS.PARCEIRO] : permitidos;
      if (!temPerfil(user, lista)) {
        throw new ForbiddenException('Seu perfil não tem permissão para esta área.');
      }
    }

    const ocultarFinanceiro =
      parceiro || (meus.includes(PERFIS.ESTAGIARIO) && !meus.some((p) =>
        [PERFIS.ADMIN, PERFIS.SOCIO, PERFIS.ADVOGADO, PERFIS.ASSOCIADO].includes(p as any)));

    if (!ocultarFinanceiro) return next.handle();
    return next.handle().pipe(map((data) => removerCamposFinanceiros(data)));
  }
}

export { PERFIS_INTERNOS };
