import { describe, expect, it } from 'vitest';
import { findPath, isWalkable, POND } from './world-layout';

function expectSafeRoute(start: [number, number], destination: [number, number]) {
  const path = findPath(...start, ...destination);
  expect(path.length).toBeGreaterThan(0);
  expect(path.at(-1)).toEqual(destination);
  let previous = start;
  for (const waypoint of path) {
    const steps = Math.max(1, Math.ceil(Math.hypot(waypoint[0]-previous[0],waypoint[1]-previous[1])/.1));
    for (let i=0; i<=steps; i++) {
      const x=previous[0]+(waypoint[0]-previous[0])*i/steps;
      const z=previous[1]+(waypoint[1]-previous[1])*i/steps;
      expect(isWalkable(x,z,.26), `unsafe route point ${x}, ${z}`).toBe(true);
    }
    previous=waypoint;
  }
  return path;
}

describe('temple navigation', () => {
  it('walks directly from the courtyard into the open main hall', () => {
    expectSafeRoute([0,16],[0,-11.9]);
  });

  it('routes around the koi pond instead of crossing the water', () => {
    const path=expectSafeRoute([0,16],[-22,0]);
    expect(path.length).toBeGreaterThan(2);
    expect(isWalkable(POND.x,POND.z)).toBe(false);
  });

  it('escapes a column edge even when rounding the starting cell lands inside the column', () => {
    expect(isWalkable(6,-7,.45)).toBe(false);
    expectSafeRoute([5.7,-6.6],[6.7,-10.8]);
  });

  it('rejects altar, walls, invalid numbers and destinations outside the map', () => {
    for (const destination of [[0,-14],[-7.55,-12],[0,-27],[30,0],[NaN,2],[0,Infinity]] as [number,number][]) {
      expect(findPath(0,16,...destination)).toEqual([]);
    }
  });

  it('keeps the entrance open between the two gate posts', () => {
    expectSafeRoute([0,20],[0,25]);
    expect(isWalkable(4,23)).toBe(false);
    expect(isWalkable(10,23.3)).toBe(false);
  });
});
