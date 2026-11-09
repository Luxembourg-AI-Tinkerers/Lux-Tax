// PARTLY VERIFIED — mounted in tests, never rendered on a device.
// `apps/mobile/test/render.spec.ts` mounts this screen with React 18 and asserts which
// buttons exist for each prompt (Phase 31), including that a discarded session shows
// sign-in only. Not proven: the biometric sensor, the device passcode prompt, navigation,
// layout and styling. The policy behind it is in `src/lib/app-lock.ts` (Phase 27).
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { nextAuthPrompt, type AuthPrompt, type LockState } from '../lib/app-lock';

export interface AppLockScreenProps {
  state: LockState;
  /** Injectable clock; defaults to the wall clock at render time. */
  now?: number;
  /** True once a biometric attempt has failed, so the passcode is offered instead. */
  biometricFailed?: boolean;
  onBiometric: () => void;
  onPasscode: () => void;
  onSignIn: () => void;
  /** Allows a test or a story to pin the derived prompt. */
  promptOverride?: AuthPrompt;
}

/**
 * Renders whatever `nextAuthPrompt()` decides. The component owns no policy: if the prompt
 * says `WAIT`, it shows the countdown; if it says `SIGN_IN`, the biometric button is not
 * rendered at all, so a discarded session cannot be retried by tapping.
 */
export function AppLockScreen(props: AppLockScreenProps): React.ReactElement {
  const prompt =
    props.promptOverride ??
    nextAuthPrompt(props.state, props.now ?? Date.now(), undefined, props.biometricFailed ?? false);

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>Lux-Tax</Text>

      {prompt.kind === 'UNLOCK_BIOMETRIC' && (
        <>
          <Text style={styles.title}>Locked</Text>
          <Text style={styles.subtitle}>Unlock to view your tax file.</Text>
          <PrimaryButton label="Unlock with biometrics" onPress={props.onBiometric} />
          <SecondaryButton label="Use device passcode" onPress={props.onPasscode} />
        </>
      )}

      {prompt.kind === 'UNLOCK_PASSCODE' && (
        <>
          <Text style={styles.title}>Enter your passcode</Text>
          <Text style={styles.subtitle}>
            {prompt.reason === 'NO_BIOMETRICS'
              ? 'Biometrics are not available on this device.'
              : prompt.reason === 'NOT_ENROLLED'
                ? 'No fingerprint or face is enrolled.'
                : 'Biometric unlock did not succeed.'}
          </Text>
          <PrimaryButton label="Use device passcode" onPress={props.onPasscode} />
        </>
      )}

      {prompt.kind === 'WAIT' && (
        <>
          <Text style={styles.title}>Too many attempts</Text>
          <Text style={styles.subtitle}>
            Try again in {prompt.retryAfterSeconds} second{prompt.retryAfterSeconds === 1 ? '' : 's'}.
          </Text>
        </>
      )}

      {prompt.kind === 'SIGN_IN' && (
        <>
          <Text style={styles.title}>Sign in again</Text>
          <Text style={styles.subtitle}>
            For your security this session has ended. Sign in to continue.
          </Text>
          <PrimaryButton label="Sign in" onPress={props.onSignIn} />
        </>
      )}

      {prompt.kind === 'NONE' && (
        <>
          <Text style={styles.title}>Unlocked</Text>
          <Text style={styles.subtitle}>The app lock is disabled or already satisfied.</Text>
        </>
      )}
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }): React.ReactElement {
  return (
    <TouchableOpacity accessibilityRole="button" onPress={onPress} style={styles.primary}>
      <Text style={styles.primaryText}>{label}</Text>
    </TouchableOpacity>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }): React.ReactElement {
  return (
    <TouchableOpacity accessibilityRole="button" onPress={onPress} style={styles.secondary}>
      <Text style={styles.secondaryText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0f172a' },
  brand: { color: '#38bdf8', fontSize: 14, fontWeight: '800', letterSpacing: 2, marginBottom: 24 },
  title: { color: '#f8fafc', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#94a3b8', fontSize: 13, marginTop: 6, marginBottom: 24, lineHeight: 19 },
  primary: { backgroundColor: '#0284c7', paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
  primaryText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  secondary: { paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  secondaryText: { color: '#7dd3fc', fontSize: 13, fontWeight: '600' },
});
