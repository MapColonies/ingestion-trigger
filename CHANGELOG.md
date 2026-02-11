# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [4.1.1](https://github.com/MapColonies/ingestion-trigger/compare/v4.1.0...v4.1.1) (2026-02-11)


### Bug Fixes

* dockerfile didnt include gdal ([#75](https://github.com/MapColonies/ingestion-trigger/issues/75)) ([82c5b06](https://github.com/MapColonies/ingestion-trigger/commit/82c5b062ae6d4ad9a52f1e8fdd300abfb7c499af))

## [4.1.0](https://github.com/MapColonies/ingestion-trigger/compare/v4.0.0...v4.1.0) (2026-02-11)


### Features

* upgrade node to 24 and update workflows (MAPCO-7224) ([#63](https://github.com/MapColonies/ingestion-trigger/issues/63)) ([aa85126](https://github.com/MapColonies/ingestion-trigger/commit/aa85126316108ba63db23774da706ecbdb71f30e))

## [4.0.0](https://github.com/MapColonies/ingestion-trigger/compare/v4.0.0-alpha.6...v4.0.0) (2026-02-08)


### Features

* added abort api endpoint (MAPCO-8328) ([#59](https://github.com/MapColonies/ingestion-trigger/issues/59)) ([345d894](https://github.com/MapColonies/ingestion-trigger/commit/345d894e5df36cd248819989271fe106439196d5))


### Bug Fixes

* fix validaiton table deletion (MAPCO-9740) ([#62](https://github.com/MapColonies/ingestion-trigger/issues/62)) ([444db18](https://github.com/MapColonies/ingestion-trigger/commit/444db1884c082f484d10320db4b691757d7f8255))
* update helm labels to match selector for mclabels integration ([#58](https://github.com/MapColonies/ingestion-trigger/issues/58)) ([0199724](https://github.com/MapColonies/ingestion-trigger/commit/019972455aef02dbe2ce7c488a2b622217b7953e))

## [4.0.0-alpha.2](https://github.com/MapColonies/ingestion-trigger/compare/v4.0.0-alpha.1...v4.0.0-alpha.2) (2025-11-16)


### Bug Fixes

* change validations task name to validation ([#40](https://github.com/MapColonies/ingestion-trigger/issues/40)) ([d7c6bad](https://github.com/MapColonies/ingestion-trigger/commit/d7c6bad67c6b5856db97e5fda9f6e39e9ab7c7a7))


## [4.0.0-alpha.1](https://github.com/MapColonies/ingestion-trigger/compare/v3.2.5...v4.0.0-alpha.1) (2025-11-13)


### ⚠ BREAKING CHANGES

* ingestion api(MAPCO-8326) ([#36](https://github.com/MapColonies/ingestion-trigger/issues/36)) ([b222166](https://github.com/MapColonies/ingestion-trigger/commit/b2221663913b7aa367cf85f29b08cb29221d4f42))

## [3.2.5](https://github.com/MapColonies/ingestion-trigger/compare/v3.2.4...v3.2.5) (2025-02-24)


### Bug Fixes

* removing max_old_space_size from Dockerfile ([#34](https://github.com/MapColonies/ingestion-trigger/issues/34)) ([50a0cd8](https://github.com/MapColonies/ingestion-trigger/commit/50a0cd8762eca8c8caecc93adcfbc4d5f1300fde))

## [3.2.4](https://github.com/MapColonies/ingestion-trigger/compare/v3.2.3...v3.2.4) (2025-02-18)


### Bug Fixes

* manifest version ([#30](https://github.com/MapColonies/ingestion-trigger/issues/30)) ([8760088](https://github.com/MapColonies/ingestion-trigger/commit/876008863ecff4c3cca7174af05b3f52ee8f9d1d))

### [3.2.3](https://github.com/MapColonies/ingestion-trigger/compare/v3.2.2...v3.2.3) (2024-11-21)


### Bug Fixes

* id in put request added format: uuid ([#26](https://github.com/MapColonies/ingestion-trigger/issues/26)) ([ecedd13](https://github.com/MapColonies/ingestion-trigger/commit/ecedd13bbdfca873644752313d04d786ee08104a))

### [3.2.2](https://github.com/MapColonies/ingestion-trigger/compare/v3.2.1...v3.2.2) (2024-11-05)


### Bug Fixes

* add footprint to additionalParams in update/swap(MAPCO-5165) ([#25](https://github.com/MapColonies/ingestion-trigger/issues/25)) ([71e77b4](https://github.com/MapColonies/ingestion-trigger/commit/71e77b4a7531189ef4ff2bb6b803b60fe02e23b3))

### [3.2.1](https://github.com/MapColonies/ingestion-trigger/compare/v3.2.0...v3.2.1) (2024-11-03)


### Bug Fixes

* change pixelSize retrieval(MAPCO-5110) ([#24](https://github.com/MapColonies/ingestion-trigger/issues/24)) ([bd26dd6](https://github.com/MapColonies/ingestion-trigger/commit/bd26dd6e6775a0bf95245b01f39461c34687542a))
* fix file explorer ([#23](https://github.com/MapColonies/ingestion-trigger/issues/23)) ([0c69873](https://github.com/MapColonies/ingestion-trigger/commit/0c698730f96d6477ab1c5416308adf5c7c970162))

## [3.2.0](https://github.com/MapColonies/ingestion-trigger/compare/v3.1.0...v3.2.0) (2024-10-29)


### Features

* add productName and type to update job(MAPCO-5092) ([#22](https://github.com/MapColonies/ingestion-trigger/issues/22)) ([8867028](https://github.com/MapColonies/ingestion-trigger/commit/88670283662f26551374d2c726adcdd114826697))

## [3.1.0](https://github.com/MapColonies/ingestion-trigger/compare/v3.0.2...v3.1.0) (2024-10-27)


### Features

* add jobTrackerUrl to additionalParams (MAPCO-5054) ([#21](https://github.com/MapColonies/ingestion-trigger/issues/21)) ([8a17dbf](https://github.com/MapColonies/ingestion-trigger/commit/8a17dbffa8028f279aea886f8c76dc4b9a797540))


### Bug Fixes

* partData to partsData ([#20](https://github.com/MapColonies/ingestion-trigger/issues/20)) ([e09bec6](https://github.com/MapColonies/ingestion-trigger/commit/e09bec65f0746717e1eb459ecca2dbb8a8968077))

### [3.0.2](https://github.com/MapColonies/ingestion-trigger/compare/v3.0.1...v3.0.2) (2024-10-20)


### Bug Fixes

* switch additionalParams between swapUpdate and update ([#19](https://github.com/MapColonies/ingestion-trigger/issues/19)) ([659b217](https://github.com/MapColonies/ingestion-trigger/commit/659b21710a2d8941ca1e0008214758b614cd3400))

### [3.0.1](https://github.com/MapColonies/ingestion-trigger/compare/v3.0.0...v3.0.1) (2024-10-13)


### Bug Fixes

* return 404 on layer not in catalog on update (MAPCO-4959) ([#17](https://github.com/MapColonies/ingestion-trigger/issues/17)) ([ae42662](https://github.com/MapColonies/ingestion-trigger/commit/ae42662b74f7c18f2f433e120a4faedbd8b6ed7e))

## [3.0.0](https://github.com/MapColonies/ingestion-trigger/compare/v2.0.0...v3.0.0) (2024-10-08)


### ⚠ BREAKING CHANGES

* Geometry to footprint(MAPCO-4916) (#15)

### Features

* Geometry to footprint(MAPCO-4916) ([#15](https://github.com/MapColonies/ingestion-trigger/issues/15)) ([330e6b4](https://github.com/MapColonies/ingestion-trigger/commit/330e6b4f07bb530dff67cdca512c2e23282e39ae))

## [2.0.0](https://github.com/MapColonies/ingestion-trigger/compare/v1.3.0...v2.0.0) (2024-08-29)


### ⚠ BREAKING CHANGES

* Update pp fields names(MAPCO-4684) (#13)

### Features

* Update pp fields names(MAPCO-4684) ([#13](https://github.com/MapColonies/ingestion-trigger/issues/13)) ([748011e](https://github.com/MapColonies/ingestion-trigger/commit/748011eb3585efca32b04911230e14750581e00b))

## [1.3.0](https://github.com/MapColonies/ingestion-trigger/compare/v1.2.0...v1.3.0) (2024-08-29)


### Features

* Add job parameters on update(MAPCO-4685) ([#12](https://github.com/MapColonies/ingestion-trigger/issues/12)) ([254ccb3](https://github.com/MapColonies/ingestion-trigger/commit/254ccb3749b3f86c96a78bc8b80858878a2fdc92))
* change name conventions and version calculation (MAPCO-4687, MAPCO-4686) ([#10](https://github.com/MapColonies/ingestion-trigger/issues/10)) ([c40caf8](https://github.com/MapColonies/ingestion-trigger/commit/c40caf8a7477009c89598a4642c31bf6349ae392))
* use scope argument in workflow ([#11](https://github.com/MapColonies/ingestion-trigger/issues/11)) ([12f198d](https://github.com/MapColonies/ingestion-trigger/commit/12f198d1e1f3a38ffabaa7ebfff43b086ea9fd68))

## [1.2.0](https://github.com/MapColonies/ingestion-trigger/compare/v1.1.2...v1.2.0) (2024-08-21)


### Features

* add advanced tracing(MAPCO-4512) ([#9](https://github.com/MapColonies/ingestion-trigger/issues/9)) ([9acc4bd](https://github.com/MapColonies/ingestion-trigger/commit/9acc4bd570ebd3a782afaaf7879c88e7a1c4016b))

### [1.1.2](https://github.com/MapColonies/ingestion-trigger/compare/v1.1.1...v1.1.2) (2024-07-21)


### Bug Fixes

* placement of task type in values ([#8](https://github.com/MapColonies/ingestion-trigger/issues/8)) ([9608546](https://github.com/MapColonies/ingestion-trigger/commit/96085461c8d6ac841a6c2c79fae2ca138936d076))

### [1.1.1](https://github.com/MapColonies/ingestion-trigger/compare/v1.1.0...v1.1.1) (2024-07-18)

## 1.1.0 (2024-07-18)


### Features

* Add basic tracing and metrics (MAPCO-4242) ([#7](https://github.com/MapColonies/ingestion-trigger/issues/7)) ([cdfcc3b](https://github.com/MapColonies/ingestion-trigger/commit/cdfcc3b2da4ab1b8b3359a2aa0879f0c486dfe22))
* New layer request (MAPCO-4246 , MAPCO-1783 , MAPCO-4243 ) ([#5](https://github.com/MapColonies/ingestion-trigger/issues/5)) ([59ba128](https://github.com/MapColonies/ingestion-trigger/commit/59ba12877224f3137d8bd723f4c22cc716225373))
* Sources info implementation (MAPCO-1783) ([#3](https://github.com/MapColonies/ingestion-trigger/issues/3)) ([23840d3](https://github.com/MapColonies/ingestion-trigger/commit/23840d31d7cd7b27b32ccc1239bd9adf48050d11))
* Update layer request (MAPCO-4249) ([#6](https://github.com/MapColonies/ingestion-trigger/issues/6)) ([a3b823d](https://github.com/MapColonies/ingestion-trigger/commit/a3b823d4f75d79570649ef643f1570cfcba4549d))
