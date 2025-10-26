import React, { useState, useEffect } from "react";
import Header from "../components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { db } from "../lib/firebase";
import { collection, addDoc, doc, getDoc, getDocs, deleteDoc } from "firebase/firestore";

interface PatientOption {
  id: string;
  name?: string;
}

export default function UploadReportsPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<string>("");
  const [selectedPatientName, setSelectedPatientName] = useState<string | null>(null);
  const [autoSelected, setAutoSelected] = useState<boolean>(false);
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [confirmedPatient, setConfirmedPatient] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reports, setReports] = useState<Array<any>>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  // -----------------------------------------------------
  // Fetch reports from Firestore (path: patients/{patientId}/reports)
  // -----------------------------------------------------
  const fetchReports = async (uid: string) => {
    setReportsLoading(true);
    try {
      const ref = collection(db, "patients", uid, "reports");
      const snap = await getDocs(ref);
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

      // Sort by uploadedAt descending
      list.sort((a, b) => {
        const da = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
        const dbt = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
        return dbt - da;
      });

      setReports(list);
    } catch (err) {
      console.error("Failed to fetch reports", err);
      setReports([]);
    } finally {
      setReportsLoading(false);
    }
  };

  // -----------------------------------------------------
  // Load selected patient from localStorage
  // -----------------------------------------------------
  useEffect(() => {
    const storedUid = typeof window !== "undefined" ? localStorage.getItem("patientUid") : null;

    const fetchSelectedPatient = async (uid: string) => {
      try {
        const docRef = doc(db, "patients", uid);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data() as any;
          setSelectedPatientName(data.name || uid);
        } else {
          setSelectedPatientName(null);
        }
      } catch (err) {
        console.error("Failed to fetch selected patient", err);
        setSelectedPatientName(null);
      }
    };

    if (storedUid) {
      setSelectedPatient(storedUid);
      setAutoSelected(true);
      fetchSelectedPatient(storedUid);
      setConfirmOpen(true);
      fetchReports(storedUid); // load reports
    }
  }, []);

  // -----------------------------------------------------
  // Handle file selection
  // -----------------------------------------------------
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  // -----------------------------------------------------
  // Download helper: convert base64 to blob and trigger download
  // -----------------------------------------------------
  const downloadReport = (r: any) => {
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

  // delete a report from Firestore
  const handleDelete = async (r: any) => {
    if (!confirm("Are you sure you want to delete this report?")) return;
    try {
      if (!selectedPatient) {
        alert("No patient selected");
        return;
      }
      await deleteDoc(doc(db, "patients", selectedPatient, "reports", r.id));
      await fetchReports(selectedPatient);
      alert("✅ Report deleted");
    } catch (err) {
      console.error("Failed to delete report", err);
      alert("❌ Failed to delete report: " + ((err as any)?.message || String(err)));
    }
  };

  // -----------------------------------------------------
  // Handle upload to Firestore
  // -----------------------------------------------------
  const handleUpload = async () => {
    if (!selectedFile) return alert("Select a file");
    if (!selectedPatient) return alert("No patient selected to attach the report to");
    if (autoSelected && !confirmedPatient) {
      // The original flow relied on showing a Dialog when a patient was auto-selected.
      // In this page the dialog markup isn't rendered, so fall back to a simple
      // confirmation prompt. If the user confirms, mark the patient as confirmed
      // and continue. Otherwise, abort the upload.
      const promptText = `Upload report to selected patient ${selectedPatientName || selectedPatient}?`;
      const ok = typeof window !== "undefined" ? confirm(promptText) : false;
      if (!ok) return;
      setConfirmedPatient(true);
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
      const docRef = await addDoc(patientReportsRef, {
        fileName: selectedFile.name,
        mimeType: selectedFile.type || null,
        size: selectedFile.size,
        data: base64,
        uploadedAt: new Date().toISOString(),
        patientId: selectedPatient,
        patientName: selectedPatientName || null,
      });
      console.log("Document added successfully with ID:", docRef.id);
     
      setUploading(false);
      setUploadProgress(100);
      setSelectedFile(null);
      setConfirmedPatient(false);
      
      alert("Report uploaded successfully to Firestore (collection: patients/{id}/reports)");
      // refresh reports list
      fetchReports(selectedPatient).catch(err => console.error('refresh reports failed', err));
    } catch (err: any) {
      console.error("Error saving file to Firestore", err);
      alert("Upload failed: " + (err?.message || String(err)));
      setUploading(false);
      setUploadProgress(null);
    }
  };

  // -----------------------------------------------------
  // Render
  // -----------------------------------------------------
  return (
    <div className="min-h-screen w-full h-full bg-muted flex flex-col">
      <Header />
      <div className="flex flex-1 min-h-0">
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-auto">
            {/* Upload Section */}
            <Card className="w-full mb-8 overflow-hidden">
              <CardHeader>
                <CardTitle>Upload Previous Reports</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 max-h-[400px] overflow-y-auto">
                <div className="flex flex-col gap-4 mb-4">
                  <label className="text-sm">Patient</label>
                  {selectedPatientName ? (
                    <div className="p-2 border rounded bg-muted/50">{selectedPatientName}</div>
                  ) : (
                    <div className="p-2 border rounded text-sm text-muted-foreground">
                      No patient selected. 
                    </div>
                  )}

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

            {/* Uploaded Reports Section */}
            <Card>
              <CardHeader>
                <CardTitle>Uploaded Reports</CardTitle>
              </CardHeader>
              <CardContent>
                {reportsLoading ? (
                  <div className="text-sm text-muted-foreground">Loading reports…</div>
                ) : reports.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No reports uploaded yet.</div>
                ) : (
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {reports.map((r) => (
                      <li key={r.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                              <span>{r.fileName ?? "unnamed"}</span>
                              {r.uploadedAt && (
                                <span className="text-xs text-muted-foreground">
                                  {new Date(r.uploadedAt).toLocaleString()}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="ghost" onClick={() => downloadReport(r)}>
                                Download
                              </Button>
                              <button
                                type="button"
                                onClick={() => handleDelete(r)}
                                className="text-red-600 text-sm ml-2"
                                title="Delete report"
                              >
                                Delete
                              </button>
                            </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

           
          </div>
        </main>
      </div>
    </div>
  );
}
