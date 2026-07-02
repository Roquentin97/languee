import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../core/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { StripePaymentAdapter } from './adapters/stripe-payment.adapter';
import { NullPaymentProvider } from './adapters/null-payment.adapter';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { PAYMENT_PROVIDER } from './billing.tokens';
import type { IPaymentProvider } from './interfaces/payment-provider.interface';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule],
  providers: [
    StripePaymentAdapter,
    NullPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (
        config: ConfigService,
        stripeAdapter: StripePaymentAdapter,
        nullProvider: NullPaymentProvider,
      ): IPaymentProvider => {
        const secretKey = config.get<string>('billing.stripeSecretKey');
        const webhookSecret = config.get<string>('billing.stripeWebhookSecret');
        const pricePlus = config.get<string>('billing.stripePricePlus');
        const pricePro = config.get<string>('billing.stripePricePro');
        const isConfigured = Boolean(
          secretKey && webhookSecret && pricePlus && pricePro,
        );
        return isConfigured ? stripeAdapter : nullProvider;
      },
      inject: [ConfigService, StripePaymentAdapter, NullPaymentProvider],
    },
    BillingService,
  ],
  controllers: [BillingController],
  exports: [BillingService],
})
export class BillingModule {}
