import { BadRequestError } from '@map-colonies/error-types';
import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { ZodError, z } from 'zod';
import { SERVICES } from '../../common/constants';

@injectable()
export class ZodValidator {
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger) {}

  public async validate<T extends z.ZodSchema>(schema: T, data: unknown): Promise<z.infer<T>> {
    this.logger.debug({ message: 'Validating data', schema: schema.description, data });
    const result = await schema.safeParseAsync(data);

    if (!result.success) {
      const schemaName: string = schema.description ?? 'Unknown Schema';
      const error = result.error.formErrors;
      this.logger.error({ message: `Validation failed for ${schemaName}`, error });
      throw new BadRequestError(this.formatStrError(result.error));
    }
    const validData = result.data as z.infer<T>;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return validData;
  }

  private formatStrError(error: ZodError): string {
    const errorMessages: string[] = [];
    error.errors.forEach((errDetail) => {
      const path = errDetail.path.join('.');
      if (path) {
        const message = errDetail.message;
        errorMessages.push(`${path}: ${message}`);
      }
    });
    if (error.formErrors.formErrors.length > 0) {
      errorMessages.push(`Global Errors: ${error.formErrors.formErrors.toString()}`);
    }
    return errorMessages.join(' | ');
  }
}
