import { mock } from "bun:test";

// Preload mock for the optional TUI dependency so every test file can import
// src/index.ts without requiring @earendil-works/pi-tui to be installed.
mock.module("@earendil-works/pi-tui", () => ({
  Text: class Text {
    text: string;
    constructor(text: string) {
      this.text = text;
    }
    setText(text: string) {
      this.text = text;
    }
  },
}));
