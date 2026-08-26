import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { AppRole } from '../../common/roles';
import type { JwtUserPayload } from './jwt.strategy';

type AuthUserRecord = {
  username: string;
  role: AppRole;
  /** Solo desarrollo / migración; en producción preferir `passwordHash`. */
  password?: string;
  /** Hash bcrypt (recomendado en producción). */
  passwordHash?: string;
};

const DEFAULT_USERS: AuthUserRecord[] = [
  { username: 'admin', password: 'admin123', role: 'admin' },
  { username: 'supervisor', password: 'sup123', role: 'supervisor' },
  { username: 'operator', password: 'op123', role: 'operator' },
  { username: 'viewer', password: 'view123', role: 'viewer' },
  { username: 'demo', password: 'demo123', role: 'viewer' },
];

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  private loadUsers(): AuthUserRecord[] {
    const raw = process.env.AUTH_USERS_JSON || JSON.stringify(DEFAULT_USERS);
    let users: AuthUserRecord[] = [];
    try {
      users = JSON.parse(raw) as AuthUserRecord[];
    } catch {
      users = [];
    }

    return this.ensureDemoUser(users);
  }

  /**
   * Usuario demo de solo lectura (rol viewer): recorre el sistema sin grabar.
   * Se agrega si falta, sin reemplazar usuarios ya definidos en AUTH_USERS_JSON.
   * Desactivar: DEMO_USER_ENABLED=false
   */
  private ensureDemoUser(users: AuthUserRecord[]): AuthUserRecord[] {
    if (process.env.DEMO_USER_ENABLED === 'false') return users;

    const username = (process.env.DEMO_USERNAME || 'demo').trim() || 'demo';
    if (users.some((u) => u.username === username)) return users;

    const passwordHash = process.env.DEMO_PASSWORD_HASH?.trim();
    const password = process.env.DEMO_PASSWORD?.trim() || 'demo123';

    const demo: AuthUserRecord = {
      username,
      role: 'viewer',
      ...(passwordHash ? { passwordHash } : { password }),
    };
    return [...users, demo];
  }

  async validateUser(username: string, password: string): Promise<JwtUserPayload> {
    const u = username.trim();
    const p = password.trim();
    const users = this.loadUsers();
    const found = users.find((x) => x.username === u);
    if (!found) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    let valid = false;
    if (found.passwordHash) {
      valid = await bcrypt.compare(p, found.passwordHash);
    } else if (found.password !== undefined) {
      valid = found.password === p;
    }

    if (!valid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return {
      sub: found.username,
      username: found.username,
      role: found.role,
    };
  }

  login(payload: JwtUserPayload) {
    const access_token = this.jwtService.sign({
      sub: payload.sub,
      username: payload.username,
      role: payload.role,
    });
    return {
      access_token,
      token_type: 'Bearer',
      expires_in: process.env.JWT_EXPIRES_IN || '8h',
    };
  }
}
