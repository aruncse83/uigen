import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";

// ─── Mock: next/navigation ────────────────────────────────────────────────────
// Capture the push spy so individual tests can assert on it.
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ─── Mock: server actions ─────────────────────────────────────────────────────
vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

// ─── Mock: anonymous work tracker ────────────────────────────────────────────
vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

// ─── Typed import references ──────────────────────────────────────────────────
// Re-import after mocking so we get the vi.fn() stubs.
import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";

// Cast to Vitest mock so TypeScript lets us call .mockResolvedValue etc.
const mockSignIn = vi.mocked(signInAction);
const mockSignUp = vi.mocked(signUpAction);
const mockGetProjects = vi.mocked(getProjects);
const mockCreateProject = vi.mocked(createProject);
const mockGetAnonWorkData = vi.mocked(getAnonWorkData);
const mockClearAnonWork = vi.mocked(clearAnonWork);

// ─── Shared test data ─────────────────────────────────────────────────────────
const EMAIL = "user@example.com";
const PASSWORD = "securepassword";

// A minimal Project shape returned by createProject / getProjects
const makeProject = (id = "proj-1") => ({
  id,
  name: "Test Project",
  userId: "user-1",
  messages: "[]",
  data: "{}",
  createdAt: new Date(),
  updatedAt: new Date(),
});

// Anon work fixture with one message
const anonWorkWithMessages = {
  messages: [{ role: "user", content: "build a button" }],
  fileSystemData: { "/App.tsx": { type: "file", content: "export default () => <button />" } },
};

