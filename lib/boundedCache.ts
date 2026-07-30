export class BoundedCache<Key, Value> {
  readonly maximumSize: number;
  #values = new Map<Key, Value>();

  constructor(maximumSize: number) {
    if (!Number.isInteger(maximumSize) || maximumSize < 1) {
      throw new Error("BoundedCache maximumSize must be a positive integer");
    }
    this.maximumSize = maximumSize;
  }

  get(key: Key): Value | undefined {
    const value = this.#values.get(key);
    if (value === undefined) return undefined;
    this.#values.delete(key);
    this.#values.set(key, value);
    return value;
  }

  set(key: Key, value: Value): void {
    this.#values.delete(key);
    this.#values.set(key, value);
    while (this.#values.size > this.maximumSize) {
      const oldestKey = this.#values.keys().next().value;
      if (oldestKey === undefined) break;
      this.#values.delete(oldestKey);
    }
  }
}
