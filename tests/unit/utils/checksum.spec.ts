import { constants, createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import jsLogger, { Logger } from '@map-colonies/js-logger';
import { trace, Tracer } from '@opentelemetry/api';
import { Checksum } from '../../../src/utils/hash/checksum';
import { ChecksumError } from '../../../src/ingestion/errors/ingestionErrors';
import type { ChecksumProcessor } from '../../../src/utils/hash/interfaces';
import { tracerMock } from '../../mocks/mockFactory';

jest.mock('node:fs');
jest.mock('@opentelemetry/api');

describe('Checksum', () => {
  let checksum: Checksum;
  let mockLogger: Logger;
  let mockTracer: Tracer;
  let mockChecksumProcessor: jest.Mocked<ChecksumProcessor>;
  let mockChecksumProcessorInit: jest.Mock;

  beforeEach(() => {
    mockLogger = jsLogger({ enabled: false });

    mockTracer = tracerMock;

    mockChecksumProcessor = {
      algorithm: 'XXH64',
      reset: jest.fn(),
      update: jest.fn().mockReturnThis(),
      digest: jest.fn(),
    } as unknown as jest.Mocked<ChecksumProcessor>;

    mockChecksumProcessorInit = jest.fn().mockResolvedValue(mockChecksumProcessor);

    (trace.getActiveSpan as jest.Mock) = jest.fn().mockReturnValue({
      updateName: jest.fn(),
    });

    checksum = new Checksum(mockLogger, mockTracer, mockChecksumProcessorInit);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculate', () => {
    it('should successfully calculate checksum for a file', async () => {
      const filePath = '/test/path/file.txt';
      const mockStream = new Readable();
      mockStream._read = jest.fn();

      const digestValue = 0xabc123def456n;
      const expectedChecksum = digestValue.toString(16);

      (createReadStream as jest.Mock).mockReturnValue(mockStream);
      mockChecksumProcessor.digest.mockReturnValue(digestValue);

      const calculatePromise = checksum.calculate(filePath);

      // Simulate stream data and end events
      process.nextTick(() => {
        mockStream.emit('data', Buffer.from('test data'));
        mockStream.emit('end');
      });

      const result = await calculatePromise;

      expect(result).toEqual({
        algorithm: 'XXH64',
        checksum: expectedChecksum,
        fileName: filePath,
      });
      expect(createReadStream).toHaveBeenCalledWith(filePath, { mode: constants.R_OK });
      expect(mockChecksumProcessorInit).toHaveBeenCalled();
      expect(mockChecksumProcessor.reset).toHaveBeenCalled();
      expect(mockChecksumProcessor.update).toHaveBeenCalledWith(Buffer.from('test data'));
      expect(mockChecksumProcessor.digest).toHaveBeenCalled();
    });

    it('should handle checksum processor without reset method', async () => {
      const filePath = '/test/path/file.txt';
      const mockStream = new Readable();
      mockStream._read = jest.fn();

      const digestValue = 0xfedcba987654n;
      const expectedChecksum = digestValue.toString(16);

      const processorWithoutReset = {
        algorithm: 'XXH64' as const,
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue(digestValue),
      };

      mockChecksumProcessorInit.mockResolvedValue(processorWithoutReset);
      (createReadStream as jest.Mock).mockReturnValue(mockStream);

      const calculatePromise = checksum.calculate(filePath);

      process.nextTick(() => {
        mockStream.emit('data', Buffer.from('test data'));
        mockStream.emit('end');
      });

      const result = await calculatePromise;

      expect(result).toEqual({
        algorithm: 'XXH64',
        checksum: expectedChecksum,
        fileName: filePath,
      });
      expect(processorWithoutReset.update).toHaveBeenCalled();
    });

    it('should handle multiple data chunks', async () => {
      const filePath = '/test/path/large-file.txt';
      const mockStream = new Readable();
      mockStream._read = jest.fn();

      const digestValue = 0x123456789abcn;
      const expectedChecksum = digestValue.toString(16);

      (createReadStream as jest.Mock).mockReturnValue(mockStream);
      mockChecksumProcessor.digest.mockReturnValue(digestValue);

      const calculatePromise = checksum.calculate(filePath);

      process.nextTick(() => {
        mockStream.emit('data', Buffer.from('chunk 1'));
        mockStream.emit('data', Buffer.from('chunk 2'));
        mockStream.emit('data', Buffer.from('chunk 3'));
        mockStream.emit('end');
      });

      const result = await calculatePromise;

      expect(result.checksum).toBe(expectedChecksum);
      expect(mockChecksumProcessor.update).toHaveBeenCalledTimes(3);
      expect(mockChecksumProcessor.update).toHaveBeenNthCalledWith(1, Buffer.from('chunk 1'));
      expect(mockChecksumProcessor.update).toHaveBeenNthCalledWith(2, Buffer.from('chunk 2'));
      expect(mockChecksumProcessor.update).toHaveBeenNthCalledWith(3, Buffer.from('chunk 3'));
    });

    it('should throw ChecksumError when file stream fails', async () => {
      const filePath = '/test/path/nonexistent.txt';
      const mockStream = new Readable();
      mockStream._read = jest.fn();
      const streamError = new Error('File not found');

      (createReadStream as jest.Mock).mockReturnValue(mockStream);

      const calculatePromise = checksum.calculate(filePath);

      process.nextTick(() => {
        mockStream.emit('error', streamError);
      });

      await expect(calculatePromise).rejects.toThrow(ChecksumError);
      await expect(calculatePromise).rejects.toThrow(`Failed to calculate checksum for file: ${filePath}`);
    });

    it('should throw ChecksumError when processor update fails', async () => {
      const filePath = '/test/path/file.txt';
      const mockStream = new Readable();
      mockStream._read = jest.fn();
      const updateError = new Error('Processor update failed');

      (createReadStream as jest.Mock).mockReturnValue(mockStream);
      mockChecksumProcessor.update.mockImplementation(() => {
        throw updateError;
      });

      const calculatePromise = checksum.calculate(filePath);

      process.nextTick(() => {
        mockStream.emit('data', Buffer.from('test data'));
      });

      await expect(calculatePromise).rejects.toThrow(ChecksumError);
      await expect(calculatePromise).rejects.toThrow(`Failed to calculate checksum for file: ${filePath}`);
    });

    it('should throw ChecksumError when processor digest fails', async () => {
      const filePath = '/test/path/file.txt';
      const mockStream = new Readable();
      mockStream._read = jest.fn();
      const digestError = new Error('Digest failed');

      (createReadStream as jest.Mock).mockReturnValue(mockStream);
      mockChecksumProcessor.digest.mockImplementation(() => {
        throw digestError;
      });

      const calculatePromise = checksum.calculate(filePath);

      process.nextTick(() => {
        mockStream.emit('data', Buffer.from('test data'));
        mockStream.emit('end');
      });

      await expect(calculatePromise).rejects.toThrow(ChecksumError);
      await expect(calculatePromise).rejects.toThrow(`Failed to calculate checksum for file: ${filePath}`);
    });

    it('should throw ChecksumError when checksumProcessorInit fails', async () => {
      const filePath = '/test/path/file.txt';
      const initError = new Error('Processor initialization failed');

      mockChecksumProcessorInit.mockRejectedValue(initError);

      await expect(checksum.calculate(filePath)).rejects.toThrow(ChecksumError);
      await expect(checksum.calculate(filePath)).rejects.toThrow(`Failed to calculate checksum for file: ${filePath}`);
    });

    it('should destroy stream when update throws error', async () => {
      const filePath = '/test/path/file.txt';
      const mockStream = new Readable();
      mockStream._read = jest.fn();
      const mockDestroy = jest.fn();
      mockStream.destroy = mockDestroy;
      const updateError = new Error('Update error');

      (createReadStream as jest.Mock).mockReturnValue(mockStream);
      mockChecksumProcessor.update.mockImplementation(() => {
        throw updateError;
      });

      const calculatePromise = checksum.calculate(filePath);

      process.nextTick(() => {
        mockStream.emit('data', Buffer.from('test data'));
      });

      await expect(calculatePromise).rejects.toThrow(ChecksumError);
      expect(mockDestroy).toHaveBeenCalled();
    });

    it('should destroy stream when digest throws error', async () => {
      const filePath = '/test/path/file.txt';
      const mockStream = new Readable();
      mockStream._read = jest.fn();
      const mockDestroy = jest.fn();
      mockStream.destroy = mockDestroy;
      const digestError = new Error('Digest error');

      (createReadStream as jest.Mock).mockReturnValue(mockStream);
      mockChecksumProcessor.digest.mockImplementation(() => {
        throw digestError;
      });

      const calculatePromise = checksum.calculate(filePath);

      process.nextTick(() => {
        mockStream.emit('data', Buffer.from('test data'));
        mockStream.emit('end');
      });

      await expect(calculatePromise).rejects.toThrow(ChecksumError);
      expect(mockDestroy).toHaveBeenCalled();
    });

    it('should destroy stream on stream error', async () => {
      const filePath = '/test/path/file.txt';
      const mockStream = new Readable();
      mockStream._read = jest.fn();
      const mockDestroy = jest.fn();
      mockStream.destroy = mockDestroy;
      const streamError = new Error('Stream error');

      (createReadStream as jest.Mock).mockReturnValue(mockStream);

      const calculatePromise = checksum.calculate(filePath);

      process.nextTick(() => {
        mockStream.emit('error', streamError);
      });

      await expect(calculatePromise).rejects.toThrow(ChecksumError);
      expect(mockDestroy).toHaveBeenCalled();
    });

    it('should convert digest bigint to hex string correctly', async () => {
      const filePath = '/test/path/file.txt';
      const mockStream = new Readable();
      mockStream._read = jest.fn();

      const digestValue = 0xabcdef1234567890n;

      (createReadStream as jest.Mock).mockReturnValue(mockStream);
      mockChecksumProcessor.digest.mockReturnValue(digestValue);

      const calculatePromise = checksum.calculate(filePath);

      process.nextTick(() => {
        mockStream.emit('data', Buffer.from('test data'));
        mockStream.emit('end');
      });

      const result = await calculatePromise;

      expect(result.checksum).toBe('abcdef1234567890');
      expect(result.algorithm).toBe('XXH64');
      expect(result.fileName).toBe(filePath);
    });
  });
});
