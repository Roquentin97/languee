import { Injectable } from '@nestjs/common';
import {
  IDefinitionProvider,
  LemmatizedOutput,
  Definition,
} from '../interfaces/pipeline.interfaces';

@Injectable()
export class DefinitionProviderStub implements IDefinitionProvider {
  provide(_input: LemmatizedOutput): Definition[] {
    return [
      {
        term: 'stub-term',
        definition: 'A stub definition for testing.',
        examples: ['Stub example sentence.'],
      },
    ];
  }
}
