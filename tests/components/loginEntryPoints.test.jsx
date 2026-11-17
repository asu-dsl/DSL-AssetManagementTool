import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfileCard from '../../src/components/ProfileCard.jsx';
import SettingsCard from '../../src/components/SettingsCard.jsx';

// There are three ways into the Perforce login form: the warning triangle in the
// profile bar, the Login button in settings, and the banner button in the Perforce
// panel (covered in P4Panel.test.jsx). All three go through onOpenP4Login, so these
// pin the two older entry points against regressions in that shared wiring.

function renderProfile(over = {}) {
  const props = {
    displayName: 'Jubilee Lin',
    p4User: 'jlin',
    p4Connected: false,
    p4Error: null,
    onEditDisplayName: vi.fn(),
    onConnectPerforce: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenP4Login: vi.fn(),
    ...over,
  };
  const view = render(<ProfileCard {...props} />);
  return { ...view, props };
}

function renderSettings(over = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    libraries: [],
    onAddLibrary: vi.fn(),
    onRelink: vi.fn(),
    onRemove: vi.fn(),
    onScan: vi.fn(),
    scanning: false,
    scanInfo: null,
    p4: { available: true, connected: false, user: 'jlin' },
    onTestPerforce: vi.fn(),
    onOpenP4Login: vi.fn(),
    ...over,
  };
  const view = render(<SettingsCard {...props} />);
  return { ...view, props };
}

const warnTriangle = (container) => container.querySelector('.pf-warn');

describe('ProfileCard login entry point', () => {
  it('shows the warning affordance only while disconnected', () => {
    const { container, unmount } = renderProfile({ p4Connected: false });
    expect(warnTriangle(container)).toBeInTheDocument();
    unmount();

    const { container: c2 } = renderProfile({ p4Connected: true });
    expect(warnTriangle(c2)).not.toBeInTheDocument();
  });

  it('opens the login form when the warning is clicked', async () => {
    const { container, props } = renderProfile();
    await userEvent.click(warnTriangle(container));
    expect(props.onOpenP4Login).toHaveBeenCalledTimes(1);
  });

  it('opens the login form from the keyboard', async () => {
    const { container, props } = renderProfile();
    warnTriangle(container).focus();
    await userEvent.keyboard('{Enter}');
    expect(props.onOpenP4Login).toHaveBeenCalledTimes(1);
  });

  it('surfaces the underlying Perforce error in the tooltip when there is one', () => {
    renderProfile({ p4Error: 'Password invalid.' });
    expect(screen.getByRole('tooltip')).toHaveTextContent('P4 Connection Error: Password invalid.');
  });

  it('falls back to a plain message when there is no error detail', () => {
    renderProfile({ p4Error: null });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Perforce is not connected.');
  });

  it('reports the signed-in Perforce user, or says nobody is', () => {
    const { unmount } = renderProfile({ p4User: 'jlin' });
    expect(screen.getByText('p4: jlin')).toBeInTheDocument();
    unmount();

    renderProfile({ p4User: null });
    expect(screen.getByText('not signed in')).toBeInTheDocument();
  });
});

describe('ProfileCard avatar initials', () => {
  it.each([
    ['Jubilee Lin', 'JL'],
    ['Jubilee', 'J'],
    ['  Jubilee   Mary  Lin ', 'JM'],
    ['jubilee lin', 'JL'],
  ])('renders %j as %s', (name, initials) => {
    const { unmount } = renderProfile({ displayName: name });
    expect(screen.getByText(initials)).toBeInTheDocument();
    unmount();
  });

  it('falls back to a placeholder for an empty name', () => {
    renderProfile({ displayName: '' });
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});

describe('SettingsCard login entry point', () => {
  const loginBtn = () => screen.getByRole('button', { name: /^login$/i });

  it('renders nothing when closed', () => {
    const { container } = renderSettings({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('offers Login while disconnected', async () => {
    const { props } = renderSettings({ p4: { available: true, connected: false } });
    expect(loginBtn()).toBeEnabled();
    await userEvent.click(loginBtn());
    expect(props.onOpenP4Login).toHaveBeenCalledTimes(1);
  });

  it('disables Login once connected', () => {
    // Nothing to log into — the derived modal state could not open it anyway.
    renderSettings({ p4: { available: true, connected: true, user: 'jlin' } });
    expect(loginBtn()).toBeDisabled();
  });

  it('reports the connection state in words', () => {
    const { unmount } = renderSettings({ p4: { available: true, connected: true, user: 'jlin' } });
    expect(screen.getByText(/connected · jlin/i)).toBeInTheDocument();
    unmount();

    renderSettings({ p4: { available: true, connected: false } });
    expect(screen.getByText(/not connected/i)).toBeInTheDocument();
  });

  it('runs a connection test without opening the login form', async () => {
    const { props } = renderSettings();
    await userEvent.click(screen.getByRole('button', { name: /^test$/i }));
    expect(props.onTestPerforce).toHaveBeenCalledTimes(1);
    expect(props.onOpenP4Login).not.toHaveBeenCalled();
  });
});
