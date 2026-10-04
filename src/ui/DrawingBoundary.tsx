import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * What one view does when its drawing throws.
 *
 * Without this, an exception while drawing tears the whole React tree down: the
 * screen goes white, the panels and the controls go with it, and the only clue
 * is in a console a gardener will never open. The design itself is never the
 * casualty — it lives in the store, and the store is untouched by a drawing
 * fault — but you cannot tell that from a blank page, so people reload and lose
 * the afternoon's work because they assume it is gone.
 *
 * One of these wraps each view. A fault in the 360° view therefore costs the
 * 360° view: the plan above it still draws, the planting is still editable, and
 * the design can still be saved. The message says so, because "your work is
 * safe" is only reassuring if it arrives before the person decides otherwise.
 *
 * What it cannot catch: anything thrown outside React's own work — an event
 * handler, a timer, an animation frame. Each drawing runs synchronously inside
 * an effect, so it is covered; the sun overlay's grid, which is computed on a
 * timer in `PlanCanvas`, is not. A fault there leaves the last drawing on
 * screen and a message in the console, which is a milder failure than a blank
 * canvas, so it is left alone rather than routed through here.
 *
 * A class because React has no hook for this; it is the one place in the app
 * where a class is the only option.
 */

interface Props {
  /** The view's name, as a person would say it: "the plan", "the 360° view". */
  view: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class DrawingBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The console is for whoever is debugging; the panel below is for whoever
    // is designing a garden.
    console.error(`${this.props.view} stopped drawing`, error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return (
      <div className="drawing-error" role="alert">
        <h3>{this.props.view} stopped drawing</h3>
        <p>
          <b>Your design is safe.</b> Nothing has been lost — the planting is still there, and
          you can still save or export it.
        </p>
        <p className="hint">
          Try drawing it again. If it keeps stopping, save your work and reload the page.
        </p>
        <div className="drawing-error-actions">
          <button onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
        <details>
          <summary>What went wrong</summary>
          <code>{error.message}</code>
        </details>
      </div>
    );
  }
}
