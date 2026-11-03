import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  @ApiOkResponse({
    description: 'Returns service health status',
    schema: {
      example: { success: true },
      properties: {
        success: { type: 'boolean' },
      },
      required: ['success'],
      type: 'object',
    },
  })
  getHello(): { success: boolean } {
    return this.healthService.getHello();
  }

  @Get('health/live')
  @ApiOperation({ summary: 'Process liveness check' })
  @ApiOkResponse({
    description: 'The API process can respond to requests',
    schema: { example: { status: 'ok' } },
  })
  getLive(): { status: 'ok' } {
    return this.healthService.getLive();
  }

  @Get('health/ready')
  @ApiOperation({ summary: 'Dependency readiness check' })
  @ApiOkResponse({
    description: 'PostgreSQL, Redis, and NLP are ready',
    schema: { example: { status: 'ok' } },
  })
  @ApiServiceUnavailableResponse({
    description: 'A required dependency is unavailable',
    schema: { example: { status: 'unavailable' } },
  })
  async getReady(): Promise<{ status: 'ok' }> {
    if (await this.healthService.isReady()) {
      return { status: 'ok' };
    }

    throw new ServiceUnavailableException({ status: 'unavailable' });
  }

  @Get('version')
  @ApiOperation({ summary: 'Get application version' })
  @ApiOkResponse({
    description: 'Returns the application version and build commit',
    schema: {
      example: {
        version: '0.1.123001',
        commit: '0123456789abcdef0123456789abcdef01234567',
      },
      properties: {
        version: { type: 'string' },
        commit: { type: 'string' },
      },
      required: ['version', 'commit'],
      type: 'object',
    },
  })
  getVersion(): { version: string; commit: string } {
    return this.healthService.getVersion();
  }
}
