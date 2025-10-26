import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User } from "lucide-react";
import { useLocation } from "wouter";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import {
  doc,
  getDoc,
  setDoc
} from "firebase/firestore";

export default function ProfilePage() {
  const [, navigate] = useLocation();
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [profilePic, setProfilePic] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [hospital, setHospital] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState(false);
  const [nameError, setNameError] = useState("");
  const [hospitalError, setHospitalError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        try {
          const docRef = doc(db, "professionals", user.uid);
          const snapshot = await getDoc(docRef);
          if (snapshot.exists()) {
            const data = snapshot.data();
            setName(data.name || "");
            setPhone(data.phone || "");
            setHospital(data.hospital || "");
            setDescription(data.description || "");
            setProfilePic(data.profilePic || null);
          }
        } catch (error) {
          console.error("Error fetching profile:", error);
        }
        setLoading(false);
      } else {
        navigate("/");
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
      try {
        await signOut(auth);
        navigate("/");
      } catch (error) {
      console.error("Logout failed:", error);
      alert("Something went wrong while logging out.");
    }
  };

  const handleProfilePicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePic(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    let valid = true;
    if (/\d/.test(name)) {
      setNameError("Name should not contain numbers.");
      valid = false;
    } else {
      setNameError("");
    }
    if (/\d/.test(hospital)) {
      setHospitalError("Hospital name should not contain numbers.");
      valid = false;
    } else {
      setHospitalError("");
    }
    if (!valid || !uid) return;

    try {
      await setDoc(doc(db, "professionals", uid), {
        uid,
        name,
        phone,
        hospital,
        description,
        profilePic: profilePic || "",
        updatedAt: new Date().toISOString()
      });
      console.log("Profile saved.");
    } catch (error) {
      console.error("Error saving profile:", error);
      alert("Failed to save profile.");
    }

    setEditing(false);
  };

  if (loading) {
    return <div className="text-center mt-10 text-gray-600">Loading profile...</div>;
  }

  return (
    <div className="flex flex-col items-center justify-start pt-8 px-6 w-full h-full bg-gradient-to-br from-blue-100 via-white to-blue-200">
      <Card className="w-full max-w-md shadow-2xl rounded-2xl border-0">
        <CardHeader className="flex flex-col items-center bg-gradient-to-b from-primary/80 to-primary/40 rounded-t-2xl pb-4 pt-4">
          <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mb-2 shadow-lg border-4 border-primary relative">
            {profilePic ? (
              <img src={profilePic} alt="Profile" className="w-20 h-20 object-cover rounded-full" />
            ) : (
              <User className="w-12 h-12 text-primary" />
            )}
            <label htmlFor="profilePicUpload" className="absolute bottom-0 right-0 bg-primary text-white rounded-full p-1 cursor-pointer shadow-md hover:bg-blue-700 transition">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 20h14M12 4v16m8-8H4" /></svg>
              <input id="profilePicUpload" type="file" accept="image/*" className="hidden" onChange={handleProfilePicChange} />
            </label>
          </div>
          <CardTitle className="text-center text-2xl text-primary-foreground drop-shadow font-bold mb-1">
            {name || "Healthcare Professional"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 bg-white rounded-b-2xl px-6 py-4">
          <div className="space-y-4">
            {editing ? (
              <>
                <div>
                  <label className="block text-sm font-semibold text-primary mb-1">Name</label>
                  <input
                    type="text"
                    className="w-full border rounded-lg p-2 text-sm mb-2"
                    value={name}
                    onChange={e => {
                      const value = e.target.value;
                      setName(value);
                      setNameError(/\d/.test(value) ? "Name should not contain numbers." : "");
                    }}
                    placeholder="Enter your name"
                  />
                  {nameError && <div className="text-red-500 text-xs mb-2">{nameError}</div>}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-primary mb-1">Phone</label>
                  <input
                    type="tel"
                    pattern="[0-9]{10}"
                    minLength={10}
                    maxLength={10}
                    className="w-full border rounded-lg p-2 text-sm mb-2"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="Enter your 10-digit contact number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-primary mb-1">Hospital</label>
                  <input
                    type="text"
                    className="w-full border rounded-lg p-2 text-sm mb-2"
                    value={hospital}
                    onChange={e => {
                      const value = e.target.value;
                      setHospital(value);
                      setHospitalError(/\d/.test(value) ? "Hospital name should not contain numbers." : "");
                    }}
                    placeholder="Enter your hospital name"
                  />
                  {hospitalError && <div className="text-red-500 text-xs mb-2">{hospitalError}</div>}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-primary mb-1">Profile Description</label>
                  <textarea
                    className="w-full border rounded-lg p-2 text-sm"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={4}
                    placeholder="Describe yourself"
                  />
                </div>
                <button
                  className="mt-2 px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                  onClick={handleSave}
                >
                  Save
                </button>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-2 mb-2">
                  <div><span className="font-semibold text-primary">Name:</span> {name || <span className="italic text-gray-400">Not set</span>}</div>
                  <div><span className="font-semibold text-primary">Phone:</span> {phone || <span className="italic text-gray-400">Not set</span>}</div>
                  <div><span className="font-semibold text-primary">Hospital:</span> {hospital || <span className="italic text-gray-400">Not set</span>}</div>
                </div>
                <div>
                  <div className="font-semibold text-lg mb-1 text-primary">Profile Description</div>
                  <div className="text-sm text-muted-foreground leading-relaxed min-h-[64px] break-words whitespace-normal">
                    {description || <span className="italic text-gray-400">No description. Click Edit to add.</span>}
                  </div>
                </div>
                <button
                  className="mt-2 px-4 py-1 bg-blue-600 text-white rounded hover                  hover:bg-blue-700"
                  onClick={() => setEditing(true)}
                >
                  Edit
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <button
        className="mt-6 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold shadow"
        onClick={handleLogout}
      >
        Logout
      </button>
    </div>
  );
}
