import { ZodValidator } from '../../src/utils/zodValidator';

const validateMock = jest.fn();

export const mockZodValidator = {
  validate: validateMock,
} as unknown as ZodValidator;
