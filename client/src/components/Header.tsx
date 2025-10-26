import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, Heart, User } from "lucide-react";
import VoiceAssistant from "@/components/VoiceAssistant";
import { useState, useEffect } from "react";
import { rtdb, db } from "@/lib/firebase";
import { ref as rtdbRef, onValue } from "firebase/database";
import { collection, query as fsQuery, where, getDocs, doc as fsDoc, getDoc } from "firebase/firestore";
import { useLocation } from 'wouter';

export default function Header({ criticalAlert }: { criticalAlert?: any }) {
  const { user } = useAuth() as { user: any };
  const { toast } = useToast();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifHover, setNotifHover] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showNotifications && !notifHover) {
      timer = setTimeout(() => {
        setShowNotifications(false);
      }, 2000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [showNotifications, notifHover]);

  const { data: alerts = [], error: alertsError } = useQuery({
    queryKey: ['/api/alerts/unacknowledged'],
    refetchInterval: 10000,
  }) as { data: any[]; error: any };

  const [localCriticalAlert, setLocalCriticalAlert] = useState<any>(null);
  const [alertedDevices, setAlertedDevices] = useState<Record<string, boolean>>({});

  // 👉 Only keep the latest alert (critical > local > api)
  const latestAlert =
    criticalAlert ||
    localCriticalAlert ||
    (alerts && alerts.length > 0 ? alerts[0] : null);

  // Handle alerts error
  useEffect(() => {
    if (alertsError) {
      if (isUnauthorizedError(alertsError as Error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
      }
    }
  }, [alertsError, toast]);

  // 🔥 Listen to realtime devices for temperature > 30°C
  useEffect(() => {
    try {
      const devicesRef = rtdbRef(rtdb, 'devices');
      const handle = (snapshot: any) => {
        const val = snapshot.val() || {};
        const entries = Object.entries(val) as Array<[string, any]>;

        for (const [id, device] of entries) {
          const dataNode = (device && (device.data ?? device)) || {};
          let temp: number | null = null;
          if (dataNode.tempC != null) temp = Number(dataNode.tempC);
          else if (dataNode.temperature != null) temp = Number(dataNode.temperature);
          else if (dataNode.temp != null) temp = Number(dataNode.temp);

          if (typeof temp === 'number' && temp > 30) {
            if (!alertedDevices[id]) {
              (async () => {
                let patientName: string | null = null;
                let patientId: string | null = null;
                try {
                  const fields = ['deviceId', 'deviceNo', 'device', 'device_id'];
                  for (const f of fields) {
                    const q = fsQuery(collection(db, 'patients'), where(f, '==', id));
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                      const foundDoc = snap.docs[0];
                      const doc = foundDoc.data() as any;
                      patientId = foundDoc.id;
                      const nameFromParts = `${doc.firstName ?? ''} ${doc.lastName ?? ''}`.trim();
                      patientName = doc.name ?? (nameFromParts || null);
                      break;
                    }
                  }
                } catch (e) {
                  console.error('Error resolving patient for device', id, e);
                }

                // If we couldn't find a patient by device fields, check if the device node itself has an assigned_to
                if (!patientId) {
                  const assigned = (device && (device.assigned_to ?? device.assignedTo ?? device.patientId ?? device.assigned)) || null;
                  if (assigned) {
                    // assigned may be a full path or an id; extract last path segment if needed
                    const assignedId = (typeof assigned === 'string') ? assigned.split('/').pop() : null;
                    if (assignedId) {
                      patientId = assignedId;
                      // try to fetch the patient name if possible
                      try {
                        const pdoc = await getDoc(fsDoc(db, 'patients', patientId));
                        if (pdoc.exists()) {
                          const pd: any = pdoc.data();
                          const nameFromParts = `${pd.firstName ?? ''} ${pd.lastName ?? ''}`.trim();
                          patientName = pd.name ?? (nameFromParts || null);
                        }
                      } catch (ee) {
                        console.error('Error fetching patient by assigned id', patientId, ee);
                      }
                    }
                  }
                }

                const displayName = patientName ? `${patientName} (device ${id})` : id;
                const alert = {
                  id: `rtdb-${id}`,
                  title: `High temperature: ${patientName ?? displayName}`,
                  description: `Patient ${patientName ?? displayName} temperature is ${Number(temp).toFixed(1)}°C`,
                  type: 'critical',
                  temperature: temp,
                  deviceId: id,
                  patientId,
                  patientName,
                  createdAt: Date.now(),
                };
                // debug: log the resolved patient info to help troubleshoot missing associations
                console.debug('[Header] local alert created', { deviceId: id, assigned_on_device: device?.assigned_to ?? device?.assignedTo ?? device?.patientId, patientId, patientName, alert });
                setLocalCriticalAlert(alert);
                window.dispatchEvent(new CustomEvent('localCriticalAlert', { detail: alert }));
                setAlertedDevices(prev => ({ ...prev, [id]: true }));
                toast({ title: alert.title, description: alert.description, variant: 'destructive' });
              })();
              break;
            }
          } else {
            if (alertedDevices[id]) {
              setAlertedDevices(prev => {
                const copy = { ...prev };
                delete copy[id];
                return copy;
              });
              setLocalCriticalAlert((prev: any) => (prev?.deviceId === id ? null : prev));
            }
          }
        }
      };

      const unsub = onValue(devicesRef, handle, (err) => console.error('RTDB listener error', err));
      return () => unsub();
    } catch (e) {
      console.error('Failed to setup RTDB listener in Header', e);
    }
  }, [alertedDevices, toast]);

  const [location] = useLocation();
  const isPatientDashboard =
    typeof location === 'string' &&
    (location.startsWith('/dashboard/patient') ||
      location === '/report' ||
      location.startsWith('/patient-med') ||
      location === '/patient-med');

  const acknowledgeAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      await apiRequest('PUT', `/api/alerts/${alertId}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/alerts/unacknowledged'] });
      toast({ title: "Alert Acknowledged", description: "Alert marked as acknowledged." });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
      } else {
        toast({ title: "Error", description: "Failed to acknowledge alert.", variant: "destructive" });
      }
    },
  });

  const handleAcknowledgeAlert = (alertId: string) => {
    acknowledgeAlertMutation.mutate(alertId);
  };

  return (
    <header className="bg-card border-b border-border shadow-sm">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center space-x-4">
          <button
            className="flex items-center space-x-2 focus:outline-none"
            title="Profile"
            style={{ background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer' }}
          >
            <Heart className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold text-foreground">VitalCare</h1>
          </button>
          <div className="h-6 w-px bg-border"></div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
            <span className="text-sm text-muted-foreground">System Online</span>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* 🔔 Notifications */}
          {!isPatientDashboard && (
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                className="relative"
                onClick={() => setShowNotifications(!showNotifications)}
              >
                <Bell className="w-5 h-5" />
                {latestAlert && (
                  <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    1
                  </span>
                )}
              </Button>

              {showNotifications && latestAlert && (
                <Card
                  className="absolute right-0 mt-2 w-80 shadow-lg border z-50"
                  onMouseEnter={() => setNotifHover(true)}
                  onMouseLeave={() => setNotifHover(false)}
                >
                  <div className="p-4 border-b border-border">
                    <h3 className="font-semibold text-foreground">Latest Alert</h3>
                  </div>
                  <CardContent className="p-0 max-h-96 overflow-y-auto">
                    <div key={latestAlert.id} className="p-4 border-b border-border hover:bg-accent">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3">
                          <div className="w-8 h-8 bg-destructive rounded-full flex items-center justify-center">
                            <Bell className="w-4 h-4 text-destructive-foreground" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">{latestAlert.title}</p>
                            <p className="text-xs text-muted-foreground">{latestAlert.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(latestAlert.createdAt).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAcknowledgeAlert(latestAlert.id)}
                        >
                          ✓
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
          {/* Voice assistant (inline, before user) - hidden on very small screens to avoid overlap */}
          <div className="hidden sm:flex items-center mr-2">
            <VoiceAssistant />
          </div>

          {/* 👤 User */}
          <div className="flex items-center space-x-3">
            <div className="text-right">
              <p className="text-sm font-medium text-foreground">
                {user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.email}
              </p>
              {!isPatientDashboard && (
                <p
                  className="text-xs text-muted-foreground cursor-pointer hover:underline"
                  onClick={() => (window.location.href = '/dashboard?tab=profile')}
                >
                  {user?.hospital || 'Healthcare Professional'}
                </p>
              )}
            </div>
            {!isPatientDashboard && (
              <Button
                variant="ghost"
                size="sm"
                className="w-8 h-8 bg-primary rounded-full flex items-center justify-center p-0"
                onClick={() => (window.location.href = '/dashboard?tab=profile')}
                title="View Profile"
              >
                <User className="w-4 h-4 text-primary-foreground" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
