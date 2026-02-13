import { featureAuth } from './feature-auth';

describe('featureAuth', () => {
    it('should work', () => {
        expect(featureAuth()).toEqual('feature-auth');
    })
})