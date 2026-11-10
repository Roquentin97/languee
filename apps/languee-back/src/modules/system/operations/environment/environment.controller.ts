import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EnvironmentService } from './environment.service';

@ApiTags('system')
@Controller('system')
export class EnvironmentController {
  constructor(private readonly systemService: EnvironmentService) {}

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
