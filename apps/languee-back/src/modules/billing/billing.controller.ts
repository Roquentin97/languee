import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { API_V1_PREFIX } from '../core/api-prefix';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { BillingService } from './billing.service';
import {
  BillingNotConfiguredError,
  WebhookSignatureError,
} from './billing.errors';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { CheckoutSessionResponseDto } from './dto/checkout-session-response.dto';
import { PlansResponseDto } from './dto/plans-response.dto';
import { SubscriptionResponseDto } from './dto/subscription-response.dto';
import { WebhookResponseDto } from './dto/webhook-response.dto';
import {
  serializeCheckoutSession,
  serializePlans,
  serializeSubscription,
} from './serializers/billing.serializer';

@ApiTags('billing')
@Controller(`${API_V1_PREFIX}/billing`)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List subscription plans' })
  @ApiOkResponse({ type: PlansResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  getPlans(): PlansResponseDto {
    return serializePlans(this.billingService.getPlans());
  }

  @Post('checkout-session')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a Stripe checkout session for a paid tier' })
  @ApiBody({ type: CreateCheckoutSessionDto })
  @ApiCreatedResponse({ type: CheckoutSessionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiServiceUnavailableResponse({ description: 'Billing is not configured' })
  async createCheckoutSession(
    @Body() dto: CreateCheckoutSessionDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<CheckoutSessionResponseDto> {
    try {
      const session = await this.billingService.createCheckoutSession(
        user.userId,
        dto.tier,
      );
      return serializeCheckoutSession(session);
    } catch (err: unknown) {
      if (err instanceof BillingNotConfiguredError) {
        throw new ServiceUnavailableException({
          message: 'Billing is not configured',
          error: 'BILLING_NOT_CONFIGURED',
        });
      }
      throw err;
    }
  }

  @Get('subscription')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get the current user's subscription state" })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async getSubscription(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SubscriptionResponseDto> {
    const subscription = await this.billingService.getSubscription(user.userId);
    return serializeSubscription(subscription);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stripe webhook endpoint (unauthenticated)' })
  @ApiOkResponse({ type: WebhookResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid webhook signature' })
  @ApiServiceUnavailableResponse({ description: 'Billing is not configured' })
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<WebhookResponseDto> {
    if (req.rawBody === undefined) {
      throw new BadRequestException({
        message: 'Missing raw request body',
        error: 'INVALID_SIGNATURE',
      });
    }

    try {
      return await this.billingService.handleWebhookEvent(
        req.rawBody,
        signature ?? '',
      );
    } catch (err: unknown) {
      if (err instanceof WebhookSignatureError) {
        throw new BadRequestException({
          message: 'Invalid webhook signature',
          error: 'INVALID_SIGNATURE',
        });
      }
      if (err instanceof BillingNotConfiguredError) {
        throw new ServiceUnavailableException({
          message: 'Billing is not configured',
          error: 'BILLING_NOT_CONFIGURED',
        });
      }
      throw err;
    }
  }
}
