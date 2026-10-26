import { Component, type ErrorInfo, type ReactNode } from "react";
import { showHarborError } from "./error-view";

type State = { crashed: boolean };

/** Renders nothing when optional chrome (a lazily loaded dock) fails to load or render, instead of crashing the shell. */
export class SilentBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error) {
    console.warn("[chrome] optional component failed", error);
  }

  render() {
    return this.state.crashed ? null : this.props.children;
  }
}

export class HarborErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    showHarborError({
      fatal: true,
      code: error.name || "Crash",
      title: "Crash",
      message:
        error.message ||
        "Something blew up while rendering. Reload to recover, or send us the technical detail.",
      detail: [
        `${error.name}: ${error.message}`,
        "",
        error.stack ?? "(no stack)",
        "",
        "Component stack:",
        info.componentStack ?? "(none)",
      ].join("\n"),
    });
  }

  render() {
    if (this.state.crashed) return null;
    return this.props.children;
  }
}
