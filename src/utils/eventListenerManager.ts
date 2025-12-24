// Event Listener Manager
// Tracks and manages event listeners for proper cleanup and memory leak prevention

interface ListenerEntry {
  type: string;
  handler: EventListener;
  options?: boolean | AddEventListenerOptions;
}

/**
 * Event Listener Manager
 * Tracks event listeners and provides cleanup functionality
 */
export class EventListenerManager {
  private listeners = new Map<EventTarget, ListenerEntry[]>();

  /**
   * Add an event listener and track it
   * @param target - Event target (Element, Window, Document, etc.)
   * @param type - Event type
   * @param handler - Event handler function
   * @param options - Event listener options
   */
  add(
    target: EventTarget,
    type: string,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions
  ): void {
    target.addEventListener(type, handler, options);
    
    if (!this.listeners.has(target)) {
      this.listeners.set(target, []);
    }
    
    this.listeners.get(target)!.push({ type, handler, options });
  }

  /**
   * Remove a specific event listener
   * @param target - Event target
   * @param type - Event type
   * @param handler - Event handler function
   * @param options - Event listener options (must match add call)
   */
  remove(
    target: EventTarget,
    type: string,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions
  ): void {
    target.removeEventListener(type, handler, options);
    
    const entries = this.listeners.get(target);
    if (entries) {
      const index = entries.findIndex(
        entry => entry.type === type && entry.handler === handler
      );
      if (index > -1) {
        entries.splice(index, 1);
      }
      if (entries.length === 0) {
        this.listeners.delete(target);
      }
    }
  }

  /**
   * Remove all listeners for a specific target
   * @param target - Event target
   */
  removeAll(target: EventTarget): void {
    const entries = this.listeners.get(target);
    if (entries) {
      entries.forEach(entry => {
        target.removeEventListener(entry.type, entry.handler, entry.options);
      });
      this.listeners.delete(target);
    }
  }

  /**
   * Remove all tracked listeners and clean up
   */
  cleanup(): void {
    this.listeners.forEach((entries, target) => {
      entries.forEach(entry => {
        target.removeEventListener(entry.type, entry.handler, entry.options);
      });
    });
    this.listeners.clear();
  }

  /**
   * Get count of tracked listeners
   * @returns Number of tracked listeners
   */
  getListenerCount(): number {
    let count = 0;
    this.listeners.forEach(entries => {
      count += entries.length;
    });
    return count;
  }

  /**
   * Get listeners for a specific target
   * @param target - Event target
   * @returns Array of listener entries
   */
  getListeners(target: EventTarget): ListenerEntry[] {
    return this.listeners.get(target) || [];
  }
}

