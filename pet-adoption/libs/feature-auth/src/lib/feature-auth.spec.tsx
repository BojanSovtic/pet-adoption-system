import { render } from '@testing-library/react';

import OrgFeatureAuth from './feature-auth';

describe('OrgFeatureAuth', () => {
  
  it('should render successfully', () => {
    const { baseElement } = render(<OrgFeatureAuth />);
    expect(baseElement).toBeTruthy();
  });
  
});
