import supertest from 'supertest';
import type { IngestionNewLayer } from '../../../../src/ingestion/schemas/newLayerSchema';
import type { IngestionUpdateLayer } from '../../../../src/ingestion/schemas/updateLayerSchema';

export class IngestionRequestSender {
  public constructor(private readonly app: Express.Application) {}

  public async ingestNewLayer(body: IngestionNewLayer): Promise<supertest.Response> {
    return supertest.agent(this.app).post('/ingestion').set('Content-Type', 'application/json').send(body);
  }

  public async updateLayer(id: string, body: IngestionUpdateLayer): Promise<supertest.Response> {
    return supertest.agent(this.app).put(`/ingestion/${id}`).set('Content-Type', 'application/json').send(body);
  }

  public async retryIngestion(jobId: string): Promise<supertest.Response> {
    return supertest.agent(this.app).put(`/ingestion/${jobId}/retry`).set('Content-Type', 'application/json');
  }

  public async abortIngestion(jobId: string): Promise<supertest.Response> {
    return supertest.agent(this.app).put(`/ingestion/${jobId}/abort`).set('Content-Type', 'application/json');
  }
}
