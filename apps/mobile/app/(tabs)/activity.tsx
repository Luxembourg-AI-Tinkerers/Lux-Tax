import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { mobileApiClient } from '../../src/lib/api-client';
import { AuditEventDto } from '@luxtax/contracts';

export default function MobileActivityScreen() {
  const [activity, setActivity] = useState<readonly AuditEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadActivity = async () => {
    const hhRes = await mobileApiClient.getHouseholds();
    if (hhRes.data && hhRes.data.length > 0) {
      const actRes = await mobileApiClient.getAuditActivity(hhRes.data[0].id, { limit: 20 });
      if (actRes.data) {
        setActivity(actRes.data);
      }
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadActivity();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0284c7" />
        <Text style={styles.loadingText}>Loading audit events...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadActivity(); }} />}
    >
      <Text style={styles.headerTitle}>Household Audit Trail</Text>
      <Text style={styles.headerSubtitle}>
        Immutable record of all changes with actor attribution
      </Text>

      {activity.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No events recorded yet.</Text>
        </View>
      ) : (
        activity.map((event) => (
          <View key={event.id} style={styles.eventCard}>
            <View style={styles.dot} />
            <View style={styles.eventContent}>
              <Text style={styles.eventDesc}>{event.description}</Text>
              <Text style={styles.eventMeta}>
                Actor: {event.actorEmail || event.actorId} • {new Date(event.createdAt).toLocaleTimeString()}
              </Text>
            </View>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{event.eventType}</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    marginBottom: 16,
  },
  empty: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  eventCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0284c7',
    marginRight: 10,
  },
  eventContent: {
    flex: 1,
  },
  eventDesc: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  eventMeta: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 3,
  },
  typeBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 9,
    fontFamily: 'Courier',
    color: '#475569',
  },
});
