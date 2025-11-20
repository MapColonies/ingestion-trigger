import { faker } from '@faker-js/faker';
import { BadRequestError } from '@map-colonies/error-types';
import jsLogger from '@map-colonies/js-logger';
import { ShapefileChunkReader } from '@map-colonies/mc-utils';
import { trace } from '@opentelemetry/api';
import config from 'config';
import type { Feature, MultiPolygon, Point, Polygon } from 'geojson';
import { UnsupportedEntityError, ValidationError } from '../../../../src/ingestion/errors/ingestionErrors';
import { ProductManager } from '../../../../src/ingestion/models/productManager';
import type { SchemasValidator } from '../../../../src/utils/validation/schemasValidator';
import { registerDefaultConfig } from '../../../mocks/configMock';
import { generateInputFiles } from '../../../mocks/mockFactory';

const mockReadShapefile = jest
  .fn<{ done: boolean; value?: Feature }, unknown[]>()
  .mockReturnValueOnce({ done: false, value: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[]]] } } })
  .mockReturnValueOnce({ done: true, value: undefined })
  .mockReturnValueOnce({ done: false, value: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[]]] } } })
  .mockReturnValueOnce({ done: true, value: undefined });
const mockOpenShapefile = jest.fn<{ read: () => unknown }, unknown[]>().mockReturnValue({
  read: () => {
    return mockReadShapefile();
  },
});
jest.mock('shapefile', () => {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esmodule: true,
    open: () => {
      return mockOpenShapefile();
    },
  };
});

describe('ProductManager', () => {
  let productManager: ProductManager;
  const mockSchemaValidator = {
    validateProductFeature: jest.fn(),
  } satisfies Partial<SchemasValidator>;

  beforeEach(() => {
    productManager = new ProductManager(
      config,
      jsLogger({ enabled: false }),
      trace.getTracer('testTracer'),
      mockSchemaValidator as unknown as SchemasValidator
    );

    registerDefaultConfig();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('read', () => {
    describe('deep mock (white-box) - test private processor', () => {
      it('should successfully read product shapefile and return product geometry', async () => {
        const { productShapefilePath } = generateInputFiles();
        const featurePolygon: Feature<Polygon> = {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          },
        };
        mockSchemaValidator.validateProductFeature.mockResolvedValue(featurePolygon.geometry);

        const response = await productManager.read(productShapefilePath);

        expect(response).toStrictEqual(featurePolygon.geometry);
        expect(mockSchemaValidator.validateProductFeature).toHaveBeenCalledTimes(1);
        expect(mockOpenShapefile).toHaveBeenCalledTimes(2);
        expect(mockReadShapefile).toHaveBeenCalledTimes(4);
      });
    });

    it('should successfully read product shapefile and return product geometry - polygon', async () => {
      const { productShapefilePath } = generateInputFiles();
      const featurePolygon: Feature<Polygon> = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        },
      };
      jest.spyOn(ShapefileChunkReader.prototype, 'readAndProcess').mockImplementation(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        (productManager as any).features = [featurePolygon];
        await Promise.resolve();
      });
      mockSchemaValidator.validateProductFeature.mockResolvedValue(featurePolygon.geometry);

      const response = await productManager.read(productShapefilePath);

      expect(response).toStrictEqual(featurePolygon.geometry);
      expect(mockSchemaValidator.validateProductFeature).toHaveBeenCalledTimes(1);
    });

    it('should successfully read product shapefile and return product geometry - multipolygon', async () => {
      const { productShapefilePath } = generateInputFiles();
      const featureMultiPolygon: Feature<MultiPolygon> = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
            [
              [
                [10, 0],
                [11, 0],
                [11, 1],
                [10, 0],
              ],
            ],
          ],
        },
      };
      jest.spyOn(ShapefileChunkReader.prototype, 'readAndProcess').mockImplementation(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        (productManager as any).features = [featureMultiPolygon];
        await Promise.resolve();
      });
      mockSchemaValidator.validateProductFeature.mockResolvedValue(featureMultiPolygon.geometry);

      const response = await productManager.read(productShapefilePath);

      expect(response).toStrictEqual(featureMultiPolygon.geometry);
      expect(mockSchemaValidator.validateProductFeature).toHaveBeenCalledTimes(1);
    });

    it('should throw an error when reading and processing product shapefile throws an error', async () => {
      const { productShapefilePath } = generateInputFiles();
      const errorMessage = 'error';
      jest.spyOn(ShapefileChunkReader.prototype, 'readAndProcess').mockRejectedValue(new Error(errorMessage));

      const promise = productManager.read(productShapefilePath);

      await expect(promise).rejects.toThrow(
        new UnsupportedEntityError(`Failed to read product shapefile of file: ${productShapefilePath}: ${errorMessage}`)
      );
    });

    it('should throw an error when reading and processing product shapefile throws an unexpected error', async () => {
      const { productShapefilePath } = generateInputFiles();
      const errorMessage = `Shapefile ${productShapefilePath} has no valid features or vertices`;
      jest.spyOn(ShapefileChunkReader.prototype, 'readAndProcess').mockRejectedValue(new Error(errorMessage));

      const promise = productManager.read(productShapefilePath);

      await expect(promise).rejects.toThrow(
        new ValidationError(`Failed to read product shapefile of file: ${productShapefilePath}: ${errorMessage}`)
      );
    });

    it('should throw an error when product shapefile has 0 features', async () => {
      const { productShapefilePath } = generateInputFiles();
      const errorMessage = 'error';
      jest.spyOn(ShapefileChunkReader.prototype, 'readAndProcess').mockImplementation(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        (productManager as any).features = [];
        await Promise.resolve();
      });
      mockSchemaValidator.validateProductFeature.mockRejectedValue(new BadRequestError(errorMessage));

      const promise = productManager.read(productShapefilePath);

      await expect(promise).rejects.toThrow(
        new ValidationError(`Failed to validate product shapefile of file: ${productShapefilePath}: ${errorMessage}`)
      );
    });

    it('should throw an error when product shapefile has more than 1 feature', async () => {
      const { productShapefilePath } = generateInputFiles();
      const featurePolygon: Feature<Polygon> = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        },
      };
      const featurePolygons = faker.helpers.multiple(() => featurePolygon, { count: { min: 2, max: 10 } });
      const errorMessage = 'error';
      jest.spyOn(ShapefileChunkReader.prototype, 'readAndProcess').mockImplementation(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        (productManager as any).features = featurePolygons;
        await Promise.resolve();
      });
      mockSchemaValidator.validateProductFeature.mockRejectedValue(new BadRequestError(errorMessage));

      const promise = productManager.read(productShapefilePath);

      await expect(promise).rejects.toThrow(
        new ValidationError(`Failed to validate product shapefile of file: ${productShapefilePath}: ${errorMessage}`)
      );
    });

    it('should throw an error when product shapefile is not polygon or multipolygon', async () => {
      const { productShapefilePath } = generateInputFiles();
      const featurePoint: Feature<Point> = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Point',
          coordinates: [0, 0],
        },
      };
      const errorMessage = 'error';
      jest.spyOn(ShapefileChunkReader.prototype, 'readAndProcess').mockImplementation(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        (productManager as any).features = [featurePoint];
        await Promise.resolve();
      });

      const promise = productManager.read(productShapefilePath);

      await expect(promise).rejects.toThrow(
        new ValidationError(`Failed to validate product shapefile of file: ${productShapefilePath}: ${errorMessage}`)
      );
    });
  });
});
