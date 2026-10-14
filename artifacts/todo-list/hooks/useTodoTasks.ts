import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';

export type Task = {
  id: string;
  title: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
};

export type LoadState = 'loading' | 'ready' | 'error';
export type SaveState = 'saved' | 'saving' | 'error';
export type CloudState = 'connecting' | 'connected' | 'syncing' | 'error';

const TASKS_STORAGE_KEY = '@todo-list/tasks-v1';
const DELETED_STORAGE_KEY = '@todo-list/deleted-v1';

function isStoredTask(value: unknown): value is Omit<Task, 'created_at' | 'updated_at'> & {
  created_at?: string;
  updated_at?: string;
} {
  if (!value || typeof value !== 'object') return false;
  const task = value as Record<string, unknown>;
  return (
    typeof task.id === 'string' &&
    typeof task.title === 'string' &&
    typeof task.completed === 'boolean' &&
    (task.created_at === undefined || typeof task.created_at === 'string') &&
    (task.updated_at === undefined || typeof task.updated_at === 'string')
  );
}

function normalizeTask(
  task: Omit<Task, 'created_at' | 'updated_at'> & {
    created_at?: string;
    updated_at?: string;
  },
): Task {
  const createdAt = task.created_at ?? new Date().toISOString();
  return {
    id: task.id,
    title: task.title,
    completed: task.completed,
    created_at: createdAt,
    updated_at: task.updated_at ?? createdAt,
  };
}

function readLocalTasks(value: string | null): Task[] {
  if (value === null) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every(isStoredTask)) {
    throw new Error('Saved tasks have an unexpected format.');
  }
  return parsed.map(normalizeTask);
}

function readDeletedIds(value: string | null): Set<string> {
  if (value === null) return new Set();
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === 'string')) {
    throw new Error('Saved sync state has an unexpected format.');
  }
  return new Set(parsed);
}

function timestamp(task: Task) {
  const result = Date.parse(task.updated_at);
  return Number.isNaN(result) ? 0 : result;
}

function mergeTasks(remoteTasks: Task[], localTasks: Task[], deletedIds: Set<string>) {
  const merged = new Map<string, Task>();

  for (const task of remoteTasks) {
    if (!deletedIds.has(task.id)) merged.set(task.id, task);
  }

  for (const task of localTasks) {
    if (deletedIds.has(task.id)) continue;
    const remoteTask = merged.get(task.id);
    if (!remoteTask || timestamp(task) > timestamp(remoteTask)) {
      merged.set(task.id, task);
    }
  }

  return [...merged.values()].sort(
    (left, right) => Date.parse(left.created_at) - Date.parse(right.created_at),
  );
}

function describeCloudError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  const status =
    error && typeof error === 'object' && 'status' in error
      ? (error as { status?: unknown }).status
      : undefined;

  if (message.includes('missing')) {
    return 'Add the Supabase project URL and publishable/anon key in Replit Secrets, then retry.';
  }
  if (message.includes('invalid supabase project url')) {
    return 'Use the full Supabase Project URL, starting with https://, in EXPO_PUBLIC_SUPABASE_URL.';
  }
  if (
    status === 401 ||
    message.includes('invalid api key') ||
    message.includes('invalid jwt')
  ) {
    return 'Supabase rejected the connection. Check that the project URL and publishable/anon key belong to the same project.';
  }
  if (message.includes('anonymous') || message.includes('sign in')) {
    return 'Enable anonymous sign-ins in Supabase, then retry.';
  }
  if (
    message.includes('relation') ||
    message.includes('schema cache') ||
    message.includes('tasks')
  ) {
    return 'Run the setup SQL from the app’s Supabase folder, then retry.';
  }
  return 'Could not sync with Supabase. Your tasks remain saved on this device; check the connection and retry.';
}

