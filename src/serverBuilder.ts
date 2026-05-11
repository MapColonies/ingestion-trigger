import { getErrorHandlerMiddleware } from '@map-colonies/error-express-handler';
import { httpLogger } from '@map-colonies/express-access-log-middleware';
import type { Logger } from '@map-colonies/js-logger';
import { OpenapiRouterConfig, OpenapiViewerRouter } from '@map-colonies/openapi-express-viewer';
import getStorageExplorerMiddleware from '@map-colonies/storage-explorer-middleware';
import { collectMetricsExpressMiddleware } from '@map-colonies/prometheus';
import bodyParser from 'body-parser';
import compression from 'compression';
import express, { Router } from 'express';
import { middleware as OpenApiMiddleware } from 'express-openapi-validator';
import { inject, injectable } from 'tsyringe';
import { Registry } from 'prom-client';
import { SERVICES } from './common/constants';
import type { ConfigType } from './common/config';
import { INFO_ROUTER_SYMBOL } from './info/routes/infoRouter';
import { INGESTION_ROUTER_SYMBOL } from './ingestion/routes/ingestionRouter';
import { makeInsensitive } from './utils/stringCapitalizationPermutations';
import { VALIDATE_ROUTER_SYMBOL } from './validate/routes/validateRouter';

@injectable()
export class ServerBuilder {
  private readonly serverInstance: express.Application;

  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: ConfigType,
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.METRICS) private readonly metricsRegistry: Registry,
    @inject(VALIDATE_ROUTER_SYMBOL) private readonly validateRouter: Router,
    @inject(INGESTION_ROUTER_SYMBOL) private readonly ingestionRouter: Router,
    @inject(INFO_ROUTER_SYMBOL) private readonly infoRouter: Router
  ) {
    this.serverInstance = express();
  }

  public build(): express.Application {
    this.registerPreRoutesMiddleware();
    this.buildRoutes();
    this.registerPostRoutesMiddleware();

    return this.serverInstance;
  }

  private buildDocsRoutes(): void {
    const openapiRouter = new OpenapiViewerRouter({
      ...(this.config.get('openapiConfig') as unknown as OpenapiRouterConfig),
      filePathOrSpec: this.config.get('openapiConfig.filePath'),
    });
    openapiRouter.setup();
    this.serverInstance.use(this.config.get('openapiConfig.basePath'), openapiRouter.getRouter());
  }

  private buildRoutes(): void {
    this.serverInstance.use('/ingestion', this.ingestionRouter);
    this.serverInstance.use('/info', this.infoRouter);
    this.serverInstance.use('/validate', this.validateRouter);

    this.buildDocsRoutes();
  }

  private registerPreRoutesMiddleware(): void {
    this.serverInstance.use(collectMetricsExpressMiddleware({ registry: this.metricsRegistry }));
    this.serverInstance.use(httpLogger({ logger: this.logger }));

    if (this.config.get('server.response.compression.enabled')) {
      this.serverInstance.use(compression(this.config.get('server.response.compression.options') as unknown as compression.CompressionFilter));
    }

    this.serverInstance.use(bodyParser.json(this.config.get('server.request.payload') as unknown as bodyParser.Options));

    const ignorePathRegex = new RegExp(`^${this.config.get('openapiConfig.basePath')}|(explorer)/.*`, 'i');
    const apiSpecPath = this.config.get('openapiConfig.filePath');
    this.serverInstance.use(OpenApiMiddleware({ apiSpec: apiSpecPath, validateRequests: true, ignorePaths: ignorePathRegex }));
    this.filePickerHandlerMiddleware();
  }

  private registerPostRoutesMiddleware(): void {
    this.serverInstance.use(getErrorHandlerMiddleware());
  }

  private filePickerHandlerMiddleware(): void {
    const physicalDirPath = this.config.get('storageExplorer.layerSourceDir') as unknown as string;
    const displayNameDir = this.config.get('storageExplorer.displayNameDir') as unknown as string;
    const mountDirs = [
      {
        physical: physicalDirPath,
        displayName: displayNameDir,
        includeFilesExt: this.getFileExtensions(),
      },
    ];
    this.serverInstance.use(getStorageExplorerMiddleware(mountDirs, this.logger as unknown as Record<string, unknown>));
  }

  private getFileExtensions(): string[] {
    const rawExtensions = this.config.get('storageExplorer.validFileExtensions') as unknown as string[];
    const extensions = rawExtensions.map((ext) => ext.trim());
    return makeInsensitive(...extensions);
  }
}
