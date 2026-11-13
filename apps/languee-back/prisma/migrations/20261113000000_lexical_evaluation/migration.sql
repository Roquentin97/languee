-- CreateEnum
CREATE TYPE "EvalDisagreementOutcome" AS ENUM ('resolved_override', 'unresolved');

-- CreateEnum
CREATE TYPE "EvalDisagreementReason" AS ENUM ('unique_pos_candidate', 'no_pos_candidate', 'multiple_pos_candidates');

-- CreateTable
CREATE TABLE "eval_lexical_lookups" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "context" TEXT,
    "selection_start" INTEGER,
    "selection_end" INTEGER,
    "nlp_lemma" TEXT,
    "nlp_pos" TEXT,
    "nlp_model_version" TEXT NOT NULL,
    "ranking_policy_version" TEXT NOT NULL,
    "candidates" JSONB NOT NULL,
    "preferred_word_id" UUID,
    "preferred_pos" TEXT,

    CONSTRAINT "eval_lexical_lookups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_lexical_dictionary_disagreements" (
    "lookup_id" UUID NOT NULL,
    "outcome" "EvalDisagreementOutcome" NOT NULL,
    "reason" "EvalDisagreementReason" NOT NULL,

    CONSTRAINT "eval_lexical_dictionary_disagreements_pkey" PRIMARY KEY ("lookup_id")
);

-- CreateTable
CREATE TABLE "eval_lexical_learner_choices" (
    "lookup_id" UUID NOT NULL,
    "chosen_definition_id" UUID NOT NULL,
    "chosen_word_id" UUID NOT NULL,
    "chosen_lemma" TEXT NOT NULL,
    "chosen_pos" TEXT NOT NULL,

    CONSTRAINT "eval_lexical_learner_choices_pkey" PRIMARY KEY ("lookup_id")
);

-- AddForeignKey
ALTER TABLE "eval_lexical_lookups" ADD CONSTRAINT "eval_lexical_lookups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_lexical_dictionary_disagreements" ADD CONSTRAINT "eval_lexical_dictionary_disagreements_lookup_id_fkey" FOREIGN KEY ("lookup_id") REFERENCES "eval_lexical_lookups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_lexical_learner_choices" ADD CONSTRAINT "eval_lexical_learner_choices_lookup_id_fkey" FOREIGN KEY ("lookup_id") REFERENCES "eval_lexical_lookups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "eval_lexical_lookups" ADD CONSTRAINT "eval_lookup_selection_pair" CHECK (("selection_start" IS NULL) = ("selection_end" IS NULL));
ALTER TABLE "eval_lexical_lookups" ADD CONSTRAINT "eval_lookup_preferred_pair" CHECK (("preferred_word_id" IS NULL) = ("preferred_pos" IS NULL));
ALTER TABLE "eval_lexical_lookups" ADD CONSTRAINT "eval_lookup_preferred_in_candidates" CHECK ("preferred_word_id" IS NULL OR "candidates" @> jsonb_build_array(jsonb_build_object('wordId', "preferred_word_id"::text, 'partOfSpeech', "preferred_pos")));
