import { PartOfSpeech } from '../../vocabulary/enums/part-of-speech.enum';

export function mapSpacyPos(raw: string): PartOfSpeech | null {
  switch (raw) {
    case 'NOUN':
    case 'PROPN':
      return PartOfSpeech.NOUN;
    case 'VERB':
    case 'AUX':
      return PartOfSpeech.VERB;
    case 'ADJ':
      return PartOfSpeech.ADJECTIVE;
    case 'ADV':
      return PartOfSpeech.ADVERB;
    case 'PRON':
      return PartOfSpeech.PRONOUN;
    case 'ADP':
      return PartOfSpeech.PREPOSITION;
    case 'CCONJ':
    case 'SCONJ':
      return PartOfSpeech.CONJUNCTION;
    case 'INTJ':
      return PartOfSpeech.INTERJECTION;
    default:
      return null;
  }
}
