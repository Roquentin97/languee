import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

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
    return this.appService.getHello();
  }
}
