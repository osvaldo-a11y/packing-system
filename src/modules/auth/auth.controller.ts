import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    const user = this.auth.validateUser(dto.username, dto.password);
    return this.auth.login(user);
  }

  @Get('health')
  health() {
    return { status: 'ok', service: 'packing-system' };
  }
}
