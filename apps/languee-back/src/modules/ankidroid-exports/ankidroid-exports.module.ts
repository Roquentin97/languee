import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CardsModule } from '../cards/cards.module';
import { AnkiDroidExportsController } from './ankidroid-exports.controller';
import { AnkiDroidExportsService } from './ankidroid-exports.service';

@Module({
  imports: [AuthModule, CardsModule],
  providers: [AnkiDroidExportsService],
  controllers: [AnkiDroidExportsController],
})
export class AnkiDroidExportsModule {}
