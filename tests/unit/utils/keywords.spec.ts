import { mergeKeywords } from '../../../src/utils/keywords';

describe('mergeKeywords', () => {
  it('should join merged keywords without spaces around the commas', () => {
    const result = mergeKeywords('test', 'test2,test3');

    expect(result).toBe('test,test2,test3');
  });

  it('should deduplicate keywords that appear in both existing and incoming', () => {
    const result = mergeKeywords('forest,urban', 'urban,coast');

    expect(result).toBe('forest,urban,coast');
  });

  it('should trim whitespace around each keyword before merging', () => {
    const result = mergeKeywords(' forest , urban ', 'urban , coast ');

    expect(result).toBe('forest,urban,coast');
  });

  it('should return only the incoming keywords when existing is undefined', () => {
    const result = mergeKeywords(undefined, 'test,test2');

    expect(result).toBe('test,test2');
  });

  it('should return only the existing keywords when incoming is undefined', () => {
    const result = mergeKeywords('test,test2', undefined);

    expect(result).toBe('test,test2');
  });

  it('should return undefined when both existing and incoming are undefined', () => {
    const result = mergeKeywords(undefined, undefined);

    expect(result).toBeUndefined();
  });

  it('should ignore empty keyword tokens caused by consecutive or trailing commas', () => {
    const result = mergeKeywords('test,,test2', 'test3,');

    expect(result).toBe('test,test2,test3');
  });
});
