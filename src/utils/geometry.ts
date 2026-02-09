import { buffer } from '@turf/buffer';
import { combine } from '@turf/combine';
import { feature, featureCollection } from '@turf/helpers';
import { Feature, MultiPolygon, Polygon } from 'geojson';
import { InfoData } from '../ingestion/schemas/infoDataSchema';

export const combineExtentPolygons = (features: Feature<Polygon>[]): Feature<MultiPolygon> => {
  const collection = featureCollection(features);
  const combinedFeature = combine(collection);

  return combinedFeature.features[0] as Feature<MultiPolygon>;
};

export const extentBuffer = (extentBuffer: number, extent: Feature): Feature<Polygon | MultiPolygon> | undefined => {
  return buffer(extent, extentBuffer, { units: 'meters' });
};

export const extractPolygons = (infoData: InfoData[]): Feature<Polygon>[] => {
  const polygonFeatures = infoData.map((data) => {
    const polygon = data.extentPolygon as Polygon;
    return feature(polygon);
  });
  return polygonFeatures;
};
