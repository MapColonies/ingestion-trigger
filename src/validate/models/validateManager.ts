import type { Logger } from '@map-colonies/js-logger';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';
import { SpanStatusCode, type Tracer, trace } from '@opentelemetry/api';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import type { IConfig, LogContext } from '../../common/interfaces';
import { FileNotFoundError, GdalInfoError } from '../../ingestion/errors/ingestionErrors';
import type { GpkgInputFiles } from '../../utils/validation/schemasValidator';
import { SourceValidator } from '../../ingestion/validators/sourceValidator';
import { GpkgError } from '../../serviceClients/database/errors';
import { getAbsoluteGpkgFilesPath } from '../../utils/paths';
import type { ValidateGpkgsResponse } from '../interfaces';

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
  public async validateGpkgs(gpkgInputFiles: GpkgInputFiles): Promise<ValidateGpkgsResponse> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateGpkgs.name };
    const { gpkgFilesPath } = gpkgInputFiles;
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('validateManager.validateGpkgs');

    const validResponse = {
      isValid: true,
      message: 'Sources are valid',
    };

    try {
      this.logger.info({ msg: 'Starting gpkgs validation process', logContext: logCtx, metadata: { gpkgFilesPath } });
      const absoluteGpkgFilesPath = getAbsoluteGpkgFilesPath({ gpkgFilesPath, sourceMount: this.sourceMount });
      await this.validateGpkgsSources(absoluteGpkgFilesPath);
      this.logger.info({ msg: 'Finished gpkgs validation process', logContext: logCtx });
      activeSpan?.setStatus({ code: SpanStatusCode.OK });
      activeSpan?.addEvent('validateManager.validateGpkgs.valid');
      return validResponse;
    } catch (error) {
      activeSpan?.setStatus({ code: SpanStatusCode.ERROR });
      if (!(error instanceof FileNotFoundError)) {
        activeSpan?.addEvent('validateManager.validateGpkgs.invalid');
      }
      if (error instanceof GdalInfoError || error instanceof GpkgError) {
        return { isValid: false, message: error.message };
      } else {
        throw error;
      }
    }
  }

  @withSpanAsyncV4
  public async validateGpkgsSources(gpkgInputFiles: GpkgInputFiles): Promise<void> {
    // this function handles absolute paths of input files
    const logCtx: LogContext = { ...this.logContext, function: this.validateGpkgsSources.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('validateManager.validateGpkgsSources');
    const { gpkgFilesPath } = gpkgInputFiles;

    try {
      await this.sourceValidator.validateFilesExist(gpkgFilesPath);
      this.logger.debug({ msg: 'GPKG file exist passed', logContext: logCtx, metadata: { gpkgFilesPath } });

      await this.sourceValidator.validateGdalInfo(gpkgFilesPath);
      this.logger.debug({ msg: 'GDAL info validation passed', logContext: logCtx, metadata: { gpkgFilesPath } });

      this.sourceValidator.validateGpkgFiles(gpkgFilesPath);
      this.logger.debug({ msg: 'GPKG files validation passed', logContext: logCtx, metadata: { gpkgFilesPath } });

      this.logger.debug({
        msg: 'Gpkgs are valid',
        logContext: logCtx,
        metadata: { gpkgFilesPath },
      });
    } catch (error) {
      let errorMessage: string;
      if (error instanceof FileNotFoundError) {
        errorMessage = `Gpkg files not found: ${error.message}`;
      } else if (error instanceof Error) {
        errorMessage = `Gpkgs are not valid: ${error.message}`;
      } else {
        errorMessage = `An unexpected error occurred during gpkg validation`;
      }

      this.logger.error({
        msg: errorMessage,
        logContext: logCtx,
        error,
        metadata: { gpkgFilesPath },
      });
      activeSpan?.recordException(error instanceof Error ? error : errorMessage);

      throw error;
    }
  }

  @withSpanAsyncV4
  public async validateShapefiles(shapefilePath: string[]): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateShapefiles.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('validateManager.validateShapefiles');

    try {
      await this.sourceValidator.validateFilesExist(shapefilePath);
    } catch (error) {
      let errorMessage: string;
      if (error instanceof FileNotFoundError) {
        errorMessage = `Shapefiles file not found: ${error.message}`;
      } else if (error instanceof Error) {
        errorMessage = `Shapefiles are not valid: ${error.message}`;
      } else {
        errorMessage = `An unexpected error occurred during shapefile validation: ${JSON.stringify(error)}`;
      }

      this.logger.error({
        msg: errorMessage,
        logContext: logCtx,
        error,
        metadata: { shapefilePath },
      });
      activeSpan?.recordException(error instanceof Error ? error : errorMessage);

      throw error;
    }
  }
}
