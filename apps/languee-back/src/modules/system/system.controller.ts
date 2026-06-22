import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { API_V1_PREFIX } from '../core/api-prefix';
import { SystemService } from './system.service';

@ApiTags('system')
@Controller(`${API_V1_PREFIX}/system`)
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('env')
  @ApiOperation({ summary: 'Get current environment configuration' })
  @ApiOkResponse({
    description: 'Current environment configuration',
    schema: {
      type: 'object',
      additionalProperties: true,
      example: { nodeEnv: 'development' },
    },
  })
  getEnv(): Record<string, unknown> {
    return this.systemService.getEnv();
  }
}
