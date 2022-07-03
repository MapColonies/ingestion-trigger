import { inject, singleton } from 'tsyringe';
import { polygon, intersect, Feature, Polygon, area } from '@turf/turf';
import { SERVICES } from '../../common/constants';
import { IConfig } from '../../common/interfaces';
import { FilesManager } from '../../utils/filesManager';

interface IResolutionRule {
  name: string;
  value: number;
  minResolution: number;
  minDataInclusionRate: number;
}

interface IClassificationOption {
  polygonCoordinates: number[][][];
  resolutionRules: IResolutionRule[];
  defaultValue: number;
}

@singleton()
export class Classifier {
  private resolutionRules: IResolutionRule[] | undefined;
  private classificationPolygon: Feature<Polygon> | undefined;
  private defaultClassification: number | undefined;

  private readonly ready: Promise<void>;

  public constructor(@inject(SERVICES.CONFIG) config: IConfig, fileManager: FilesManager) {
    const classificationOptionsFileLocation = config.get<string>('classification.optionsFileLocation');
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const classificationProvider = config.get<string>('classification.storageProvider').toUpperCase();
    let options: Promise<string>;
    switch (classificationProvider) {
      case 'FS':
        options = fileManager.readAsString(classificationOptionsFileLocation);
        break;
      case 'S3':
        options = fileManager.readS3ObjectAsString(classificationOptionsFileLocation);
        break;
      default:
        throw new Error(`unsupported classification options provider: ${classificationProvider}`);
    }
    this.ready = options.then((rawOptions) => {
      const parsedOptions = JSON.parse(rawOptions) as IClassificationOption;
      this.resolutionRules = parsedOptions.resolutionRules.sort((rule1, rule2) => rule1.value - rule2.value);
      this.classificationPolygon = polygon(parsedOptions.polygonCoordinates);
      this.defaultClassification = parsedOptions.defaultValue;
    });
  }

  public async getClassification(resolution: number, polygonCoordinates: number[][][]): Promise<number> {
    await this.ready;
    const polygonFeature = polygon(polygonCoordinates);
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    const intersection = intersect(this.classificationPolygon!, polygonFeature);
    const intersectionArea = intersection != null ? area(intersection) : 0;
    const intersectionRate = intersectionArea / area(polygonFeature);
    for (let i = 0; i < this.resolutionRules!.length; i++) {
      const rule = this.resolutionRules![i];
      if (intersectionRate >= rule.minDataInclusionRate && resolution < rule.minResolution) {
        return rule.value;
      }
    }
    return this.defaultClassification!;
    /* eslint-enable @typescript-eslint/no-non-null-assertion */
  }
}
