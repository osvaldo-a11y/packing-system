import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AppRole } from '../roles';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!roles?.length) {
      return true;
    }
    const req = context.switchToHttp().getRequest<{ user?: { role?: string } }>();
    const role = req.user?.role ? String(req.user.role).toLowerCase().trim() : '';
    if (!role || !roles.includes(role as AppRole)) {
      throw new ForbiddenException('Rol no autorizado para esta operación');
    }
    return true;
  }
}
