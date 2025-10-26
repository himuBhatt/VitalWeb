import React, { useEffect, useState } from "react";
import Header from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { db, rtdb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { ref as rtdbRef, onValue, off } from "firebase/database";
import { useLocation } from "wouter";

export default function PatientDashboard() {
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [realtime, setRealtime] = useState<Record<string, any> | null>(null);
 
  const [showRawPatient, setShowRawPatient] = useState<boolean>(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    const uid = typeof window !== "undefined" ? localStorage.getItem("patientUid") : null;
    if (!uid) {
      // not logged in — redirect to login
      navigate('/patient-login');
      return;
    }

    let deviceUnsub: any = null;

    const fetchPatient = async () => {
      try {
        const docRef = doc(db, "patients", uid);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as any;
          setPatient(data);
          // Debug log to inspect stored patient document fields
          // This helps determine why some fields (deviceNo, notes) may be missing
          console.debug('Loaded patient document:', data);

          const deviceId = (data.deviceId || data.deviceNo || data.device || data.device_id || "").toString();
          if (deviceId) {
            const devicePath = `devices/${deviceId}`;
            const deviceRef = rtdbRef(rtdb, devicePath);
            const handle = (s: any) => {
              const val = s.val();
              if (!val) {
                setRealtime(null);
                return;
              }
              const dataNode = val.data ?? val;
              const normalized: Record<string, any> = { ...dataNode };
              if (normalized.tempC == null && normalized.temperature != null) normalized.tempC = Number(normalized.temperature);
              if (normalized.hr == null && normalized.bpm != null) normalized.hr = Number(normalized.bpm);
              if (normalized.spo2 == null && normalized.SpO2 != null) normalized.spo2 = Number(normalized.SpO2);
              setRealtime(normalized);
            };
            onValue(deviceRef, handle, (err) => console.error('RTDB device onValue error', err));
            deviceUnsub = () => off(deviceRef, 'value');
          }
        } else {
          // patient doc missing -> clear stored uid and redirect
          localStorage.removeItem('patientUid');
          navigate('/patient-login');
        }
      } catch (err) {
        console.error('Failed to load patient', err);
        alert('Failed to load patient data');
      } finally {
        setLoading(false);
      }
    };

    fetchPatient();

    return () => {
      try { deviceUnsub && deviceUnsub(); } catch (e) { /* ignore */ }
    };
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('patientUid');
    localStorage.removeItem('patientName');
    navigate('/');
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!patient) return <div className="min-h-screen flex items-center justify-center">No patient data available.</div>;

  return (
    <div className="min-h-screen w-full h-full bg-muted flex flex-col">
      <Header />
      <div className="flex flex-1 min-h-0">
       
        <main className="flex-1 p-6 min-h-0 h-full w-full">
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">{patient.name}</h1>
                {patient.email && <p className="text-sm text-muted-foreground">{patient.email}</p>}
                <p className="text-sm text-muted-foreground">Room: {patient.room ?? '—'} • Age: {patient.age ?? '—'}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={handleLogout}>Logout</Button>
              </div>
            </div>

            {/* Vitals summary moved into Recent Vitals section */}

            <Card>
              <CardContent>
                <h3 className="font-semibold mb-2">Recent Vitals</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Temperature</p>
                    <p className="text-lg font-bold">{realtime?.tempC != null ? `${Number(realtime.tempC).toFixed(1)}°C` : '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Heart Rate</p>
                    <p className="text-lg font-bold">{realtime?.hr != null ? `${Number(realtime.hr)} bpm` : '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">SpO₂</p>
                    <p className="text-lg font-bold">{realtime?.spo2 != null ? `${Number(realtime.spo2)}%` : '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Humidity</p>
                    <p className="text-lg font-bold">{realtime?.humidity != null ? `${Number(realtime.humidity)}%` : '—'}</p>
                  </div>
                </div>
                
              </CardContent>
            </Card>
           
            <Card>
              <CardContent>
                <h3 className="font-semibold mb-2">Details</h3>
                <div className="space-y-1 text-sm text-muted-foreground">
                  {patient.gender && <div>Gender: {patient.gender}</div>}
                  {patient.doctorName && <div>Doctor: {patient.doctorName}</div>}
                  {/* Try multiple common field names for device */}
                  {(patient.deviceNo || patient.deviceId || patient.device || patient.device_id) && (
                    <div>Device No: {patient.deviceNo ?? patient.deviceId ?? patient.device ?? patient.device_id}</div>
                  )}
                  

                  {/* Notes field fallback */}
                  {(patient.notes || patient.note || patient.comments) && (
                    <div>Notes: {patient.notes ?? patient.note ?? patient.comments}</div>
                  )}
                </div>
                 <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => navigate('/report')}>Upload Report</Button>
              <Button variant="ghost" onClick={() => {
                try { localStorage.setItem('patientUid', patient.id); localStorage.setItem('patientName', patient.name); } catch (e) { /* ignore */ }
                navigate('/patient-med');
              }}>Medicines</Button>
            </div>
                
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
