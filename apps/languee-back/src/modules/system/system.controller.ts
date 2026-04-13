import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SystemService } from './system.service';

@ApiTags('system')
@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('env')
  @ApiOperation({ summary: 'Get current environment configuration' })
  getEnv(): Record<string, unknown> {
    return this.systemService.getEnv();
  }
}
