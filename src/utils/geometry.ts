import { FeatureCollection, combine, feature, featureCollection, Feature, buffer } from '@turf/turf';
import { GeoJSON } from 'geojson';
import { InfoData } from '../ingestion/schemas/infoDataSchema';

export const combineExtentPolygons = (infoData: InfoData[]): FeatureCollection => {
  const features = infoData.map((data) => {
    return feature(data.extentPolygon);
  });

  const collection = featureCollection(features);
  //console.log(JSON.stringify(collection, null, 2));

  const combinedFeature = combine(collection);

  //console.log(JSON.stringify(combinedFeature, null, 2));
  //const combinedExtentGeoJson = JSON.stringify(combinedFeature, null, 2);
  return combinedFeature;
};

export const extentBuffer = (extentBuffer: number, extent: GeoJSON): GeoJSON => {
  return buffer(extent as Feature, extentBuffer, { units: 'meters' });
};
