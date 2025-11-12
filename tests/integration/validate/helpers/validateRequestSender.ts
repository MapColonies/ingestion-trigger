import supertest from 'supertest';
import type { GpkgInputFiles } from '../../../../src/utils/validation/schemasValidator';

export class ValidateRequestSender {
  public constructor(private readonly app: Express.Application) {}

  public async validateGpkgs(body: GpkgInputFiles): Promise<supertest.Response> {
    return supertest.agent(this.app).post('/validate/gpkgs').set('Content-Type', 'application/json').send(body);
  }
}
