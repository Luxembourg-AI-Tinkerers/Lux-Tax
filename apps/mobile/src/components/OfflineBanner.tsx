// PARTLY VERIFIED — mounted in tests, never rendered on a device.
// `apps/mobile/test/render.spec.ts` mounts this component with React 18 and walks the
// element tree, so props, branches and rendered text are proven (Phase 31). What is NOT
// proven: layout, styling, gestures and accessibility bridging — `react-native` is a
// primitive shim in `.tools/node_modules`, there is no NativeModule and no build.
// The wording and priority come from `src/lib/push-and-status.ts` (Phase 25).
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  deriveOfflineStatus,
  type OfflineStatusInput,
  type OfflineStatus,
} from '../lib/push-and-status';

export interface OfflineBannerProps extends OfflineStatusInput {
  /** Optional retry action, shown when the queue has work waiting. */
  onRetry?: () => void;
  /** Allows a test or a story to pin the derived status. */
  statusOverride?: OfflineStatus;
}

/**
 * Thin renderer over `deriveOfflineStatus()`. All wording, priority and visibility come
 * from the tested function — this file only maps a level to colours.
 */
export function OfflineBanner(props: OfflineBannerProps): React.ReactElement | null {
  const status = props.statusOverride ?? deriveOfflineStatus(props);
  if (!status.visible) return null;

  const palette = {
    OFFLINE: { background: '#7f1d1d', text: '#fee2e2' },
    PENDING: { background: '#78350f', text: '#fef3c7' },
    STALE: { background: '#1e3a8a', text: '#dbeafe' },
    ONLINE: { background: '#064e3b', text: '#d1fae5' },
  }[status.level];

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]} accessibilityRole="alert">
      <View style={styles.textColumn}>
        <Text style={[styles.title, { color: palette.text }]}>{status.title}</Text>
        <Text style={[styles.detail, { color: palette.text }]}>{status.detail}</Text>
      </View>
      {props.onRetry && status.level !== 'ONLINE' ? (
        <TouchableOpacity accessibilityRole="button" onPress={props.onRetry} style={styles.retry}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  textColumn: { flex: 1, paddingRight: 12 },
  title: { fontSize: 13, fontWeight: '700' },
  detail: { fontSize: 12, marginTop: 2, opacity: 0.9 },
  retry: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.15)' },
  retryText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
});
