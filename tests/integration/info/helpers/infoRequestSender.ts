import supertest from 'supertest';
import type { GpkgInputFiles } from '../../../../src/ingestion/schemas/inputFilesSchema';

export class InfoRequestSender {
  public constructor(private readonly app: Express.Application) {}

  public async getGpkgsInfo(body: GpkgInputFiles): Promise<supertest.Response> {
    return supertest.agent(this.app).post('/info/gpkgs').set('Content-Type', 'application/json').send(body);
  }
}
