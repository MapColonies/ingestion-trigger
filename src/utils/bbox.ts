import { bbox } from '@turf/turf';
import { GeoJSON } from 'geojson';

export const createBBoxString = (footprint: GeoJSON): string => {
  const bboxCords = bbox(footprint);
  //format: "minX,minY,maxX,maxY"
  return `${bboxCords[0]},${bboxCords[1]},${bboxCords[2]},${bboxCords[3]}`;
};
