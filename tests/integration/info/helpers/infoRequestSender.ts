import { type Response, agent } from 'supertest';
import type { GpkgInputFiles } from '../../../../src/utils/validation/schemasValidator';

export class InfoRequestSender {
  public constructor(private readonly app: Express.Application) {}

  public async getGpkgsInfo(body: GpkgInputFiles): Promise<Response> {
    return agent(this.app).post('/info/gpkgs').set('Content-Type', 'application/json').send(body);
  }
}
