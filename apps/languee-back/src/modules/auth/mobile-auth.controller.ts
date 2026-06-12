import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { MobileLoginResponseDto } from './dto/mobile-login-response.dto';
import { MobileLogoutRequestDto } from './dto/mobile-logout-request.dto';
import { MobileRefreshRequestDto } from './dto/mobile-refresh-request.dto';
import { MobileRefreshResponseDto } from './dto/mobile-refresh-response.dto';
import { MobileRegisterResponseDto } from './dto/mobile-register-response.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

type AuthUser = { userId: string; sessionId: string };

@ApiTags('auth-mobile')
@Controller('auth/mobile')
export class MobileAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @HttpCode(201)
  @ApiOperation({ summary: 'Register a new account (mobile)' })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ type: MobileRegisterResponseDto })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
  ): Promise<MobileRegisterResponseDto> {
    await this.authService.register(dto);
    const userAgent = (req.headers['user-agent'] as string) ?? 'unknown';
    const ip = req.ip ?? 'unknown';
    const { accessToken, plainRefreshToken, sessionId, userId, email } =
      await this.authService.loginMobile(dto, userAgent, ip);
    return {
      accessToken,
      refreshToken: plainRefreshToken,
      sessionId,
      user: { id: userId, email },
    };
  }

  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @HttpCode(200)
  @ApiOperation({ summary: 'Login (mobile)' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: MobileLoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<MobileLoginResponseDto> {
    const userAgent = (req.headers['user-agent'] as string) ?? 'unknown';
    const ip = req.ip ?? 'unknown';
    const { accessToken, plainRefreshToken, sessionId, userId, email } =
      await this.authService.loginMobile(dto, userAgent, ip);
    return {
      accessToken,
      refreshToken: plainRefreshToken,
      sessionId,
      user: { id: userId, email },
    };
  }

  @Post('refresh')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @HttpCode(200)
  @ApiOperation({ summary: 'Refresh access token (mobile)' })
  @ApiBody({ type: MobileRefreshRequestDto })
  @ApiOkResponse({ type: MobileRefreshResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid refresh token' })
  async refresh(
    @Body() dto: MobileRefreshRequestDto,
  ): Promise<MobileRefreshResponseDto> {
    const { accessToken, plainRefreshToken } = await this.authService.refresh(
      dto.refreshToken,
      dto.sessionId,
    );
    return {
      accessToken,
      refreshToken: plainRefreshToken,
      sessionId: dto.sessionId,
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Logout current session (mobile)' })
  @ApiBody({ type: MobileLogoutRequestDto })
  @ApiOkResponse({ schema: { properties: { message: { type: 'string' } } } })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async logout(@CurrentUser() user: AuthUser): Promise<{ message: string }> {
    await this.authService.logout(user.sessionId);
    return { message: 'Logged out' };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Logout all sessions (mobile)' })
  @ApiOkResponse({ schema: { properties: { message: { type: 'string' } } } })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async logoutAll(@CurrentUser() user: AuthUser): Promise<{ message: string }> {
    await this.authService.logoutAll(user.userId);
    return { message: 'Logged out from all sessions' };
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(200)
  @ApiOperation({ summary: 'List active sessions (mobile)' })
  @ApiOkResponse({ description: 'List of active sessions', type: [Object] })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async getSessions(@CurrentUser() user: AuthUser): Promise<object[]> {
    return this.authService.getSessions(user.userId);
  }
}
