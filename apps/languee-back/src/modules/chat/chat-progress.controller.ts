import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { API_V1_PREFIX } from '../core/api-prefix';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { ChatProgressService } from './chat-progress.service';
import { ProgressResponseDto } from './dto/progress-response.dto';
import { serializeProgress } from './serializers/chat.serializer';

@ApiTags('chat')
@ApiBearerAuth('access-token')
@Controller(`${API_V1_PREFIX}/chat`)
@UseGuards(JwtAuthGuard)
export class ChatProgressController {
  constructor(private readonly chatProgressService: ChatProgressService) {}

  @Get('progress')
  @ApiOperation({
    summary:
      "Get the current user's weekly progress on acting on chat analysis suggestions",
  })
  @ApiOkResponse({ type: ProgressResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async getProgress(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ProgressResponseDto> {
    const result = await this.chatProgressService.getProgress(user.userId);
    return serializeProgress(result);
  }
}
