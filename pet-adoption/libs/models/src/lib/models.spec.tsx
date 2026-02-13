import { render } from '@testing-library/react';

import OrgModels from './models';

describe('OrgModels', () => {
  
  it('should render successfully', () => {
    const { baseElement } = render(<OrgModels />);
    expect(baseElement).toBeTruthy();
  });
  
});
