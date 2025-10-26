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
  // Fetch reports from Firestore (path: reports/{patientId}/items)
  // -----------------------------------------------------
  const fetchReports = async (uid: string) => {
    setReportsLoading(true);
    try {
      const ref = collection(db, "reports", uid, "items");
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
  // Download helper: convert base64 -> blob and trigger download
  // -----------------------------------------------------
  const downloadReport = (r: any) => {
    try {
      const base64 = r?.data || r?.base64 || r?.file || "";
      if (!base64) {
        alert("No file data available to download.");
        return;
      }
      const mime = r?.mimeType || r?.type || "application/octet-stream";
      const fileName = r?.fileName || `report-${r.id || Date.now()}`;

      // atob to binary
      const binary = atob(base64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed", err);
      const msg = err && (err as any).message ? (err as any).message : String(err);
      alert("Download failed: " + msg);
    }
  };

  // delete a report (legacy path reports/{uid}/items/{id})
  const handleDelete = async (r: any) => {
    if (!confirm("Are you sure you want to delete this report?")) return;
    try {
      if (!selectedPatient) {
        alert("No patient selected");
        return;
      }
      await deleteDoc(doc(db, "reports", selectedPatient, "items", r.id));
      await fetchReports(selectedPatient);
      alert("✅ Report deleted");
    } catch (err) {
      console.error("Failed to delete report", err);
      alert("❌ Failed to delete report: " + ((err as any)?.message || String(err)));
    }
  };

  // -----------------------------------------------------
  // Handle upload to Firestore (reports/{patientId}/items)
  // -----------------------------------------------------
  const handleUpload = async () => {
    if (!selectedFile) return alert("Select a file first");
    if (!selectedPatient) return alert("No patient selected");
    if (autoSelected && !confirmedPatient) {
      setConfirmOpen(true);
      return;
    }

    const MAX_BYTES = 900 * 1024; // 900 KB
    if (selectedFile.size > MAX_BYTES) {
      alert("File too large to store in Firestore. Use smaller files (<900KB).");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // Convert to Base64 with progress
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

      // ✅ Correct Firestore path per your rules
      const reportRef = collection(db, "reports", selectedPatient, "items");
      await addDoc(reportRef, {
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

      alert("✅ Report uploaded successfully!");
      fetchReports(selectedPatient); // Refresh reports list
    } catch (err: any) {
      console.error("Error saving file", err);
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
                      No patient selected. Please open this page from a patient or set localStorage.patientUid
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
