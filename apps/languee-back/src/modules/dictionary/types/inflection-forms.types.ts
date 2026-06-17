import type { ApiPropertyOptions } from '@nestjs/swagger';

export type AdjectiveInflections = {
  type: 'adjective';
  positive: string;
  comparative?: string;
  superlative?: string;
};

export type VerbInflections = {
  type: 'verb';
  base: string;
  past?: string;
  present3sg?: string;
  presentNon3sg?: string;
  pastParticiple?: string;
  gerundParticiple?: string;
};

export type NounInflections = {
  type: 'noun';
  singular?: string;
  plural?: string;
};

export type InflectionForms =
  | AdjectiveInflections
  | VerbInflections
  | NounInflections;

export const INFLECTION_FORMS_SWAGGER: ApiPropertyOptions = {
  nullable: true,
  oneOf: [
    {
      type: 'object',
      required: ['type', 'positive'],
      properties: {
        type: { type: 'string', enum: ['adjective'] },
        positive: { type: 'string', example: 'good' },
        comparative: { type: 'string', example: 'better' },
        superlative: { type: 'string', example: 'best' },
      },
    },
    {
      type: 'object',
      required: ['type', 'base'],
      properties: {
        type: { type: 'string', enum: ['verb'] },
        base: { type: 'string', example: 'see' },
        past: { type: 'string', example: 'saw' },
        present3sg: { type: 'string', example: 'sees' },
        presentNon3sg: { type: 'string', example: 'see' },
        pastParticiple: { type: 'string', example: 'seen' },
        gerundParticiple: { type: 'string', example: 'seeing' },
      },
    },
    {
      type: 'object',
      required: ['type'],
      properties: {
        type: { type: 'string', enum: ['noun'] },
        singular: { type: 'string', example: 'owl' },
        plural: { type: 'string', example: 'owls' },
      },
    },
  ],
  discriminator: { propertyName: 'type' },
};
