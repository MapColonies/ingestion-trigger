import { LayerMetadata } from '@map-colonies/mc-model-types';
import { OperationStatus } from '../common/enums';

export interface ICompletedTasks {
  completed: boolean;
  successful: boolean;
  metadata: LayerMetadata;
  relativePath: string;
  status: OperationStatus;
}

export interface ITaskZoomRange {
  minZoom: number;
  maxZoom: number;
}
