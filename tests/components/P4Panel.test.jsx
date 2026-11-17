import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import P4Panel from '../../src/components/P4Panel.jsx';

const AUTH_ERROR = 'Perforce password (P4PASSWD) invalid or unset.';
const MERGE_ERROR = 'Merges still pending -- use resolve to merge files.';

const p4State = (over = {}) => ({
  available: true, connected: true, user: 'jlin', server: 'ssl:p4:1666',
  client: 'art-ws', ...over,
});

const openedFile = {
  depotFile: '//depot/art/barrel.fbx',
  clientFile: 'C:/work/art/barrel.fbx',
  action: 'edit',
  rev: '3',
};

function renderPanel(over = {}) {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    currentFolder: '//depot/art',
    p4: p4State(),
    onRefreshConnection: vi.fn().mockResolvedValue(undefined),
    artDepotClient: 'art-ws',
    artDepotRoot: 'C:/work',
    openedFiles: [],
    onRefreshOpened: vi.fn().mockResolvedValue(undefined),
    onOpenP4Login: vi.fn(),
    p4SessionEpoch: 0,
    ...over,
  };
  const view = render(<P4Panel {...props} />);
  return { ...view, props };
}

const loginButton = () => screen.queryByRole('button', { name: /log in/i });

beforeEach(() => {
  window.electron = {
    p4Submit: vi.fn(),
    p4RevertFiles: vi.fn(),
    p4Sync: vi.fn(),
    p4Diff: vi.fn(),
  };
  // jsdom leaves window.confirm unimplemented, returning undefined — which reads as
  // "cancelled" and makes handleRevert bail before it ever calls Perforce.
  window.confirm = vi.fn(() => true);
});

