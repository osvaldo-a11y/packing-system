import { JwtService } from '@nestjs/jwt';
import type { JwtUserPayload } from './jwt.strategy';
export declare class AuthService {
    private readonly jwtService;
    constructor(jwtService: JwtService);
    private loadUsers;
    validateUser(username: string, password: string): JwtUserPayload;
    login(payload: JwtUserPayload): {
        access_token: string;
        token_type: string;
        expires_in: string;
    };
}
