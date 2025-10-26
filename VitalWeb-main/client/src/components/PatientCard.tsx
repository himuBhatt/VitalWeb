import React, { useState, useEffect } from "react";
import { Thermometer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { collection, getDocs, doc, deleteDoc, getDoc } from "firebase/firestore";
import { db, rtdb } from "../lib/firebase";
import { ref as rtdbRef, onValue, off, query as rtdbQuery, orderByChild, limitToLast } from "firebase/database";
import { Trash2 } from "lucide-react";

interface PatientCardProps {
  patientId: string;
  onDelete?: () => void;
  onRealtimeTemperature?: (patientId: string, temperature: number | null) => void;
}

// Map patient status to allowed Badge variants
function getBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "critical":
      return "destructive";
    case "watch":
      return "default";
    case "stable":
      return "secondary";
    default:
      return "outline";
  }
}

function SinglePatientCard({ patientId, onDelete, onRealtimeTemperature }: PatientCardProps) {
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [realtimeVitals, setRealtimeVitals] = useState<Record<string, any> | null>(null);
  useEffect(() => {
    if (typeof onRealtimeTemperature === "function") {
      const t = realtimeVitals?.tempC ?? realtimeVitals?.temperature ?? realtimeVitals?.temp ?? null;
      const tempNum = t != null ? Number(t) : null;
      onRealtimeTemperature(patientId, tempNum);
    }
  }, [realtimeVitals, patientId, onRealtimeTemperature]);
  const [, navigate] = useLocation();

  useEffect(() => {
    const fetchPatient = async () => {
      try {
        const docRef = doc(db, "patients", patientId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setPatient({ id: docSnap.id, ...docSnap.data() });
        }
      } catch (error) {
        console.error("Error fetching patient:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchPatient();
  }, [patientId]);

  useEffect(() => {
    // Listen to latest reading for this patient's device in RTDB
    if (!patient) return;
    const deviceId = (patient.deviceId || patient.deviceNo || patient.device || patient.device_id || "").toString();
    if (!deviceId) return;

    const readingsPath = `devices/${deviceId}/readings`;
    const readingsRef = rtdbRef(rtdb, readingsPath);
    const q = rtdbQuery(readingsRef, orderByChild('timestamp'), limitToLast(1));

    const devicePath = `devices/${deviceId}`;
    const deviceRef = rtdbRef(rtdb, devicePath);

    const handleReadingsSnapshot = (snap: any) => {
      const val = snap.val();
      console.debug('[RTDB] snapshot for', readingsPath, val);
      if (!val) {
        // don't clear here; allow deviceRef listener to provide current data
        return;
      }
      const first = Object.values(val)[0] as any;
      console.debug('[RTDB] latest reading (first):', first);
      const normalized: Record<string, any> = { ...first };
      if (normalized.tempC == null && normalized.temperature != null) normalized.tempC = Number(normalized.temperature);
      if (normalized.tempC == null && normalized.temp != null) normalized.tempC = Number(normalized.temp);
      if (normalized.hr == null && normalized.bpm != null) normalized.hr = Number(normalized.heartRate);
      if (normalized.spo2 == null && normalized.SpO2 != null) normalized.spo2 = Number(normalized.SpO2);

      setRealtimeVitals(normalized);
      if (typeof onRealtimeTemperature === "function") {
        const t = normalized.tempC ?? null;
        onRealtimeTemperature(patientId, typeof t === 'number' ? t : (t ? Number(t) : null));
      }
    };

    const handleDeviceNode = (snap: any) => {
      const val = snap.val();
      console.debug('[RTDB] device node for', devicePath, val);
      if (!val) {
        setRealtimeVitals(null);
        if (typeof onRealtimeTemperature === "function") onRealtimeTemperature(patientId, null);
        return;
      }
      // common shape: { assigned_to, data: { temperature, humidity }, status }
      const data = val.data ?? val;
      const normalized: Record<string, any> = { ...data };
      if (normalized.tempC == null && normalized.temperature != null) normalized.tempC = Number(normalized.temperature);
      if (normalized.humidity == null && val.data && val.data.humidity != null) normalized.humidity = Number(val.data.humidity);
      if (normalized.hr == null && normalized.bpm != null) normalized.hr = Number(normalized.bpm);
      if (normalized.spo2 == null && normalized.SpO2 != null) normalized.spo2 = Number(normalized.SpO2);

      setRealtimeVitals(normalized);
      if (typeof onRealtimeTemperature === "function") {
        const t = normalized.tempC ?? null;
        onRealtimeTemperature(patientId, typeof t === 'number' ? t : (t ? Number(t) : null));
      }
    };

    onValue(q, handleReadingsSnapshot, (err) => {
      console.error('RTDB onValue error for device readings', err);
    });

    onValue(deviceRef, handleDeviceNode, (err) => {
      console.error('RTDB onValue error for device node', err);
    });

    return () => {
      try { off(q, 'value'); } catch (e) { /* ignore */ }
      try { off(deviceRef, 'value'); } catch (e) { /* ignore */ }
    };
  }, [patient]);

  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete this patient?")) {
      try {
        await deleteDoc(doc(db, "patients", patientId));
        if (onDelete) onDelete();
      } catch (error) {
        console.error("Error deleting patient:", error);
        alert("Failed to delete patient.");
      }
    }
  };

  if (loading) return <div>Loading patient data...</div>;
  if (!patient) return <div>Patient not found.</div>;

  return (
    <Card className="my-4 group relative">
      <div className="p-4 border-b border-border flex justify-between items-start">
        <div>
          <h3 className="font-semibold text-foreground">{patient.name}</h3>
          <p className="text-sm text-muted-foreground">Room {patient.room} • Age {patient.age}</p>
          {patient.gender && <p className="text-sm text-muted-foreground mt-1">Gender: {patient.gender}</p>}
          {patient.doctorName && <p className="text-sm text-muted-foreground mt-1">Doctor: {patient.doctorName}</p>}
          {patient.deviceNo && <p className="text-sm text-muted-foreground mt-1">Device No: {patient.deviceNo}</p>}
          {/* Show assigned device id (concise) */}
          {(
            patient.deviceId || patient.deviceNo || patient.device || patient.device_id
          ) && (
            <p className="text-sm text-muted-foreground mt-1">Device ID: {patient.deviceId || patient.deviceNo || patient.device || patient.device_id}</p>
          )}
        </div>

        {/* debug panel removed */}
        <div className="flex flex-col items-end gap-2">
          <Badge variant={getBadgeVariant(patient.status)} className="text-xs">
            {patient.status.toUpperCase()}
          </Badge>
          <button
           className="absolute top-2 right-2 text-red-500 hover:text-red-700 font-bold opacity-0 group-hover:opacity-100 transition-opacity"

            onClick={handleDelete}
          >
             <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Thermometer />
              <span className="text-sm text-foreground">Temperature</span>
            </div>
            <span className="text-lg font-bold">
              {realtimeVitals?.tempC != null ? `${Number(realtimeVitals.tempC).toFixed(1)}°C` : "—"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-foreground">Humidity</div>
            <div className="text-lg font-bold">{realtimeVitals?.humidity != null ? `${Number(realtimeVitals.humidity)}%` : "—"}</div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-foreground">Heart Rate</div>
            <div className="text-lg font-bold">{realtimeVitals?.hr != null ? `${Number(realtimeVitals.hr)} bpm` : "—"}</div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-foreground">SpO₂</div>
            <div className="text-lg font-bold">{realtimeVitals?.spo2 != null ? `${Number(realtimeVitals.spo2)}%` : "—"}</div>
          </div>
        </div>
      </CardContent>

      {/* 'Add Medicines' moved to the Sidebar as a dashboard tab to avoid duplicate navigation */}
    </Card>
  );
}

export function PatientCardList({ onRealtimeTemperature }: { onRealtimeTemperature?: (patientId: string, temperature: number | null) => void }) {
  const [patients, setPatients] = useState<any[]>([]);
  const [searchType, setSearchType] = useState<"name" | "room" | "device">("name");
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const snapshot = await getDocs(collection(db, "patients"));
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPatients(data);
      } catch (error) {
        console.error("Error fetching patients:", error);
      }
    };
    fetchPatients();
  }, []);

  const handleRemove = (id: string) => {
    setPatients(prev => prev.filter(p => p.id !== id));
  };

  const filteredPatients = patients.filter(patient => {
    if (!searchValue.trim()) return true;
    const val = searchValue.toLowerCase();
    if (searchType === "name") return patient.name?.toLowerCase().includes(val);
    if (searchType === "room") return String(patient.room).toLowerCase().includes(val);
    if (searchType === "device") return String(patient.deviceNo).toLowerCase().includes(val);
    return true;
  });

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Patient List</h2>
      <div className="flex items-center gap-2 mb-4">
        <select
          className="border rounded px-2 py-1"
          value={searchType}
          onChange={e => setSearchType(e.target.value as any)}
        >
          <option value="name">Name</option>
          <option value="room">Room No.</option>
          <option value="device">Device No.</option>
        </select>
        <input
          className="border rounded px-2 py-1"
          type="text"
          placeholder={`Search by ${searchType}`}
          value={searchValue}
          onChange={e => setSearchValue(e.target.value)}
        />
      </div>
      {filteredPatients.length > 0 ? (
        filteredPatients.map(patient => (
          <SinglePatientCard
            key={patient.id}
            patientId={patient.id}
            onDelete={() => handleRemove(patient.id)}
            onRealtimeTemperature={onRealtimeTemperature}
          />
        ))
      ) : (
        <div className="text-muted-foreground">No patients found.</div>
      )}
    </div>
  );
}
