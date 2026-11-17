import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PerforceLoginModal from '../../src/components/PerforceLoginModal.jsx';

function renderModal(over = {}) {
  const props = {
    open: true,
    defaultServer: 'ssl:perforce.example.com:1999',
    defaultUser: 'jlin',
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    ...over,
  };
  const view = render(<PerforceLoginModal {...props} />);
  return { ...view, props };
}

const serverBox = () => screen.getByLabelText(/server/i);
const userBox = () => screen.getByLabelText(/^user$/i);
const passwordBox = () => screen.getByLabelText(/password/i);
const submitBtn = () => screen.getByRole('button', { name: /^log in$/i });

const isFlagged = (el) => el.classList.contains('p4login-input-invalid');

beforeEach(() => {
  window.electron = { p4Login: vi.fn() };
});

describe('PerforceLoginModal visibility', () => {
  it('renders nothing when closed', () => {
    const { container } = renderModal({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('prefills the configured server and user', () => {
    renderModal();
    expect(serverBox()).toHaveValue('ssl:perforce.example.com:1999');
    expect(userBox()).toHaveValue('jlin');
    expect(passwordBox()).toHaveValue('');
  });

  it('never prefills a password', () => {
    renderModal();
    expect(passwordBox()).toHaveValue('');
  });
});

describe('local validation', () => {
  it('refuses to submit with an empty password and does not call Perforce', async () => {
    renderModal();
    await userEvent.click(submitBtn());
    expect(await screen.findByText(/all required/i)).toBeInTheDocument();
    expect(window.electron.p4Login).not.toHaveBeenCalled();
  });

  it('flags only the empty field, not the filled ones', async () => {
    renderModal();
    await userEvent.click(submitBtn());
    await screen.findByText(/all required/i);
    expect(isFlagged(passwordBox())).toBe(true);
    expect(isFlagged(serverBox())).toBe(false);
    expect(isFlagged(userBox())).toBe(false);
  });

  it('treats a whitespace-only server as empty', async () => {
    renderModal({ defaultServer: '   ' });
    await userEvent.type(passwordBox(), 'hunter2');
    await userEvent.click(submitBtn());
    await screen.findByText(/all required/i);
    expect(isFlagged(serverBox())).toBe(true);
    expect(window.electron.p4Login).not.toHaveBeenCalled();
  });
});

describe('submitting credentials', () => {
  it('sends trimmed server and user, with the password untouched', async () => {
    window.electron.p4Login.mockResolvedValue({ success: true });
    renderModal({ defaultServer: '  ssl:p4:1666  ', defaultUser: '  jlin  ' });
    await userEvent.type(passwordBox(), '  pa ss  ');
    await userEvent.click(submitBtn());
    await waitFor(() => expect(window.electron.p4Login).toHaveBeenCalled());
    expect(window.electron.p4Login).toHaveBeenCalledWith({
      server: 'ssl:p4:1666',
      user: 'jlin',
      password: '  pa ss  ',
    });
  });

  it('calls onSuccess after a successful login', async () => {
    window.electron.p4Login.mockResolvedValue({ success: true });
    const { props } = renderModal();
    await userEvent.type(passwordBox(), 'hunter2');
    await userEvent.click(submitBtn());
    await waitFor(() => expect(props.onSuccess).toHaveBeenCalledTimes(1));
  });

  it('does not call onSuccess when the server rejects the login', async () => {
    window.electron.p4Login.mockResolvedValue({
      success: false, error: 'Password invalid.', field: 'credentials',
    });
    const { props } = renderModal();
    await userEvent.type(passwordBox(), 'wrong');
    await userEvent.click(submitBtn());
    expect(await screen.findByText('Password invalid.')).toBeInTheDocument();
    expect(props.onSuccess).not.toHaveBeenCalled();
  });

  it('surfaces a thrown error instead of hanging', async () => {
    window.electron.p4Login.mockRejectedValue(new Error('bridge exploded'));
    renderModal();
    await userEvent.type(passwordBox(), 'hunter2');
    await userEvent.click(submitBtn());
    expect(await screen.findByText('bridge exploded')).toBeInTheDocument();
  });

  it('falls back to a generic message when the backend gives none', async () => {
    window.electron.p4Login.mockResolvedValue({ success: false });
    renderModal();
    await userEvent.type(passwordBox(), 'hunter2');
    await userEvent.click(submitBtn());
    expect(await screen.findByText(/login failed/i)).toBeInTheDocument();
  });
});

// Perforce deliberately returns the same "Password invalid." for a wrong password
// and a nonexistent user, so credentials is the most precise blame available.
describe('per-field blame on a rejected login', () => {
  async function failWith(field) {
    window.electron.p4Login.mockResolvedValue({ success: false, error: 'nope', field });
    renderModal();
    await userEvent.type(passwordBox(), 'hunter2');
    await userEvent.click(submitBtn());
    await screen.findByText('nope');
  }

  it('flags user and password — but not server — for a credentials failure', async () => {
    await failWith('credentials');
    expect(isFlagged(userBox())).toBe(true);
    expect(isFlagged(passwordBox())).toBe(true);
    expect(isFlagged(serverBox())).toBe(false);
  });

  it('flags only the server for a connection failure', async () => {
    await failWith('server');
    expect(isFlagged(serverBox())).toBe(true);
    expect(isFlagged(userBox())).toBe(false);
    expect(isFlagged(passwordBox())).toBe(false);
  });

  it('flags all three when the failure is unrecognized', async () => {
    await failWith('unknown');
    expect(isFlagged(serverBox())).toBe(true);
    expect(isFlagged(userBox())).toBe(true);
    expect(isFlagged(passwordBox())).toBe(true);
  });

  it('drops the stale highlight as soon as the user starts correcting it', async () => {
    await failWith('credentials');
    expect(isFlagged(passwordBox())).toBe(true);
    await userEvent.type(passwordBox(), 'x');
    expect(isFlagged(passwordBox())).toBe(false);
    expect(isFlagged(userBox())).toBe(false);
  });
});

describe('dismissing the form', () => {
  it('closes on the Not now button', async () => {
    const { props } = renderModal();
    await userEvent.click(screen.getByRole('button', { name: /not now/i }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on the X button', async () => {
    const { props } = renderModal();
    await userEvent.click(screen.getByLabelText('close'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when a click starts and ends on the backdrop', async () => {
    const { container, props } = renderModal();
    const overlay = container.querySelector('.p4login-overlay');
    await userEvent.click(overlay);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open when a drag starts inside the card and ends on the backdrop', async () => {
    // Selecting text in a field and releasing outside must not discard what was typed.
    const { container, props } = renderModal();
    const overlay = container.querySelector('.p4login-overlay');
    await userEvent.pointer([
      { target: serverBox(), keys: '[MouseLeft>]' },
      { target: overlay, keys: '[/MouseLeft]' },
    ]);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('stays open when a click lands entirely inside the card', async () => {
    const { props } = renderModal();
    await userEvent.click(screen.getByText(/log in to perforce/i));
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
