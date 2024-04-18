import { injectable } from 'tsyringe';
import { GdalInfoValidator } from './gdalInfoValidator';

@injectable()
export class SourceValidator {
  public constructor(private readonly gdalInfoValidator: GdalInfoValidator) {}

  public async validateGdalInfo(files: string[], originDirectory: string): Promise<void> {
    await this.gdalInfoValidator.validateInfoData(files, originDirectory);
  }
}
