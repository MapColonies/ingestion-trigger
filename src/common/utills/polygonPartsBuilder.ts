import { LayerMetadata } from '@map-colonies/mc-model-types';
import { bbox } from '@turf/turf';
import { GeoJSON, Geometry } from 'geojson';

export const layerMetadataToPolygonParts = (metadata: LayerMetadata): GeoJSON => {
  return {
    bbox: bbox(metadata.footprint as GeoJSON),
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: metadata.footprint as Geometry,
        properties: {
          /* eslint-disable @typescript-eslint/naming-convention */
          Dsc: metadata.description,
          Rms: metadata.rms ?? null,
          Ep90: metadata.minHorizontalAccuracyCE90 ?? null,
          Scale: metadata.scale ?? null,
          Cities: null,
          Source: `${metadata.productId as string}-${metadata.productVersion as string}`,
          Countries: metadata.region?.join(',') ?? '',
          Resolution: metadata.maxResolutionDeg?.toString(),
          SensorType: metadata.sensors?.join(',') ?? '',
          SourceName: metadata.productName,
          UpdateDate: new Date(metadata.sourceDateEnd as Date).toLocaleDateString('en-GB'),
          /* eslint-enable @typescript-eslint/naming-convention */
        },
      },
    ],
  };
};
