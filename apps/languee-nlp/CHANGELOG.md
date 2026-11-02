# Changelog

## [1.0.0](https://github.com/Roquentin97/languee/compare/v0.0.3...v1.0.0) (2026-07-25)


### ⚠ BREAKING CHANGES

* **languee-nlp:** /analyze rejects language values other than 'en' with 400 LANGUAGE_NOT_SUPPORTED; word responses no longer include extra_forms.
* **languee-nlp:** GET /words and GET /expressions are removed; use GET /analyze?text=... instead. Token-count rejections now return 400 "text must contain between 1 and 6 tokens".

### Features

* add nlp service to docker-compose ([566fc0c](https://github.com/Roquentin97/languee/commit/566fc0c251757e97b414a6ce93a2f469991bbef1))
* **cards:** add AnkiDroid export state tracking ([b4dead8](https://github.com/Roquentin97/languee/commit/b4dead8f36f432eb1f6cdb430e99a6794e91ae8f))
* **languee-nlp:** add /version endpoint ([8fd8cd3](https://github.com/Roquentin97/languee/commit/8fd8cd32ffc823f94e4b2f04febd43d3adb075f6))
* **languee-nlp:** add /version endpoint returning service version constant ([ad5b232](https://github.com/Roquentin97/languee/commit/ad5b23267e6b90408b6bd61bc56a74d26e5eda74))
* **languee-nlp:** add context-aware token analysis via POST /words ([9e1eb8d](https://github.com/Roquentin97/languee/commit/9e1eb8d3d4f258a7a579f8639f814aff8697ffe5))
* **languee-nlp:** add context-aware token analysis via POST /words ([870dba3](https://github.com/Roquentin97/languee/commit/870dba36ff48660199115ab46c70a50ad681c169))
* **languee-nlp:** add expressions analysis endpoint ([2c34611](https://github.com/Roquentin97/languee/commit/2c34611cdbc3b9a1b8072b1dc62755a217af3af1))
* **languee-nlp:** add german language support ([41eb96f](https://github.com/Roquentin97/languee/commit/41eb96f8faeda95c71d637fa809c9d8538317e11))
* **languee-nlp:** add GET /words endpoint ([cf0b154](https://github.com/Roquentin97/languee/commit/cf0b1543d033ddc47c5d5aa5e91e774bf0735286))
* **languee-nlp:** add OTel instrumentation, log correlation, and sanitization ([240e2db](https://github.com/Roquentin97/languee/commit/240e2dbdc0400e89560717557100f61e53a20e86))
* **languee-nlp:** add spanish language support with inflections ([a7d7e02](https://github.com/Roquentin97/languee/commit/a7d7e02b5fb77fe6d8e967dc4e115d2a12b475bd))
* **languee-nlp:** add structured debug/info/warn logs to routers and nlp modules ([259bb88](https://github.com/Roquentin97/languee/commit/259bb888011d9d2a2ea3a654c3937a98fa96f2cb))
* **languee-nlp:** add structured JSON logging and Loki-compatible output ([5434e18](https://github.com/Roquentin97/languee/commit/5434e18d8e9fa0113b3099292ac7d42386f860c4))
* **languee-nlp:** add structured JSON logging with Loki-compatible output ([dcf7e40](https://github.com/Roquentin97/languee/commit/dcf7e40b5bccdd126f297e7bbff4972964b33e1f))
* **languee-nlp:** add swagger and bruno ([1137df3](https://github.com/Roquentin97/languee/commit/1137df33ce55830fc73ea2d890a6c584f98d07bd))
* **languee-nlp:** bootstrap FastAPI spaCy NLP service ([3c79048](https://github.com/Roquentin97/languee/commit/3c7904836440950364710bf6dd3c9934eb798a7c))
* **languee-nlp:** extend GET /words with lemmatization, morphology, and inflection ([cf06322](https://github.com/Roquentin97/languee/commit/cf06322a9f2661f14d50ae8d986709c03ec9101a))
* **languee-nlp:** extend GET /words with lemmatization, morphology, and inflection ([755901c](https://github.com/Roquentin97/languee/commit/755901c823febdc019c788891d0d3bfe963d4451))
* **languee-nlp:** hide /words route behind basic auth ([9b9ed56](https://github.com/Roquentin97/languee/commit/9b9ed56b64debd2b27c3fad068db2dc6007ed0b6))
* **languee-nlp:** raise expression bound to 10 tokens and give NLP sole ownership ([c8aafc3](https://github.com/Roquentin97/languee/commit/c8aafc32e214fe69749f9c0646a82d66aa8bfb81))
* **languee-nlp:** replace /words and /expressions with unified /analyze ([e12e699](https://github.com/Roquentin97/languee/commit/e12e699c52ff2037c2a9866360b00911409362cd))
* **languee-nlp:** restrict analysis to English ([123cc79](https://github.com/Roquentin97/languee/commit/123cc795b01a258850ed0a7d097d4b33c48549e6))
* **languee-nlp:** strip separated-object tokens from phrasal-verb canonical ([58f3e4f](https://github.com/Roquentin97/languee/commit/58f3e4fc2fb0030ca38eedd224a36a46a3f9143e))
* **nlp:** refactor words analysis to contextual get ([27d5284](https://github.com/Roquentin97/languee/commit/27d52842f8f9559b3059e373bc71e8fe3cc1ecb5))
* **observability:** add Tempo, Prometheus, Alloy OTLP pipeline, and RED metrics dashboards ([4747a02](https://github.com/Roquentin97/languee/commit/4747a0204481f5edc2c90d0b2e0cc059c0d3ac92))
* **observability:** end-to-end distributed tracing, metrics, and RED dashboards ([a62b350](https://github.com/Roquentin97/languee/commit/a62b3508ddd108f5154a4929c340873aa2af2424))
* standalone MVP — SRS review, green redesign, and language services (no chat/billing) ([96391f1](https://github.com/Roquentin97/languee/commit/96391f1b7308df274fd2e4737e69f18b4536f3e5))


### Bug Fixes

* file missed stashing ([b4cdc2c](https://github.com/Roquentin97/languee/commit/b4cdc2c3d375df9bc4d1b9b06d40f913d1dd4bd5))
* **languee-nlp:** raise token bound to 15 to absorb tokenization spread ([e136eb8](https://github.com/Roquentin97/languee/commit/e136eb860c9d47d20f7d17e85da828bc87b6778d))

## Changelog
