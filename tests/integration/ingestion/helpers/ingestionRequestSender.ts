import type { InputFiles } from '@map-colonies/mc-model-types';
import supertest from 'supertest';
import type { IngestionNewLayer } from '../../../../src/ingestion/schemas/ingestionLayerSchema';
import type { IngestionUpdateLayer } from '../../../../src/ingestion/schemas/updateLayerSchema';

export class IngestionRequestSender {
  public constructor(private readonly app: Express.Application) {}

  public async ingestNewLayer(body: IngestionNewLayer): Promise<supertest.Response> {
    return supertest.agent(this.app).post('/ingestion').set('Content-Type', 'application/json').send(body);
  }

  public async updateLayer(id: string, body: IngestionUpdateLayer): Promise<supertest.Response> {
    return supertest.agent(this.app).put(`/ingestion/${id}`).set('Content-Type', 'application/json').send(body);
  }

  public async validateSources(body: InputFiles): Promise<supertest.Response> {
    return supertest.agent(this.app).post('/ingestion/validateSources').set('Content-Type', 'application/json').send(body);
  }

  public async getSourcesGdalInfo(body: InputFiles): Promise<supertest.Response> {
    return supertest.agent(this.app).post('/ingestion/sourcesInfo').set('Content-Type', 'application/json').send(body);
  }
}