async function getRemoteTasks() {
  const client = getSupabaseClient();
  const { data: sessionResult, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;

  let user = sessionResult.session?.user ?? null;
  if (!user) {
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    user = data.user;
  }

  if (!user) {
    throw new Error('Supabase did not create an anonymous session.');
  }

  const { data, error } = await client
    .from('tasks')
    .select('id, user_id, title, completed, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return { userId: user.id, tasks: (data ?? []) as Task[] };
}

async function writeRemoteTaskList(userId: string, tasks: Task[]) {
  const client = getSupabaseClient();
  const { data: existingRows, error: readError } = await client
    .from('tasks')
    .select('id')
    .eq('user_id', userId);

  if (readError) throw readError;

  const keepIds = new Set(tasks.map((task) => task.id));
  const idsToDelete = (existingRows ?? [])
    .map((row) => row.id as string)
    .filter((id) => !keepIds.has(id));

  if (idsToDelete.length > 0) {
    const { error } = await client
      .from('tasks')
      .delete()
      .eq('user_id', userId)
      .in('id', idsToDelete);
    if (error) throw error;
  }

  if (tasks.length > 0) {
    const { error } = await client
      .from('tasks')
      .upsert(
        tasks.map((task) => ({ ...task, user_id: userId })),
        { onConflict: 'id' },
      );
    if (error) throw error;
  }
}

export function useTodoTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('Could not load the saved list.');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [cloudState, setCloudState] = useState<CloudState>('connecting');
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);

  const tasksRef = useRef<Task[]>([]);
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const userIdRef = useRef<string | null>(null);
  const cloudStateRef = useRef<CloudState>('connecting');
  const storageQueue = useRef<Promise<void>>(Promise.resolve());
  const cloudQueue = useRef<Promise<void>>(Promise.resolve());
  const hasBootstrapped = useRef(false);

  const updateCloudState = useCallback((state: CloudState) => {
    cloudStateRef.current = state;
    setCloudState(state);
  }, []);

  const replaceTasks = useCallback((nextTasks: Task[]) => {
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
  }, []);

  const saveLocally = useCallback((nextTasks: Task[], deletedIds: Set<string>) => {
    const values: [string, string][] = [
      [TASKS_STORAGE_KEY, JSON.stringify(nextTasks)],
      [DELETED_STORAGE_KEY, JSON.stringify([...deletedIds])],
    ];

    storageQueue.current = storageQueue.current
      .catch(() => undefined)
      .then(async () => {
        setSaveState('saving');
        await AsyncStorage.multiSet(values);
      })
      .then(() => setSaveState('saved'))
      .catch(() => setSaveState('error'));

    return storageQueue.current;
  }, []);

  const syncWithSupabase = useCallback(async () => {
    updateCloudState('connecting');
    setCloudMessage(null);

    try {
      const { userId, tasks: remoteTasks } = await getRemoteTasks();
      const deletedSnapshot = new Set(deletedIdsRef.current);
      const merged = mergeTasks(remoteTasks, tasksRef.current, deletedSnapshot);

      userIdRef.current = userId;
      replaceTasks(merged);
      await saveLocally(merged, deletedSnapshot);
      await writeRemoteTaskList(userId, merged);

      const remainingDeletedIds = new Set(deletedIdsRef.current);
      for (const id of deletedSnapshot) remainingDeletedIds.delete(id);
      deletedIdsRef.current = remainingDeletedIds;
      await saveLocally(tasksRef.current, remainingDeletedIds);

      setCloudMessage(null);
      updateCloudState('connected');
    } catch (error) {
      setCloudMessage(describeCloudError(error));
      updateCloudState('error');
    }
  }, [replaceTasks, saveLocally, updateCloudState]);

  const loadTasks = useCallback(async () => {
    setLoadState('loading');
    updateCloudState('connecting');
    setCloudMessage(null);

    try {
      const stored = await AsyncStorage.multiGet([
        TASKS_STORAGE_KEY,
        DELETED_STORAGE_KEY,
      ]);
      const localTasks = readLocalTasks(stored[0]?.[1] ?? null);
      const deletedIds = readDeletedIds(stored[1]?.[1] ?? null);
      replaceTasks(localTasks);
      deletedIdsRef.current = deletedIds;
      setLoadState('ready');
    } catch {
      setLoadError('Could not load your saved tasks. Your existing data was left untouched.');
      setLoadState('error');
      updateCloudState('error');
      return;
    }

    await syncWithSupabase();
  }, [replaceTasks, syncWithSupabase, updateCloudState]);

  useEffect(() => {
    if (hasBootstrapped.current) return;
    hasBootstrapped.current = true;
    void loadTasks();
  }, [loadTasks]);

  const queueCloudSync = useCallback(() => {
    const userId = userIdRef.current;
    if (
      !userId ||
      cloudStateRef.current === 'error' ||
      cloudStateRef.current === 'connecting'
    ) {
      return;
    }

    const taskSnapshot = tasksRef.current;
    const deletedSnapshot = new Set(deletedIdsRef.current);
    updateCloudState('syncing');

    cloudQueue.current = cloudQueue.current
      .catch(() => undefined)
      .then(() => writeRemoteTaskList(userId, taskSnapshot))
      .then(async () => {
        const remainingDeletedIds = new Set(deletedIdsRef.current);
        for (const id of deletedSnapshot) remainingDeletedIds.delete(id);
        deletedIdsRef.current = remainingDeletedIds;
        await saveLocally(tasksRef.current, remainingDeletedIds);
        setCloudMessage(null);
        updateCloudState('connected');
      })
      .catch((error: unknown) => {
        setCloudMessage(describeCloudError(error));
        updateCloudState('error');
      });
  }, [saveLocally, updateCloudState]);

  const applyChange = useCallback(
    (nextTasks: Task[], deletedIds: Set<string> = deletedIdsRef.current) => {
      deletedIdsRef.current = deletedIds;
      replaceTasks(nextTasks);
      void saveLocally(nextTasks, deletedIds);
      queueCloudSync();
    },
    [queueCloudSync, replaceTasks, saveLocally],
  );

  const addTask = useCallback(
    (title: string) => {
      const trimmed = title.trim();
      if (
        !trimmed ||
        loadState !== 'ready' ||
        cloudStateRef.current === 'connecting'
      ) {
        return false;
      }

      const now = new Date().toISOString();
      const task: Task = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
        title: trimmed,
        completed: false,
        created_at: now,
        updated_at: now,
      };
      applyChange([...tasksRef.current, task]);
      return true;
    },
    [applyChange, loadState],
  );

  const toggleTask = useCallback(
    (id: string) => {
      if (cloudStateRef.current === 'connecting') return;
      const now = new Date().toISOString();
      applyChange(
        tasksRef.current.map((task) =>
          task.id === id
            ? { ...task, completed: !task.completed, updated_at: now }
            : task,
        ),
      );
    },
    [applyChange],
  );

  const deleteTask = useCallback(
    (id: string) => {
      if (cloudStateRef.current === 'connecting') return;
      const deletedIds = new Set(deletedIdsRef.current);
      deletedIds.add(id);
      applyChange(
        tasksRef.current.filter((task) => task.id !== id),
        deletedIds,
      );
    },
    [applyChange],
  );

  const retryCloud = useCallback(() => {
    void syncWithSupabase();
  }, [syncWithSupabase]);

  const retryLoad = useCallback(() => {
    void loadTasks();
  }, [loadTasks]);

  const retrySave = useCallback(() => {
    void saveLocally(tasksRef.current, deletedIdsRef.current);
  }, [saveLocally]);

  return {
    tasks,
    loadState,
    loadError,
    saveState,
    cloudState,
    cloudMessage,
    addTask,
    toggleTask,
    deleteTask,
    retryLoad,
    retrySave,
    retryCloud,
  };
}
