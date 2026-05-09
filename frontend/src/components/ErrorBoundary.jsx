import React from "react";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  clearLocalState = () => {
    try {
      window.localStorage.removeItem("bytebattle-player");
    } catch (_error) {
      // Reload anyway. Some browser settings block localStorage access entirely.
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="app-shell error-shell">
        <section className="error-panel">
          <AlertTriangle size={34} />
          <h1>ByteBattle Arena paused</h1>
          <p>
            The browser hit a local state issue while loading the arcade. Refreshing usually clears it; clearing
            the saved player profile starts clean.
          </p>
          {this.state.error?.message && <code className="error-detail">{this.state.error.message}</code>}
          <div className="game-actions">
            <button className="primary-action" type="button" onClick={() => window.location.reload()}>
              <RefreshCw size={16} />
              Reload
            </button>
            <button className="secondary-action" type="button" onClick={this.clearLocalState}>
              <Trash2 size={16} />
              Clear Profile
            </button>
          </div>
        </section>
      </main>
    );
  }
}
