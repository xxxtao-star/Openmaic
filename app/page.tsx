'use client';

import { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  Bot,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Folder,
  FolderPlus,
  Pencil,
  Trash2,
  Search,
  Settings,
  Upload,
  Sparkles,
  Atom,
  X,
  Presentation,
  Loader2,
} from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeToggle } from '@/components/site-header/theme-toggle';
import { createLogger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupInput, InputGroupButton } from '@/components/ui/input-group';
import { cn } from '@/lib/utils';
import { SettingsDialog } from '@/components/settings';
import { GenerationToolbar, ModelSelectorPill } from '@/components/generation/generation-toolbar';
import { DeepThinkingButton } from '@/components/generation/deep-thinking-button';
import { AgentBar } from '@/components/agent/agent-bar';
import Image from 'next/image';
import { nanoid } from 'nanoid';
import { deleteDocumentBlob, storeDocumentBlob } from '@/lib/utils/image-storage';
import { normalizeDocumentMimeType } from '@/lib/document/mime';
import {
  courseMaterialFingerprint,
  dedupeCourseMaterialFiles,
} from '@/lib/document/course-materials';
import type {
  SelectedCourseMaterial,
  SessionDocumentSource,
  UserRequirements,
} from '@/lib/types/generation';
import { useSettingsStore } from '@/lib/store/settings';
import { hasUsableLLMProvider } from '@/lib/store/settings-validation';
import { useUserProfileStore } from '@/lib/store/user-profile';
import {
  StageListItem,
  listStages,
  deleteStageData,
  renameStage,
  getFirstSlideByStages,
  revokeThumbnailSlideMediaUrls,
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  setStageFolder,
  FolderNameError,
  type DeleteFolderMode,
} from '@/lib/utils/stage-storage';
import type { FolderRecord } from '@/lib/utils/database';
import { displayNameWidth, FOLDER_NAME_MAX_WIDTH } from '@/lib/utils/folder-name-validation';
import { FolderCard } from '@/components/discovery/folder-card';
import { NewFolderDialog } from '@/components/discovery/folder-dialogs';
import { MoveToFolderMenu } from '@/components/discovery/move-to-folder-menu';
import type { Slide } from '@openmaic/dsl';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDraftCache } from '@/lib/hooks/use-draft-cache';
import { useImportClassroom } from '@/lib/import/use-import-classroom';
import { isProWorkbenchEnabled, isPptxImportEnabled } from '@/lib/config/feature-flags';
import { useImportPptx } from '@/lib/import/use-import-pptx';
import { ProBadge } from '@/components/workbench/ProBadge';
import { arrivedByProSwap, startProSwap } from '@/lib/workbench/pro-swap';
import {
  readLastWorkspaceSessionId,
  workspaceResumeHref,
} from '@/lib/workbench/workspace-session-memory';

const log = createLogger('Home');

const WEB_SEARCH_STORAGE_KEY = 'webSearchEnabled';
const RECENT_OPEN_STORAGE_KEY = 'recentClassroomsOpen';
const INTERACTIVE_MODE_STORAGE_KEY = 'interactiveModeEnabled';

// PPTX import is still scaffolding: `useImportPptx` has no `onImported` consumer
// yet, so the flow only logs the parsed slides. Hide the entry point behind a
// flag until it's wired end-to-end, so the UI doesn't expose a no-op button.
const PPTX_IMPORT_ENABLED = isPptxImportEnabled();

/** The configured runtime probe result, retained across client navigations. */
let workbenchRuntimeCache: boolean | null = null;

interface FormState {
  courseMaterials: SelectedCourseMaterial[];
  requirement: string;
  webSearch: boolean;
  interactiveMode: boolean;
  vocationalTestMode: boolean;
}

const initialFormState: FormState = {
  courseMaterials: [],
  requirement: '',
  webSearch: false,
  interactiveMode: false,
  vocationalTestMode: false,
};

