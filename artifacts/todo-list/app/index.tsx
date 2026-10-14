import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

type Task = {
  id: string;
  title: string;
  completed: boolean;
};

type Filter = 'all' | 'active' | 'completed';
type LoadState = 'loading' | 'ready' | 'error';
type SaveState = 'saved' | 'saving' | 'error';

const STORAGE_KEY = '@todo-list/tasks-v1';

function isTask(value: unknown): value is Task {
  if (!value || typeof value !== 'object') return false;
  const task = value as Record<string, unknown>;
  return (
    typeof task.id === 'string' &&
    typeof task.title === 'string' &&
    typeof task.completed === 'boolean'
  );
}

function todayLabel() {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}

export default function TodoScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isDark = colors.background === '#201F1D';
  const webTopInset = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const webBottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  const loadTasks = useCallback(async () => {
    setLoadState('loading');
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored === null) {
        setTasks([]);
      } else {
        const parsed: unknown = JSON.parse(stored);
        if (!Array.isArray(parsed) || !parsed.every(isTask)) {
          throw new Error('Saved tasks have an unexpected format.');
        }
        setTasks(parsed);
      }
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (loadState !== 'ready') return;

    const snapshot = JSON.stringify(tasks);
    writeQueue.current = writeQueue.current
      .catch(() => undefined)
      .then(async () => {
        setSaveState('saving');
        await AsyncStorage.setItem(STORAGE_KEY, snapshot);
      })
      .then(() => setSaveState('saved'))
      .catch(() => setSaveState('error'));
  }, [loadState, saveAttempt, tasks]);

  const completedCount = useMemo(
    () => tasks.reduce((total, task) => total + Number(task.completed), 0),
    [tasks],
  );
  const activeCount = tasks.length - completedCount;
  const visibleTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (filter === 'active') return !task.completed;
        if (filter === 'completed') return task.completed;
        return true;
      }),
    [filter, tasks],
  );
  const progress = tasks.length === 0 ? 0 : Math.round((completedCount / tasks.length) * 100);

  const addTask = useCallback(() => {
    const title = draft.trim();
    if (!title || loadState !== 'ready') return;

    setTasks((current) => [
      ...current,
      {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
        title,
        completed: false,
      },
    ]);
    setDraft('');
    Keyboard.dismiss();
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
  }, [draft, loadState]);

  const toggleTask = useCallback((id: string) => {
    setTasks((current) =>
      current.map((task) =>
        task.id === id ? { ...task, completed: !task.completed } : task,
      ),
    );
    if (Platform.OS !== 'web') {
      void Haptics.selectionAsync().catch(() => undefined);
    }
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((current) => current.filter((task) => task.id !== id));
  }, []);

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: tasks.length },
    { key: 'active', label: 'Open', count: activeCount },
    { key: 'completed', label: 'Done', count: completedCount },
  ];

  const emptyCopy = {
    all: {
      title: 'Nothing on your list',
      detail: 'Add a task below when something comes to mind.',
      icon: 'leaf-outline' as const,
    },
    active: {
      title: 'You’re all caught up',
      detail: 'Every task is complete. Enjoy the breathing room.',
      icon: 'sunny-outline' as const,
    },
    completed: {
      title: 'No finished tasks yet',
      detail: 'Completed tasks will show up here.',
      icon: 'checkmark-done-outline' as const,
    },
  }[filter];

  const renderTask = ({ item }: { item: Task }) => (
    <View
      style={[
        styles.taskRow,
        { borderBottomColor: colors.border },
      ]}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`${item.completed ? 'Mark as open' : 'Complete'}: ${item.title}`}
        accessibilityState={{ checked: item.completed }}
        onPress={() => toggleTask(item.id)}
        style={({ pressed }) => [
          styles.checkButton,
          {
            borderColor: item.completed ? colors.primary : colors.border,
            backgroundColor: item.completed ? colors.primary : 'transparent',
            opacity: pressed ? 0.72 : 1,
          },
        ]}
        testID={`task-toggle-${item.id}`}
      >
        {item.completed ? (
          <Ionicons name="checkmark" size={16} color={colors.primaryForeground} />
        ) : null}
      </Pressable>

      <Text
        style={[
          styles.taskTitle,
          {
            color: item.completed ? colors.mutedForeground : colors.foreground,
            textDecorationLine: item.completed ? 'line-through' : 'none',
          },
        ]}
      >
        {item.title}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${item.title}`}
        onPress={() => deleteTask(item.id)}
        hitSlop={10}
        style={({ pressed }) => [styles.deleteButton, { opacity: pressed ? 0.55 : 1 }]}
        testID={`task-delete-${item.id}`}
      >
        <Ionicons name="close" size={19} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={0}
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          paddingTop: webTopInset,
        },
      ]}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <FlatList
        data={visibleTasks}
        keyExtractor={(item) => item.id}
        renderItem={renderTask}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <View style={styles.topLine}>
              <View style={[styles.brandMark, { backgroundColor: colors.accent }]}>
                <Ionicons name="checkmark-done" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.brandText, { color: colors.mutedForeground }]}>
                A SMALL STEP
              </Text>
              <View style={{ flex: 1 }} />
              {loadState === 'loading' ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <View style={[styles.dateDot, { backgroundColor: colors.primary }]} />
              )}
            </View>

            <Text style={[styles.date, { color: colors.mutedForeground }]}>
              {todayLabel()}
            </Text>
            <Text style={[styles.heading, { color: colors.foreground }]}>
              Make room for{'\n'}what matters.
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              One thing at a time is still progress.
            </Text>

            <View style={[styles.progressCard, { backgroundColor: colors.card }]}>
              <View style={styles.progressHeader}>
                <View>
                  <Text style={[styles.progressTitle, { color: colors.foreground }]}>
                    Your progress
                  </Text>
                  <Text style={[styles.progressCaption, { color: colors.mutedForeground }]}>
                    {tasks.length === 0
                      ? 'A fresh start'
                      : `${activeCount} ${activeCount === 1 ? 'task' : 'tasks'} to go`}
                  </Text>
                </View>
                <Text style={[styles.progressPercent, { color: colors.primary }]}>
                  {progress}%
                </Text>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: colors.primary,
                      width: `${progress}%`,
                    },
                  ]}
                />
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Your tasks
              </Text>
              <Text style={[styles.taskCount, { color: colors.mutedForeground }]}>
                {activeCount} open
              </Text>
            </View>

            <View style={[styles.filters, { backgroundColor: colors.muted }]}>
              {filters.map((item) => {
                const selected = filter === item.key;
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    onPress={() => setFilter(item.key)}
                    style={({ pressed }) => [
                      styles.filterButton,
                      selected ? { backgroundColor: colors.card } : null,
                      { opacity: pressed ? 0.72 : 1 },
                    ]}
                    testID={`filter-${item.key}`}
                  >
                    <Text
                      style={[
                        styles.filterLabel,
                        { color: selected ? colors.foreground : colors.mutedForeground },
                      ]}
                    >
                      {item.label}
                    </Text>
                    <Text
                      style={[
                        styles.filterCount,
                        { color: selected ? colors.primary : colors.mutedForeground },
                      ]}
                    >
                      {item.count}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {loadState === 'error' ? (
              <View style={[styles.errorPanel, { backgroundColor: colors.accent }]}>
                <Ionicons name="cloud-offline-outline" size={20} color={colors.primary} />
                <View style={styles.errorTextWrap}>
                  <Text style={[styles.errorTitle, { color: colors.foreground }]}>
                    Couldn’t load your saved tasks
                  </Text>
                  <Text style={[styles.errorMessage, { color: colors.mutedForeground }]}>
                    Your existing list is untouched. Try loading it again.
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading tasks"
                  onPress={() => void loadTasks()}
                  style={styles.retryButton}
                  testID="retry-load"
                >
                  <Ionicons name="refresh" size={18} color={colors.primary} />
                </Pressable>
              </View>
            ) : null}

            {loadState === 'ready' && saveState === 'error' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry saving tasks"
                onPress={() => setSaveAttempt((attempt) => attempt + 1)}
                style={[styles.saveNotice, { backgroundColor: colors.accent }]}
                testID="retry-save"
              >
                <Ionicons name="alert-circle-outline" size={17} color={colors.primary} />
                <Text style={[styles.saveNoticeText, { color: colors.accentForeground }]}>
                  Changes aren’t saved yet. Tap to retry.
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loadState === 'ready' ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.accent }]}>
                <Ionicons name={emptyCopy.icon} size={25} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {emptyCopy.title}
              </Text>
              <Text style={[styles.emptyDetail, { color: colors.mutedForeground }]}>
                {emptyCopy.detail}
              </Text>
            </View>
          ) : loadState === 'loading' ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
                Loading your list…
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          visibleTasks.length > 0 && saveState === 'saving' ? (
            <View style={styles.savingState}>
              <ActivityIndicator size="small" color={colors.mutedForeground} />
              <Text style={[styles.savingText, { color: colors.mutedForeground }]}>
                Saving on this device
              </Text>
            </View>
          ) : null
        }
      />

      <View
        style={[
          styles.composerArea,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            paddingBottom: Math.max(webBottomInset, 16),
          },
        ]}
      >
        <View
          style={[
            styles.composer,
            {
              backgroundColor: colors.card,
              borderColor: colors.input,
            },
          ]}
        >
          <TextInput
            accessibilityLabel="New task"
            editable={loadState === 'ready'}
            maxLength={120}
            onChangeText={setDraft}
            onSubmitEditing={addTask}
            placeholder="Add a task…"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="done"
            style={[styles.input, { color: colors.foreground }]}
            testID="task-input"
            value={draft}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add task"
            disabled={!draft.trim() || loadState !== 'ready'}
            onPress={addTask}
            style={({ pressed }) => [
              styles.addButton,
              {
                backgroundColor: colors.primary,
                opacity: !draft.trim() || loadState !== 'ready' ? 0.45 : pressed ? 0.78 : 1,
              },
            ]}
            testID="add-task"
          >
            <Ionicons name="add" size={24} color={colors.primaryForeground} />
          </Pressable>
        </View>
        <Text style={[styles.footerHint, { color: colors.mutedForeground }]}>
          Saved just for you, on this device
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    flexGrow: 1,
  },
  topLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  brandMark: {
    alignItems: 'center',
    borderRadius: 12,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  brandText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.4,
  },
  dateDot: {
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  date: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    letterSpacing: 0.15,
    marginTop: 29,
    textTransform: 'capitalize',
  },
  heading: {
    fontFamily: 'Inter_700Bold',
    fontSize: 34,
    letterSpacing: -1.35,
    lineHeight: 40,
    marginTop: 9,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  progressCard: {
    borderRadius: 18,
    marginTop: 25,
    paddingHorizontal: 17,
    paddingVertical: 16,
  },
  progressHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  progressCaption: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 4,
  },
  progressPercent: {
    fontFamily: 'Inter_700Bold',
    fontSize: 19,
    letterSpacing: -0.5,
  },
  progressTrack: {
    borderRadius: 4,
    height: 6,
    marginTop: 14,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: 4,
    height: 6,
  },
  sectionHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    marginTop: 31,
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    letterSpacing: -0.4,
  },
  taskCount: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  filters: {
    borderRadius: 13,
    flexDirection: 'row',
    gap: 4,
    marginBottom: 10,
    padding: 4,
  },
  filterButton: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 36,
  },
  filterLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  filterCount: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  taskRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 13,
    minHeight: 60,
    paddingVertical: 12,
  },
  checkButton: {
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: 1.5,
    height: 23,
    justifyContent: 'center',
    width: 23,
  },
  taskTitle: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 20,
  },
  deleteButton: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 34,
  },
  emptyIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    marginTop: 14,
    textAlign: 'center',
  },
  emptyDetail: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
    textAlign: 'center',
  },
  loadingState: {
    alignItems: 'center',
    gap: 10,
    paddingTop: 32,
  },
  loadingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  errorPanel: {
    alignItems: 'center',
    borderRadius: 13,
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  errorTextWrap: {
    flex: 1,
  },
  errorTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  errorMessage: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  retryButton: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  saveNotice: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    marginTop: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  saveNoticeText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  savingState: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingTop: 14,
  },
  savingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  composerArea: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 13,
  },
  composer: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 54,
    paddingHorizontal: 8,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    minHeight: 52,
    paddingHorizontal: 10,
  },
  addButton: {
    alignItems: 'center',
    borderRadius: 12,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  footerHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    marginTop: 9,
    textAlign: 'center',
  },
});