describe('P4Panel rendering', () => {
  it('renders nothing when closed', () => {
    const { container } = renderPanel({ isOpen: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('refreshes the shared opened-files list when it opens', () => {
    const onRefreshOpened = vi.fn().mockResolvedValue(undefined);
    renderPanel({ onRefreshOpened });
    expect(onRefreshOpened).toHaveBeenCalled();
  });
});

describe('disconnected banner', () => {
  it('reports a missing connection and offers a Log in button', () => {
    renderPanel({ p4: p4State({ connected: false }) });
    expect(screen.getByText('Not connected to Perforce server')).toBeInTheDocument();
    expect(loginButton()).toBeInTheDocument();
  });

  it('calls onOpenP4Login when the button is clicked', async () => {
    const onOpenP4Login = vi.fn();
    renderPanel({ p4: p4State({ connected: false }), onOpenP4Login });
    await userEvent.click(loginButton());
    expect(onOpenP4Login).toHaveBeenCalledTimes(1);
  });

  it('does not close the panel when the Log in button is clicked', async () => {
    // The button sits inside the panel, whose overlay closes on click — the panel
    // must stay open behind the login form.
    const onClose = vi.fn();
    renderPanel({ p4: p4State({ connected: false }), onClose });
    await userEvent.click(loginButton());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows no banner at all while connected', () => {
    renderPanel();
    expect(screen.queryByText('Not connected to Perforce server')).not.toBeInTheDocument();
    expect(loginButton()).not.toBeInTheDocument();
  });

  it('hides the Log in button when the Perforce CLI is unavailable', () => {
    // Nothing to log into — the modal could not open, so the button would be dead.
    renderPanel({ p4: p4State({ available: false, connected: false }) });
    expect(screen.getByText('Not connected to Perforce server')).toBeInTheDocument();
    expect(loginButton()).not.toBeInTheDocument();
  });

  it('clears the banner once the connection comes back', () => {
    const { rerender, props } = renderPanel({ p4: p4State({ connected: false }) });
    expect(loginButton()).toBeInTheDocument();
    rerender(<P4Panel {...props} p4={p4State({ connected: true })} />);
    expect(screen.queryByText('Not connected to Perforce server')).not.toBeInTheDocument();
    expect(loginButton()).not.toBeInTheDocument();
  });
});

describe('operation errors', () => {
  async function submit(result, over = {}) {
    if (result instanceof Error) window.electron.p4Submit.mockRejectedValue(result);
    else window.electron.p4Submit.mockResolvedValue(result);
    const view = renderPanel({ openedFiles: [openedFile], ...over });
    await userEvent.type(
      screen.getByPlaceholderText(/changelist description/i), 'tweak barrel',
    );
    await userEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    return view;
  }

  it('offers a Log in button when a submit fails on an expired session', async () => {
    // The scenario the feature exists for: the ticket expires mid-task, so
    // p4.connected is still a stale true and only the error text reveals it.
    await submit({ success: false, error: AUTH_ERROR });
    expect(await screen.findByText(AUTH_ERROR)).toBeInTheDocument();
    expect(loginButton()).toBeInTheDocument();
  });

  it('offers a Log in button when submit throws an auth error', async () => {
    await submit(new Error(AUTH_ERROR));
    expect(await screen.findByText(AUTH_ERROR)).toBeInTheDocument();
    expect(loginButton()).toBeInTheDocument();
  });

  it('shows no Log in button for a non-auth submit failure', async () => {
    await submit({ success: false, error: MERGE_ERROR });
    expect(await screen.findByText(MERGE_ERROR)).toBeInTheDocument();
    expect(loginButton()).not.toBeInTheDocument();
  });

  it('shows no Log in button on a successful submit', async () => {
    await submit({ success: true, changelist: '4312' });
    expect(await screen.findByText(/changelist 4312/i)).toBeInTheDocument();
    expect(loginButton()).not.toBeInTheDocument();
  });

  it('disables submit on an empty description without any login affordance', () => {
    renderPanel({ openedFiles: [openedFile] });
    expect(screen.getByRole('button', { name: /^submit$/i })).toBeDisabled();
    expect(loginButton()).not.toBeInTheDocument();
  });

  it('offers a Log in button when a sync fails on an expired session', async () => {
    window.electron.p4Sync.mockResolvedValue({ success: false, error: AUTH_ERROR });
    renderPanel();
    await userEvent.click(screen.getByTitle(/sync \/ get latest/i));
    expect(await screen.findByText(AUTH_ERROR)).toBeInTheDocument();
    expect(loginButton()).toBeInTheDocument();
  });

  it('shows no Log in button when a sync fails for a non-auth reason', async () => {
    const msg = 'Path //depot/art/... is not under client root.';
    window.electron.p4Sync.mockResolvedValue({ success: false, error: msg });
    renderPanel();
    await userEvent.click(screen.getByTitle(/sync \/ get latest/i));
    expect(await screen.findByText(msg)).toBeInTheDocument();
    expect(loginButton()).not.toBeInTheDocument();
  });

  it('offers a Log in button when a revert fails on an expired session', async () => {
    window.electron.p4RevertFiles.mockResolvedValue({ success: false, error: AUTH_ERROR });
    renderPanel({ openedFiles: [openedFile] });
    await userEvent.click(screen.getByTitle(/revert unchanged/i));
    expect(await screen.findByText(AUTH_ERROR)).toBeInTheDocument();
    expect(loginButton()).toBeInTheDocument();
  });
});

// Regression: p4.connected is already true in the stale case, so a successful login
// never changes it. Keying the clearing effect only on p4.connected left the auth
// banner — and its Log in button — on screen after the user had already logged in.
describe('banner clearing after a successful login', () => {
  it('clears a stale-session auth banner when the session epoch advances', async () => {
    window.electron.p4Submit.mockResolvedValue({ success: false, error: AUTH_ERROR });
    const { rerender, props } = renderPanel({ openedFiles: [openedFile] });
    await userEvent.type(
      screen.getByPlaceholderText(/changelist description/i), 'tweak barrel',
    );
    await userEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    expect(await screen.findByText(AUTH_ERROR)).toBeInTheDocument();

    // The user logs in. p4.connected was — and stays — true throughout.
    rerender(<P4Panel {...props} openedFiles={[openedFile]} p4SessionEpoch={1} />);

    await waitFor(() => {
      expect(screen.queryByText(AUTH_ERROR)).not.toBeInTheDocument();
    });
    expect(loginButton()).not.toBeInTheDocument();
  });

  it('keeps a non-auth error visible across a login', async () => {
    window.electron.p4Submit.mockResolvedValue({ success: false, error: MERGE_ERROR });
    const { rerender, props } = renderPanel({ openedFiles: [openedFile] });
    await userEvent.type(
      screen.getByPlaceholderText(/changelist description/i), 'tweak barrel',
    );
    await userEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    expect(await screen.findByText(MERGE_ERROR)).toBeInTheDocument();

    rerender(<P4Panel {...props} openedFiles={[openedFile]} p4SessionEpoch={1} />);
    expect(screen.getByText(MERGE_ERROR)).toBeInTheDocument();
  });
});
