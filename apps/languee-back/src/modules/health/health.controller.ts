import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
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

  @Get('version')
  @ApiOperation({ summary: 'Get application version' })
  @ApiOkResponse({
    description: 'Returns the application version and build commit',
    schema: {
      example: { version: '1.0.0', commit: 'abc1234' },
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
