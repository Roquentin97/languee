import { Injectable } from '@nestjs/common';
import {
  Definition,
  DefinitionProviderInput,
  IDefinitionProvider,
} from '../interfaces/pipeline.interfaces';

@Injectable()
export class DefinitionProviderStub implements IDefinitionProvider {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  provide(_input: DefinitionProviderInput): Promise<Definition[]> {
    return [
      {
        term: 'stub-term',
        definition: 'A stub definition for testing.',
        examples: ['Stub example sentence.'],
        part_of_speech: 'noun',
        provider: 'stub',
      },
    ];
  }
}
