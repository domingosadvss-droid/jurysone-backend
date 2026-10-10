import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Segredo dos tokens do portal. JWT_PORTAL_SECRET deve estar definido —
 * não usamos fallback para JWT_SECRET para isolar tokens de cliente e advogado.
 */
export function getPortalSecret(): string {
  const secret = process.env.JWT_PORTAL_SECRET;
  if (!secret) {
    throw new UnauthorizedException('Portal authentication is not configured. Please contact support.');
  }
  return secret;
}

@Injectable()
export class PortalAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Token not found');
    }

    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer') {
      throw new UnauthorizedException('Invalid auth scheme');
    }

    const secret = getPortalSecret();

    try {
      const decoded = this.jwtService.verify(token, { secret });

      // Validar que o usuário está ativo
      if (!decoded.ativo) {
        throw new UnauthorizedException('User account is inactive');
      }

      // Validar que é um token de cliente (não advogado)
      if (decoded.userType !== 'CLIENT') {
        throw new UnauthorizedException('Invalid token type for portal access');
      }

      request.client = decoded;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
