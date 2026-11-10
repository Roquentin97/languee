import { Module } from '@nestjs/common';
import { VocabularyModule } from './vocabulary/vocabulary.module';
import { CardsModule } from './cards/cards.module';
import { DecksModule } from './decks/decks.module';
import { ReviewsModule } from './reviews/reviews.module';
import { AnkiDroidExportsModule } from './exports/ankidroid/ankidroid-exports.module';

@Module({
  imports: [
    VocabularyModule,
    CardsModule,
    DecksModule,
    ReviewsModule,
    AnkiDroidExportsModule,
  ],
})
export class LearningModule {}
