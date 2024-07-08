import { combine, feature, featureCollection, buffer } from '@turf/turf';
import { GeoJSON, Feature, Polygon, MultiPolygon } from 'geojson';
import { InfoData } from '../ingestion/schemas/infoDataSchema';

export const combineExtentPolygons = (features: Feature<Polygon>[]): Feature<MultiPolygon> => {
  const collection = featureCollection(features);
  const combinedFeature = combine(collection);

  return combinedFeature.features[0] as Feature<MultiPolygon>;
};

export const extentBuffer = (extentBuffer: number, extent: GeoJSON): Feature<Polygon | MultiPolygon> | undefined => {
  return buffer(extent as Feature, extentBuffer, { units: 'meters' });
};

export const extractPolygons = (infoData: InfoData[]): Feature<Polygon>[] => {
  const polygonFeatures = infoData.map((data) => {
    const polygon = data.extentPolygon as Polygon;
    return feature(polygon);
  });
  return polygonFeatures;
};
