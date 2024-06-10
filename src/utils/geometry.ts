import { combine, feature, featureCollection, buffer } from '@turf/turf';
import { GeoJSON, FeatureCollection, Feature, Polygon, MultiPolygon, Geometry } from 'geojson';
import { InfoData } from '../ingestion/schemas/infoDataSchema';

export const combineExtentPolygons = (infoData: InfoData[]): Feature<MultiPolygon> => {
  const features = infoData.map((data) => {
    const polygon = data.extentPolygon as Polygon;
    return feature(polygon);
  });

  const collection = featureCollection(features);
  const combinedFeature = combine(collection);

  // Collect all Polygon and MultiPolygon coordinates into one MultiPolygon
  const multiPolygonCoordinates: MultiPolygon['coordinates'] = [];

  combinedFeature.features.forEach((feat) => {
    const geometry = feat.geometry as Geometry;
    if (geometry.type === 'Polygon') {
      multiPolygonCoordinates.push(geometry.coordinates);
    } else if (geometry.type === 'MultiPolygon') {
      multiPolygonCoordinates.push(...geometry.coordinates);
    } else {
      throw new Error(`Unexpected geometry type: ${geometry.type}`);
    }
  });

  // Create a MultiPolygon feature with the collected coordinates
  const multiPolygon: MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: multiPolygonCoordinates,
  };

  return feature(multiPolygon);
};

export const extentBuffer = (extentBuffer: number, extent: GeoJSON): Feature<Polygon | MultiPolygon> | undefined => {
  return buffer(extent as Feature, extentBuffer, { units: 'meters' });
};
