import { ApiProperty } from '@nestjs/swagger';

class MobileLoginUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;
}

export class MobileLoginResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  sessionId: string;

  @ApiProperty({ type: MobileLoginUserDto })
  user: { id: string; email: string };
}
