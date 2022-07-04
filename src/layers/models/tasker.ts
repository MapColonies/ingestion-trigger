import { singleton, inject } from 'tsyringe';
import { TileRanger, tileToBbox } from '@map-colonies/mc-utils';
import { IngestionParams } from '@map-colonies/mc-model-types';
import { Polygon } from '@turf/helpers';
import { ITaskParameters } from '../interfaces';
import { ITaskZoomRange } from '../../tasks/interfaces';
import { SERVICES } from '../../common/constants';
import { IConfig } from '../../common/interfaces';

@singleton()
export class Tasker {
  private readonly bboxSizeTiles: number;
  public constructor(@inject(SERVICES.CONFIG) private readonly config: IConfig) {
    this.bboxSizeTiles = config.get<number>('bboxSizeTiles');
  }

  public *generateTasksParameters(data: IngestionParams, layerRelativePath: string, zoomRanges: ITaskZoomRange[]): Generator<ITaskParameters> {
    const ranger = new TileRanger();
    for (const zoomRange of zoomRanges) {
      const zoom = this.getZoom(zoomRange.maxZoom);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const tileGen = ranger.generateTiles(data.metadata.footprint as Polygon, zoom);
      for (const tile of tileGen) {
        yield {
          discreteId: data.metadata.productId as string,
          version: data.metadata.productVersion as string,
          originDirectory: data.originDirectory,
          minZoom: zoomRange.minZoom,
          maxZoom: zoomRange.maxZoom,
          layerRelativePath: layerRelativePath,
          bbox: tileToBbox(tile),
        };
      }
    }
  }

  /**
   * this function calculate the zoom level where tile contains the maximum amount of tiles
   * in "maxRequestedZoom" that is smaller or equels to the configured value "bboxSizeTiles"
   * @param maxRequestedZoom task maximum tile`s zoom
   * @returns optimized zoom level for bbox equivalent tile
   */
  private getZoom(maxRequestedZoom: number): number {
    /* eslint-disable @typescript-eslint/no-magic-numbers */
    const diff = Math.max(0, Math.floor(Math.log2(this.bboxSizeTiles >> 1) >> 1));
    return Math.max(0, maxRequestedZoom - diff);
    /* eslint-enable @typescript-eslint/no-magic-numbers */
  }
}
