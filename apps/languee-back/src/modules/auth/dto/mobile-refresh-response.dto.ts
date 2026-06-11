import { ApiProperty } from '@nestjs/swagger';

export class MobileRefreshResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  sessionId: string;
}