function HomePage() {
  const { t } = useI18n();
  const router = useRouter();
  // Do not replay the classic hero's entrance after the route handoff already
  // carried the lockup and composer into place.
  const [swapped] = useState(arrivedByProSwap);
  const heroEnter = (from: Record<string, number>) => (swapped ? false : from);
  const workbenchBuildEnabled = isProWorkbenchEnabled();
  const [workbenchRuntimeEnabled, setWorkbenchRuntimeEnabled] = useState(
    workbenchRuntimeCache === true,
  );
  useEffect(() => {
    if (!workbenchBuildEnabled || workbenchRuntimeCache !== null) return;
    let cancelled = false;
    fetch('/api/agent/runtime')
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        workbenchRuntimeCache = body?.enabled === true;
        if (!cancelled) setWorkbenchRuntimeEnabled(workbenchRuntimeCache);
      })
      .catch(() => {
        // A failed probe keeps the entry hidden and allows a later visit to retry.
      });
    return () => {
      cancelled = true;
    };
  }, [workbenchBuildEnabled]);
  const workbenchEntryEnabled = workbenchBuildEnabled && workbenchRuntimeEnabled;
  const enterWorkbench = () => {
    const href = workspaceResumeHref(readLastWorkspaceSessionId());
    startProSwap(href, (next) => router.push(next));
  };
  useEffect(() => {
    if (workbenchEntryEnabled) router.prefetch('/workspace');
  }, [router, workbenchEntryEnabled]);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    import('@/lib/types/settings').SettingsSection | undefined
  >(undefined);

  // Draft cache for requirement text
  const { cachedValue: cachedRequirement, updateCache: updateRequirementCache } =
    useDraftCache<string>({ key: 'requirementDraft' });

  // A usable LLM provider exists ⇒ a concrete model is always selected (#580
  // invariant). Gate generation on this single condition (state A vs B)
  // instead of inspecting modelId directly.
  const providersConfig = useSettingsStore((s) => s.providersConfig);
  const hasUsableProvider = hasUsableLLMProvider(providersConfig);
  const [recentOpen, setRecentOpen] = useState(true);
  const persistRecentOpen = (next: boolean) => {
    setRecentOpen(next);
    try {
      localStorage.setItem(RECENT_OPEN_STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  // Hydrate client-only state after mount (avoids SSR mismatch)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_OPEN_STORAGE_KEY);
      if (saved !== null) setRecentOpen(saved !== 'false');
    } catch {
      /* localStorage unavailable */
    }
    try {
      const savedWebSearch = localStorage.getItem(WEB_SEARCH_STORAGE_KEY);
      const savedInteractiveMode = localStorage.getItem(INTERACTIVE_MODE_STORAGE_KEY);
      const updates: Partial<FormState> = {};
      if (savedWebSearch === 'true') updates.webSearch = true;
      if (savedInteractiveMode === 'true') updates.interactiveMode = true;
      if (Object.keys(updates).length > 0) {
        setForm((prev) => ({ ...prev, ...updates }));
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  // Restore requirement draft from localStorage on mount. The previous derived-state
  // pattern initialised `prev` from the cached value itself, so on the first client
  // render the comparison was always equal and the restore never fired. Use an effect
  // so the cache is hydrated into the form once we know the live requirement is empty.
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (draftRestoredRef.current) return;
    if (!cachedRequirement) return;
    draftRestoredRef.current = true;
    setForm((prev) => (prev.requirement ? prev : { ...prev, requirement: cachedRequirement }));
  }, [cachedRequirement]);

  const [error, setError] = useState<string | null>(null);
  // True while the Generate click drains upload-time ingests and builds the
  // generation session. Doubles as the guard flag that freezes the course
  // material set for the duration of prep and as the switch that disables the
  // toolbar's add/remove affordances, so the session is always built from a
  // set that cannot change under it.
  const [preparingGenerate, setPreparingGenerate] = useState(false);
  const [classrooms, setClassrooms] = useState<StageListItem[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Course folders — device-local grouping. `currentFolderId === undefined`
  // is the root view (folders + unfiled courses); a folder id navigates into
  // that folder's course list. Searching flattens every course regardless of
  // folder and annotates each with its folder name.
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  // True once the initial classroom + folder loads resolve. Guards layout
  // selection so the hero does not flip between full-screen and compact as the
  // two async reads land (avoids a visible layout shift on first paint).
  const [hydrated, setHydrated] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(undefined);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  // When set, the new-folder dialog is creating a folder AND moving this course
  // into it (entered via the move-menu's "new folder" entry).
  const [createAndMoveTarget, setCreateAndMoveTarget] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const thumbnailsRef = useRef<Record<string, Slide>>({});

  const replaceThumbnails = (slides: Record<string, Slide>) => {
    const previous = thumbnailsRef.current;
    thumbnailsRef.current = slides;
    setThumbnails(slides);
    window.setTimeout(() => revokeThumbnailSlideMediaUrls(previous), 0);
  };

  const loadClassrooms = async () => {
    try {
      const list = await listStages();
      setClassrooms(list);
      // Load first slide thumbnails
      if (list.length > 0) {
        const slides = await getFirstSlideByStages(list.map((c) => c.id));
        replaceThumbnails(slides);
      } else {
        replaceThumbnails({});
      }
    } catch (err) {
      log.error('Failed to load classrooms:', err);
      toast.error('Persistence is unavailable. Saved classrooms could not be loaded.');
    }
  };

  const loadFolders = async () => {
    try {
      setFolders(await listFolders());
    } catch (err) {
      log.error('Failed to load folders:', err);
    }
  };

  // Capture the active folder when an import starts so the imported course
  // lands in that folder, not whichever folder is active when the async import
  // resolves (the user may have navigated away in the meantime).
  const importFolderRef = useRef<string | undefined>(undefined);
  const handleImportSuccess = async (importedStageId: string) => {
    const folderId = importFolderRef.current;
    importFolderRef.current = undefined;
    // File the imported course into the folder that was active when the
    // import began, before refreshing the list so the card appears in place.
    if (folderId) {
      try {
        await setStageFolder(importedStageId, folderId);
      } catch (err) {
        log.error('Failed to assign imported course to folder:', err);
        toast.error(t('classroom.moveFailed'));
      }
    }
    await loadClassrooms();
  };
  const { importing, fileInputRef, triggerFileSelect, handleFileChange } =
    useImportClassroom(handleImportSuccess);
  const triggerImport = () => {
    importFolderRef.current = currentFolderId;
    triggerFileSelect();
  };

  const {
    importing: pptxImporting,
    fileInputRef: pptxFileInputRef,
    triggerFileSelect: triggerPptxFileSelect,
    handleFileChange: handlePptxFileChange,
  } = useImportPptx();

  useEffect(() => {
    // Clear stale media store to prevent cross-course thumbnail contamination.
    // The store may hold tasks from a previously visited classroom whose elementIds
    // (gen_img_1, etc.) collide with other courses' placeholders.
    useMediaGenerationStore.getState().revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });

    // Read sessionStorage on the client only (avoids SSR hydration mismatch).
    // Both reads resolve before flipping `hydrated`, so the hero layout does
    // not thrash as each lands independently.
    void Promise.all([loadClassrooms(), loadFolders()]).finally(() => setHydrated(true));

    return () => {
      revokeThumbnailSlideMediaUrls(thumbnailsRef.current);
      thumbnailsRef.current = {};
    };
  }, []);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteId(id);
  };

  const confirmDelete = async (id: string) => {
    setPendingDeleteId(null);
    try {
      await deleteStageData(id);
      await loadClassrooms();
    } catch (err) {
      log.error('Failed to delete classroom:', err);
      toast.error('Failed to delete classroom');
    }
  };

  const handleRename = async (id: string, newName: string) => {
    try {
      await renameStage(id, newName);
      setClassrooms((prev) => prev.map((c) => (c.id === id ? { ...c, name: newName } : c)));
    } catch (err) {
      log.error('Failed to rename classroom:', err);
      toast.error(t('classroom.renameFailed'));
    }
  };

  // ─── Folder handlers ────────────────────────────────────────────────
  const handleCreateFolder = async (name: string) => {
    const folder = await createFolder(name);
    setFolders((prev) => [...prev, folder]);
    // If this create came from the move-menu's "new folder" entry, move the
    // requesting course into the freshly created folder.
    if (createAndMoveTarget) {
      await handleMoveCourse(createAndMoveTarget, folder.id);
      setCreateAndMoveTarget(null);
    }
  };

  const handleRenameFolder =
    (folder: FolderRecord) =>
    async (newName: string): Promise<string | null> => {
      // Empty or unchanged input just exits editing without an error.
      const trimmed = newName.trim();
      if (!trimmed || trimmed === folder.name) return null;
      try {
        await renameFolder(folder.id, newName);
        setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, name: trimmed } : f)));
        return null;
      } catch (err) {
        if (err instanceof FolderNameError) {
          if (err.kind === 'duplicate') return t('classroom.folderNameExists');
          if (err.kind === 'tooLong')
            return t('classroom.folderWidth', {
              width: displayNameWidth(trimmed),
              max: FOLDER_NAME_MAX_WIDTH,
            });
          return t('classroom.folderNameHint');
        }
        log.error('Failed to rename folder:', err);
        return t('classroom.folderRenameFailed');
      }
    };

  const confirmDeleteFolder = async (folder: FolderRecord, mode: DeleteFolderMode) => {
    try {
      await deleteFolder(folder.id, mode);
      if (currentFolderId === folder.id) setCurrentFolderId(undefined);
    } catch (err) {
      log.error('Failed to delete folder:', err);
      toast.error(t('classroom.folderDeleteFailed'));
    } finally {
      // Always refresh authoritative state: in 'remove' mode a partial failure
      // may have durably deleted some courses before throwing, and the UI must
      // reflect that rather than leaving stale cards/counts behind.
      await Promise.all([loadFolders(), loadClassrooms()]);
    }
  };

  const handleMoveCourse = async (stageId: string, folderId: string | undefined) => {
    // Optimistic update for snappy UI; the persistence call follows.
    setClassrooms((prev) => prev.map((c) => (c.id === stageId ? { ...c, folderId } : c)));
    try {
      await setStageFolder(stageId, folderId);
    } catch (err) {
      log.error('Failed to move course:', err);
      toast.error(t('classroom.moveFailed'));
      // Revert on failure.
      await loadClassrooms();
    }
  };

  // From the move-menu's "new folder" entry: remember the course, then open the
  // folder dialog. The actual create+move happens in handleCreateFolder once the
  // name is confirmed. (A Radix DropdownMenu is modal, so the name input cannot
  // live inside it; the dialog is the focus surface.)
  const handleCreateAndMove = (stageId: string) => () => {
    setCreateAndMoveTarget(stageId);
    setNewFolderOpen(true);
  };

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const filteredClassrooms = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    if (!q) return classrooms;
    return classrooms.filter((c) => {
      const name = c.name?.toLowerCase() ?? '';
      const desc = c.description?.toLowerCase() ?? '';
      return name.includes(q) || desc.includes(q);
    });
  }, [classrooms, deferredSearchQuery]);

  // Folder-aware view model. Searching collapses the hierarchy: every matching
  // course is shown flat, annotated with its folder name. Otherwise the root
  // view shows folder tiles + unfiled courses, and a folder view shows only
  // that folder's members.
  const folderNameById = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);
  const isSearching = deferredSearchQuery.trim().length > 0;
  // The course tiles rendered in the active view: search flattens everything;
  // a folder shows only its members; the root shows unfiled courses (folder
  // tiles are rendered separately above them).
  const visibleClassrooms = useMemo(() => {
    if (isSearching) return filteredClassrooms;
    if (currentFolderId) return filteredClassrooms.filter((c) => c.folderId === currentFolderId);
    return filteredClassrooms.filter(
      (c) => c.folderId === undefined || !folderNameById.has(c.folderId),
    );
  }, [filteredClassrooms, isSearching, currentFolderId, folderNameById]);
  const currentFolderClassrooms = useMemo(
    () => (currentFolderId ? classrooms.filter((c) => c.folderId === currentFolderId) : []),
    [classrooms, currentFolderId],
  );
  const courseCountByFolder = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of classrooms) {
      if (c.folderId) counts.set(c.folderId, (counts.get(c.folderId) ?? 0) + 1);
    }
    return counts;
  }, [classrooms]);
  // Up to 3 member course covers (first-slide thumbnails) per folder, for the
  // folder tile's cover stack. Members are ordered by updatedAt desc so the
  // frontmost cover is the most recently touched course.
  const coverSlidesByFolder = useMemo(() => {
    const byFolder = new Map<string, Slide[]>();
    for (const c of [...classrooms].sort((a, b) => b.updatedAt - a.updatedAt)) {
      if (!c.folderId) continue;
      const slide = thumbnails[c.id];
      if (!slide) continue;
      const list = byFolder.get(c.folderId) ?? [];
      if (list.length < 3) list.push(slide);
      byFolder.set(c.folderId, list);
    }
    return byFolder;
  }, [classrooms, thumbnails]);
  const currentFolder = folders.find((f) => f.id === currentFolderId);

  const updateForm = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    try {
      if (field === 'webSearch') localStorage.setItem(WEB_SEARCH_STORAGE_KEY, String(value));
      if (field === 'interactiveMode')
        localStorage.setItem(INTERACTIVE_MODE_STORAGE_KEY, String(value));
      if (field === 'requirement') updateRequirementCache(value as string);
    } catch {
      /* ignore */
    }
  };

  const addCourseMaterials = (files: File[]) => {
    // The set is frozen for the duration of generate-prep: adding is inert
    // while `preparingGenerate` is set (the toolbar affordance is disabled
    // via the same state), so nothing can slip into the set mid-prep.
    if (preparingGenerate) return;
    const dedupedFiles = dedupeCourseMaterialFiles(form.courseMaterials, files);
    const startOrder = form.courseMaterials.length + 1;
    const additions = dedupedFiles.map((file, index) => ({
      id: nanoid(8),
      file,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      type: file.type,
      order: startOrder + index,
    }));

    if (additions.length === 0) return;
    setForm((prev) => {
      // Pure updater: drop any addition the latest state already carries — by
      // id (a replayed or superseded update) or by content fingerprint (two
      // addCourseMaterials calls in one render batch both dedupe against the
      // same stale closure list, so the same file could otherwise enter twice
      // under two ids and ingest/extract twice) — then append the rest.
      const missing = additions.filter((addition) => {
        if (prev.courseMaterials.some((item) => item.id === addition.id)) return false;
        return !prev.courseMaterials.some(
          (item) => courseMaterialFingerprint(item) === courseMaterialFingerprint(addition),
        );
      });
      if (missing.length === 0) return prev;
      return { ...prev, courseMaterials: [...prev.courseMaterials, ...missing] };
    });
  };

  const removeCourseMaterial = (id: string) => {
    // The set is frozen for the duration of generate-prep: removing is inert
    // while `preparingGenerate` is set (the toolbar affordance is disabled
    // via the same state), so nothing can slip out of the set mid-prep.
    if (preparingGenerate) return;
    setForm((prev) => ({
      ...prev,
      courseMaterials: prev.courseMaterials
        .filter((item) => item.id !== id)
        .map((item, index) => ({ ...item, order: index + 1 })),
    }));
  };

  const handleGenerate = async () => {
    // No model/provider guard here: generation is gated by `canGenerate`
    // (requires a usable provider), and under the #580 invariant a usable
    // provider always has a concrete model. State A (no usable provider)
    // surfaces through the toolbar's single Configure-Provider affordance.
    if (preparingGenerate) return;
    if (!form.requirement.trim()) {
      setError(t('upload.requirementRequired'));
      return;
    }

    setError(null);

    // The material list and the extractor provider config are frozen for the
    // duration of prep: `preparingGenerate` makes add/remove inert and
    // disables the toolbar affordances (including the extractor Select and the
    // web-search toggle), so neither can change under the session build below.
    // Capture both at click time and build the session from this snapshot,
    // never from live form state or live store state.
    const frozenMaterials = [...form.courseMaterials].sort((a, b) => a.order - b.order);
    const settingsSnapshot = useSettingsStore.getState();
    const frozenPdfProviderId = settingsSnapshot.pdfProviderId;
    const frozenPdfProviderConfig = settingsSnapshot.pdfProvidersConfig?.[
      settingsSnapshot.pdfProviderId
    ]
      ? {
          apiKey: settingsSnapshot.pdfProvidersConfig[settingsSnapshot.pdfProviderId].apiKey,
          baseUrl: settingsSnapshot.pdfProvidersConfig[settingsSnapshot.pdfProviderId].baseUrl,
          accessKeyId:
            settingsSnapshot.pdfProvidersConfig[settingsSnapshot.pdfProviderId].accessKeyId,
          accessKeySecret:
            settingsSnapshot.pdfProvidersConfig[settingsSnapshot.pdfProviderId].accessKeySecret,
        }
      : undefined;

    // Flip the generating UI state before material bytes are copied locally.
    setPreparingGenerate(true);
    try {
      const userProfile = useUserProfileStore.getState();
      const requirements: UserRequirements = {
        requirement: form.requirement,
        userNickname: userProfile.nickname || undefined,
        userBio: userProfile.bio || undefined,
        webSearch: form.webSearch || undefined,
        interactiveMode: form.vocationalTestMode ? true : form.interactiveMode,
        ...(form.vocationalTestMode ? { taskEngineMode: true } : {}),
      };

      let documentSources: SessionDocumentSource[] | undefined;
      let pdfProviderId: string | undefined;
      let pdfProviderConfig:
        | { apiKey?: string; baseUrl?: string; accessKeyId?: string; accessKeySecret?: string }
        | undefined;

      if (frozenMaterials.length > 0) {
        // The session is built from the click-time snapshot (frozen above),
        // never from live store state.
        pdfProviderId = frozenPdfProviderId;
        pdfProviderConfig = frozenPdfProviderConfig;

        const storedDocumentKeys: string[] = [];
        try {
          documentSources = [];
          for (const [index, item] of frozenMaterials.entries()) {
            const storageKey = await storeDocumentBlob(item.file);
            storedDocumentKeys.push(storageKey);
            documentSources.push({
              id: item.id,
              name: item.name,
              size: item.size,
              lastModified: item.lastModified,
              mimeType: normalizeDocumentMimeType({
                mimeType: item.file.type,
                fileName: item.file.name,
              }),
              order: index + 1,
              storageKey,
              providerId: pdfProviderId,
            });
          }
        } catch (error) {
          await Promise.allSettled(storedDocumentKeys.map((key) => deleteDocumentBlob(key)));
          throw error;
        }
      }

      const sessionState = {
        sessionId: nanoid(),
        requirements,
        pdfText: '',
        pdfImages: [],
        imageStorageIds: [],
        documentSources,
        // Backward-compatible single-document fields for previously saved sessions.
        pdfStorageKey: documentSources?.[0]?.storageKey,
        pdfFileName: documentSources?.[0]?.name,
        documentMimeType: documentSources?.[0]?.mimeType,
        pdfProviderId,
        pdfProviderConfig,
        sceneOutlines: null,
        currentStep: 'generating' as const,
      };
      sessionStorage.setItem('generationSession', JSON.stringify(sessionState));

      router.push('/generation-preview');
    } catch (err) {
      log.error('Error preparing generation:', err);
      setError(err instanceof Error ? err.message : t('upload.generateFailed'));
    } finally {
      // Unfreeze the set once prep settles (navigation unmounts this page, so
      // this is normally a no-op on the way out).
      setPreparingGenerate(false);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('classroom.today');
    if (diffDays === 1) return t('classroom.yesterday');
    if (diffDays < 7) return `${diffDays} ${t('classroom.daysAgo')}`;
    return date.toLocaleDateString();
  };

  const canGenerate = !!form.requirement.trim() && hasUsableProvider;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canGenerate && !preparingGenerate) handleGenerate();
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center p-4 pt-6 md:p-8 md:pt-8 overflow-x-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        onChange={handleFileChange}
        className="hidden"
      />
      {PPTX_IMPORT_ENABLED && (
        <input
          ref={pptxFileInputRef}
          type="file"
          accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          onChange={handlePptxFileChange}
          className="hidden"
        />
      )}
      {/* ═══ Top-right pill (unchanged) ═══ */}
      <div
        ref={toolbarRef}
        className="fixed top-4 right-4 z-50 flex items-center gap-1 bg-white/60 dark:bg-gray-800/60 backdrop-blur-md px-2 py-1.5 rounded-full border border-gray-100/50 dark:border-gray-700/50 shadow-sm"
      >
        {/* Language Selector */}
        <LanguageSwitcher />

        {/* Theme Switcher — matches the pill's own hover idiom */}
        <ThemeToggle className="text-gray-400 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-white hover:shadow-sm" />

        <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700" />

        {/* Settings Button */}
        <div className="relative">
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-full text-gray-400 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-white hover:shadow-sm transition-all group"
          >
            <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
          </button>
        </div>
      </div>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setSettingsSection(undefined);
        }}
        initialSection={settingsSection}
      />

      {/* ═══ Background Decor ═══ */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '4s' }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '6s' }}
        />
      </div>

      {/* ═══ Hero section: brand lockup + input (centered, wider) ═══ */}
      <motion.div
        initial={heroEnter({ opacity: 0, y: 20 })}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={cn('relative z-20 w-full max-w-[920px] flex flex-col items-center mt-[4vh]')}
      >
        {/* ── Brand lockup: drawn in code, so it scales with the viewport ── */}
        <div className="relative w-[480px] sm:w-[600px] md:w-[720px]" data-pro-morph="lockup">
          <motion.div
            initial={heroEnter({ opacity: 0, scale: 0.9 })}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              delay: 0.1,
              type: 'spring',
              stiffness: 200,
              damping: 20,
            }}
          >
            <Image
              src="/hero-brand.png"
              alt="芯火课堂"
              width={720}
              height={340}
              priority
              className="w-full h-auto drop-shadow-2xl"
            />
          </motion.div>
          {workbenchEntryEnabled ? (
            <div
              className="absolute left-full top-0 ml-1.5 mt-[10px] md:ml-2 md:mt-[14px]"
              data-pro-morph="badge"
            >
              <ProBadge active={false} onToggle={enterWorkbench} />
            </div>
          ) : null}
        </div>

        {/* ── Unified input area ── */}
        <motion.div
          initial={heroEnter({ opacity: 0, scale: 0.97 })}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35 }}
          className="w-full"
        >
          <div
            data-pro-morph="composer"
            className="w-full rounded-3xl border border-indigo-400/25 bg-white/80 backdrop-blur-xl shadow-xl shadow-indigo-950/10 transition-shadow focus-within:border-indigo-400/45 focus-within:shadow-2xl focus-within:shadow-violet-500/[0.12] dark:border-indigo-400/20 dark:bg-slate-900/70 dark:shadow-black/30"
          >
            {/* ── Header: bot avatar + title + mode selector ── */}
            <div className="relative z-20 flex items-center justify-between gap-3 px-4 pt-3.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-violet-600 shadow-md shadow-cyan-500/25">
                  <Bot className="size-4 text-white" />
                </div>
                <span className="flex items-center gap-1.5 truncate text-[13px] font-medium text-foreground/85">
                  {t('home.askPromptTitle')}
                  <span className="text-violet-400">✦</span>
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ModelSelectorPill
                  onSettingsOpen={(section) => {
                    setSettingsSection(section);
                    setSettingsOpen(true);
                  }}
                />
              </div>
            </div>

            {/* Prompt box */}
            <div className="px-3.5 pt-3.5">
              <div className="rounded-2xl border border-border/50 dark:border-border">
                <textarea
                  ref={textareaRef}
                  placeholder={t('upload.requirementPlaceholder')}
                  className="w-full resize-none border-0 bg-transparent px-4 py-3.5 text-[14px] leading-relaxed placeholder:text-muted-foreground/40 dark:placeholder:text-muted-foreground focus:outline-none min-h-[172px] max-h-[360px]"
                  value={form.requirement}
                  onChange={(e) => updateForm('requirement', e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={5}
                />
              </div>
            </div>

            {/* ── Toolbar: attachments / media / web / agents ── */}
            <div className="flex items-center gap-2 px-3.5 pb-3.5 pt-3">
              <GenerationToolbar
                webSearch={form.webSearch}
                onWebSearchChange={(v) => updateForm('webSearch', v)}
                onSettingsOpen={(section) => {
                  setSettingsSection(section);
                  setSettingsOpen(true);
                }}
                courseMaterials={form.courseMaterials}
                onCourseMaterialsAdd={addCourseMaterials}
                onCourseMaterialRemove={removeCourseMaterial}
                onPdfError={setError}
                materialsLocked={preparingGenerate}
              />

              {/* Agents */}
              <AgentBar />

              {/* Right cluster: deep thinking + primary action */}
              <div className="ml-auto flex items-center gap-2">
                <DeepThinkingButton />
                <button
                  onClick={handleGenerate}
                  disabled={!canGenerate || preparingGenerate}
                  className={cn(
                    'shrink-0 h-10 rounded-full flex items-center justify-center gap-2 transition-all px-6',
                    canGenerate && !preparingGenerate
                      ? 'bg-gradient-to-r from-sky-500 via-indigo-500 to-fuchsia-500 text-white hover:opacity-90 shadow-sm shadow-indigo-500/25 cursor-pointer'
                      : 'bg-muted text-muted-foreground/40 dark:text-muted-foreground cursor-not-allowed',
                  )}
                >
                  <span className="text-[14px] font-semibold">
                    {preparingGenerate ? t('stage.generating') : t('toolbar.startLearning')}
                  </span>
                  {preparingGenerate ? (
                    <Loader2 className="size-[18px] animate-spin" />
                  ) : (
                    <ArrowRight className="size-[18px]" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Error ── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 w-full p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
            >
              <p className="text-sm text-destructive">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ═══ Recent classrooms — collapsible ═══ */}
      {/* The library action bar is always present after hydration: it carries
          the New-folder / import / search actions, so a brand-new user with
          zero courses and zero folders can still create the first folder or
          import. One stable action surface across root, folder, and empty. */}
      {hydrated && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="relative z-10 mt-12 w-full max-w-6xl flex flex-col items-center"
        >
          {/* Header — left-aligned title, right-aligned "View all". The folder
              path and the library actions (search / import / new folder) ride
              along the same row so they stay reachable in every view. */}
          <div className="w-full flex items-center gap-3">
            <button
              onClick={() => {
                if (currentFolderId) setCurrentFolderId(undefined);
                else persistRecentOpen(!recentOpen);
              }}
              className="group/head flex min-w-0 items-center gap-2 text-[15px] font-semibold text-foreground/85 hover:text-foreground transition-colors cursor-pointer"
            >
              <Clock className="size-4 shrink-0 text-muted-foreground/70 dark:text-muted-foreground" />
              <span className="shrink-0">{t('classroom.recentClassrooms')}</span>
              {currentFolder && (
                <>
                  <ChevronRight className="size-3.5 shrink-0 opacity-40" />
                  <span className="truncate max-w-[160px] text-foreground/80">
                    {currentFolder.name}
                  </span>
                </>
              )}
              <span className="shrink-0 text-[12px] font-normal tabular-nums text-muted-foreground/50 dark:text-muted-foreground">
                {currentFolder ? currentFolderClassrooms.length : classrooms.length}
              </span>
              <motion.div
                animate={{ rotate: recentOpen ? 180 : 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="shrink-0 text-muted-foreground/50 dark:text-muted-foreground"
              >
                <ChevronDown className="size-3.5" />
              </motion.div>
            </button>

            <div className="flex-1" />

            {/* Search toggle — icon that expands into an input in place */}
            <AnimatePresence initial={false}>
              {!searchOpen ? (
                <motion.button
                  key="search-icon"
                  ref={searchButtonRef}
                  type="button"
                  aria-label={t('classroom.searchAriaLabel')}
                  onClick={() => {
                    setSearchOpen(true);
                    if (!recentOpen) persistRecentOpen(true);
                    requestAnimationFrame(() => searchInputRef.current?.focus());
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12, ease: 'easeOut' }}
                  className="flex items-center justify-center size-7 rounded-full text-muted-foreground/50 dark:text-muted-foreground hover:text-foreground/70 dark:hover:text-foreground hover:bg-muted/50 dark:hover:bg-muted transition-colors cursor-pointer"
                >
                  <Search className="size-3.5" />
                </motion.button>
              ) : (
                <motion.div
                  key="search-input"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 200 }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                  className="overflow-hidden"
                >
                  <InputGroup
                    className={cn(
                      'h-7 text-[12px] rounded-full bg-muted/40 border-transparent shadow-none',
                      'transition-colors',
                      'hover:bg-muted/60',
                      'has-[[data-slot=input-group-control]:focus-visible]:bg-muted/60',
                      'has-[[data-slot=input-group-control]:focus-visible]:border-transparent',
                      'has-[[data-slot=input-group-control]:focus-visible]:ring-0',
                    )}
                  >
                    <InputGroupInput
                      ref={searchInputRef}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          if (searchQuery) {
                            setSearchQuery('');
                          } else {
                            setSearchOpen(false);
                            requestAnimationFrame(() => searchButtonRef.current?.focus());
                          }
                        }
                      }}
                      onBlur={() => {
                        if (!searchQuery) {
                          setSearchOpen(false);
                        }
                      }}
                      placeholder={t('classroom.searchPlaceholder')}
                      aria-label={t('classroom.searchAriaLabel')}
                      className="h-7 pl-3 placeholder:text-muted-foreground/50"
                    />
                    {searchQuery && (
                      <InputGroupButton
                        size="icon-xs"
                        aria-label={t('classroom.clearSearch')}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSearchQuery('');
                          searchInputRef.current?.focus();
                        }}
                      >
                        <X />
                      </InputGroupButton>
                    )}
                  </InputGroup>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={triggerImport}
              disabled={importing}
              className="group/import grid grid-cols-[auto_0fr] hover:grid-cols-[auto_1fr] items-center gap-1 rounded-full px-1.5 py-0.5 text-[12px] text-muted-foreground/35 dark:text-muted-foreground/80 hover:text-muted-foreground/70 dark:hover:text-muted-foreground hover:bg-muted/50 transition-all duration-200 cursor-pointer"
            >
              <Upload className="size-3" />
              <span className="overflow-hidden opacity-0 group-hover/import:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                {t('import.classroom')}
              </span>
            </button>
            {PPTX_IMPORT_ENABLED && (
              <button
                onClick={triggerPptxFileSelect}
                disabled={pptxImporting}
                className="group/import-pptx grid grid-cols-[auto_0fr] hover:grid-cols-[auto_1fr] items-center gap-1 rounded-full px-1.5 py-0.5 text-[12px] text-muted-foreground/35 dark:text-muted-foreground/80 hover:text-muted-foreground/70 dark:hover:text-muted-foreground hover:bg-muted/50 transition-all duration-200 cursor-pointer"
              >
                <Presentation className="size-3" />
                <span className="overflow-hidden opacity-0 group-hover/import-pptx:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                  {t('import.pptx')}
                </span>
              </button>
            )}
            {/* New folder — round icon button, matches the import/upload affordances. */}
            {!currentFolderId && !isSearching && (
              <button
                type="button"
                onClick={() => {
                  if (!recentOpen) persistRecentOpen(true);
                  setNewFolderOpen(true);
                }}
                aria-label={t('classroom.newFolderTitle')}
                title={t('classroom.newFolderTitle')}
                className="inline-flex items-center justify-center size-7 rounded-full bg-muted/40 text-muted-foreground ring-1 ring-border/50 hover:bg-muted hover:text-foreground hover:ring-border transition-[background-color,color,box-shadow] cursor-pointer"
              >
                <FolderPlus className="size-3.5" />
              </button>
            )}
          </div>

          {/* Expandable content */}
          <AnimatePresence>
            {recentOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                className="w-full overflow-hidden"
              >
                {folders.length === 0 && classrooms.length === 0 ? (
                  <div className="pt-8 pb-2 text-center text-[13px] text-muted-foreground/60 dark:text-muted-foreground">
                    {t('classroom.emptyLibraryHint')}
                  </div>
                ) : !isSearching && currentFolderId && currentFolderClassrooms.length === 0 ? (
                  // Empty folder: hint directly below the centered path bar.
                  <div className="pt-8 text-center">
                    <p className="text-[14px] text-muted-foreground">
                      {t('classroom.emptyFolderHint')}
                    </p>
                  </div>
                ) : isSearching && filteredClassrooms.length === 0 ? (
                  <div className="pt-8 pb-2 text-center text-[13px] text-muted-foreground/60 dark:text-muted-foreground">
                    {t('classroom.searchEmpty')}
                  </div>
                ) : (
                  <div className="pt-8">
                    {/* Breadcrumb — shown only while searching (the folder path
                        already lives in the centered header above). */}
                    {isSearching && (
                      <div className="mb-4 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentFolderId(undefined);
                            setSearchQuery('');
                            setSearchOpen(false);
                          }}
                          className="hover:text-foreground transition-colors"
                        >
                          {t('classroom.recentClassrooms')}
                        </button>
                        <ChevronRight className="size-3.5" />
                        <span className="text-foreground font-medium">
                          {t('classroom.searchResults')}
                        </span>
                        <span className="ml-1.5 text-[12px] text-muted-foreground tabular-nums">
                          ({filteredClassrooms.length})
                        </span>
                      </div>
                    )}

                    <AnimatePresence mode="wait">
                      <motion.div
                        key={
                          isSearching
                            ? 'search'
                            : currentFolderId
                              ? `folder-${currentFolderId}`
                              : 'root'
                        }
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                      >
                        {/* Root + non-search: render folder tiles first. */}
                        {!isSearching &&
                          currentFolderId === undefined &&
                          folders.map((folder, i) => (
                            <motion.div
                              key={folder.id}
                              initial={{ opacity: 0, y: 16 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.04, duration: 0.35, ease: 'easeOut' }}
                            >
                              <FolderCard
                                folder={folder}
                                courseCount={courseCountByFolder.get(folder.id) ?? 0}
                                coverSlides={coverSlidesByFolder.get(folder.id) ?? []}
                                onOpen={() => setCurrentFolderId(folder.id)}
                                onRename={handleRenameFolder(folder)}
                                onDelete={(mode) => confirmDeleteFolder(folder, mode)}
                                onDropCourse={(stageId) => handleMoveCourse(stageId, folder.id)}
                              />
                            </motion.div>
                          ))}

                        {/* Course tiles for the active view. */}
                        {visibleClassrooms.map((classroom, i) => (
                          <motion.div
                            key={classroom.id}
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04, duration: 0.35, ease: 'easeOut' }}
                          >
                            <ClassroomCard
                              classroom={classroom}
                              formatDate={formatDate}
                              onDelete={handleDelete}
                              onRename={handleRename}
                              confirmingDelete={pendingDeleteId === classroom.id}
                              onConfirmDelete={() => confirmDelete(classroom.id)}
                              onCancelDelete={() => setPendingDeleteId(null)}
                              onClick={() => router.push(`/classroom/${classroom.id}`)}
                              overlay={
                                <>
                                  <MoveToFolderMenu
                                    folders={folders}
                                    currentFolderId={classroom.folderId}
                                    onMove={(folderId) => handleMoveCourse(classroom.id, folderId)}
                                    onCreateAndMove={handleCreateAndMove(classroom.id)}
                                  />
                                  {/* Search view: show the owning folder as a badge. */}
                                  {isSearching && classroom.folderId && (
                                    <span className="absolute bottom-2 left-2 z-10 inline-flex items-center gap-1 rounded-md bg-violet-500/80 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm pointer-events-none">
                                      <Folder className="size-2.5" />
                                      {folderNameById.get(classroom.folderId) ?? ''}
                                    </span>
                                  )}
                                </>
                              }
                            />
                          </motion.div>
                        ))}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Folder dialogs — mounted at the top level so they are reachable even
          while the Recent section is collapsed or the course list is empty. */}
      <NewFolderDialog
        open={newFolderOpen}
        onOpenChange={(open) => {
          setNewFolderOpen(open);
          if (!open) setCreateAndMoveTarget(null);
        }}
        folders={folders}
        onCreate={handleCreateFolder}
      />

      {/* Footer — flows with content, at the very end */}
      <div className="mt-auto pt-12 pb-4 text-center text-xs text-muted-foreground/40 dark:text-muted-foreground/80">
        OpenMAIC Open Source Project
      </div>
    </div>
  );
}

