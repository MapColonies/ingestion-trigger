import { Logger } from '@map-colonies/js-logger';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';
import { SpanStatusCode, trace, Tracer } from '@opentelemetry/api';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import type { IConfig } from '../../common/interfaces';
import { InfoDataWithFile } from '../../ingestion/schemas/infoDataSchema';
import { GpkgInputFiles } from '../../ingestion/schemas/inputFilesSchema';
import { SourceValidator } from '../../ingestion/validators/sourceValidator';
import { LogContext } from '../../utils/logger/logContext';
import { getAbsoluteGpkgFilesPath } from '../../utils/paths';
import { GdalInfoManager } from './gdalInfoManager';

@injectable()
export class InfoManager {
  private readonly logContext: LogContext;
  private readonly sourceMount: string;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    private readonly sourceValidator: SourceValidator,
    private readonly gdalInfoManager: GdalInfoManager
  ) {
    this.logContext = {
      fileName: __filename,
      class: InfoManager.name,
    };
    this.sourceMount = config.get<string>('storageExplorer.layerSourceDir');
  }

  @withSpanAsyncV4
  public async getGpkgsInfo(gpkgInputFiles: GpkgInputFiles): Promise<InfoDataWithFile[]> {
    const logCtx: LogContext = { ...this.logContext, function: this.getGpkgsInfo.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('infoManager.getGpkgsInfo');

    const { gpkgFilesPath } = gpkgInputFiles;
    this.logger.info({ msg: 'Starting gpkgs info process', logContext: logCtx, metadata: { gpkgFilesPath } });

    const absoluteGpkgFilesPath = getAbsoluteGpkgFilesPath({ sourceMount: this.sourceMount, gpkgFilesPath }).gpkgFilesPath;
    const filesGdalInfoData = await this.getGpkgsInformation({ gpkgFilesPath: absoluteGpkgFilesPath });

    this.logger.info({ msg: 'Finished gpkgs info process', logContext: logCtx });
    activeSpan?.setStatus({ code: SpanStatusCode.OK }).addEvent('getInfoData.get.ok');

    return filesGdalInfoData;
  }

  @withSpanAsyncV4
  public async getGpkgsInformation(gpkgInputFiles: GpkgInputFiles): Promise<InfoDataWithFile[]> {
    // this function handles absolute paths of input files
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('infoManager.getGpkgsInfo');
    const logCtx: LogContext = { ...this.logContext, function: this.getGpkgsInformation.name };

    const { gpkgFilesPath } = gpkgInputFiles;
    this.logger.info({ msg: 'Getting gdal info for files', logContext: logCtx, metadata: { gpkgFilesPath } });

    await this.sourceValidator.validateFilesExist(gpkgFilesPath);
    this.logger.debug({ msg: 'Files exist validation passed', logContext: logCtx, metadata: { gpkgFilesPath } });

    const filesGdalInfoData = await this.gdalInfoManager.getInfoData(gpkgFilesPath);
    return filesGdalInfoData;
  }
}
