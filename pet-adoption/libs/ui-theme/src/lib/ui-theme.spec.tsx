import { render } from '@testing-library/react';

import OrgUiTheme from './ui-theme';

describe('OrgUiTheme', () => {
  
  it('should render successfully', () => {
    const { baseElement } = render(<OrgUiTheme />);
    expect(baseElement).toBeTruthy();
  });
  
});