// ─── Classroom Card — clean, minimal style ──────────────────────
/**
 * Decorative gradient disc palettes for course cards, picked by hashing the
 * course id so a card keeps its colour across sorting, filtering and folder
 * moves. Purely cosmetic — the course name still carries the identity.
 */
const COURSE_CARD_PALETTES = [
  'bg-gradient-to-br from-sky-400 to-indigo-500',
  'bg-gradient-to-br from-violet-400 to-fuchsia-500',
  'bg-gradient-to-br from-emerald-400 to-teal-500',
  'bg-gradient-to-br from-amber-400 to-orange-500',
  'bg-gradient-to-br from-rose-400 to-pink-500',
  'bg-gradient-to-br from-cyan-400 to-blue-500',
];

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function ClassroomCard({
  classroom,
  formatDate,
  overlay,
  onDelete,
  onRename,
  confirmingDelete,
  onConfirmDelete,
  onCancelDelete,
  onClick,
}: {
  classroom: StageListItem;
  formatDate: (ts: number) => string;
  /** Extra layers in the hover action row (move menu, folder badge). */
  overlay?: React.ReactNode;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRename: (id: string, newName: string) => void;
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) nameInputRef.current?.focus();
  }, [editing]);

  const isTaskEngineMode = classroom.taskEngineMode === true;
  const showModeBadge = classroom.interactiveMode || isTaskEngineMode;
  const ModeBadgeIcon = isTaskEngineMode ? Sparkles : Atom;
  const modeBadgeLabel = isTaskEngineMode ? 'Vocational Mode' : t('toolbar.interactiveModeLabel');

  // Two decorative, order-stable gradients for the icon disc. Hashing the id
  // (rather than the array index) keeps a card's colour fixed across sorting,
  // filtering and folder moves.
  const palette = COURSE_CARD_PALETTES[hashString(classroom.id) % COURSE_CARD_PALETTES.length];

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNameDraft(classroom.name);
    setEditing(true);
  };

  const commitRename = () => {
    if (!editing) return;
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== classroom.name) {
      onRename(classroom.id, trimmed);
    }
    setEditing(false);
  };

  return (
    <div
      className={cn(
        'group relative cursor-pointer rounded-2xl border border-indigo-400/15 bg-white/70 backdrop-blur-xl',
        'p-3.5 transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-indigo-400/35 hover:shadow-lg hover:shadow-indigo-500/10',
        'dark:border-indigo-400/15 dark:bg-slate-900/60 dark:hover:shadow-black/30',
      )}
      onClick={confirmingDelete ? undefined : onClick}
      draggable={!confirmingDelete && !editing}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/stage-id', classroom.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => {
        // Notify folder cards to clear any lingering drop highlight (Escape-
        // cancelled drags may not fire dragleave on every target).
        window.dispatchEvent(new CustomEvent('course-drag-end'));
      }}
    >
      {/* Header — icon disc, title (double-click to rename), hover actions */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'shrink-0 size-10 rounded-xl flex items-center justify-center text-white shadow-sm',
            palette,
          )}
        >
          <span className="text-[15px] font-bold">
            {classroom.name.trim().charAt(0).toUpperCase() || '·'}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          {editing ? (
            <div onClick={(e) => e.stopPropagation()}>
              <input
                ref={nameInputRef}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setEditing(false);
                }}
                onBlur={commitRename}
                maxLength={100}
                placeholder={t('classroom.renamePlaceholder')}
                className="w-full bg-transparent border-b border-violet-400/60 text-[14px] font-semibold text-foreground/90 outline-none placeholder:text-muted-foreground/40"
              />
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <p
                  className="truncate text-[14px] font-semibold text-foreground/90 cursor-text"
                  onDoubleClick={startRename}
                >
                  {classroom.name}
                </p>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                sideOffset={4}
                className="!max-w-[min(90vw,32rem)] break-words whitespace-normal"
              >
                <div className="flex items-center gap-1.5">
                  <span className="break-all">{classroom.name}</span>
                  <button
                    className="shrink-0 p-0.5 rounded hover:bg-foreground/10 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(classroom.name);
                      toast.success(t('classroom.nameCopied'));
                    }}
                  >
                    <Copy className="size-3 opacity-60" />
                  </button>
                </div>
              </TooltipContent>
            </Tooltip>
          )}

          <p className="mt-1 line-clamp-2 min-h-[2.5em] text-[12px] leading-relaxed text-muted-foreground/60">
            {classroom.description?.trim() || t('classroom.noDescription')}
          </p>
        </div>

        {/* Delete / rename — revealed on hover, kept out of the title's flow. */}
        <AnimatePresence>
          {!confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Button
                size="icon"
                variant="ghost"
                className="size-6 text-muted-foreground/50 hover:text-foreground"
                onClick={startRename}
              >
                <Pencil className="size-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-6 text-muted-foreground/50 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(classroom.id, e);
                }}
              >
                <Trash2 className="size-3" />
              </Button>
              {overlay}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer — metadata pills, then the relative time and the go arrow. */}
      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground/55">
        <span className="inline-flex items-center rounded-full bg-violet-100/70 dark:bg-violet-900/25 px-2 py-0.5 font-medium text-violet-600/90 dark:text-violet-300/90">
          {classroom.sceneCount} {t('classroom.scenesSuffix')}
        </span>
        {showModeBadge && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                aria-label={modeBadgeLabel}
                className={cn(
                  'inline-flex items-center justify-center size-5 rounded-full',
                  isTaskEngineMode
                    ? 'text-amber-600 dark:text-amber-300 ring-1 ring-amber-500/35'
                    : 'text-cyan-600 dark:text-cyan-300 ring-1 ring-cyan-500/30',
                )}
              >
                <ModeBadgeIcon className="size-3" />
              </span>
            </TooltipTrigger>
            {/* Negative sideOffset compensates for the global Tooltip Arrow's
                rotate-45 bounding box, which Radix reserves as spacing. */}
            <TooltipContent
              side="top"
              align="start"
              sideOffset={-4}
              collisionPadding={0}
              className="text-xs"
            >
              {modeBadgeLabel}
            </TooltipContent>
          </Tooltip>
        )}

        <div className="flex-1" />

        <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
          <Clock className="size-3" />
          {formatDate(classroom.updatedAt)}
        </span>
        <ArrowRight className="size-3.5 shrink-0 opacity-0 -translate-x-0.5 group-hover:opacity-70 group-hover:translate-x-0 transition-all" />
      </div>

      {/* Inline delete confirmation overlay */}
      <AnimatePresence>
        {confirmingDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-black/50 backdrop-blur-[6px]"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-[13px] font-medium text-white/90">
              {t('classroom.deleteConfirmTitle')}?
            </span>
            <div className="flex gap-2">
              <button
                className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-white/15 text-white/80 hover:bg-white/25 backdrop-blur-sm transition-colors"
                onClick={onCancelDelete}
              >
                {t('common.cancel')}
              </button>
              <button
                className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-red-500/90 text-white hover:bg-red-500 transition-colors"
                onClick={onConfirmDelete}
              >
                {t('classroom.delete')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Page() {
  return <HomePage />;
}
