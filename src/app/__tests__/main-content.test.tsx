import { test, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MainContent } from "../main-content";

// Mock next/navigation so useRouter does not error in jsdom
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock FileSystemProvider — it is a context wrapper; render children directly
vi.mock("@/lib/contexts/file-system-context", () => ({
  FileSystemProvider: ({ children }: any) => <>{children}</>,
}));

// Mock ChatProvider — it is a context wrapper; render children directly
vi.mock("@/lib/contexts/chat-context", () => ({
  ChatProvider: ({ children }: any) => <>{children}</>,
}));

// Mock ChatInterface — the left-panel chat UI
vi.mock("@/components/chat/ChatInterface", () => ({
  ChatInterface: () => <div data-testid="chat-interface">Chat</div>,
}));

// Mock FileTree — the file browser shown inside the Code view
vi.mock("@/components/editor/FileTree", () => ({
  FileTree: () => <div data-testid="file-tree">File Tree</div>,
}));

// Mock CodeEditor — the Monaco editor shown inside the Code view
vi.mock("@/components/editor/CodeEditor", () => ({
  CodeEditor: () => <div data-testid="code-editor">Code Editor</div>,
}));

// Mock PreviewFrame — the iframe preview shown in the Preview view
vi.mock("@/components/preview/PreviewFrame", () => ({
  PreviewFrame: () => <div data-testid="preview-frame">Preview</div>,
}));

// Mock HeaderActions — authentication / project-picker buttons in the top bar
vi.mock("@/components/HeaderActions", () => ({
  HeaderActions: () => <div data-testid="header-actions">Header</div>,
}));

// Mock Resizable primitives — react-resizable-panels relies on layout APIs
// unavailable in jsdom; replace with simple flex wrappers so children render.
vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children, className }: any) => (
    <div className={className} data-testid="panel-group">{children}</div>
  ),
  ResizablePanel: ({ children }: any) => (
    <div data-testid="panel">{children}</div>
  ),
  ResizableHandle: () => <div data-testid="panel-handle" />,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// Helper: render MainContent with no user or project (anonymous session)
function renderMainContent() {
  return render(<MainContent />);
}

test("renders Preview tab as active and shows PreviewFrame on initial load", () => {
  // The initial activeView state is "preview", so PreviewFrame should be visible
  renderMainContent();

  // PreviewFrame must be in the document
  expect(screen.getByTestId("preview-frame")).toBeDefined();

  // CodeEditor must NOT be visible while Preview tab is active
  expect(screen.queryByTestId("code-editor")).toBeNull();
});

test("clicking the Code tab hides PreviewFrame and shows CodeEditor", async () => {
  const user = userEvent.setup();
  renderMainContent();

  // Confirm initial state: PreviewFrame visible, CodeEditor hidden
  expect(screen.getByTestId("preview-frame")).toBeDefined();
  expect(screen.queryByTestId("code-editor")).toBeNull();

  // Click the "Code" tab trigger
  const codeTab = screen.getByRole("tab", { name: "Code" });
  await user.click(codeTab);

  // After clicking, CodeEditor should appear and PreviewFrame should be gone
  await waitFor(() => {
    expect(screen.getByTestId("code-editor")).toBeDefined();
  });
  expect(screen.queryByTestId("preview-frame")).toBeNull();
});

test("clicking back to Preview tab restores PreviewFrame", async () => {
  const user = userEvent.setup();
  renderMainContent();

  // Switch to Code view first
  const codeTab = screen.getByRole("tab", { name: "Code" });
  await user.click(codeTab);

  await waitFor(() => {
    expect(screen.getByTestId("code-editor")).toBeDefined();
  });

  // Now switch back to Preview
  const previewTab = screen.getByRole("tab", { name: "Preview" });
  await user.click(previewTab);

  await waitFor(() => {
    expect(screen.getByTestId("preview-frame")).toBeDefined();
  });
  expect(screen.queryByTestId("code-editor")).toBeNull();
});

test("both tab buttons are always rendered in the top bar", () => {
  renderMainContent();

  // Both triggers must be present regardless of active state
  expect(screen.getByRole("tab", { name: "Preview" })).toBeDefined();
  expect(screen.getByRole("tab", { name: "Code" })).toBeDefined();
});

test("Preview tab is selected (aria-selected=true) by default", () => {
  renderMainContent();

  const previewTab = screen.getByRole("tab", { name: "Preview" });
  const codeTab = screen.getByRole("tab", { name: "Code" });

  // Radix sets aria-selected on the active trigger
  expect(previewTab.getAttribute("aria-selected")).toBe("true");
  expect(codeTab.getAttribute("aria-selected")).toBe("false");
});

test("Code tab becomes selected after clicking it", async () => {
  const user = userEvent.setup();
  renderMainContent();

  const codeTab = screen.getByRole("tab", { name: "Code" });
  await user.click(codeTab);

  await waitFor(() => {
    expect(codeTab.getAttribute("aria-selected")).toBe("true");
  });

  const previewTab = screen.getByRole("tab", { name: "Preview" });
  expect(previewTab.getAttribute("aria-selected")).toBe("false");
});

test("FileTree is displayed alongside CodeEditor in Code view", async () => {
  const user = userEvent.setup();
  renderMainContent();

  const codeTab = screen.getByRole("tab", { name: "Code" });
  await user.click(codeTab);

  await waitFor(() => {
    expect(screen.getByTestId("file-tree")).toBeDefined();
    expect(screen.getByTestId("code-editor")).toBeDefined();
  });
});
