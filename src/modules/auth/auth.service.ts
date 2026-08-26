import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { AppRole } from '../../common/roles';
import { ROLES } from '../../common/roles';
import type { JwtUserPayload } from './jwt.strategy';

type AuthUserRecord = {
  username: string;
  role: AppRole;
  /** Solo desarrollo / migración; en producción preferir `passwordHash`. */
  password?: string;
  /** Hash bcrypt (recomendado en producción). */
  passwordHash?: string;
};

export type PublicDemoInfo = {
  enabled: boolean;
  /** BD/entorno aislado para prospectos (pueden grabar). */
  sandbox: boolean;
  writable: boolean;
  username: string;
  password?: string;
  role: AppRole;
};

const DEFAULT_USERS: AuthUserRecord[] = [
  { username: 'admin', password: 'admin123', role: 'admin' },
  { username: 'supervisor', password: 'sup123', role: 'supervisor' },
  { username: 'operator', password: 'op123', role: 'operator' },
  { username: 'viewer', password: 'view123', role: 'viewer' },
  { username: 'demo', password: 'demo123', role: 'viewer' },
];

const ROLE_SET = new Set<string>(Object.values(ROLES));

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  /** Entorno demo de ventas: datos propios, sin tocar producción. */
  isDemoSandbox(): boolean {
    return process.env.DEMO_SANDBOX === 'true';
  }

  getDemoUsername(): string {
    return (process.env.DEMO_USERNAME || 'demo').trim() || 'demo';
  }

  getDemoPasswordPlain(): string {
    return process.env.DEMO_PASSWORD?.trim() || 'demo123';
  }

  getDemoUserRole(): AppRole {
    if (!this.isDemoSandbox()) return ROLES.VIEWER;
    const raw = (process.env.DEMO_USER_ROLE || 'admin').trim().toLowerCase();
    if (ROLE_SET.has(raw)) return raw as AppRole;
    return ROLES.ADMIN;
  }

  getPublicDemoInfo(): PublicDemoInfo {
    const enabled = process.env.DEMO_USER_ENABLED !== 'false';
    const sandbox = this.isDemoSandbox();
    const role = this.getDemoUserRole();
    const showCreds = process.env.DEMO_SHOW_CREDENTIALS !== 'false';
    return {
      enabled,
      sandbox,
      writable: sandbox && role !== ROLES.VIEWER,
      username: this.getDemoUsername(),
      password: showCreds ? this.getDemoPasswordPlain() : undefined,
      role,
    };
  }

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
   * Usuario demo: en producción (sin DEMO_SANDBOX) = viewer solo lectura.
   * En sandbox de ventas (DEMO_SANDBOX=true) = admin/operator según DEMO_USER_ROLE.
   * Desactivar: DEMO_USER_ENABLED=false
   */
  private ensureDemoUser(users: AuthUserRecord[]): AuthUserRecord[] {
    if (process.env.DEMO_USER_ENABLED === 'false') return users;

    const username = this.getDemoUsername();
    const role = this.getDemoUserRole();
    const passwordHash = process.env.DEMO_PASSWORD_HASH?.trim();
    const password = this.getDemoPasswordPlain();
    const demo: AuthUserRecord = {
      username,
      role,
      ...(passwordHash ? { passwordHash } : { password }),
    };

    const idx = users.findIndex((u) => u.username === username);
    if (idx >= 0) {
      // En sandbox forzamos rol escribible aunque AUTH_USERS_JSON diga viewer.
      if (this.isDemoSandbox()) {
        const next = users.slice();
        next[idx] = { ...users[idx], role, ...(passwordHash ? { passwordHash } : {}) };
        if (!passwordHash && users[idx].password == null && users[idx].passwordHash == null) {
          next[idx].password = password;
        }
        return next;
      }
      return users;
    }

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
      demo_sandbox: this.isDemoSandbox(),
    };
  }
}
