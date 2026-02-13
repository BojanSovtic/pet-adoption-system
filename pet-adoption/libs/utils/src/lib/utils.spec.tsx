import { render } from '@testing-library/react';

import OrgUtils from './utils';

describe('OrgUtils', () => {
  
  it('should render successfully', () => {
    const { baseElement } = render(<OrgUtils />);
    expect(baseElement).toBeTruthy();
  });
  
});
