import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
export declare class AuthController {
    private readonly auth;
    constructor(auth: AuthService);
    login(dto: LoginDto): {
        access_token: string;
        token_type: string;
        expires_in: string;
    };
    health(): {
        status: string;
        service: string;
    };
}
