import { readFileSync } from 'fs';
import { singleton } from 'tsyringe';

@singleton()
export class FilesManager {
  //required for testing as fs promises cant be mocked here
  public readFileSync = readFileSync;
}