// Anon work fixture with NO messages (should be treated as empty)
const anonWorkEmpty = {
  messages: [],
  fileSystemData: {},
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Reset all mocks to a clean state before each test.
beforeEach(() => {
  vi.clearAllMocks();

  // Default: no anonymous work, no existing projects, new project returns proj-1
  mockGetAnonWorkData.mockReturnValue(null);
  mockGetProjects.mockResolvedValue([]);
  mockCreateProject.mockResolvedValue(makeProject("proj-1"));
});

// ═════════════════════════════════════════════════════════════════════════════
// signIn
// ═════════════════════════════════════════════════════════════════════════════

describe("useAuth – signIn", () => {
  // ── Happy paths ────────────────────────────────────────────────────────────

  test("returns success result when credentials are valid", async () => {
    // Arrange: server action succeeds, no anon work, no existing projects
    mockSignIn.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useAuth());

    // Act
    let returnValue: Awaited<ReturnType<typeof result.current.signIn>>;
    await act(async () => {
      returnValue = await result.current.signIn(EMAIL, PASSWORD);
    });

    // Assert: the hook forwards the action's result to the caller
    expect(returnValue!).toEqual({ success: true });
    expect(mockSignIn).toHaveBeenCalledWith(EMAIL, PASSWORD);
  });

  test("redirects to existing project when user has projects and no anon work", async () => {
    // Arrange: user already has two projects; most-recent is "proj-42"
    mockSignIn.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue([makeProject("proj-42"), makeProject("proj-1")]);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn(EMAIL, PASSWORD);
    });

    // Assert: router pushed to the first (most-recent) project
    expect(mockPush).toHaveBeenCalledWith("/proj-42");
    // No new project should have been created
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  test("creates a new project and redirects when user has no projects and no anon work", async () => {
    // Arrange: sign-in succeeds, no projects exist, server creates "proj-new"
    mockSignIn.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue(makeProject("proj-new"));

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn(EMAIL, PASSWORD);
    });

    // Assert: a new project was created with empty state, then redirected
    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [], data: {} })
    );
    expect(mockPush).toHaveBeenCalledWith("/proj-new");
  });

  test("migrates anon work into a new project and clears it after sign-in", async () => {
    // Arrange: anon session has a chat message and file system snapshot
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(anonWorkWithMessages);
    mockCreateProject.mockResolvedValue(makeProject("proj-anon"));

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn(EMAIL, PASSWORD);
    });

    // Assert: project was created with the anon data
    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: anonWorkWithMessages.messages,
        data: anonWorkWithMessages.fileSystemData,
      })
    );

    // Assert: anon data is cleared from session storage
    expect(mockClearAnonWork).toHaveBeenCalled();

    // Assert: router pushed to the newly created project
    expect(mockPush).toHaveBeenCalledWith("/proj-anon");

    // Assert: existing projects were NOT fetched (anon path short-circuits)
    expect(mockGetProjects).not.toHaveBeenCalled();
  });

  test("skips anon-work migration when anonWork has empty messages array", async () => {
    // Arrange: anon data exists but has no messages — should fall through
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(anonWorkEmpty);
    mockGetProjects.mockResolvedValue([makeProject("proj-1")]);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn(EMAIL, PASSWORD);
    });

    // Assert: anon-work path was skipped; existing projects were checked instead
    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/proj-1");
  });

  // ── Error states ───────────────────────────────────────────────────────────

  test("returns failure result without navigating when credentials are wrong", async () => {
    // Arrange: server action returns an error
    mockSignIn.mockResolvedValue({ success: false, error: "Invalid credentials" });

    const { result } = renderHook(() => useAuth());

    let returnValue: Awaited<ReturnType<typeof result.current.signIn>>;
    await act(async () => {
      returnValue = await result.current.signIn(EMAIL, PASSWORD);
    });

    // Assert: error surfaced to caller, no navigation
    expect(returnValue!).toEqual({ success: false, error: "Invalid credentials" });
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(mockGetProjects).not.toHaveBeenCalled();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  test("sets isLoading true while sign-in is in-flight, false after it resolves", async () => {
    // Arrange: delay the server action so we can observe the loading state mid-flight
    let resolveSignIn!: (v: { success: boolean }) => void;
    const pendingSignIn = new Promise<{ success: boolean }>((res) => {
      resolveSignIn = res;
    });
    mockSignIn.mockReturnValue(pendingSignIn);

    const { result } = renderHook(() => useAuth());

    // isLoading starts false
    expect(result.current.isLoading).toBe(false);

    // Start sign-in (don't await yet)
    act(() => {
      result.current.signIn(EMAIL, PASSWORD);
    });

    // isLoading should now be true
    expect(result.current.isLoading).toBe(true);

    // Resolve the sign-in and wait for all effects to settle
    await act(async () => {
      resolveSignIn({ success: false, error: "bad" });
    });

    // isLoading resets to false after completion (via finally block)
    expect(result.current.isLoading).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// signUp
// ═════════════════════════════════════════════════════════════════════════════

describe("useAuth – signUp", () => {
  // ── Happy paths ────────────────────────────────────────────────────────────

  test("returns success result when registration succeeds", async () => {
    // Arrange
    mockSignUp.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useAuth());

    let returnValue: Awaited<ReturnType<typeof result.current.signUp>>;
    await act(async () => {
      returnValue = await result.current.signUp(EMAIL, PASSWORD);
    });

    expect(returnValue!).toEqual({ success: true });
    expect(mockSignUp).toHaveBeenCalledWith(EMAIL, PASSWORD);
  });

  test("creates a new project and redirects for a brand-new user with no anon work", async () => {
    // Arrange: new user has no anon work and no existing projects
    mockSignUp.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue(makeProject("proj-fresh"));

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signUp(EMAIL, PASSWORD);
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [], data: {} })
    );
    expect(mockPush).toHaveBeenCalledWith("/proj-fresh");
  });

  test("migrates anon work into a new project and clears it after sign-up", async () => {
    // Arrange: user signed up immediately after creating anon work
    mockSignUp.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(anonWorkWithMessages);
    mockCreateProject.mockResolvedValue(makeProject("proj-anon-signup"));

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signUp(EMAIL, PASSWORD);
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: anonWorkWithMessages.messages,
        data: anonWorkWithMessages.fileSystemData,
      })
    );
    expect(mockClearAnonWork).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/proj-anon-signup");
    expect(mockGetProjects).not.toHaveBeenCalled();
  });

  test("redirects to existing project if one exists after sign-up (edge case)", async () => {
    // Arrange: user already had projects from a previous session (shouldn't normally happen
    // on sign-up, but the hook delegates to handlePostSignIn which handles it)
    mockSignUp.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue([makeProject("proj-existing")]);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signUp(EMAIL, PASSWORD);
    });

    expect(mockPush).toHaveBeenCalledWith("/proj-existing");
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  // ── Error states ───────────────────────────────────────────────────────────

  test("returns failure result without navigating when registration fails", async () => {
    mockSignUp.mockResolvedValue({ success: false, error: "Email already registered" });

    const { result } = renderHook(() => useAuth());

    let returnValue: Awaited<ReturnType<typeof result.current.signUp>>;
    await act(async () => {
      returnValue = await result.current.signUp(EMAIL, PASSWORD);
    });

    expect(returnValue!).toEqual({ success: false, error: "Email already registered" });
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(mockGetProjects).not.toHaveBeenCalled();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  test("sets isLoading true while sign-up is in-flight, false after it resolves", async () => {
    let resolveSignUp!: (v: { success: boolean }) => void;
    const pendingSignUp = new Promise<{ success: boolean }>((res) => {
      resolveSignUp = res;
    });
    mockSignUp.mockReturnValue(pendingSignUp);

    const { result } = renderHook(() => useAuth());

    expect(result.current.isLoading).toBe(false);

    act(() => {
      result.current.signUp(EMAIL, PASSWORD);
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveSignUp({ success: false, error: "bad" });
    });

    expect(result.current.isLoading).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Initial state
// ═════════════════════════════════════════════════════════════════════════════

describe("useAuth – initial state", () => {
  test("exposes signIn, signUp, and isLoading on mount", () => {
    const { result } = renderHook(() => useAuth());

    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
    expect(result.current.isLoading).toBe(false);
  });
});
