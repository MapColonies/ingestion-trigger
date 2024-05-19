import { makeInsensitive } from '../../../src/utils/stringCapitalizationPermutations';

describe('makeInsensitive', () => {
  it('return all capitalization options', function () {
    const strings = ['Ab', 'cD'];

    const receivedStrings = makeInsensitive(...strings);

    const expectedStrings = ['ab', 'aB', 'Ab', 'AB', 'cd', 'cD', 'Cd', 'CD'];
    expect(receivedStrings).toEqual(expectedStrings);
  });
});
