import { promises as fsPromise, constants as fsConstants, readFileSync, Stats, lstatSync } from 'fs';
import S3 from 'aws-sdk/clients/s3';
import { singleton, inject } from 'tsyringe';
import { IConfig } from '../common/interfaces';
import { SERVICES } from '../common/constants';

interface IS3Config {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  bucket: string;
  forcePathStyle: boolean;
  sslEnabled: boolean;
}
@singleton()
export class FilesManager {
  //required for testing as fs promises cant be mocked here
  public openDir = fsPromise.opendir;
  //required for testing as fs promises cant be mocked here
  public readFileSync = readFileSync;

  public constructor(@inject(SERVICES.CONFIG) private readonly config: IConfig) {}

  public async fileExists(path: string): Promise<boolean> {
    return fsPromise
      .access(path, fsConstants.F_OK)
      .then(() => true)
      .catch(() => {
        return false;
      });
  }

  public directoryExists(fullPath: string): boolean {
    try {
      const stats: Stats = lstatSync(fullPath);
      return stats.isDirectory();
    } catch (e) {
      return false;
    }
  }

  public async readAllLines(path: string): Promise<string[]> {
    const content = await this.readAsString(path);
    return content.split(/\r?\n/);
  }

  public async readAsString(path: string): Promise<string> {
    return fsPromise.readFile(path, { encoding: 'utf8' });
  }

  public readAsStringSync(path: string): string {
    return readFileSync(path, { encoding: 'utf8' });
  }

  public async readS3ObjectAsString(key: string): Promise<string> {
    const s3Config = this.config.get<IS3Config>('S3');
    const s3 = new S3({
      credentials: {
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
      },
      endpoint: s3Config.endpoint,
      s3ForcePathStyle: s3Config.forcePathStyle,
      sslEnabled: s3Config.sslEnabled,
    });
    if (process.platform === 'win32') {
      key = key.replace(/\\/g, '/');
    }
    const options: S3.GetObjectRequest = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      Bucket: s3Config.bucket,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      Key: key,
    };
    return s3
      .getObject(options)
      .promise()
      .then((obj) => obj.Body?.toString('utf-8') as string);
  }
}
