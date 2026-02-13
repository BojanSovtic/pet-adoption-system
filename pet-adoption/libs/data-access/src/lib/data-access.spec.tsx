import { render } from '@testing-library/react';

import OrgDataAccess from './data-access';

describe('OrgDataAccess', () => {
  
  it('should render successfully', () => {
    const { baseElement } = render(<OrgDataAccess />);
    expect(baseElement).toBeTruthy();
  });
  
});
