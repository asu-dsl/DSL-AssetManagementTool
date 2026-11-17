import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UploadPanel from '../../src/components/UploadPanel.jsx';

const p4State = (over = {}) => ({
  available: true, connected: true, user: 'jlin', server: 'ssl:p4:1666',
  client: 'art-ws', ...over,
});

function renderPanel(over = {}) {
  const props = {
    currentPath: '//Art/props',
    onOpenP4Panel: vi.fn(),
    openedFiles: [],
    onRefreshOpened: vi.fn().mockResolvedValue(undefined),
    p4: p4State(),
    onRefreshConnection: vi.fn().mockResolvedValue(undefined),
    artDepotClient: 'art-ws',
    artDepotRoot: 'C:/work',
    ...over,
  };
  const view = render(<UploadPanel {...props} />);
  return { ...view, props };
}

const uploadBtn = () => screen.getByRole('button', { name: /^upload$/i });
const p4Control = () => screen.queryByRole('button', { name: /^perforce:/i });

beforeEach(() => {
  window.electron = {
    selectUploadFiles: vi.fn(),
    p4UploadToDepot: vi.fn(),
  };
});

describe('Perforce status control', () => {
  it('is hidden entirely when the Perforce CLI is unavailable', () => {
    renderPanel({ p4: p4State({ available: false }) });
    expect(p4Control()).not.toBeInTheDocument();
    // The upload button itself still renders.
    expect(uploadBtn()).toBeInTheDocument();
  });

  it('announces a disconnected session', () => {
    renderPanel({ p4: p4State({ connected: false }) });
    expect(p4Control()).toHaveAccessibleName(/disconnected/i);
    expect(screen.getByText(/click to reconnect/i)).toBeInTheDocument();
  });

  it('announces a clean workspace', () => {
    renderPanel({ openedFiles: [] });
    expect(p4Control()).toHaveAccessibleName(/connected, up to date/i);
  });

  it('uses the singular for exactly one pending change', () => {
    renderPanel({ openedFiles: [{ depotFile: '//Art/a.png' }] });
    expect(screen.getByText('1 pending change')).toBeInTheDocument();
  });

  it('uses the plural for more than one pending change', () => {
    renderPanel({ openedFiles: [{ depotFile: '//Art/a.png' }, { depotFile: '//Art/b.png' }] });
    expect(screen.getByText('2 pending changes')).toBeInTheDocument();
  });

  it('opens the Perforce panel when clicked, in every state', async () => {
    // It used to be two controls, one of which only existed when something was
    // pending — leaving no way to open the panel with a clean workspace.
    for (const openedFiles of [[], [{ depotFile: '//Art/a.png' }]]) {
      const { props, unmount } = renderPanel({ openedFiles });
      await userEvent.click(p4Control());
      expect(props.onOpenP4Panel).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it('opens the Perforce panel from the keyboard', async () => {
    const { props } = renderPanel();
    p4Control().focus();
    await userEvent.keyboard('{Enter}');
    expect(props.onOpenP4Panel).toHaveBeenCalledTimes(1);
  });
});

describe('refresh button', () => {
  it('refreshes both the connection and the pending list', async () => {
    const { props } = renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /refresh perforce connection/i }));
    await waitFor(() => expect(props.onRefreshConnection).toHaveBeenCalledTimes(1));
    expect(props.onRefreshOpened).toHaveBeenCalledTimes(1);
  });

  it('does not also open the Perforce panel it sits inside', async () => {
    // The refresh button is nested in the click-to-open control, so it has to stop
    // the event from bubbling.
    const { props } = renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /refresh perforce connection/i }));
    await waitFor(() => expect(props.onRefreshConnection).toHaveBeenCalled());
    expect(props.onOpenP4Panel).not.toHaveBeenCalled();
  });
});

