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

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  private loadUsers(): AuthUserRecord[] {
    const raw =
      process.env.AUTH_USERS_JSON ||
      JSON.stringify([
        { username: 'admin', password: 'admin123', role: 'admin' },
        { username: 'supervisor', password: 'sup123', role: 'supervisor' },
        { username: 'operator', password: 'op123', role: 'operator' },
      ]);
    try {
      return JSON.parse(raw) as AuthUserRecord[];
    } catch {
      return [];
    }
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
