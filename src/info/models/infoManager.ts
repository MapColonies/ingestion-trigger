import { inject, injectable } from "tsyringe";
import { LogContext } from "../../utils/logger/logContext";
import { SERVICES } from "../../common/constants";
import { Logger } from "@map-colonies/js-logger";
import { SpanStatusCode, trace, Tracer } from "@opentelemetry/api";
import { SourceValidator } from "../../ingestion/validators/sourceValidator";
import { GdalInfoManager } from "./gdalInfoManager";
import { withSpanAsyncV4 } from "@map-colonies/telemetry";
import { InfoDataWithFile } from "../../ingestion/schemas/infoDataSchema";
import { GpkgInputFiles } from "../../ingestion/interfaces";


@injectable()
export class InfoManager {
  private readonly logContext: LogContext;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    private readonly sourceValidator: SourceValidator,
    private readonly gdalInfoManager: GdalInfoManager,
  ) {
    this.logContext = {
      fileName: __filename,
      class: InfoManager.name,
    };
  }

  @withSpanAsyncV4
  public async getGpkgsInfo(GpkgInputFiles: GpkgInputFiles): Promise<InfoDataWithFile[]> {
    const logCtx: LogContext = { ...this.logContext, function: this.getGpkgsInfo.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('infoManager.getInfoData');
    const { gpkgFilesPath } = GpkgInputFiles;
    this.logger.info({ msg: 'getting gdal info for files', logContext: logCtx, metadata: { gpkgFilesPath } });

    await this.sourceValidator.validateFilesExist(gpkgFilesPath);
    this.logger.debug({ msg: 'Files exist validation passed', logContext: logCtx, metadata: { gpkgFilesPath } });

    const filesGdalInfoData = await this.gdalInfoManager.getInfoData(gpkgFilesPath);
    activeSpan?.setStatus({ code: SpanStatusCode.OK }).addEvent('getInfoData.get.ok');
    return filesGdalInfoData;
  }
}
