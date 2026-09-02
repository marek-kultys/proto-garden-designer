import { useCallback, useEffect, useRef, useState } from 'react';
import { currentDesign, isDirty, useStore } from '../state/store';
import { listProjects, storageAvailable, type ProjectSummary } from '../state/projectStorage';
import { exportProjectFile, readProjectFromFile } from '../state/projectTransfer';
import { describeFailure, describeLosses } from '../state/projectFile';

/**
 * Saving, naming and reopening a design.
 *
 * A dialog rather than a fourth side panel: the app's grid is three columns on a
 * desktop and a stack of sheets on a phone, and a centred dialog is the one
 * shape that needs no special case in either.
 */

type Tone = 'ok' | 'warn' | 'error';
interface Message {
  tone: Tone;
  text: string;
}

/** "today at 14:32" reads faster than a date when most saves are recent. */
function formatSaved(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return 'unknown';
  const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const sameDay =
    at.getFullYear() === today.getFullYear() &&
    at.getMonth() === today.getMonth() &&
    at.getDate() === today.getDate();
  if (sameDay) return `today at ${time}`;
  return `${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`;
}

export function ProjectsDialog({ onClose }: { onClose: () => void }) {
  const projectId = useStore((s) => s.projectId);
  const projectName = useStore((s) => s.projectName);
  const dirty = useStore(isDirty);
  const plantCount = useStore((s) => s.plants.length);

  const saveProject = useStore((s) => s.saveProject);
  const saveProjectAs = useStore((s) => s.saveProjectAs);
  const renameProject = useStore((s) => s.renameProject);
  const openProject = useStore((s) => s.openProject);
  const deleteSavedProject = useStore((s) => s.deleteSavedProject);
  const newProject = useStore((s) => s.newProject);
  const importDesign = useStore((s) => s.importDesign);

  const [projects, setProjects] = useState<ProjectSummary[]>(() => listProjects());
  const [message, setMessage] = useState<Message | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState(projectName);
  const available = useRef(storageAvailable()).current;
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => setProjects(listProjects()), []);

  useEffect(() => setNameDraft(projectName), [projectName]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const commitName = useCallback(() => {
    const trimmed = nameDraft.trim();
    if (trimmed.length === 0) {
      setNameDraft(projectName);
      return;
    }
    if (trimmed !== projectName) {
      renameProject(trimmed);
      refresh();
    }
  }, [nameDraft, projectName, renameProject, refresh]);

  const doSave = useCallback(() => {
    const trimmed = nameDraft.trim();
    if (trimmed.length === 0) {
      setMessage({ tone: 'error', text: 'A project needs a name.' });
      return;
    }
    if (trimmed !== projectName) renameProject(trimmed);
    const result = saveProject();
    setMessage(
      result.ok
        ? { tone: 'ok', text: `Saved “${result.name}”.` }
        : { tone: 'error', text: result.detail },
    );
    refresh();
  }, [nameDraft, projectName, renameProject, saveProject, refresh]);

  const doSaveAs = useCallback(() => {
    const base = nameDraft.trim().length > 0 ? nameDraft.trim() : projectName;
    const result = saveProjectAs(`${base} copy`);
    setMessage(
      result.ok
        ? { tone: 'ok', text: `Saved a separate copy as “${result.name}”.` }
        : { tone: 'error', text: result.detail },
    );
    refresh();
  }, [nameDraft, projectName, saveProjectAs, refresh]);

  const doOpen = useCallback(
    (id: string) => {
      const result = openProject(id);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.detail });
        refresh();
        return;
      }
      // The honest report: the design opened, and here is what it could not
      // bring back. Silence here would be the app quietly losing plants.
      setMessage(
        result.note === null
          ? { tone: 'ok', text: `Opened “${result.name}”.` }
          : { tone: 'warn', text: `Opened “${result.name}”. ${result.note}` },
      );
      refresh();
    },
    [openProject, refresh],
  );

  const doDelete = useCallback(
    (id: string) => {
      deleteSavedProject(id);
      setConfirmDelete(null);
      setMessage({ tone: 'ok', text: 'Deleted.' });
      refresh();
    },
    [deleteSavedProject, refresh],
  );

  const doExport = useCallback(async () => {
    const state = useStore.getState();
    // Exports whatever is on screen, saved or not — the file is a copy of the
    // design you are looking at, not of the last thing written to storage.
    const result = await exportProjectFile(state.projectName, currentDesign(state));
    setMessage(
      result.ok
        ? { tone: 'ok', text: `Exported as ${result.filename}.` }
        : // Cancelling is a choice, not a fault, so it is not shown in red.
          // Read from the reason rather than from the wording, so rephrasing
          // the message cannot turn a plain "no" into a red error.
          { tone: result.reason === 'cancelled' ? 'ok' : 'error', text: result.detail },
    );
  }, []);

  const doImport = useCallback(
    async (file: File) => {
      const result = await readProjectFromFile(file);
      if (!result.ok) {
        setMessage({ tone: 'error', text: describeFailure(result.failure) });
        return;
      }
      importDesign(result.name, result.design);
      const lost = describeLosses(result);
      setMessage({
        tone: lost === null ? 'ok' : 'warn',
        text:
          `Imported “${result.name}”. It is not saved on this device yet — Save keeps it.` +
          (lost === null ? '' : ` ${lost}`),
      });
      refresh();
    },
    [importDesign, refresh],
  );

  const doNew = useCallback(() => {
    newProject();
    setMessage({ tone: 'ok', text: 'Started an empty garden.' });
  }, [newProject]);

  return (
    <>
      <button className="menu-shield dialog-shield" onClick={onClose} aria-label="Close" />
      <div className="project-dialog" role="dialog" aria-modal="true" aria-label="Projects">
        <div className="project-dialog-head">
          <h2>Projects</h2>
          <button onClick={onClose} aria-label="Close">
            Done
          </button>
        </div>

        {!available && (
          <p className="project-note error">
            This browser is not allowing saved data, so designs cannot be kept. A private window
            usually does this.
          </p>
        )}

        <div className="project-current">
          <label htmlFor="project-name">Current design</label>
          <input
            id="project-name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            placeholder="Name this garden"
            aria-label="Project name"
          />
          <p className="project-meta">
            {plantCount === 0 ? 'Nothing planted' : `${plantCount} planted`}
            {dirty ? ' · unsaved changes' : projectId === null ? ' · never saved' : ' · saved'}
          </p>
          <div className="project-actions">
            <button onClick={doSave} disabled={!available}>
              Save
            </button>
            <button onClick={doSaveAs} disabled={!available}>
              Save as copy
            </button>
            <button onClick={doNew}>New</button>
          </div>
        </div>

        {message !== null && <p className={`project-note ${message.tone}`}>{message.text}</p>}

        <div className="project-list">
          <h3>Saved on this device</h3>
          {projects.length === 0 ? (
            <p className="project-empty">Nothing saved yet.</p>
          ) : (
            <ul>
              {projects.map((p) => (
                <li key={p.id} className={p.id === projectId ? 'open' : ''}>
                  <div className="project-row-text">
                    <strong>{p.name}</strong>
                    <span>{formatSaved(p.savedAt)}</span>
                  </div>
                  {confirmDelete === p.id ? (
                    <div className="project-row-buttons">
                      <button className="danger" onClick={() => doDelete(p.id)}>
                        Really delete
                      </button>
                      <button onClick={() => setConfirmDelete(null)}>Keep</button>
                    </div>
                  ) : (
                    <div className="project-row-buttons">
                      <button onClick={() => doOpen(p.id)}>Open</button>
                      <button onClick={() => setConfirmDelete(p.id)} aria-label={`Delete ${p.name}`}>
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="project-transfer">
          <h3>Move between devices</h3>
          <div className="project-actions">
            <button onClick={() => void doExport()}>Export file</button>
            <button onClick={() => fileInput.current?.click()}>Import file…</button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Cleared so choosing the same file twice in a row still fires.
              e.target.value = '';
              if (file !== undefined) void doImport(file);
            }}
          />
        </div>

        <p className="project-footnote">
          Designs are kept in this browser on this device only. They are not sent anywhere, and
          clearing site data removes them.
        </p>
      </div>
    </>
  );
}
