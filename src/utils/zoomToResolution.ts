import { inject, singleton } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { degreesPerPixelToZoomLevel } from '@map-colonies/mc-utils';
import { ITaskZoomRange } from '../tasks/interfaces';
import { SERVICES } from '../common/constants';
import { IConfig } from '../common/interfaces';

@singleton()
export class ZoomLevelCalculator {
  private readonly zoomRanges: ITaskZoomRange[];

  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger, @inject(SERVICES.CONFIG) private readonly config: IConfig) {
    const batches = config.get<string>('tiling.zoomGroups');
    this.zoomRanges = this.getZoomRanges(batches);
  }

  public createLayerZoomRanges(resolution: number): ITaskZoomRange[] {
    const maxZoom = degreesPerPixelToZoomLevel(resolution);
    const layerZoomRanges = this.zoomRanges
      .filter((range) => {
        return range.minZoom <= maxZoom;
      })
      .map((range) => {
        const taskRange: ITaskZoomRange = { minZoom: range.minZoom, maxZoom: range.maxZoom <= maxZoom ? range.maxZoom : maxZoom };
        return taskRange;
      });
    return layerZoomRanges;
  }

  private getZoomRanges(batches: string): ITaskZoomRange[] {
    const zoomBatches = batches.split(',');
    const zoomRanges = zoomBatches.map((batch) => {
      const limits = batch.split('-').map((value) => Number.parseInt(value));
      const zoomRange: ITaskZoomRange = {
        minZoom: Math.min(...limits),
        maxZoom: Math.max(...limits),
      };
      return zoomRange;
    });
    return zoomRanges;
  }
}
