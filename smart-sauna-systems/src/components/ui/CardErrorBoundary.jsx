import { Component } from 'react';

/**
 * Error boundary that wraps individual dashboard cards.
 * Prevents a single card crash from taking down the whole dashboard.
 */
export default class CardErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error(`Card crashed [${this.props.cardId}]:`, error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const { t, cardId } = this.props;
      return (
        <div className="h-full rounded-2xl border border-red-500/20 bg-red-500/5 flex flex-col items-center justify-center p-4 text-center gap-2">
          <div className="text-red-400 text-xs font-bold uppercase tracking-widest">
            {t?.('error.cardCrash') || 'Card Error'}
          </div>
          <div className="text-[var(--text-muted)] text-[10px] font-mono truncate max-w-full">
            {cardId}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-1 px-3 py-1 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-bold uppercase tracking-wider hover:bg-red-500/20 transition-colors border border-red-500/20"
          >
            {t?.('error.retry') || 'Retry'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
