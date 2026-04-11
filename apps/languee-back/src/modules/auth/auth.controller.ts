import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

type AuthUser = { userId: string; sessionId: string };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Returns a JWT access token', schema: { properties: { accessToken: { type: 'string' } } } })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    const ip = req.ip ?? 'unknown';

    const { accessToken, plainRefreshToken, sessionId } =
      await this.authService.login(dto, userAgent, ip);

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'test',
      sameSite: 'strict' as const,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    };

    res.cookie('refresh_token', plainRefreshToken, cookieOptions);
    res.cookie('session_id', sessionId, cookieOptions);

    return { accessToken };
  }

  @Post('refresh')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Refresh access token using refresh token cookie' })
  @ApiOkResponse({ description: 'Returns a new JWT access token', schema: { properties: { accessToken: { type: 'string' } } } })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid refresh token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const cookies = req.cookies as Record<string, string>;
    const refreshToken = cookies['refresh_token'];
    const sessionId = cookies['session_id'];

    if (!refreshToken || !sessionId) {
      throw new UnauthorizedException('Missing refresh token or session id');
    }

    const { accessToken, plainRefreshToken } = await this.authService.refresh(
      refreshToken,
      sessionId,
    );

    res.cookie('refresh_token', plainRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'test',
      sameSite: 'strict' as const,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });

    return { accessToken };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout current session' })
  @ApiOkResponse({ description: 'Session revoked', schema: { properties: { message: { type: 'string' } } } })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async logout(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    await this.authService.logout(user.sessionId);

    res.clearCookie('refresh_token');
    res.clearCookie('session_id');

    return { message: 'Logged out' };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout all sessions for the current user' })
  @ApiOkResponse({ description: 'All sessions revoked', schema: { properties: { message: { type: 'string' } } } })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    await this.authService.logoutAll(user.userId);

    res.clearCookie('refresh_token');
    res.clearCookie('session_id');

    return { message: 'All sessions revoked' };
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List all active sessions for the current user' })
  @ApiOkResponse({ description: 'List of active sessions', type: [Object] })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async getSessions(@CurrentUser() user: AuthUser): Promise<object[]> {
    return this.authService.getSessions(user.userId);
  }
}
