import { PartOfSpeech } from './part-of-speech.enum';

export interface RawDefinitionEntry {
  partOfSpeech: PartOfSpeech;
  definition: string;
  example?: string;
}
