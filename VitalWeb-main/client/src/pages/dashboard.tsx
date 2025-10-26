import React, { useState, useEffect } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, AlertTriangle, Wifi, Clock } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import AlertModal from "@/components/AlertModal";
import AddPatientPage from "@/pages/add-patient";
import { UploadReportsContent } from "./upload-reports";
import ProfilePage from "@/pages/profile";
import { PatientCardList } from "@/components/PatientCard";
import { collection, onSnapshot } from "firebase/firestore";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { db, rtdb } from "@/lib/firebase";
import { ref as rtdbRef, onValue, get } from "firebase/database";
import { ReactNode } from "react";
import { MedicineReminderContent } from "./medi";

type StatCardProps = {
  label: string;
  value: string | number;
  icon: ReactNode;
  bg: string;
  textColor?: string;
};

function StatCard({
  label,
  value,
  icon,
  bg,
  textColor = "text-foreground",
}: StatCardProps) {
  return (
    <Card className="vital-card">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground text-sm">{label}</p>
            <p className={`text-base font-semibold ${textColor}`}>{value}</p>
          </div>
          <div className={`w-12 h-12 ${bg} rounded-full flex items-center justify-center`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  // ...existing code...

  // Track real-time temperatures for all patients
  const [patientTemperatures, setPatientTemperatures] = useState<{ [id: string]: number | null }>({});

  // Show alert only when PatientCard temperature is above 30
  useEffect(() => {
    const abnormalEntry = Object.entries(patientTemperatures).find(
      ([, temp]) => typeof temp === "number" && temp > 30
    );
    if (abnormalEntry) {
      setCriticalAlert({
        id: abnormalEntry[0],
        title: "alert temp>30",
        description: `Patient temperature is ${abnormalEntry[1]}°C`,
        type: "critical",
        temperature: abnormalEntry[1],
        createdAt: Date.now(),
      });
    } else {
      setCriticalAlert(null);
    }
  }, [patientTemperatures]);

  // Callback for PatientCardList
  const handleRealtimeTemperature = (patientId: string, temperature: number | null) => {
    console.log(`[DEBUG] Temperature update for patient ${patientId}:`, temperature);
    setPatientTemperatures(prev => ({ ...prev, [patientId]: temperature }));
  };
  const getTabFromQuery = () => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("tab") || "overview";
    }
    return "overview";
  };

  const [activeTab, setActiveTab] = useState(getTabFromQuery());
  const { toast } = useToast();
  const [criticalAlert, setCriticalAlert] = useState<any>(null);
  const [alertsList, setAlertsList] = useState<any[]>([]);
  // Listen for global localCriticalAlert events dispatched by Header so alerts show in Alerts tab
  useEffect(() => {
    const handleLocal = (e: any) => {
      try {
        const alert = e?.detail ?? null;
        if (!alert) return;
        // add to alerts list (avoid dupes) and update critical count
        setAlertsList(prev => {
          if (prev.find(a => a.id === alert.id)) {
            // ensure criticalAlert is set to the latest
            setCriticalAlert(alert);
            // recompute critical count from existing list
            const criticalCount = prev.filter(a => (a.level === 'critical' || a.type === 'critical')).length;
            setStats(s => ({ ...s, criticalAlerts: criticalCount }));
            return prev;
          }
          const updated = [alert, ...prev];
          const criticalCount = updated.filter(a => (a.level === 'critical' || a.type === 'critical')).length;
          setStats(s => ({ ...s, criticalAlerts: criticalCount }));
          setCriticalAlert(alert);
          return updated;
        });
      } catch (err) {
        console.error('Failed to handle localCriticalAlert event', err);
      }
    };
    window.addEventListener('localCriticalAlert', handleLocal as EventListener);
    return () => window.removeEventListener('localCriticalAlert', handleLocal as EventListener);
  }, []);
  // Standard normal values for vitals
  const normalValues = {
    temperature: 37,
    heartRate: 80,
    oxygenLevel: 98,
  };

  const [stats, setStats] = useState({
    activePatients: 0,
    criticalAlerts: 0,
    connectedDevices: 0,
  });

  useEffect(() => {
    const onPopState = () => setActiveTab(getTabFromQuery());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      await apiRequest('PUT', `/api/alerts/${alertId}/acknowledge`);
      queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/alerts/unacknowledged'] });
      toast({ title: 'Alert Acknowledged', description: 'Alert has been acknowledged.' });
      setAlertsList(prev => {
        const updated = prev.filter(a => a.id !== alertId);
        const criticalCount = updated.filter((a: any) => (a.level === 'critical' || a.type === 'critical')).length;
        setStats(s => ({ ...s, criticalAlerts: criticalCount }));
        return updated;
      });
      if (criticalAlert?.id === alertId) setCriticalAlert(null);
    } catch (err: any) {
      if (err?.message && err.message.startsWith('401')) {
        toast({ title: 'Unauthorized', description: 'Please log in again.', variant: 'destructive' });
        setTimeout(() => window.location.href = '/api/login', 500);
        return;
      }
      console.error('Failed to acknowledge alert', err);
      toast({ title: 'Error', description: 'Failed to acknowledge alert.', variant: 'destructive' });
    }
  };

  useEffect(() => {
    const unsubscribePatients = onSnapshot(collection(db, "patients"), snapshot => {
      const patients = snapshot.docs.map(doc => doc.data());

      const totalPatients = patients.length;
        setStats(prev => ({
          ...prev,
          activePatients: totalPatients,
        }));
    });


    // 🚨 Listen for new alerts
    const unsubscribeAlerts = onSnapshot(collection(db, "alerts"), (snapshot) => {
      const alerts = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      const criticals = alerts.filter((a: any) => a.level === "critical");

      // ✅ NEW LOGIC: Keep all alerts persistent and stack new ones on top
      setAlertsList((prev) => {
        const newAlerts = alerts.map((a: any) => ({
          ...a,
          createdAt: a.createdAt || Date.now(),
        }));

        const existingIds = new Set(prev.map((a) => a.id));
        const merged = [
          ...newAlerts.filter((a) => !existingIds.has(a.id)),
          ...prev,
        ];

        // Return all alerts sorted (newest first) and update critical count including local alerts
        const mergedSorted = merged.sort((a, b) => b.createdAt - a.createdAt);
        const criticalCount = mergedSorted.filter((a: any) => (a.level === 'critical' || a.type === 'critical')).length;
        setStats(prev => ({ ...prev, criticalAlerts: criticalCount }));
        return mergedSorted;
      });

      // 🔔 Show toast for latest critical alert only
      if (criticals.length > 0) {
        const latest: any = criticals[0];
        setCriticalAlert(latest);
        toast({
          title: "Critical Alert",
          description: latest.message ?? latest.description ?? "A patient requires attention.",
          variant: "destructive",
        });
      }
    });

    // Also listen for assigned devices in Realtime DB
    const devicesRef = rtdbRef(rtdb, 'devices');
    const devicesListener = onValue(devicesRef, (snapshot) => {
      const val = snapshot.val() || {};
      const entries = Object.entries(val) as Array<[string, any]>;
      const assigned = entries.filter(([k, v]) => {
        // consider assigned if status === 'assigned' or assigned_to is present
        return v?.status === 'assigned' || (v?.assigned_to != null && v?.assigned_to !== '');
      }).length;
      setStats(prev => ({ ...prev, connectedDevices: assigned }));
    }, (err) => {
      console.error('RTDB devices listener error', err);
      setStats(prev => ({ ...prev, connectedDevices: 0 }));
    });

    return () => {
      unsubscribePatients();
      unsubscribeAlerts();
      try { devicesListener && devicesListener(); } catch (e) { /* ignore */ }
    };
  }, [toast]);

  // Handler to open map link for an alert by checking assigned device in RTDB, then fallback to patient-level link
  const handleAlertClick = async (alert: any) => {
    try {
      // If already attached to alert, open directly
      if (alert.googleMapsLink) {
        window.open(alert.googleMapsLink, '_blank');
        return;
      }

      // Prefer resolving by deviceId if present on the alert (faster, more reliable)
      const deviceId = alert.deviceId ?? alert.device ?? alert.device_id ?? alert.deviceNo;
      let pid = alert.patientId || alert.patient || alert.patient_id;
      if (deviceId) {
        try {
          const deviceRef = rtdbRef(rtdb, `devices/${deviceId}`);
          const deviceSnap = await get(deviceRef);
          const deviceNode = deviceSnap.val();
          if (deviceNode) {
            // If the device node has a map_link (top-level or under `data`), open it immediately
            const mapFromDevice = deviceNode?.map_link
              ?? deviceNode?.mapLink
              ?? deviceNode?.googleMapsLink
              ?? deviceNode?.location?.googleMapsLink
              ?? deviceNode?.location?.map_link
              ?? deviceNode?.data?.map_link
              ?? deviceNode?.data?.mapLink
              ?? deviceNode?.data?.googleMapsLink
              ?? deviceNode?.data?.location?.googleMapsLink
              ?? deviceNode?.data?.location?.map_link
              ?? (deviceNode?.data && (deviceNode.data.latitude && deviceNode.data.longitude) ? `https://www.google.com/maps/search/?api=1&query=${deviceNode.data.latitude},${deviceNode.data.longitude}` : undefined);
            if (mapFromDevice) {
              setAlertsList(prev => prev.map(a => a.id === alert.id ? { ...a, googleMapsLink: mapFromDevice } : a));
              window.open(mapFromDevice, '_blank');
              return;
            }

            // Otherwise, try to derive patient id from device.assigned_to (if present)
            const assigned = deviceNode?.assigned_to ?? deviceNode?.assignedTo ?? deviceNode?.patientId ?? deviceNode?.assigned;
            if (assigned) {
              pid = (typeof assigned === 'string') ? assigned.split('/').pop() : pid;
            }
          }
        } catch (e) {
          console.error('Error reading device node for map resolution', deviceId, e);
        }
      }

      // If we don't yet have a patient id, try to find devices assigned to the patient (older fallback)
      if (!pid) {
        toast({ title: 'No patient associated', description: 'This alert has no patient id to resolve location.', variant: 'default' });
        return;
      }

      // Read devices once and find the one assigned to this patient
      const devicesRef = rtdbRef(rtdb, 'devices');
      const snap = await get(devicesRef);
      const devices = snap.val() || {};
      let found: string | undefined;

      for (const [did, d] of Object.entries(devices) as Array<[string, any]>) {
        const device = d as any;
        const assigned = device?.assigned_to ?? device?.assignedTo ?? device?.patientId;
        if (!assigned) continue;
        if (assigned === pid || (Array.isArray(assigned) && assigned.includes(pid))) {
          found = device?.map_link
            ?? device?.mapLink
            ?? device?.googleMapsLink
            ?? device?.location?.googleMapsLink
            ?? device?.location?.map_link
            ?? device?.data?.map_link
            ?? device?.data?.mapLink
            ?? device?.data?.googleMapsLink
            ?? (device?.data && (device.data.latitude && device.data.longitude) ? `https://www.google.com/maps/search/?api=1&query=${device.data.latitude},${device.data.longitude}` : undefined);
          if (found) break;
        }
      }

      if (found) {
        // cache on the alert list
        setAlertsList(prev => prev.map(a => a.id === alert.id ? { ...a, googleMapsLink: found } : a));
        window.open(found, '_blank');
        return;
      }

      // last fallback: try patient node under 'patientsLocationData' if present
      try {
        const locRef = rtdbRef(rtdb, `patientsLocationData/${pid}`);
        const locSnap = await get(locRef);
        const locVal = locSnap.val();
        const pl = locVal?.googleMapsLink ?? locVal?.map_link ?? locVal?.mapLink;
        if (pl) {
          setAlertsList(prev => prev.map(a => a.id === alert.id ? { ...a, googleMapsLink: pl } : a));
          window.open(pl, '_blank');
          return;
        }
      } catch (e) {
        // ignore
      }

      toast({ title: 'Location not found', description: 'No map link was found for this alert.', variant: 'default' });
    } catch (err) {
      console.error('handleAlertClick error', err);
      toast({ title: 'Error', description: 'Failed to open map link.', variant: 'destructive' });
    }
  };

  const renderOverviewTab = () => (
    <div className="space-y-6 max-h-[70vh] overflow-auto" data-testid="tab-overview">
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          label="Active Patients"
          value={stats.activePatients}
          icon={<Users className="w-6 h-6 text-primary" />}
          bg="bg-primary/10"
        />
        <StatCard
          label="Critical Alerts"
          value={stats.criticalAlerts}
          icon={<AlertTriangle className="w-6 h-6 text-destructive" />}
          bg="bg-destructive/10"
          textColor="text-destructive"
        />
        <StatCard
          label="Connected Devices"
          value={stats.connectedDevices}
          icon={<Wifi className="w-6 h-6 text-success" />}
          bg="bg-success/10"
        />
        
      </div>
    </div>
  );

  const renderPatientsTab = () => (
    <div className="space-y-6" data-testid="tab-patients">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-foreground">Patient Management</h2>
      </div>
  <PatientCardList onRealtimeTemperature={handleRealtimeTemperature} />
    </div>
  );

  const renderProfileTab = () => (
    <div className="flex items-center justify-center h-full">
      <div className="w-full max-w-md">
        <ProfilePage />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen w-full h-full bg-muted flex flex-col">
      <Header criticalAlert={criticalAlert} />
      <div className="flex flex-1 min-h-0">
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="flex-1 p-6 min-h-0 h-full w-full">
          <Tabs
            value={activeTab}
            onValueChange={(tab) => {
              setActiveTab(tab);
              window.history.pushState({}, "", `?tab=${tab}`);
            }}
            className="w-full"
          >
            <TabsContent value="overview">{renderOverviewTab()}</TabsContent>
            <TabsContent value="patients">{renderPatientsTab()}</TabsContent>
            <TabsContent value="add-patient"><AddPatientPage /></TabsContent>
            <TabsContent value="upload-reports"><UploadReportsContent /></TabsContent>
            <TabsContent value="medi"><MedicineReminderContent /></TabsContent>
            <TabsContent value="alerts">
              <div className="max-w-md mx-auto mt-8">
                {alertsList.length > 0 ? (
                  <Card className="shadow-lg">
                      <CardContent className="p-0 max-h-96 overflow-y-auto">
                      {alertsList.map((alert: any) => (
                        <div key={alert.id} className="p-4 border-b border-border hover:bg-accent flex items-start justify-between cursor-pointer" onClick={() => handleAlertClick(alert)}>
                          <div className="flex items-start space-x-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              alert.type === 'critical' ? 'bg-destructive' : alert.type === 'warning' ? 'bg-warning' : 'bg-primary'
                            }`}>
                              <AlertTriangle className={`w-4 h-4 ${alert.type === 'critical' ? 'text-destructive-foreground' : 'text-primary-foreground'}`} />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-foreground">{alert.title}</p>
                              <p className="text-xs text-muted-foreground">{alert.description}</p>
                              <p className="text-xs text-muted-foreground">{alert.patientName ? `Patient: ${alert.patientName}` : ''} {alert.createdAt ? new Date(alert.createdAt).toLocaleTimeString() : ''}</p>
                            </div>
                          </div>
                          <div className="ml-4 flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" onClick={() => handleAcknowledgeAlert(alert.id)} data-testid={`button-acknowledge-${alert.id}`}>
                              ✓
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ) : (
                  <p className="text-muted-foreground text-center">No critical alerts at the moment.</p>
                )}
              </div>
            </TabsContent>
            <TabsContent value="profile">{renderProfileTab()}</TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}