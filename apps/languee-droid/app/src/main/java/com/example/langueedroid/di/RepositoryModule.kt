package com.example.langueedroid.di

import com.example.langueedroid.core.data.AnkiDroidExportRepository
import com.example.langueedroid.core.data.AuthRepository
import com.example.langueedroid.core.data.CardRepository
import com.example.langueedroid.core.data.DeckRepository
import com.example.langueedroid.core.data.ReviewRepository
import com.example.langueedroid.core.data.VocabularyRepository
import com.example.langueedroid.core.data.local.AuthSessionStore
import com.example.langueedroid.core.network.AnkiDroidExportApi
import com.example.langueedroid.core.network.AuthApi
import com.example.langueedroid.core.network.CardsApi
import com.example.langueedroid.core.network.DecksApi
import com.example.langueedroid.core.network.ReviewsApi
import com.example.langueedroid.core.network.VocabularyApi
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object RepositoryModule {
    @Provides
    @Singleton
    fun provideAuthRepository(
        authApi: AuthApi,
        sessionStore: AuthSessionStore,
    ): AuthRepository = AuthRepository(authApi = authApi, sessionStore = sessionStore)

    @Provides
    @Singleton
    fun provideDeckRepository(decksApi: DecksApi): DeckRepository = DeckRepository(decksApi = decksApi)

    @Provides
    @Singleton
    fun provideVocabularyRepository(vocabularyApi: VocabularyApi): VocabularyRepository =
        VocabularyRepository(vocabularyApi = vocabularyApi)

    @Provides
    @Singleton
    fun provideCardRepository(cardsApi: CardsApi): CardRepository = CardRepository(cardsApi = cardsApi)

    @Provides
    @Singleton
    fun provideAnkiDroidExportRepository(ankiDroidExportApi: AnkiDroidExportApi): AnkiDroidExportRepository =
        AnkiDroidExportRepository(ankiDroidExportApi = ankiDroidExportApi)

    @Provides
    @Singleton
    fun provideReviewRepository(reviewsApi: ReviewsApi): ReviewRepository = ReviewRepository(reviewsApi = reviewsApi)
}
