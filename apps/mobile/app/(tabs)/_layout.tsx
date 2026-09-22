import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#ffffff' },
        headerTitleStyle: { fontWeight: '700', fontSize: 16, color: '#0f172a' },
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#e2e8f0',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#0284c7',
        tabBarInactiveTintColor: '#94a3b8',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerTitle: 'Luxembourg Tax Workspace',
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: 'Documents',
          headerTitle: 'Document Vault & Evidence',
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          headerTitle: 'Readiness & Tasks',
        }}
      />
      <Tabs.Screen
        name="estimate"
        options={{
          title: 'Estimate',
          headerTitle: '2025 Tax Estimate',
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          headerTitle: 'Account & Settings',
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          href: null, // Accessible from Home contextual action
          headerTitle: 'Household Audit Log',
        }}
      />
    </Tabs>
  );
}
