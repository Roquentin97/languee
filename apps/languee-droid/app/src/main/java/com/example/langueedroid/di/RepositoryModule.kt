package com.example.langueedroid.di

import com.example.langueedroid.data.AnkiDroidExportRepository
import com.example.langueedroid.data.AuthRepository
import com.example.langueedroid.data.CardRepository
import com.example.langueedroid.data.DeckRepository
import com.example.langueedroid.data.VocabularyRepository
import com.example.langueedroid.data.local.AuthSessionStore
import com.example.langueedroid.data.remote.AnkiDroidExportApi
import com.example.langueedroid.data.remote.AuthApi
import com.example.langueedroid.data.remote.CardsApi
import com.example.langueedroid.data.remote.DecksApi
import com.example.langueedroid.data.remote.VocabularyApi
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
}
