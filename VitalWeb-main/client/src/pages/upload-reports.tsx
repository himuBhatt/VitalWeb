import React, { useState, useEffect } from "react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { db } from "../lib/firebase";
import { collection, addDoc, doc, getDoc, getDocs, deleteDoc } from "firebase/firestore";

interface PatientOption { id: string; name?: string }

export default function UploadReportsPage() {
  // Thin wrapper for the standalone page route: renders header, sidebar and the content component.
  return (
    <div className="min-h-screen w-full h-full bg-muted flex flex-col">
      <Header />
      <div className="flex flex-1 min-h-0">
        <Sidebar activeTab="upload-reports" onTabChange={() => {}} />
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-auto">
            <UploadReportsContent />
          </div>
        </main>
      </div>
    </div>
  );
}

// Named export: the content-only component (no header/sidebar) so it can be embedded in the dashboard tabs.
export function UploadReportsContent() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<string>("");
  const [selectedPatientName, setSelectedPatientName] = useState<string | null>(null);
  const [autoSelected, setAutoSelected] = useState<boolean>(false);
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [confirmedPatient, setConfirmedPatient] = useState<boolean>(false);
  const [patientsList, setPatientsList] = useState<PatientOption[]>([]);
  interface ReportItem { id: string; fileName: string; mimeType?: string | null; size?: number | null; data: string; uploadedAt?: string | null; source?: string }
  const [reportsList, setReportsList] = useState<ReportItem[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const snap = await getDocs(collection(db, "patients"));
        const list: PatientOption[] = snap.docs.map(d => ({ id: d.id, name: (d.data() as any).name }));
        setPatientsList(list);
      } catch (err) {
        console.error("Failed to fetch patients list", err);
        setPatientsList([]);
      }
    };

    fetchPatients();
    // Do not auto-select a patient from localStorage. Patient must be chosen explicitly from the dropdown.
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handlePatientSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const uid = e.target.value;
    setSelectedPatient(uid);
    setAutoSelected(false);
    // if user explicitly selects, treat as confirmed
    setConfirmedPatient(true);

    const found = patientsList.find(p => p.id === uid);
    if (found) setSelectedPatientName(found.name || uid);
    else setSelectedPatientName(uid || null);
    // load reports for the explicitly selected patient
    if (uid) {
      fetchReports(uid).catch(err => console.error('fetchReports failed', err));
    } else {
      setReportsList([]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return alert("Select a file");
    if (!selectedPatient) return alert("No patient selected to attach the report to");
    if (autoSelected && !confirmedPatient) {
      setConfirmOpen(true);
      return;
    }

    const MAX_BYTES = 900 * 1024; // 900 KB limit for Firestore documents
    if (selectedFile.size > MAX_BYTES) {
      alert("File is too large to store in Firestore. Use smaller files (<900KB) or use Firebase Storage.");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.round((ev.loaded / ev.total) * 100);
            setUploadProgress(pct);
          }
        };
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(selectedFile as Blob);
      });

      const base64 = dataUrl.split(",")[1] ?? "";

      // Save the report to: patients/{patientId}/reports/{autoId}
      const patientReportsRef = collection(db, "patients", selectedPatient, "reports");
      await addDoc(patientReportsRef, {
        fileName: selectedFile.name,
        mimeType: selectedFile.type || null,
        size: selectedFile.size,
        data: base64,
        uploadedAt: new Date().toISOString(),
        patientId: selectedPatient,
        patientName: selectedPatientName || null,
      });

      setUploading(false);
      setUploadProgress(100);
      setSelectedFile(null);
      setConfirmedPatient(false);
  // refresh reports list
  fetchReports(selectedPatient).catch(err => console.error('refresh reports failed', err));
      alert("Report uploaded successfully to Firestore (collection: patients/{id}/reports)");
    } catch (err: any) {
      console.error("Error saving file to Firestore", err);
      alert("Upload failed: " + (err?.message || String(err)));
      setUploading(false);
      setUploadProgress(null);
    }
  };

  // Fetch reports for a given patient from both new and legacy paths
  const fetchReports = async (uid: string) => {
    if (!uid) return setReportsList([]);
    try {
      const results: ReportItem[] = [];
      // new path: patients/{uid}/reports
      try {
        const snap = await getDocs(collection(db, "patients", uid, "reports"));
        snap.docs.forEach(d => {
          const data = d.data() as any;
          results.push({
            id: d.id,
            fileName: data.fileName || `report-${d.id}`,
            mimeType: data.mimeType || null,
            size: data.size || null,
            data: data.data || "",
            uploadedAt: data.uploadedAt || null,
            source: "patients",
          });
        });
      } catch (e) {
        console.debug("No new-path reports or error", e);
      }

      // legacy path: reports/{uid}/items
      try {
        const snap2 = await getDocs(collection(db, "reports", uid, "items"));
        snap2.docs.forEach(d => {
          const data = d.data() as any;
          results.push({
            id: d.id,
            fileName: data.fileName || `report-${d.id}`,
            mimeType: data.mimeType || null,
            size: data.size || null,
            data: data.data || "",
            uploadedAt: data.uploadedAt || null,
            source: "legacy",
          });
        });
      } catch (e) {
        console.debug("No legacy-path reports or error", e);
      }

      // sort by uploadedAt desc when possible
      results.sort((a, b) => {
        const at = a.uploadedAt ? Date.parse(a.uploadedAt) : 0;
        const bt = b.uploadedAt ? Date.parse(b.uploadedAt) : 0;
        return bt - at;
      });
      setReportsList(results);
    } catch (err) {
      console.error("Failed to fetch reports for", uid, err);
      setReportsList([]);
    }
  };

  // download helper: convert base64 to blob and trigger download
  const downloadReport = (r: ReportItem) => {
    try {
      const base64 = r.data || "";
      const mime = r.mimeType || "application/octet-stream";
      const byteChars = atob(base64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = r.fileName || 'report.bin';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('download failed', err);
      alert('Failed to download file.');
    }
  };

  // delete a report from Firestore (new path patients/{uid}/reports or legacy reports/{uid}/items)
  const handleDeleteReport = async (r: ReportItem) => {
    if (!confirm("Are you sure you want to delete this report?")) return;
    try {
      if (!selectedPatient) {
        alert("No patient selected");
        return;
      }
      if (r.source === "patients") {
        // new path
        await deleteDoc(doc(db, "patients", selectedPatient, "reports", r.id));
      } else if (r.source === "legacy") {
        // legacy path
        await deleteDoc(doc(db, "reports", selectedPatient, "items", r.id));
      } else {
        // unknown source: try both places (best-effort)
        try { await deleteDoc(doc(db, "patients", selectedPatient, "reports", r.id)); } catch (_) {}
        try { await deleteDoc(doc(db, "reports", selectedPatient, "items", r.id)); } catch (_) {}
      }
      // refresh
      await fetchReports(selectedPatient);
      alert("✅ Report deleted");
    } catch (err) {
      console.error("Failed to delete report", err);
      alert("❌ Failed to delete report: " + ((err as any)?.message || String(err)));
    }
  };

  return (
    <>
      <Card className="w-full mb-8 overflow-hidden">
        <CardHeader>
          <CardTitle>Upload Previous Reports</CardTitle>
        </CardHeader>
        <CardContent className="pt-6 max-h-[400px] overflow-y-auto">
          <div className="flex flex-col gap-4 mb-4">
            <label className="text-sm">Patient</label>
            <select
              className="p-2 border rounded bg-background"
              value={selectedPatient}
              onChange={handlePatientSelect}
            >
              <option value="">-- Select patient --</option>
              {patientsList.map(p => (
                <option key={p.id} value={p.id}>{p.name ?? p.id}</option>
              ))}
            </select>
            

            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={handleFileChange}
            />
            {selectedFile && <div>Selected: {selectedFile.name}</div>}
            {uploading && uploadProgress != null && (
              <div>
                {uploadProgress === 0
                  ? "Starting..."
                  : `Uploading: ${uploadProgress}%`}
              </div>
            )}
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || !selectedPatient || uploading}
            >
              Upload Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Uploaded reports list */}
      <Card className="w-full mb-8">
        <CardHeader>
          <CardTitle>Uploaded Reports</CardTitle>
        </CardHeader>
        <CardContent>
            {reportsList.length === 0 ? (
              <div className="text-sm text-muted-foreground">No reports found for this patient.</div>
            ) : (
              <div className="space-y-3">
                {reportsList.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <div className="font-medium">{r.fileName}</div>
                      <div className="text-xs text-muted-foreground">{r.size ? `${r.size} bytes` : ''} {r.uploadedAt ? ` • ${new Date(r.uploadedAt).toLocaleString()}` : ''}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button onClick={() => downloadReport(r)}>Download</Button>
                      <button
                        type="button"
                        onClick={() => handleDeleteReport(r)}
                        className="text-red-600 text-sm"
                        title="Delete report"
                        aria-label={`Delete report ${r.fileName}`}
                      >
                        Delete
                      </button>
                     
                    </div>
                  </div>
                ))}
              </div>
            )}
        </CardContent>
      </Card>

     
    </>
  );
}
