import React, { useState, useEffect } from "react";
import { Heart, Droplets, Thermometer, Gauge } from "lucide-react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { db } from "../lib/firebase";
import { collection, doc, getDoc, setDoc, updateDoc, arrayUnion, addDoc, getDocs } from "firebase/firestore";

type Medicine = {
  user: string;
  name: string;
  dose: string;
  time: string;
  addedAt?: string;
};

// Content-only component for embedding in the dashboard tabs (no Header/Sidebar)
export function MedicineReminderContent() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [form, setForm] = useState<Medicine>({
    user: "",
    name: "",
    dose: "",
    time: "",
  });
  const [patientsList, setPatientsList] = useState<Array<{ id: string; name?: string }>>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setForm((prev) => ({ ...prev, [id]: value }));
  };

  useEffect(() => {
    // fetch patients for dropdown
    const fetchPatients = async () => {
      try {
        const snap = await getDocs(collection(db, "patients"));
        const list = snap.docs.map(d => ({ id: d.id, name: (d.data() as any).name }));
        setPatientsList(list);
        // Do not auto-select a patient from localStorage here.
        // Patient must be chosen explicitly from the dropdown.
      } catch (err) {
        console.error('Failed to fetch patients for medicines dropdown', err);
      }
    };
    fetchPatients();
  }, []);

  // fetch medicines for a given patient id from Firestore
  const fetchMedicines = async (pid: string | null) => {
    if (!pid) {
      setMedicines([]);
      return;
    }
    try {
      const snap = await getDoc(doc(db, "medicine", pid));
      if (!snap.exists()) {
        setMedicines([]);
        return;
      }
      const data = snap.data() as any;
      setMedicines(Array.isArray(data.medicines) ? data.medicines : []);
    } catch (err) {
      console.error('Failed to fetch medicines for', pid, err);
      setMedicines([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMedicines((prev) => [...prev, form]);
    // prepare medicine entry
    const medEntry = {
      user: form.user,
      name: form.name,
      dose: form.dose,
      time: form.time,
      addedAt: new Date().toISOString(),
    };

    // Write to local backend (existing behavior) and to Firestore medicine collection
    try {
      // existing local POST (best-effort)
      fetch("http://localhost:5000/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }).catch(err => console.debug('local backend add failed', err));

  // Firestore: one document per patient in the 'medicine' collection.
  // Use only the explicitly selected patient id from the dropdown.
  const pid = selectedPatientId || null;
      const patientName = patientsList.find(p => p.id === pid)?.name || form.user;
      if (pid) {
        const docRef = doc(db, "medicine", pid);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          await updateDoc(docRef, { medicines: arrayUnion(medEntry), updatedAt: new Date().toISOString() });
        } else {
          await setDoc(docRef, { patientId: pid, patientName: patientName, medicines: [medEntry], createdAt: new Date().toISOString() });
        }
        // refresh the displayed list
        await fetchMedicines(pid);
      } else {
        // no patient id: create a new document with auto id
        await addDoc(collection(db, "medicine"), { patientName: patientName, medicines: [medEntry], createdAt: new Date().toISOString() });
      }

      alert("✅ Medicine added and saved to Firestore");
      setForm({ user: "", name: "", dose: "", time: "" });
    } catch (error) {
      console.error("Error adding medicine:", error);
      alert("❌ Failed to add medicine: " + ((error as any)?.message || String(error)));
    }
  };

  // delete a medicine entry by its addedAt timestamp or by index
  const handleDelete = async (addedAt?: string, indexToRemove?: number) => {
    if (!confirm("Are you sure you want to delete this medicine?")) return;
    try {
      const pid = selectedPatientId || null;
      if (pid) {
        const docRef = doc(db, "medicine", pid);
        const snap = await getDoc(docRef);
        if (!snap.exists()) {
          alert("Medicine record not found for this patient.");
          return;
        }
        const data = snap.data() as any;
        const meds: any[] = Array.isArray(data.medicines) ? data.medicines : [];
        let newMeds: any[] = [];
        if (addedAt) {
          newMeds = meds.filter(m => (m.addedAt as string) !== addedAt);
        } else if (typeof indexToRemove === "number") {
          newMeds = meds.filter((_, i) => i !== indexToRemove);
        } else {
          return;
        }
        await updateDoc(docRef, { medicines: newMeds, updatedAt: new Date().toISOString() });
        await fetchMedicines(pid);
        alert("✅ Medicine deleted");
      } else {
        // No patient id selected: search all medicine docs for the entry and remove it
        const snap = await getDocs(collection(db, "medicine"));
        for (const d of snap.docs) {
          const data = d.data() as any;
          const meds: any[] = Array.isArray(data.medicines) ? data.medicines : [];
          let matches = false;
          let newMeds: any[] = [];
          if (addedAt) {
            if (meds.some(m => m.addedAt === addedAt)) {
              newMeds = meds.filter(m => m.addedAt !== addedAt);
              matches = true;
            }
          } else if (typeof indexToRemove === "number") {
            if (indexToRemove >= 0 && indexToRemove < meds.length) {
              newMeds = meds.filter((_, i) => i !== indexToRemove);
              matches = true;
            }
          }
          if (matches) {
            const docRef2 = doc(db, "medicine", d.id);
            await updateDoc(docRef2, { medicines: newMeds, updatedAt: new Date().toISOString() });
            break;
          }
        }
        await fetchMedicines(selectedPatientId);
        alert("✅ Medicine deleted");
      }
    } catch (err) {
      console.error("Failed to delete medicine", err);
      alert("❌ Failed to delete medicine: " + ((err as any)?.message || String(err)));
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().toTimeString().slice(0, 5);
      medicines.forEach((med) => {
        if (med.time === now) {
          alert(`⏰ Reminder: ${med.user}- Take ${med.name} - ${med.dose}`);
        }
      });
    }, 30000);
    return () => clearInterval(interval);
  }, [medicines]);

  // when selected patient changes, fetch persisted medicines
  useEffect(() => {
    fetchMedicines(selectedPatientId).catch(err => console.error('fetchMedicines error', err));
  }, [selectedPatientId]);

  return (
    <div className="space-y-6 max-w-xl mx-auto w-full">
      <h2 className="text-2xl font-bold">💊 Medicine Reminder</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm mb-1">Patient</label>
          <select
            className="w-full p-2 border rounded"
            value={selectedPatientId ?? ""}
            onChange={(e) => {
              const id = e.target.value || null;
              setSelectedPatientId(id);
              const found = patientsList.find(p => p.id === id);
              setForm(prev => ({ ...prev, user: found?.name || "" }));
            }}
          >
            <option value="">-- Select patient --</option>
            {patientsList.map(p => (
              <option key={p.id} value={p.id}>{p.name ?? p.id}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1">Medicine</label>
          <input
            id="name"
            type="text"
            placeholder="Medicine name"
            value={form.name}
            onChange={handleChange}
            required
            className="w-full p-2 border rounded"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm mb-1">Dose</label>
            <input
              id="dose"
              type="text"
              placeholder="Dose"
              value={form.dose}
              onChange={handleChange}
              required
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Time</label>
            <input
              id="time"
              type="time"
              value={form.time}
              onChange={handleChange}
              required
              className="w-full p-2 border rounded"
            />
          </div>
        </div>
        <button type="submit" className="bg-primary text-white px-4 py-2 rounded">
          Add Medicine
        </button>
      </form>

      <ul className="mt-6 space-y-2">
        {medicines.length === 0 ? (
          <li className="text-sm text-muted-foreground">No medicines scheduled for this patient.</li>
        ) : (
          medicines.map((med, idx) => (
            <li key={idx} className="text-sm flex items-center justify-between">
              <span className="pr-4">
                {med.user} - {med.name} - {med.dose} at {med.time}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(med.addedAt, idx)}
                className="text-red-600 text-sm"
                title="Delete medicine"
                aria-label={`Delete medicine ${med.name}`}
              >
                Delete
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

// Default export: standalone page wrapper with Header and Sidebar
export default function MedicineReminderPage() {
  return (
    <div className="min-h-screen w-full h-full bg-muted flex flex-col">
      <Header />
      <div className="flex flex-1 min-h-0">
        <Sidebar activeTab="medi" onTabChange={() => {}} />
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <MedicineReminderContent />
        </main>
      </div>
    </div>
  );
}