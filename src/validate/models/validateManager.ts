import type { Logger } from '@map-colonies/js-logger';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';
import { SpanStatusCode, type Tracer, trace } from '@opentelemetry/api';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import type { IConfig } from '../../common/interfaces';
import { FileNotFoundError, GdalInfoError } from '../../ingestion/errors/ingestionErrors';
import type { SourcesValidationResponse } from '../../ingestion/interfaces';
import type { GpkgInputFiles } from '../../ingestion/schemas/inputFilesSchema';
import { SourceValidator } from '../../ingestion/validators/sourceValidator';
import { GpkgError } from '../../serviceClients/database/errors';
import type { LogContext } from '../../common/interfaces';
import { getAbsoluteGpkgFilesPath } from '../../utils/paths';

@injectable()
export class ValidateManager {
  private readonly logContext: LogContext;
  private readonly sourceMount: string;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    private readonly sourceValidator: SourceValidator
  ) {
    this.logContext = {
      fileName: __filename,
      class: ValidateManager.name,
    };
    this.sourceMount = config.get<string>('storageExplorer.layerSourceDir');
  }

  @withSpanAsyncV4
  public async validateGpkgs(gpkgInputFiles: GpkgInputFiles): Promise<SourcesValidationResponse> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateGpkgs.name };
    const { gpkgFilesPath } = gpkgInputFiles;
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('validateManager.validateGpkgs');

    try {
      this.logger.info({ msg: 'Starting gpkgs validation process', logContext: logCtx, metadata: { gpkgFilesPath } });
      const absoluteGpkgFilesPath = getAbsoluteGpkgFilesPath({ gpkgFilesPath, sourceMount: this.sourceMount });
      const response = await this.validateGpkgsSources(absoluteGpkgFilesPath);
      this.logger.info({ msg: 'Finished gpkgs validation process', logContext: logCtx });
      activeSpan?.setStatus({ code: SpanStatusCode.OK });
      if (response.isValid) {
        activeSpan?.addEvent('validateManager.validateGpkgs.valid', { isValid: true });
      } else {
        activeSpan?.addEvent('validateManager.validateGpkgs.invalid', { isValid: false });
      }
      return response;
    } catch (err) {
      activeSpan
        ?.setStatus({ code: SpanStatusCode.ERROR })
        .addEvent('validateManager.validateGpkgs.invalid', { isValid: false, error: JSON.stringify(err) });
      throw err;
    }
  }

  @withSpanAsyncV4
  public async validateGpkgsSources(gpkgInputFiles: GpkgInputFiles): Promise<SourcesValidationResponse> {
    // this function handles absolute paths of input files
    const logCtx: LogContext = { ...this.logContext, function: this.validateGpkgsSources.name };
    const { gpkgFilesPath } = gpkgInputFiles;

    try {
      await this.sourceValidator.validateFilesExist(gpkgFilesPath);
      this.logger.debug({ msg: 'GPKG file exist passed', logContext: logCtx, metadata: { gpkgFilesPath } });

      await this.sourceValidator.validateGdalInfo(gpkgFilesPath);
      this.logger.debug({ msg: 'GDAL info validation passed', logContext: logCtx, metadata: { gpkgFilesPath } });

      this.sourceValidator.validateGpkgFiles(gpkgFilesPath);
      this.logger.debug({ msg: 'GPKG files validation passed', logContext: logCtx, metadata: { gpkgFilesPath } });

      const validationResult = { isValid: true, message: 'Sources are valid' };
      this.logger.debug({
        msg: validationResult.message,
        logContext: logCtx,
        metadata: { gpkgFilesPath, isValid: validationResult.isValid },
      });
      return validationResult;
    } catch (err) {
      if (err instanceof FileNotFoundError || err instanceof GdalInfoError || err instanceof GpkgError) {
        this.logger.info({ msg: `Sources are not valid: ${err.message}`, logContext: logCtx, err, metadata: { gpkgFilesPath } });
        return { isValid: false, message: err.message };
      }

      this.logger.error({
        msg: `An unexpected error occurred during source validation`,
        logContext: logCtx,
        err,
        metadata: { gpkgFilesPath },
      });
      throw err;
    }
  }
}
