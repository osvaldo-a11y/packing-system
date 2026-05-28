import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class PrintAgentGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.PRINT_AGENT_API_KEY?.trim();
    if (!expected) {
      throw new UnauthorizedException('PRINT_AGENT_API_KEY no configurada en el servidor.');
    }
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const provided =
      req.headers['x-print-agent-key']?.trim() ||
      req.headers['authorization']?.replace(/^Bearer\s+/i, '').trim();
    if (!provided || provided !== expected) {
      throw new UnauthorizedException('Clave de agente de impresión inválida.');
    }
    return true;
  }
}