describe('uploading', () => {
  it('does nothing when the file dialog is cancelled', async () => {
    window.electron.selectUploadFiles.mockResolvedValue([]);
    const { props } = renderPanel();
    await userEvent.click(uploadBtn());
    await waitFor(() => expect(window.electron.selectUploadFiles).toHaveBeenCalled());
    expect(window.electron.p4UploadToDepot).not.toHaveBeenCalled();
    expect(props.onOpenP4Panel).not.toHaveBeenCalled();
  });

  it('does nothing when the dialog returns nothing at all', async () => {
    window.electron.selectUploadFiles.mockResolvedValue(null);
    renderPanel();
    await userEvent.click(uploadBtn());
    await waitFor(() => expect(window.electron.selectUploadFiles).toHaveBeenCalled());
    expect(window.electron.p4UploadToDepot).not.toHaveBeenCalled();
  });

  it('uploads into the depot folder currently being browsed', async () => {
    window.electron.selectUploadFiles.mockResolvedValue(['C:/tmp/a.png']);
    window.electron.p4UploadToDepot.mockResolvedValue({ success: true, results: [] });
    renderPanel({ currentPath: '//Art/props/barrels' });
    await userEvent.click(uploadBtn());
    await waitFor(() => expect(window.electron.p4UploadToDepot).toHaveBeenCalledWith({
      depotFolder: '//Art/props/barrels',
      filePaths: ['C:/tmp/a.png'],
    }));
  });

  it('falls back to the Art depot root when browsing outside the depot', async () => {
    window.electron.selectUploadFiles.mockResolvedValue(['C:/tmp/a.png']);
    window.electron.p4UploadToDepot.mockResolvedValue({ success: true, results: [] });
    renderPanel({ currentPath: 'C:/some/local/folder' });
    await waitFor(() => expect(uploadBtn()).toBeEnabled());
    await userEvent.click(uploadBtn());
    await waitFor(() => expect(window.electron.p4UploadToDepot).toHaveBeenCalledWith({
      depotFolder: '//Art',
      filePaths: ['C:/tmp/a.png'],
    }));
  });

  it('falls back to the Art depot root when nothing is selected', async () => {
    window.electron.selectUploadFiles.mockResolvedValue(['C:/tmp/a.png']);
    window.electron.p4UploadToDepot.mockResolvedValue({ success: true, results: [] });
    renderPanel({ currentPath: null });
    await userEvent.click(uploadBtn());
    await waitFor(() => expect(window.electron.p4UploadToDepot).toHaveBeenCalledWith({
      depotFolder: '//Art',
      filePaths: ['C:/tmp/a.png'],
    }));
  });

  it('refreshes pending files and opens the panel to review a clean upload', async () => {
    window.electron.selectUploadFiles.mockResolvedValue(['C:/tmp/a.png']);
    window.electron.p4UploadToDepot.mockResolvedValue({ success: true, results: [] });
    const { props } = renderPanel();
    await userEvent.click(uploadBtn());
    await waitFor(() => expect(props.onOpenP4Panel).toHaveBeenCalledTimes(1));
    expect(props.onRefreshOpened).toHaveBeenCalled();
  });

  it('reports which files failed in a partially successful upload', async () => {
    window.electron.selectUploadFiles.mockResolvedValue(['C:/tmp/a.png', 'C:/tmp/b.exr']);
    window.electron.p4UploadToDepot.mockResolvedValue({
      success: true,
      results: [
        { file: 'a.png', success: true },
        { file: 'b.exr', success: false, error: 'already open' },
      ],
    });
    renderPanel();
    await userEvent.click(uploadBtn());
    const msg = await screen.findByText(/1 file\(s\) failed/i);
    expect(msg).toHaveTextContent('b.exr');
    expect(msg).toHaveTextContent('already open');
  });

  it('still opens the panel after a partial failure, so the rest can be submitted', async () => {
    window.electron.selectUploadFiles.mockResolvedValue(['C:/tmp/a.png']);
    window.electron.p4UploadToDepot.mockResolvedValue({
      success: true, results: [{ file: 'a.png', success: false, error: 'nope' }],
    });
    const { props } = renderPanel();
    await userEvent.click(uploadBtn());
    await waitFor(() => expect(props.onOpenP4Panel).toHaveBeenCalled());
  });

  it('shows the backend error when the upload fails outright', async () => {
    window.electron.selectUploadFiles.mockResolvedValue(['C:/tmp/a.png']);
    window.electron.p4UploadToDepot.mockResolvedValue({ success: false, error: 'depot is locked' });
    const { props } = renderPanel();
    await userEvent.click(uploadBtn());
    expect(await screen.findByText('depot is locked')).toBeInTheDocument();
    expect(props.onOpenP4Panel).not.toHaveBeenCalled();
  });

  it('surfaces a thrown error rather than leaving the button stuck', async () => {
    window.electron.selectUploadFiles.mockResolvedValue(['C:/tmp/a.png']);
    window.electron.p4UploadToDepot.mockRejectedValue(new Error('bridge exploded'));
    renderPanel();
    await userEvent.click(uploadBtn());
    expect(await screen.findByText('bridge exploded')).toBeInTheDocument();
    await waitFor(() => expect(uploadBtn()).toBeEnabled());
  });

  it('re-enables the upload button once a successful upload settles', async () => {
    window.electron.selectUploadFiles.mockResolvedValue(['C:/tmp/a.png']);
    window.electron.p4UploadToDepot.mockResolvedValue({ success: true, results: [] });
    renderPanel();
    await userEvent.click(uploadBtn());
    await waitFor(() => expect(uploadBtn()).toBeEnabled());
  });
});
