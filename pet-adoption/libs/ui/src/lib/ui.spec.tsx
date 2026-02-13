import { render } from '@testing-library/react';

import OrgUi from './ui';

describe('OrgUi', () => {
  
  it('should render successfully', () => {
    const { baseElement } = render(<OrgUi />);
    expect(baseElement).toBeTruthy();
  });
  
});
