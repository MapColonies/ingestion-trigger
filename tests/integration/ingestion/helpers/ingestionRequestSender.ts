import supertest from 'supertest';
import { InputFiles, NewRasterLayer } from '@map-colonies/mc-model-types';

export class IngestionRequestSender {
  public constructor(private readonly app: Express.Application) {}

  public async ingestNewLayer(body: NewRasterLayer): Promise<supertest.Response> {
    return supertest.agent(this.app).post('/ingestion').send(body).set('Content-Type', 'application/json');
  }

  public async validateSources(body: InputFiles): Promise<supertest.Response> {
    return supertest.agent(this.app).post('/ingestion/validateSources').send(body).set('Content-Type', 'application/json');
  }

  public async getSourcesGdalInfo(body: InputFiles): Promise<supertest.Response> {
    return supertest.agent(this.app).post('/ingestion/sourcesInfo').send(body).set('Content-Type', 'application/json');
  }
}
