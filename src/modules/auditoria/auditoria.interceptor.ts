import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AcaoAuditoria, AuditoriaService, contextoDa } from './auditoria.service';

/**
 * Registra na auditoria toda operação de usuário logado:
 *   POST sem :id → INCLUSAO · POST com :id → ACAO (cumprir, enviar, assinar…) · PATCH/PUT → ALTERACAO
 *   DELETE → EXCLUSAO · GET de um registro (/:id) → VISUALIZACAO (quem abriu qual cliente/processo).
 * Listagens não são registradas (seriam milhares por dia). Login, logout e senha são gravados
 * pelo AuthService, porque nessas rotas ainda não há usuário identificado.
 * Tentativas que falham (erro de validação, permissão negada) também ficam registradas.
 */
const ROTAS_IGNORADAS = [/^\/api\/auth\//, /^\/api\/auditoria/, /^\/api\/health/, /^\/api\/notifica/];

@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  constructor(private readonly auditoria: AuditoriaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    const metodo = String(req?.method ?? '').toUpperCase();
    const caminho = String(req?.originalUrl ?? req?.url ?? '').split('?')[0];
    const rota: string = req?.route?.path ?? caminho;
    const temId = /:[A-Za-z]*[iI]d\b|:id\b/.test(rota);

    let acao: AcaoAuditoria | null = null;
    if (metodo === 'DELETE') acao = 'EXCLUSAO';
    else if (metodo === 'PATCH' || metodo === 'PUT') acao = 'ALTERACAO';
    else if (metodo === 'POST') acao = temId ? 'ACAO' : 'INCLUSAO';
    else if (metodo === 'GET' && temId) acao = 'VISUALIZACAO';

    if (!acao || !user?.id || ROTAS_IGNORADAS.some((r) => r.test(caminho))) return next.handle();

    const escritorioId = user.officeId ?? user.escritorioId;
    const tipoEntidade = caminho.replace(/^\/api\/?/, '').split('/')[0] || null;
    const ctx = contextoDa(req);
    const base = {
      metodo, rota: `${metodo} ${caminho}`,
      ...(acao !== 'VISUALIZACAO' && req.body && Object.keys(req.body).length ? { dados: req.body } : {}),
    };
    const gravar = (sucesso: boolean, extra: Record<string, any>, idResposta?: string) =>
      this.auditoria.registrar({
        escritorioId, usuarioId: user.id, acao, tipoEntidade,
        idEntidade: req.params?.id ?? idResposta ?? null, ctx,
        detalhes: { ...base, sucesso, ...extra },
      });

    return next.handle().pipe(
      tap({
        next: (resposta: any) => {
          const id = resposta && typeof resposta === 'object' && !Array.isArray(resposta) ? resposta.id : undefined;
          void gravar(true, {}, id ? String(id) : undefined);
        },
        error: (e: any) => {
          void gravar(false, { erro: String(e?.response?.message ?? e?.message ?? 'erro').slice(0, 300), status: e?.status ?? 500 });
        },
      }),
    );
  }
}
