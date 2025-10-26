import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { collection, addDoc, doc, deleteDoc } from "firebase/firestore";
import { db, rtdb } from "../lib/firebase";
import { ref as rtdbRef, onValue, query as rtdbQuery, orderByChild, equalTo, get, update } from "firebase/database";

export default function AddPatientPage() {
  const [patientName, setPatientName] = useState("");
  const [age, setAge] = useState("");
  const [roomNo, setRoomNo] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [password, setPassword] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [gender, setGender] = useState("");
  const [availableDevices, setAvailableDevices] = useState<Array<{ id: string; [key: string]: any }>>([]);

  // 🟢 Fetch available devices (not assigned)
  useEffect(() => {
    // Listen for devices in Realtime DB and filter client-side so we include
    // devices that are either status==='available' or not assigned (assigned_to missing/empty)
    const devicesRef = rtdbRef(rtdb, 'devices');

    const unsubscribe = onValue(devicesRef, (snapshot) => {
      const val = snapshot.val();
      if (!val) {
        setAvailableDevices([]);
        return;
      }
      const entries = Object.entries(val) as Array<[string, any]>;
      const list = entries
        .map(([key, v]) => ({ id: key, ...(v as any) }))
        .filter((d) => {
          // include if explicitly available
          if (d.status === 'available') return true;
          // include if not assigned (assigned_to missing, null or empty string)
          if (!d.assigned_to || d.assigned_to === '') return true;
          return false;
        });
      setAvailableDevices(list);
    }, (err) => {
      console.error('RTDB devices onValue error', err);
      setAvailableDevices([]);
    });

    return () => unsubscribe();
  }, []);

  const handleAddPatient = async () => {
    if (!patientName || !deviceId) {
      alert("Please enter patient name and select a device.");
      return;
    }

    setError("");

    const newPatient = {
      name: patientName,
      age: age ? parseInt(age) : null,
      room: roomNo,
      password: password || null,
      gender,
      doctorName,
      deviceId,
      status: "stable",
      createdAt: new Date().toISOString(),
    };

    try {
      // Add patient
      const patientRef = await addDoc(collection(db, "patients"), newPatient);

      // Confirm device exists in RTDB before assigning
      const devicePathRef = rtdbRef(rtdb, `devices/${deviceId}`);
      const deviceSnap = await get(devicePathRef);
      if (!deviceSnap.exists()) {
        // Delete the patient we just created to avoid orphaned document
        try {
          await deleteDoc(doc(db, "patients", patientRef.id));
        } catch (delErr) {
          console.warn('Failed to rollback created patient:', delErr);
        }
        throw new Error(`Device '${deviceId}' not found in Realtime Database`);
      }

      // Assign device in RTDB (keep devices in RTDB consistent)
      try {
        await update(devicePathRef, { assigned_to: patientRef.id, status: "assigned" });
      } catch (updErr) {
        // rollback patient creation if assignment fails
        try {
          await deleteDoc(doc(db, "patients", patientRef.id));
        } catch (delErr) {
          console.warn('Failed to rollback created patient after update failure:', delErr);
        }
        throw updErr;
      }

      // Reset form
      setPatientName("");
      setAge("");
      setRoomNo("");
      setDeviceId("");
  setPassword("");
      setDoctorName("");
      setGender("");

      alert("✅ Patient added and device assigned!");
    } catch (error) {
      console.error("Error adding patient or assigning device:", error);
      const message = (error as any)?.message || String(error);
      setError(message);
      alert(`❌ Failed to add patient or assign device: ${message}`);
    }
  };

  const [error, setError] = useState("");

  return (
    <div className="w-full h-full flex flex-col items-center justify-center">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-auto">
        <Card className="w-full mb-8 overflow-hidden">
          <CardHeader>
            <CardTitle>Add Patient</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 max-h-[400px] overflow-y-auto">
            <div className="flex flex-wrap gap-2 mb-4">
              <Input
                placeholder="Patient Name"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="flex-1 min-w-[150px]"
              />
              <Input
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 min-w-[150px]"
                type="password"
              />
              <Input
                placeholder="Age"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="flex-1 min-w-[100px]"
                type="number"
              />
              <Input
                placeholder="Room No."
                value={roomNo}
                onChange={(e) => setRoomNo(e.target.value)}
                className="flex-1 min-w-[100px]"
              />
              
              {/* 🔽 Dropdown for device selection */}
              <select
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                className="flex-1 min-w-[120px] border rounded-lg p-2 text-sm"
              >
                <option value="">Select Device</option>
                {availableDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.id}
                  </option>
                ))}
              </select>

              <Input
                placeholder="Doctor Name"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                className="flex-1 min-w-[150px]"
              />
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="flex-1 min-w-[120px] border rounded-lg p-2 text-sm"
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
              <Button onClick={handleAddPatient}>Add Patient</Button>
            </div>
            {error && (
              <div className="mt-2 text-sm text-red-600">Error: {error}</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
