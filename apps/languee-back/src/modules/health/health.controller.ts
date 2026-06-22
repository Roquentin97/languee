import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { API_V1_PREFIX } from '../core/api-prefix';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller(API_V1_PREFIX)
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

  @Get('version')
  @ApiOperation({ summary: 'Get application version' })
  @ApiOkResponse({
    description: 'Returns the application version',
    schema: {
      example: { version: '0.0.1' },
      properties: {
        version: { type: 'string' },
      },
      required: ['version'],
      type: 'object',
    },
  })
  getVersion(): { version: string } {
    return this.healthService.getVersion();
  }
}
