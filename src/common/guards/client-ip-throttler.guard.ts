import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Limitador de requisições por IP real do cliente.
 * Em produção o tráfego passa por Cloudflare → Render; o Cloudflare informa o IP
 * de origem em CF-Connecting-IP. Sem ele, cai no IP resolvido pelo Express (trust proxy).
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const cfIp = req.headers?.['cf-connecting-ip'];
    if (typeof cfIp === 'string' && cfIp) return cfIp;
    return req.ips?.length ? req.ips[0] : req.ip;
  }
}
