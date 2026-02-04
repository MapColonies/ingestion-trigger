import { faker } from '@faker-js/faker';
import { StatusCodes } from 'http-status-codes';
import { ValidateController } from '../../../../src/validate/controllers/validateController';
import { FileNotFoundError } from '../../../../src/ingestion/errors/ingestionErrors';
import type { ValidateManager } from '../../../../src/validate/models/validateManager';
import type { SchemasValidator } from '../../../../src/utils/validation/schemasValidator';

describe('ValidateController', () => {
  let controller: ValidateController;

  const schemasValidator = {
    validateGpkgsInputFilesRequestBody: jest.fn(),
  } satisfies Partial<SchemasValidator>;

  const validateManager = {
    validateGpkgs: jest.fn(),
  } satisfies Partial<ValidateManager>;

  beforeEach(() => {
    controller = new ValidateController(schemasValidator as unknown as SchemasValidator, validateManager as unknown as ValidateManager);
    jest.clearAllMocks();
  });

  it('maps FileNotFoundError to NOT_FOUND and calls next(error)', async () => {
    const fileName = faker.system.fileName({ extensionCount: 0 }) + '.gpkg';
    const err = new FileNotFoundError(fileName);

    schemasValidator.validateGpkgsInputFilesRequestBody.mockResolvedValue({ gpkgFilesPath: [fileName] });
    validateManager.validateGpkgs.mockRejectedValue(err);

    const req = { body: { gpkgFilesPath: [fileName] } };
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();

    type AsyncHandler = (req: unknown, res: unknown, next: unknown) => Promise<void>;
    await (controller.validateGpkgs as unknown as AsyncHandler)(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect((err as { status?: number }).status).toBe(StatusCodes.NOT_FOUND);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });
});
