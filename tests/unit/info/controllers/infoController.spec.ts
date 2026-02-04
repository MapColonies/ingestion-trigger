import { faker } from '@faker-js/faker';
import { StatusCodes } from 'http-status-codes';
import { InfoController } from '../../../../src/info/controllers/infoController';
import { FileNotFoundError } from '../../../../src/ingestion/errors/ingestionErrors';
import type { InfoManager } from '../../../../src/info/models/infoManager';
import type { SchemasValidator } from '../../../../src/utils/validation/schemasValidator';

describe('InfoController', () => {
  let controller: InfoController;

  const schemasValidator = {
    validateGpkgsInputFilesRequestBody: jest.fn(),
  } satisfies Partial<SchemasValidator>;

  const infoManager = {
    getGpkgsInfo: jest.fn(),
  } satisfies Partial<InfoManager>;

  beforeEach(() => {
    controller = new InfoController(schemasValidator as unknown as SchemasValidator, infoManager as unknown as InfoManager);
    jest.clearAllMocks();
  });

  it('maps FileNotFoundError to NOT_FOUND and calls next(error)', async () => {
    const fileName = faker.system.fileName({ extensionCount: 0 }) + '.gpkg';
    const err = new FileNotFoundError(fileName);

    schemasValidator.validateGpkgsInputFilesRequestBody.mockResolvedValue({ gpkgFilesPath: [fileName] });
    infoManager.getGpkgsInfo.mockRejectedValue(err);

    const req = { body: { gpkgFilesPath: [fileName] } };
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();

    type AsyncHandler = (req: unknown, res: unknown, next: unknown) => Promise<void>;
    await (controller.getGpkgsInfo as unknown as AsyncHandler)(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect((err as { status?: number }).status).toBe(StatusCodes.NOT_FOUND);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });
});
