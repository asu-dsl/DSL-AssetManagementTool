import { useEffect, useRef, useState } from 'react';
import { X, LogIn } from 'lucide-react';
import './PerforceLoginModal.css';

function PerforceLoginModal({ open, defaultServer, defaultUser, onClose, onSuccess }) {
  const [server, setServer] = useState(defaultServer || '');
  const [user, setUser] = useState(defaultUser || '');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  // Separate from attemptedSubmit (the empty-field case, where we know
  // exactly which field is wrong). This tracks which field(s) a *rejected*
  // login points at: 'server' (connection-level failure — distinct
  // wording), 'credentials' (user or password — Perforce deliberately
  // returns the identical "Password invalid." for both, to avoid leaking
  // which usernames exist, so these two can never be told apart), or
  // 'unknown' (an error we don't recognize — fall back to flagging all three).
  const [loginFailureField, setLoginFailureField] = useState(null);
  const overlayMouseDownRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setServer((prev) => prev || defaultServer || '');
    setUser((prev) => prev || defaultUser || '');
    setPassword('');
    setError(null);
    setLoginFailureField(null);
  }, [open, defaultServer, defaultUser]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAttemptedSubmit(true);
    if (!server.trim() || !user.trim() || !password) {
      setError('Server, user, and password are all required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setLoginFailureField(null);
    try {
      const r = await window.electron.p4Login({ server: server.trim(), user: user.trim(), password });
      if (r && r.success) {
        setPassword('');
        // Clearing the password above would otherwise immediately satisfy
        // the empty-field check (attemptedSubmit && !password) for the
        // brief moment before the modal closes — closing isn't instant,
        // it waits on an async session recheck up in App.jsx.
        setAttemptedSubmit(false);
        if (onSuccess) onSuccess();
      } else {
        setError((r && r.error) || 'Login failed.');
        setLoginFailureField((r && r.field) || 'unknown');
      }
    } catch (err) {
      setError(err.message || 'Login failed.');
      setLoginFailureField('unknown');
    } finally {
      setSubmitting(false);
    }
  };

  // Once the user starts correcting something, drop the stale failure
  // highlight rather than leaving it stuck red through their edits.
  const clearLoginFailure = () => { if (loginFailureField) setLoginFailureField(null); };

  const serverInvalid = (attemptedSubmit && !server.trim()) || loginFailureField === 'server' || loginFailureField === 'unknown';
  const userInvalid = (attemptedSubmit && !user.trim()) || loginFailureField === 'credentials' || loginFailureField === 'unknown';
  const passwordInvalid = (attemptedSubmit && !password) || loginFailureField === 'credentials' || loginFailureField === 'unknown';


  // Close only if BOTH the press and the release landed directly on the
  // backdrop itself
  const handleOverlayMouseDown = (e) => {
    overlayMouseDownRef.current = e.target === e.currentTarget;
  };
  const handleOverlayMouseUp = (e) => {
    if (overlayMouseDownRef.current && e.target === e.currentTarget) onClose();
    overlayMouseDownRef.current = false;
  };

  return (
    <div className="p4login-overlay" onMouseDown={handleOverlayMouseDown} onMouseUp={handleOverlayMouseUp}>
      <form className="p4login-card" onSubmit={handleSubmit}>
        <div className="p4login-header">
          <span>Log in to Perforce</span>
          <button type="button" className="p4login-close" onClick={onClose} aria-label="close"><X size={16} /></button>
        </div>

        <p className="p4login-sub">
          Your Perforce session isn't connected. Your password is sent directly to the server to create a session ticket — it's never stored by this app.
        </p>

        {error && <div className="p4login-error">{error}</div>}

        <label className="p4login-field">
          <span>Server</span>
          <input
            type="text"
            value={server}
            onChange={(e) => { setServer(e.target.value); clearLoginFailure(); }}
            placeholder="ssl:perforce.example.com:1999"
            autoFocus
            className={serverInvalid ? 'p4login-input-invalid' : ''}
          />
        </label>
        <label className="p4login-field">
          <span>User</span>
          <input 
            type="text" 
            value={user}
            onChange={(e) => { setUser(e.target.value); clearLoginFailure(); }}
            placeholder="Username" 
            className={userInvalid ? 'p4login-input-invalid' : ''}
          />
        </label>
        <label className="p4login-field">
          <span>Password</span>
          <input 
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); clearLoginFailure(); }}
            placeholder="Password" 
            className={passwordInvalid ? 'p4login-input-invalid' : ''}
          />
        </label>

        <div className="p4login-footer">
          <button type="button" className="p4login-cancel" onClick={onClose}>Not now</button>
          <button type="submit" className="p4login-submit" disabled={submitting}>
            <LogIn size={14} />
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default PerforceLoginModal;
