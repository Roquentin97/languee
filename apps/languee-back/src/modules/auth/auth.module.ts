import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { StringValue } from 'ms';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MobileAuthController } from './mobile-auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: (cs: ConfigService) => ({
        secret: cs.getOrThrow<string>('auth.jwtSecret'),
        signOptions: {
          expiresIn: cs.getOrThrow<string>('auth.jwtExpiresIn') as StringValue,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, MobileAuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
